import { openResourceReview } from "./resource-review-modal.js";
import { productionConfig, startProduction, readProduction, controlProduction, renderProductionProgress } from "./production-client.js?v=20260928-production-brain-recenter-2";
import { createEmptySession, createStore, isSameSubtopicKey } from "./state.js?v=20260930-source-files-30";
import { saveSession, listSessions, deleteSession, duplicateSession } from "./sessions-store.js";
import { filterSessionsByAcademicMeta, getAcademicFilterOptions, renderSessionSidebar } from "./session-sidebar.js";
import { renderAcceptedPanel, renderAutomationSpinner } from "./accepted-panel.js?v=20260930-inspector-resize-1";
import { normalizeActivitySubtopicTitle } from "./activity-label.js";
import { createChatController, renderProposalMessage } from "./chat-controller.js?v=20260930-source-files-30";
import { normalizeProposalAnswers } from "./proposal-answer-markup.js";
import { refineActivities } from "./unit-generator.js";
import { getStaticGeminiTextModels, listGeminiModels, sendCharlyChat, controlCharlyChat, improveCharlySya, deleteCharlyAttachment, DEFAULT_GEMINI_MODEL } from "./gemini-client.js?v=20260930-source-files-30";
import { loadSyaForMeta, getCompleteSyaGroupedByCategory, buildSubtopicSyaFields } from "./sya-service.js";
import { listReadingsForUnit, saveGeneratedReading } from "./reading-service.js";
import { ensureReadingIllustration } from "./reading-illustration.js";
import { ALL_OPTION, getCategoriesForGrade, getGradesForLevel, getWorkModeLabel, isProjectSelection } from "./unit-contracts.js";
import { routeUserIntent } from "./user-intent.js";
import { createId, toast, stripHtml, setBusy, escapeHtml } from "./ui-components.js";
import { ensureApprovedUserAccess } from "./auth-guard.js";
import { DEFAULT_ACTIVITY_SECTIONS, COMPOSER_AGENT_TOOLS, getNextWorkflowStep } from "./workflow.js";
export { COMPOSER_AGENT_TOOLS };
import { createActivitySection, listActivitySections, restoreActivitySection, updateActivitySection } from "./activity-section-service.js";
import { downloadApprovedFiles } from "./export-service.js";
import { AUTOMATED_RESOURCE_SELECTIONS, buildAutomatedActivityQueue, pickExactReadingForMeta, normalizeNumericSlot, sameGrade, sameNumericSlot, sameText } from "./unit-automation.js?v=20260928-production-attention-1";
import { initSubtopicsSettingsModal, openSubtopicsSettingsModal } from "./subtopics-settings-modal.js";
import { initPreferredVocabulary } from "./vocabulary-service.js";
import { getInternalPrompts } from "./prompts-service.js";
import { buildVocabularyPromptDirective } from "./vocabulary-service.js";
import { getStoredExerciseDynamics } from "./exercise-dynamics-catalog.js";
import { convertExerciseStyles } from "./exercise-style-conversion.js";
import { formatFriendlyChatMessage } from "./friendly-chat-messages.js";

const root = document;
const store = createStore(createEmptySession());
if (typeof window !== "undefined") window.__cbStore = store;
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
let productionPollTimer = null;
let productionSnapshot = "";
let productionHasLocalChanges = false;
let productionAttentionSignature = "";
let sessionFilters = { level: "", grade: "", trimester: "", category: "" };
let pendingResourceSelections = {
  fichas: false,
  anexos: false,
  recortables: false,
  videos: false
};
let pendingResourceCounts = { fichas: 1, anexos: 1, recortables: 1, videos: 1 };
let resourceCountMode = false;
const DEFAULT_ACCEPTED_WIDTH = 360;
const MIN_ACCEPTED_WIDTH = 280;
const MAX_ACCEPTED_WIDTH = 760;
const MIN_CHAT_WIDTH = 280;
const DEFAULT_SESSIONS_WIDTH = 280;
const MIN_SESSIONS_WIDTH = 220;
const MAX_SESSIONS_WIDTH = 420;
const DEFAULT_INSPECTOR_WIDTH = 420;
const MIN_INSPECTOR_WIDTH = 320;
const MAX_INSPECTOR_WIDTH = 800;
const SETUP_PANEL_COLLAPSED_KEY = "cbSetupPanelCollapsed";
const SYA_SUBTOPIC_META_KEY = "__subtopics";
let chatController = null;
let activeChatRequestId = "";

export async function boot() {
  const defaultMeta = syncMetaForLevelAndGrade(createEmptySession().meta);
  renderGradeOptions(defaultMeta.level, defaultMeta.grade);
  renderCategoryAndSubtopicControls(defaultMeta);
  renderEditionOptions(defaultMeta.edition);
  bindMetaControls();
  bindSessionsPanelControls();
  bindSessionFilterModalControls();
  bindAcceptedPanelControls();
  bindExportControls();
  bindProductionProgressModalControls();
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
  initSubtopicsSettingsModal({
    onSave: async () => {
      const meta = store.getState().session.meta;
      renderCategoryAndSubtopicControls(meta);
      await persist();
    }
  });
  initPreferredVocabulary();
  renderGeminiModelOptions();

  // Esperar a Auth solo antes de cargar los datos de usuario
  const access = await ensureApprovedUserAccess();
  if (!access.allowed) return;

  chatController = createChatController({
    root,
    store,
    onAction: handleAction,
    onUserMessage: handleUserMessage,
    onDeleteSourceFile: async (storagePath) => {
      if (activeChatRequestId) throw new Error("Espera a que termine la respuesta del chat.");
      const session = store.getState().session;
      const result = await deleteCharlyAttachment({ sessionId: session.id, targetUnitId: session.activeUnitId, storagePath });
      store.setSession(result.session);
      toast("Archivo eliminado de esta unidad");
    },
    onCancel: stopChatGeneration
  });
  document.querySelector(".cb-send-button")?.addEventListener("click", (event) => {
    if (!activeChatRequestId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    stopChatGeneration();
  }, true);
  bindProposalActions();
  store.subscribe(renderAll);
  await refreshSessions();
  resumeChatGeneration();
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

  requestAnimationFrame(() => {
    const input = document.getElementById("cbComposerInput");
    if (input && !input.disabled) {
      input.focus();
      const len = input.value.length;
      if (typeof input.setSelectionRange === "function") {
        input.setSelectionRange(len, len);
      }
    }
  });
}

async function loadGeminiModelOptions() {
  const models = await listGeminiModels().catch(() => getStaticGeminiTextModels());
  geminiModelOptions = models.length ? models : getStaticGeminiTextModels();
  renderGeminiModelOptions(store.getState().session.meta?.model);
}

const selectedAgentTools = new Set();

function renderComposerToolsMenu() {
  const menu = document.getElementById("cbComposerToolsMenu");
  if (!menu) return;

  const isAuto = selectedAgentTools.size === 0;

  let html = `
    <header class="cb-composer-tools-header">
      <span class="cb-composer-tools-header-title">Herramientas del Agente</span>
      <button type="button" class="cb-composer-tools-mode-toggle" id="cbComposerToolsClearBtn">
        ${isAuto ? '<i class="fas fa-check"></i> Modo Auto' : 'Limpiar (Auto)'}
      </button>
    </header>
    <div class="cb-composer-tools-list">
  `;

  COMPOSER_AGENT_TOOLS.forEach(tool => {
    const checked = selectedAgentTools.has(tool.id);
    html += `
      <button type="button" class="cb-composer-tool-option${checked ? ' is-checked' : ''}" data-composer-tool-id="${escapeAttr(tool.id)}" role="menuitemcheckbox" aria-checked="${checked ? 'true' : 'false'}">
        <i class="fas ${tool.icon} cb-composer-tool-icon" aria-hidden="true"></i>
        <span class="cb-composer-tool-name">${escapeHtmlText(tool.name)}</span>
        ${checked ? '<i class="fas fa-check cb-composer-tool-check" aria-hidden="true"></i>' : ''}
      </button>
    `;
  });

  html += `</div>`;

  menu.innerHTML = html;
  syncComposerToolsButton();
  syncComposerActiveToolsChips();
}

function syncComposerToolsButton() {
  const button = document.getElementById("cbComposerToolsBtn");
  const label = document.getElementById("cbComposerToolsLabel");
  const badge = document.getElementById("cbComposerToolsBadge");
  if (!button || !label || !badge) return;

  const count = selectedAgentTools.size;
  if (count === 0) {
    label.textContent = "Herramientas";
    badge.hidden = true;
    button.title = "Herramientas del agente · Modo Inteligente Automático";
  } else {
    label.textContent = `${count} ${count === 1 ? 'herramienta' : 'herramientas'}`;
    badge.textContent = String(count);
    badge.hidden = false;
    button.title = `${count} herramientas seleccionadas activas`;
  }
}

function syncComposerActiveToolsChips() {
  const container = document.getElementById("cbComposerActiveTools");
  if (!container) return;

  if (selectedAgentTools.size === 0) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  container.hidden = false;
  const chipsHtml = Array.from(selectedAgentTools).map(toolId => {
    const tool = COMPOSER_AGENT_TOOLS.find(t => t.id === toolId);
    if (!tool) return "";
    return `
      <span class="cb-composer-active-tool-chip">
        <i class="fas ${tool.icon}"></i>
        <span>${escapeHtmlText(tool.name)}</span>
        <button type="button" data-remove-tool="${escapeAttr(tool.id)}" aria-label="Quitar ${escapeAttr(tool.name)}">&times;</button>
      </span>
    `;
  }).join("");

  container.innerHTML = `
    ${chipsHtml}
    <button type="button" class="cb-composer-active-tools-clear" id="cbComposerActiveToolsClearBtn">Limpiar todo (Modo Auto)</button>
  `;
}

function toggleComposerToolsMenu(force) {
  const button = document.getElementById("cbComposerToolsBtn");
  const menu = document.getElementById("cbComposerToolsMenu");
  if (!button || !menu) return;
  const open = typeof force === "boolean" ? force : menu.hidden;
  menu.hidden = !open;
  button.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    toggleComposerModelMenu(false);
    renderComposerToolsMenu();
    menu.querySelector("input[type='checkbox'], button")?.focus();
  }
}

function renderGeminiModelOptions(selectedModel = "") {
  const current = selectedModel || store.getState().session.meta?.model || DEFAULT_GEMINI_MODEL;
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
  if (open) {
    toggleComposerToolsMenu(false);
    menu.querySelector(".is-selected, .cb-composer-model-option")?.focus();
  }
}

function syncComposerModelButton(modelId = "") {
  const button = document.getElementById("cbComposerModelBtn");
  const label = document.getElementById("cbComposerModelLabel");
  if (!button || !label) return;
  const current = String(modelId || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
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
  const sessionTitle = document.querySelector(".cb-session-item.is-active .cb-session-main-line")?.textContent?.trim();
  if (sessionTitle) document.getElementById("cbActiveSessionTitle").textContent = sessionTitle;
  syncSessionFilterButton();
  renderAcceptedPanel({
    root,
    session: state.session,
    isAutomating: Boolean(unitAutomationRun),
    automationProgress: unitAutomationRun,
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
    onEditReadingSection: (part, unitId, nextHtml) => withUnit(unitId, () => editReadingSection(part, nextHtml)),
    onEditActivity: (id, unitId, nextHtml) => withUnit(unitId, () => editActivity(id, nextHtml)),
    onEditResource: (id, unitId, nextHtml) => withUnit(unitId, () => editResource(id, nextHtml)),
    onRegenerateActivity: (id, unitId) => withUnit(unitId, () => regenerateActivity(id)),
    onConvertActivityStyles: (id, unitId) => withUnit(unitId, () => proposeExerciseStyleConversion(id)),
    onRegenerateActivityStep: (id, unitId, stepIndex) => withUnit(unitId, () => regenerateApprovedActivityStep(id, stepIndex)),
    onRegenerateInfo: ({ activityId, unitId, kind, content }) => withUnit(unitId, async () => {
      const session = store.getState().session;
      const activity = session.accepted.activities.find((item) => String(item.id) === String(activityId));
      if (!activity) return;
      const label = kind === "strategy" ? "Estrategia" : "Para saber más";
      const displayText = `Proponer otra alternativa para el bloque «${label}» de la actividad de ${activity.subtopic || activity.section || "la actividad"}.`;
      const prompt = `Usa design_activity para crear una propuesta pendiente de aprobación que sustituya únicamente el bloque «${label}» de la actividad aprobada indicada. Conserva el subtema, título, instrucciones, pasos, respuestas, demás bloques y estructura visual; redacta una alternativa distinta, correcta y vinculada al tema. Identifica claramente el subtema ${activity.subtopic || activity.section || ""}. No apruebes ni cambies de lugar la actividad. sessionId=${session.id}, targetUnitId=${unitId}, targetActivityId=${activityId}. Contenido actual del bloque: ${content}`;
      return runMcpChatAgent(prompt, { status: `Proponiendo otra ${label.toLowerCase()}...`, requestedTools: ["design_activity"], displayText });
    }),
    onAdjustActivityDifficulty: (id, unitId, difficulty, stepIndex) => withUnit(unitId, () => adjustApprovedActivityDifficulty(id, difficulty, stepIndex)),
    onImproveSya: (unitId, subtopic, category, fields) => improveSyaForUnit(unitId, subtopic, category, fields),
    onSaveSya: (unitId, subtopic, fields) => saveSyaFieldsForUnit(unitId, subtopic, fields),
    onRegenerateResource: (id, unitId) => withUnit(unitId, () => regenerateResource(id)),
    onAdjustResourceDifficulty: (id, unitId, difficulty) => withUnit(unitId, () => regenerateResource(id, difficulty)),
    onOpenUnit: openArchivedUnit,
    onEditUnit: editUnit,
    onRemoveUnit: removeUnit,
    onRemoveActivity: (id, unitId) => withUnit(unitId, () => {
      store.removeActivity(id);
      persist();
    }),
    onRemoveResource: (id, unitId) => handleRemoveResource(id, unitId),
    onGenerateResourcesForActivity: (activityId, unitId) => withUnit(unitId, () => handleGenerateResourcesForActivity(activityId)),
    onGenerateNotesForActivity: (id, unitId) => withUnit(unitId, () => handleGenerateTeacherNotes(id)),
    onGenerateNotesForResource: (id, unitId) => withUnit(unitId, () => handleGenerateResourceNotes(id)),
    onRegenerateTeacherNote: (id, unitId) => withUnit(unitId, () => regenerateApprovedTeacherNote(id)),
    onGenerateGlobalNotes: () => handleGenerateTeacherNotes(""),
    onEditTeacherNotes: (id, text, unitId) => withUnit(unitId, () => {
      store.editTeacherNotes(id, text);
      persist();
    }),
    onDeleteTeacherNotes: (id, unitId) => withUnit(unitId, () => {
      store.removeTeacherNotes(id);
      persist();
    }),
    onReorderActivities: (unitId, ids) => withUnit(unitId, () => {
      store.reorderActivities(ids);
      persist();
    }),
    onReorderResources: (unitId, ids) => withUnit(unitId, () => {
      store.reorderResources(ids);
      persist();
    }),
    onReorderTeacherNotes: (unitId, ids) => withUnit(unitId, () => {
      store.reorderTeacherNotes(ids);
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
    reconnectPersistentProduction(sessions[0]);
  }
  scheduleReadingsReload({ silent: true, delay: 0 });
  scheduleSyaReload({ silent: true, delay: 0, replaceExisting: false });
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
  if (unitAutomationRun?.persistentId) {
    await changePersistentProduction(unitAutomationRun.persistentId, "cancel");
    return;
  }
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

  const run = { cancelled: false, paused: false, status: "running", unit, completed: 0, resourcesCompleted: 0, total: 0 };
  unitAutomationRun = run;
  setComposerBusy(true);
  productionModalManuallyDismissed = false;
  openProductionProgressModal();

  let queue = [];
  const buildClientTasks = () => {
    if (!queue || !queue.length) return [];
    const isActStage = run.completed < queue.length;
    const tasks = queue.map((item, idx) => ({
      id: `act_${idx}`,
      activityId: `act_${idx}`,
      section: item.section,
      subtopic: item.mathFocus || item.subtopic,
      stage: 'activity',
      status: idx < run.completed ? 'completed' : (run.status === 'running' && isActStage && idx < (run.completed + 7) ? 'running' : 'pending'),
      order: idx
    }));

    const resourceLimits = { worksheet: 1, annex: 2, cutout: 2, 'video-script': 1 };
    const runningResourceCounts = { worksheet: 0, annex: 0, cutout: 0, 'video-script': 0 };
    const busyActivityIndices = new Set();
    let resourceOrder = 0;

    queue.forEach((item, activityIndex) => {
      (item.resourceTypes || []).forEach((resType, resourceIndex) => {
        const isComplete = resourceOrder < run.resourcesCompleted;
        const canRunStage = !isActStage && run.status === 'running'
          && (runningResourceCounts[resType] || 0) < (resourceLimits[resType] || 1)
          && !busyActivityIndices.has(activityIndex)
          && Object.values(runningResourceCounts).reduce((a, b) => a + b, 0) < 6;

        const isCurrent = !isComplete && canRunStage;
        if (isCurrent) {
          runningResourceCounts[resType] = (runningResourceCounts[resType] || 0) + 1;
          busyActivityIndices.add(activityIndex);
        }

        tasks.push({
          id: `res_${activityIndex}_${resourceIndex}_${resType}`,
          stage: resType,
          activityId: `act_${activityIndex}`,
          section: item.section,
          subtopic: item.mathFocus || item.subtopic,
          code: item.resourceCodes?.[{ worksheet: 'fichas', annex: 'anexos', cutout: 'recortables', 'video-script': 'videos' }[resType]] || '',
          status: isComplete ? "completed" : isCurrent ? "running" : "pending",
          order: 100 + activityIndex * 4 + resourceIndex
        });
        resourceOrder += 1;
      });
    });

    queue.forEach((item, index) => tasks.push({
      id: `notes_task_${index}`,
      stage: 'notes',
      activityId: `act_${index}`,
      section: item.section,
      subtopic: item.mathFocus || item.subtopic,
      status: run.status === 'completed' ? 'completed' : 'pending',
      order: 1000 + index
    }));

    return tasks;
  };

  const handleClientControl = (action) => {
    if (action === "pause") {
      run.paused = true;
      run.status = "paused";
      syncAutomatedUnitButton({ label: "Pausado", running: true });
      chatController?.showTransientStatus("Generación de unidad pausada.");
      renderProductionProgress(productionHost(), { status: "paused", tasks: buildClientTasks(), total: run.total, completed: run.completed }, handleClientControl);
    } else if (action === "resume") {
      run.paused = false;
      run.status = "running";
      syncAutomatedUnitButton({ label: `${run.completed}/${run.total}`, running: true });
      chatController?.showTransientStatus("Reanudando generación...");
      renderProductionProgress(productionHost(), { status: "running", tasks: buildClientTasks(), total: run.total, completed: run.completed }, handleClientControl);
    } else if (action === "cancel") {
      run.cancelled = true;
      run.status = "cancelled";
      syncAutomatedUnitButton({ label: "Unidad automática", running: false });
      setComposerBusy(false);
      chatController?.showTransientStatus("Generación de unidad cancelada.");
      closeProductionProgressModal();
    }
  };

  const waitForPause = async () => {
    while (run.paused && !run.cancelled) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  };

  renderProductionProgress(productionHost(), {
    status: "running",
    tasks: []
  }, handleClientControl);
  syncAutomatedUnitButton({ label: "Buscando lectura...", running: true });
  chatController?.showTransientStatus(`Preparando Unidad ${unit}...`);

  try {
    const targetMeta = { ...academicMeta, unit };
    const config = await productionConfig();
    const existingRun = selectedUnit.automation;
    if (config.enabled && existingRun?.id && existingRun.status === "running") {
      try {
        const status = await readProduction(existingRun.id);
        if (status.status === "running") {
          showPersistentProduction(status);
          return;
        }
      } catch (_) {}
    }
    const readings = selectedUnit.accepted?.reading ? [] : await listReadingsForUnit({ meta: targetMeta, limit: 500, includeAll: true });
    const reading = selectedUnit.accepted?.reading || pickExactReadingForMeta(readings, targetMeta);
    if (!reading) {
      throw new Error(`No encontré una lectura que coincida exactamente con ${targetMeta.level}, ${targetMeta.grade}, trimestre ${targetMeta.trimester}, unidad ${unit}.`);
    }
    if (run.cancelled) return;

    let acceptedReading = selectedUnit.accepted?.reading || toAcceptedReading(reading);
    if (!/class\s*=\s*["'][^"']*cb-reading-illustration[^"']*["'][\s\S]*?<img\b/i.test(String(acceptedReading.html || acceptedReading.sections?.narrativeHtml || ""))) {
      syncAutomatedUnitButton({ label: "Creando ilustración de lectura...", running: true });
      chatController?.showTransientStatus("Creando una ilustración para la lectura...");
      acceptedReading = await ensureReadingIllustration(acceptedReading, {
        sessionId: session.id,
        targetUnitId: selectedUnit.id,
        model: selectedUnit.meta?.model || DEFAULT_GEMINI_MODEL
      });
      if (run.cancelled) return;
    }
    store.useReading(acceptedReading);
    const createdUnit = selectedUnit;
    syncMetaControls(store.getState().session);
    store.addMessage({
      role: "assistant",
      text: `Automatización iniciada para la Unidad ${unit} seleccionada. Elegí la lectura “${reading.title}” por coincidencia exacta de nivel, grado, trimestre y unidad.`
    });
    await persist({ silent: true });

    syncAutomatedUnitButton({ label: "Cargando secuencia...", running: true });
    const sya = selectedUnit.accepted?.sya || selectedUnit.sya || await loadSyaForMeta(targetMeta);
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
    queue = buildAutomatedActivityQueue(groups, { unit });
    if (!queue.length) throw new Error("La secuencia y alcance no contiene subtemas utilizables para esta unidad.");
    store.setActivitySections(queue);
    run.total = queue.length;
    await persist({ silent: true });
    renderProductionProgress(productionHost(), { status: "running", unit: selectedUnit, session: store.getState().session, tasks: buildClientTasks(), total: run.total, completed: run.completed }, handleClientControl);

    if (config.enabled) {
      if (!await persist({ silent: true })) throw new Error("Guarda la sesión antes de iniciar la generación.");
      productionSnapshot = ""; productionHasLocalChanges = false;
      showPersistentProduction(await startProduction(session.id, selectedUnit.id, getStoredExerciseDynamics()));
      return;
    }
    throw new Error("La producción especializada con Gemini Image no está habilitada. Se canceló la unidad para evitar generar anexos o recortables mediante HTML, SVG o canvas.");

  } catch (error) {
    console.error("[charly-brown] automated unit failed", error);
    const message = `No pude crear la unidad automatizada: ${error.message}`;
    if (store.getState().session.activeUnitId) store.addMessage({ role: "assistant", text: message });
    toast(message);
    await persist({ silent: true });
  } finally {
    if (unitAutomationRun?.persistentId) return;
    unitAutomationRun = null;
    setComposerBusy(false);
    syncAutomatedUnitButton();
    chatController?.clearTransientStatus();
  }
}

let productionModalManuallyDismissed = false;

function openProductionProgressModal() {
  const modal = document.getElementById("cbProductionProgressModal");
  if (!modal) return;
  productionModalManuallyDismissed = false;

  const host = document.getElementById("cbProductionProgress");
  if (host && !host.querySelector(".cb-hud-glass")) {
    const session = store.getState().session;
    const targetUnit = session?.units?.find(u => u.id === session.activeUnitId) || session?.units?.[0];
    const run = targetUnit?.automation;
    const initialStatus = {
      id: run?.id || "temp",
      status: run?.status || "running",
      unit: targetUnit,
      session,
      tasks: []
    };
    renderProductionProgress(host, initialStatus, action => {
      if (run?.id) void changePersistentProduction(run.id, action);
    });
  }

  modal.hidden = false;
  modal.removeAttribute("hidden");
  modal.inert = false;
  modal.setAttribute("aria-hidden", "false");
}

function closeProductionProgressModal() {
  const modal = document.getElementById("cbProductionProgressModal");
  if (!modal) return;
  productionModalManuallyDismissed = true;
  if (modal.contains(document.activeElement)) document.activeElement?.blur?.();
  modal.hidden = true;
  modal.setAttribute("hidden", "");
  modal.inert = true;
  modal.setAttribute("aria-hidden", "true");
  // Liberar recursos Three.js al ocultar el overlay
  import("./production-client.js?v=20260928-production-brain-recenter-2").then(m => m.destroyParticles?.()).catch(() => {});
}

function productionHost() {
  // Con el nuevo overlay, #cbProductionProgress existe directamente en el HTML
  const host = document.getElementById("cbProductionProgress");
  const acceptedPanel = root.querySelector("#cbAcceptedPanel");
  if (acceptedPanel && !acceptedPanel.querySelector("#cbAutomationSpinnerPanel")) {
    renderAutomationSpinner(acceptedPanel, { label: "Iniciando orquestación MCP..." });
  }
  return host;
}

function showPersistentProduction(status) {
  clearTimeout(productionPollTimer);
  const current = store.getState().session;
  if (status.session.id !== current.id) return;
  const newLocalChange = !productionHasLocalChanges && Boolean(productionSnapshot && JSON.stringify(current.units) !== productionSnapshot);
  productionHasLocalChanges ||= newLocalChange;
  const sameLocal = !productionHasLocalChanges;
  if (sameLocal) store.setSession({ ...status.session, activeUnitId: current.activeUnitId });
  else if (newLocalChange) toast("Hay cambios locales: se conserva tu edición. Reabre la sesión para ver los resultados del servidor.");
  productionSnapshot = JSON.stringify(store.getState().session.units);

  const running = status.status === "running";
  const needsAttention = status.status === "needs_attention";

  const completedCount = status.tasks.filter(t => t.status === "completed").length;
  const runningTasks = status.tasks.filter(t => t.status === "running" || t.status === "claimed");
  const failedTasks = status.tasks.filter(t => t.status !== "completed" && (t.status === "failed" || t.status === "stale" || (t.status === "pending" && Boolean(t.error))));

  console.info(`%c[charly-production] 📊 Run: ${status.id} | Estado: ${status.status} | Progreso: ${completedCount}/${status.tasks.length} | Activos: ${runningTasks.length}`, "color: #3b82f6; font-weight: bold;");

  if (runningTasks.length) {
    console.groupCollapsed(`%c[charly-production] 🏃 Agentes activos (${runningTasks.length}):`, "color: #10b981; font-weight: bold;");
    for (const t of runningTasks) {
      console.log(`• [${t.stage.toUpperCase()}] ${t.subtopic || t.section || t.code || t.id} (Intento: ${t.attempt || 1})`, t);
    }
    console.groupEnd();
  }

  if (failedTasks.length) {
    console.group(`%c[charly-production] ⚠️ Tareas con errores o reintentos (${failedTasks.length}):`, "color: #ef4444; font-weight: bold;");
    for (const t of failedTasks) {
      console.error(`❌ [${t.stage.toUpperCase()}] Subtema: "${t.subtopic || t.section || 'N/A'}" | Código: "${t.code || 'N/A'}" | Intento: ${t.attempt || 1}`, {
        error: t.error,
        taskId: t.id,
        status: t.status,
        dueAt: t.dueAt ? new Date(t.dueAt).toISOString() : null
      });
    }
    console.groupEnd();
  }

  if (needsAttention) {
    const failures = status.tasks.filter(task => ["failed", "stale"].includes(task.status));
    const summary = failures.map(task => ({
      id: task.id,
      stage: task.stage,
      section: task.subtopic || task.section || "",
      error: task.error || "Error de generación"
    }));
    const signature = JSON.stringify(summary);
    if (signature !== productionAttentionSignature) {
      productionAttentionSignature = signature;
      console.error("[charly-brown] Producción requiere atención", JSON.stringify(summary, null, 2));
      if (failures.length) toast(`No se completó ${failures[0].subtopic || failures[0].section || "una tarea"}: ${failures[0].error || "Error de generación"}`);
    }
  } else {
    productionAttentionSignature = "";
  }
  unitAutomationRun = running ? { persistentId: status.id, sessionId: current.id } : null;
  setComposerBusy(running);
  syncAutomatedUnitButton({ label: running ? `${status.tasks.filter(t => t.status === "completed").length}/${status.tasks.length}` : "", running });
  chatController?.clearTransientStatus();

  if (["running", "paused", "needs_attention", "completed"].includes(status.status) && !productionModalManuallyDismissed) {
    openProductionProgressModal();
  }

  renderProductionProgress(productionHost(), status, action => void changePersistentProduction(status.id, action));

  if (running) productionPollTimer = setTimeout(async () => {
    if (store.getState().session.id !== current.id) return;
    try { showPersistentProduction(await readProduction(status.id)); }
    catch (error) { toast(error.message); unitAutomationRun = null; setComposerBusy(false); syncAutomatedUnitButton(); }
  }, 3000);
}

async function changePersistentProduction(id, action) {
  if (action === "restart" && productionHasLocalChanges) { toast("Concilia y guarda los cambios locales antes de iniciar otra ejecución. Los resultados del servidor están conservados."); return; }
  try {
    const next = await controlProduction(id, action);
    if (action === "cancel") {
      clearTimeout(productionPollTimer);
      unitAutomationRun = null;
      setComposerBusy(false);
      syncAutomatedUnitButton();
      closeProductionProgressModal();
      toast("Producción cancelada.");
      return;
    }
    showPersistentProduction(next);
  }
  catch (error) { toast(error.message); }
}

function reconnectPersistentProduction(session) {
  clearTimeout(productionPollTimer); productionSnapshot = ""; productionHasLocalChanges = false;
  unitAutomationRun = null; setComposerBusy(false);
  const targetUnit = session?.units?.find(u => u.id === session.activeUnitId) || session?.units?.[0];
  const run = targetUnit?.automation;
  if (run?.id && ["running", "paused", "needs_attention"].includes(run?.status)) {
    productionModalManuallyDismissed = false;
    const host = productionHost();
    const initialStatus = {
      id: run.id,
      status: run.status,
      unit: targetUnit,
      session,
      tasks: []
    };
    renderProductionProgress(host, initialStatus, action => void changePersistentProduction(run.id, action));
    openProductionProgressModal();
    void readProduction(run.id).then(showPersistentProduction).catch(error => toast(error.message));
  } else {
    closeProductionProgressModal();
    document.getElementById("cbAutomationSpinnerPanel")?.remove();
  }
}

function syncAutomatedUnitButton({ label = "Unidad automática", running = false } = {}) {
  const button = document.getElementById("cbAutomateUnitBtn");
  if (button) {
    button.classList.toggle("is-running", running);
    button.setAttribute("aria-busy", running ? "true" : "false");
    button.title = running ? "Detener al terminar la actividad actual" : "Crear unidad automatizada";
    button.setAttribute("aria-label", button.title);
    const icon = button.querySelector("i");
    const text = button.querySelector("span");
    if (icon) icon.className = running ? "fas fa-stop" : "fas fa-bolt";
    if (text) text.textContent = label;
  }
  renderAcceptedPanel({
    root,
    session: store.getState().session,
    isAutomating: running || Boolean(unitAutomationRun),
    automationProgress: { label, running }
  });
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
      const saved = await saveSession(next, { create: true }).catch((error) => {
        toast(`No se creó el libro: ${error.message}`);
        console.error("[charly-brown] create session failed", error);
        return null;
      });
      if (!saved) return false;
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
      return true;
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
  const meta = { ...(session.academicMeta || {}), ...(session.meta || {}) };
  currentReadingOptions = await listReadingsForUnit({ meta, limit: 500, includeAll: true }).catch(() => currentReadingOptions);
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
  const metaSource = initialMeta || (isUnitForm ? ({ ...(session.academicMeta || {}), ...(session.meta || {}) }) : (session.academicMeta || session.meta || {}));
  const meta = isNewSession ? { ...metaSource, category: ALL_OPTION, subtopic: ALL_OPTION } : metaSource;
  modal.dataset.mode = mode;
  editor.innerHTML = isNewUnit
    ? buildNewUnitEditor(meta, session.units || [], currentReadingOptions, initialReadingMode)
    : isEditUnit
      ? buildEditUnitEditor(editingUnit)
      : buildUnitDataEditor(meta);
  if (isNewUnit) bindNewUnitReadingControls(editor);
  let wizardState = null;
  if (!isUnitForm) {
    wizardState = { step: 2, viewMode: "hud", meta: { ...meta, level: "Primaria" } };
    bindUnitDataEditorEvents(editor, meta, wizardState);
    editor.onchange = null;
  } else {
    editor.onchange = isNewUnit ? (event) => {
      if (event.target?.name === "cb-reading-mode") syncNewUnitReadingMode(editor);
    } : null;
  }
  if (kicker) {
    kicker.textContent = isUnitForm ? "Unidad" : isNewSession ? "" : "Asistente Curricular";
    kicker.hidden = isNewSession;
  }
  if (title) title.textContent = isNewUnit ? "Crear nueva unidad" : isEditUnit ? "Editar unidad" : isNewSession ? "Configurar nuevo libro" : "Datos académicos del libro";
  if (subtitle) {
    subtitle.textContent = isNewUnit
      ? "Asigna la unidad y decide qué lectura se usará antes de iniciar su chat."
      : isEditUnit
        ? "Actualiza el número o título sin cambiar el chat ni el contenido aprobado."
        : isNewSession
          ? "Define paso a paso las características pedagógicas y editoriales del libro."
          : "Configura o actualiza los datos académicos para el libro de trabajo.";
    subtitle.hidden = isNewSession;
  }
  if (saveBtn) saveBtn.textContent = isNewUnit ? "Crear unidad" : isEditUnit ? "Guardar unidad" : isNewSession ? "Generar unidad automatizada" : "Guardar datos";
  if (cancelBtn) cancelBtn.textContent = isNewSession ? "Cancelar creación" : "Cancelar";
  saveBtn.disabled = isNewSession;
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  modal.inert = false;
  editor.querySelector("[data-hud-select-field]:not([disabled]), select:not([type='hidden']), input:not([type='hidden'])")?.focus();
  let submitting = false;
  const submitConfiguration = async ({ automate = false } = {}) => {
    if (submitting || saveBtn.disabled) return;
    const data = wizardState ? { ...wizardState.meta, ...readUnitDataEditor(editor) } : readUnitDataEditor(editor);
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
      submitting = true;
      saveBtn.disabled = true;
      closeUnitDataModal();
      try {
        const saved = await onSave?.(data);
        if (saved === true && automate) await createAutomatedUnit();
      }
      finally { submitting = false; saveBtn.disabled = false; }
      return;
    }
    store.updateMeta(data);
    syncMetaControls(store.getState().session);
    closeUnitDataModal();
    persist();
    scheduleReadingsReload({ silent: true, delay: 0 });
    scheduleSyaReload({ silent: true, delay: 0, replaceExisting: true });
  };
  editor.saveConfiguration = () => submitConfiguration();
  saveBtn.onclick = () => submitConfiguration({ automate: isNewSession });
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
  reconnectPersistentProduction(store.getState().session);
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
  chatController?.syncSessionComposer(session.id);
  store.setSession(session);
  reconnectPersistentProduction(session);
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

async function handleUserMessage(text, options = {}) {
  const replaceMessageId = typeof options === "string" ? options : options?.replaceMessageId || "";
  const explicitAttachments = Array.isArray(options?.attachments) ? options.attachments : [];
  if (!ensureActiveUnit()) return;
  const activeUnit = (store.getState().session.units || []).find((u) => u.id === store.getState().session.activeUnitId);
  const knownFiles = activeUnit?.sourceAttachments?.length ? activeUnit.sourceAttachments
    : activeUnit?.sourceAttachmentsManaged ? []
      : (activeUnit?.messages || []).filter((message) => message.role === "user").flatMap((message) => message.attachments || []);
  const fileMap = new Map(knownFiles.map((file) => [file.storagePath || file.downloadUrl, file]));
  explicitAttachments.forEach((file) => fileMap.set(file.storagePath || file.downloadUrl, file));
  const allAttachments = [...fileMap.values()];
  if (explicitAttachments.length && allAttachments.length > 10) {
    toast("Puedes tener hasta 10 archivos activos por unidad. Elimina uno antes de agregar otro.");
    return;
  }
  const effectiveAttachments = allAttachments.slice(-10);
  let toolsToSend = Array.from(selectedAgentTools);

  // Si el usuario responde a una opción de planificación o el turno anterior estaba en modo plan
  if (!toolsToSend.length) {
    const lastAssistantMsg = (activeUnit?.messages || []).slice().reverse().find((m) => m.role === "assistant" && (m.text || m.html));
    const isPlanReply = /^elijo:\s*/i.test(text);
    const hadPlanOptions = lastAssistantMsg && (
      String(lastAssistantMsg.text || "").includes("[[PLAN_OPTION:") ||
      String(lastAssistantMsg.html || "").includes("cb-plan-option")
    );
    if (isPlanReply || hadPlanOptions) {
      toolsToSend = ["planning_mode"];
    }
  }

  const isNewAttachment = explicitAttachments.length > 0;
  if (isNewAttachment) store.patchSession({ sourceAttachments: effectiveAttachments, sourceAttachmentsManaged: true });
  if (replaceMessageId) {
    store.updateMessage(replaceMessageId, { role: "user", text, attachments: explicitAttachments, requestedTools: toolsToSend });
  } else {
    store.addMessage({ role: "user", text, attachments: explicitAttachments, requestedTools: toolsToSend });
  }

  // Limpiar herramientas activas del composer para el siguiente turno
  if (selectedAgentTools.size > 0) {
    selectedAgentTools.clear();
    syncComposerToolsButton();
    syncComposerActiveToolsChips();
    renderComposerToolsMenu();
  }

  await persist();
  return runMcpChatAgent(text, {
    status: isNewAttachment ? "Analizando archivo..." : (toolsToSend.includes("planning_mode") ? "Charly está planificando..." : "Charly está respondiendo..."),
    requestedTools: toolsToSend,
    attachments: effectiveAttachments,
    isNewAttachment,
    isSentFromComposer: true
  });
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
  return runMcpChatAgent(text, { status: "Generando...", requestedTools: Array.from(selectedAgentTools) });
}

async function runMcpChatAgent(text = "", { status = "Generando...", requestedTools = [], attachments = [], isNewAttachment = undefined, displayText = "", isSentFromComposer = false } = {}) {
  if (activeChatRequestId) return { error: new Error("Ya hay una respuesta en curso.") };
  const hasNewAtt = typeof isNewAttachment === "boolean" ? isNewAttachment : (Array.isArray(attachments) && attachments.length > 0);
  const transientAttachments = hasNewAtt ? attachments : [];
  const requestId = `chat_${createId()}`;
  activeChatRequestId = requestId;
  try {
    localStorage.setItem("cb_active_chat_generation", JSON.stringify({ requestId, sessionId: store.getState().session.id, status, attachments: transientAttachments, startedAt: Date.now() }));
  } catch (error) {
    if (error?.name !== "QuotaExceededError") console.warn("No se pudo guardar el estado del chat", error);
    // La generación sigue en memoria; el almacenamiento solo permite reanudar tras recargar.
  }
  setComposerBusy(true);
  chatController?.showTransientStatus(status, { attachments: transientAttachments, progressPct: hasNewAtt ? 15 : null });
  void pollActiveChatProgress(requestId, status, transientAttachments);
  try {
    const session = store.getState().session;
    const proposalIds = new Set((session.proposals || []).map((proposal) => proposal.id));
    const toolsToRequest = requestedTools.length ? requestedTools : Array.from(selectedAgentTools);

    // Si la llamada fue disparada por un botón o acción programática (no desde el composer),
    // registrar el mensaje amigable en el chat conservando los parámetros e IDs en el texto interno
    if (!isSentFromComposer) {
      const friendlyLabel = displayText || formatFriendlyChatMessage(text, session);
      store.addMessage({ role: "user", text, displayText: friendlyLabel, requestedTools: toolsToRequest });
      await persist();
    }

    const result = await sendCharlyChat({
      sessionId: session.id,
      targetUnitId: session.activeUnitId,
      text,
      model: session.meta?.model,
      requestedTools: toolsToRequest,
      requestId,
      attachments,
      editorialConfig: {
        prompts: getInternalPrompts(),
        gradeSubtopics: getCategoriesForGrade(session.meta?.grade || ""),
        studentVocabulary: buildVocabularyPromptDirective({ target: "student" }),
        teacherVocabulary: buildVocabularyPromptDirective({ target: "teacher" }),
        enabledExerciseDynamics: getStoredExerciseDynamics()
      }
    }).catch((error) => ({ error }));
    if (result.error && activeChatRequestId === requestId) {
      await new Promise((r) => setTimeout(r, 1200));
      try {
        const state = await controlCharlyChat(requestId);
        if (state && (state.status === "running" || state.status === "complete")) {
          return result;
        }
      } catch (_) {}
      store.addMessage({ role: "assistant", text: `No pude responder el chat: ${result.error.message}` });
    }
    if (result.session) {
      store.setSession(result.session);
    } else if (result.text) {
      store.addMessage({ role: "assistant", text: result.text, specifications: result.specifications || "", toolCalls: result.usedTools || [] });
    }
    if (result.proposal) {
      store.addProposal(result.proposal);
    }
    const newProposals = (store.getState().session.proposals || []).filter((proposal) => !proposalIds.has(proposal.id));
    newProposals.reverse().forEach((proposal) => store.addMessage({ role: "assistant", html: renderProposalMessage(proposal), proposalId: proposal.id }));
    await persist();
    return result;
  } finally {
    if (activeChatRequestId === requestId) {
      activeChatRequestId = "";
      localStorage.removeItem("cb_active_chat_generation");
      chatController?.clearTransientStatus();
      setComposerBusy(false);
    }
  }
}

function calculateAnalysisPercent(elapsedMs = 0, progressText = "") {
  if (/completad/i.test(progressText)) return 100;
  const blockMatch = progressText.match(/(?:bloque|checkpoint|parte)\s*(\d+)\s*de\s*(\d+)/i);
  if (blockMatch) {
    const cur = parseInt(blockMatch[1], 10);
    const total = parseInt(blockMatch[2], 10);
    if (total > 0) return Math.min(94, Math.round(15 + (cur / total) * 75));
  }
  if (/sintetiz|integr|redactando|preparando respuesta/i.test(progressText)) {
    const extraSec = Math.max(0, (elapsedMs - 12000) / 1000);
    return Math.min(99, Math.round(92 + Math.min(7, extraSec * 0.5)));
  }
  const seconds = elapsedMs / 1000;
  if (seconds < 3) return Math.min(25, Math.round(15 + seconds * 4));
  if (seconds < 12) return Math.min(65, Math.round(25 + (seconds - 3) * 4.4));
  if (seconds < 30) return Math.min(88, Math.round(65 + (seconds - 12) * 1.3));
  if (seconds < 60) return Math.min(96, Math.round(88 + (seconds - 30) * 0.27));
  return Math.min(99, Math.round(96 + (seconds - 60) * 0.06));
}

const FILE_ANALYSIS_STEPS = [
  "Leyendo estructura del archivo...",
  "Extrayendo texto y metadatos...",
  "Indexando unidades y temas...",
  "Examinando contenido con el modelo...",
  "Sintetizando información del documento...",
  "Preparando respuesta y propuestas..."
];

async function pollActiveChatProgress(requestId, initialStatus, attachments = []) {
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const startedAt = Date.now();
  let lastLabel = initialStatus || (attachments.length ? FILE_ANALYSIS_STEPS[0] : "Respondiendo...");

  while (activeChatRequestId === requestId) {
    try {
      const state = await controlCharlyChat(requestId);
      if (activeChatRequestId !== requestId) return;
      const backendProgress = String(state?.progress || "").trim();
      const elapsed = Date.now() - startedAt;

      if (state?.status === "complete") {
        chatController?.showTransientStatus("¡Análisis completado!", { attachments, progressPct: 100 });
        await new Promise((r) => setTimeout(r, 400));
        if (activeChatRequestId === requestId) {
          activeChatRequestId = "";
          localStorage.removeItem("cb_active_chat_generation");
          chatController?.clearTransientStatus();
          setComposerBusy(false);
          const selectedSessionId = store.getState().session.id;
          await refreshSessions();
          const sessions = store.getState().sessions || [];
          const restoredSession = sessions.find((session) => session.id === selectedSessionId);
          if (restoredSession) store.setSession(restoredSession);
        }
        return;
      }

      if (state?.status === "failed") {
        if (activeChatRequestId === requestId) {
          activeChatRequestId = "";
          localStorage.removeItem("cb_active_chat_generation");
          chatController?.clearTransientStatus();
          setComposerBusy(false);
          store.addMessage({ role: "assistant", text: "No pude completar el análisis del archivo. Por favor vuelve a intentarlo." });
        }
        return;
      }

      const isGeneric = !backendProgress || /^(Procesando|Preparando|Iniciando)\s+tu\s+solicitud/i.test(backendProgress);
      let displayLabel = backendProgress;

      if (isGeneric && attachments.length > 0) {
        const stepIdx = Math.min(FILE_ANALYSIS_STEPS.length - 1, Math.floor(elapsed / 3800));
        displayLabel = FILE_ANALYSIS_STEPS[stepIdx];
      } else if (!displayLabel) {
        displayLabel = lastLabel;
      }

      const progressPct = calculateAnalysisPercent(elapsed, displayLabel);
      if (state.status === "running") {
        lastLabel = displayLabel;
        chatController?.showTransientStatus(displayLabel, { attachments, progressPct });
      }
    } catch (_) {
      // Reintentar en el siguiente tick ante fallos de red transitorios
    }
    const pollDelay = document.hidden ? 15000 : Date.now() - startedAt > 30000 ? 5000 : 2500;
    await new Promise((resolve) => setTimeout(resolve, pollDelay));
  }
}

async function stopChatGeneration() {
  const requestId = activeChatRequestId;
  if (!requestId) return;
  activeChatRequestId = "";
  localStorage.removeItem("cb_active_chat_generation");
  chatController?.clearTransientStatus(); setComposerBusy(false);
  toast("Generación detenida");
  await controlCharlyChat(requestId, "stop").catch((error) => {
    if (error?.status !== 404) console.warn("No se pudo confirmar la cancelación del chat", error);
  });
}

function resumeChatGeneration() {
  let pending;
  try { pending = JSON.parse(localStorage.getItem("cb_active_chat_generation") || "null"); } catch (_) { pending = null; }
  if (!pending?.requestId) return;
  activeChatRequestId = pending.requestId;
  setComposerBusy(true);
  const initialPct = calculateAnalysisPercent(Date.now() - (pending.startedAt || Date.now()), pending.status);
  chatController?.showTransientStatus(pending.status || "Respondiendo...", { attachments: pending.attachments || [], progressPct: initialPct });
  let missingStateRetries = 0;
  const poll = async () => {
    if (activeChatRequestId !== pending.requestId) return;
    let state;
    let pollError = null;
    try { state = await controlCharlyChat(pending.requestId); } catch (error) { pollError = error; }
    if (!state) {
      if (pollError?.status === 404) {
        if (missingStateRetries++ < 40) { setTimeout(poll, 1500); return; }
        // Si no se encontró el job anterior pero tenemos el texto y los adjuntos, reanudar automáticamente
        if (pending.text || (pending.attachments && pending.attachments.length)) {
          console.info("[charly-brown] Reanudando análisis de documento en segundo plano...");
          localStorage.removeItem("cb_active_chat_generation");
          activeChatRequestId = "";
          void runMcpChatAgent(pending.text, {
            status: pending.attachments?.length ? "Analizando archivo..." : "Respondiendo...",
            attachments: pending.attachments || []
          });
          return;
        }
        activeChatRequestId = ""; localStorage.removeItem("cb_active_chat_generation");
        chatController?.clearTransientStatus(); setComposerBusy(false);
        store.addMessage({ role: "assistant", text: "No encontré el estado de la respuesta anterior. El chat ya está disponible para continuar." });
        return;
      }
      setTimeout(poll, 1800); return;
    }
    if (state.status === "running") {
      const backendProgress = String(state.progress || "").trim();
      const elapsed = Date.now() - (pending.startedAt || Date.now());
      const isGeneric = !backendProgress || /^(Procesando|Preparando|Iniciando)\s+tu\s+solicitud/i.test(backendProgress);
      let displayLabel = backendProgress;
      if (isGeneric && (pending.attachments?.length || 0) > 0) {
        const stepIdx = Math.min(FILE_ANALYSIS_STEPS.length - 1, Math.floor(elapsed / 3800));
        displayLabel = FILE_ANALYSIS_STEPS[stepIdx];
      } else if (!displayLabel) {
        displayLabel = pending.status || "Analizando archivo...";
      }
      const progressPct = calculateAnalysisPercent(elapsed, displayLabel);
      chatController?.showTransientStatus(displayLabel, { attachments: pending.attachments || [], progressPct });
      setTimeout(poll, document.hidden ? 15000 : 5000); return;
    }
    if (state.status === "complete") {
      const selectedSessionId = store.getState().session.id;
      await refreshSessions();
      const sessions = store.getState().sessions || [];
      const restoredSession = sessions.find((session) => session.id === selectedSessionId)
        || sessions.find((session) => session.id === pending.sessionId);
      if (restoredSession) store.setSession(restoredSession);
    } else if (state.status === "failed") {
      // Si falló el job anterior pero tenemos el texto y los adjuntos, reintentar automáticamente
      if (pending.text || (pending.attachments && pending.attachments.length)) {
        console.info("[charly-brown] Reintentando análisis de documento en segundo plano...");
        localStorage.removeItem("cb_active_chat_generation");
        activeChatRequestId = "";
        void runMcpChatAgent(pending.text, {
          status: pending.attachments?.length ? "Analizando archivo..." : "Respondiendo...",
          attachments: pending.attachments || []
        });
        return;
      }
      store.addMessage({ role: "assistant", text: "La respuesta anterior terminó con un error. Puedes volver a intentarlo." });
    }
    activeChatRequestId = ""; localStorage.removeItem("cb_active_chat_generation");
    chatController?.clearTransientStatus(); setComposerBusy(false);
  };
  poll();
}

async function handleGenerateReading(userText = "") {
  const current = store.getState().session;
  const activeUnit = current.units?.find((unit) => unit.id === current.activeUnitId);
  const next = getNextWorkflowStep(activeUnit?.workflow || {});
  const readingStage = ["reading", "synonyms", "comprehension"].includes(next.kind) ? next.kind : "reading";
  const brief = String(userText || "").trim();
  const stageLabel = readingStage === "synonyms" ? "sinónimos" : readingStage === "comprehension" ? "comprensión" : "lectura";
  const displayText = `Diseñar propuesta de ${stageLabel} para la unidad`;
  const prompt = `Consulta get_unit_workflow y usa design_reading_stage para crear una propuesta de ${readingStage}. Usa sessionId=${current.id}, targetUnitId=${current.activeUnitId}, baseRevision=${Number(activeUnit?.revision || 0)} y readingStage=${readingStage}.${brief ? ` Instrucción adicional: ${brief}` : ""} No apruebes el contenido.`;
  return runMcpChatAgent(prompt, {
    status: `Diseñando ${stageLabel}...`,
    requestedTools: ["design_reading_stage"],
    displayText
  });
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
  const session = store.getState().session;
  if (!Number(session.storageRevision || 0) && !store.getState().sessions.some(item => item.id === session.id)) return;
  if (session.units?.find(unit => unit.id === session.activeUnitId)?.automation?.status === "running") return;
  clearTimeout(syaLoadTimer);
  syaLoadTimer = setTimeout(() => {
    handleLoadSya({ silent, replaceExisting });
  }, delay);
}

async function handleLoadSya({ silent = false, replaceExisting = false } = {}) {
  const session = store.getState().session;
  if (!Number(session.storageRevision || 0) && !store.getState().sessions.some(item => item.id === session.id)) return;
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
  const nextOriginal = shouldKeepEditedVersion ? currentOriginal : sya;
  store.patchSession({
    sya: nextActive,
    syaOriginal: nextOriginal,
    syaContextKey: contextKey,
    accepted: { ...(current.accepted || {}), sya: nextActive, syaOriginal: nextOriginal }
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
  const mathSelections = getMathResourceSelections(category, subtopic, workflowItems);
  if (mathSelections) {
    const selected = resourceSelections || {};
    resourceSelections = Object.fromEntries(["fichas", "anexos", "recortables", "videos"].map((type) => [type, Boolean(selected[type] || mathSelections[type])]));
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
  const mathResourceLabels = [
    mathSelections?.fichas && "una ficha de práctica",
    mathSelections?.anexos && "un anexo visual",
    mathSelections?.recortables && "un recortable manipulativo"
  ].filter(Boolean);
  const mathResourceInstruction = mathResourceLabels.length ? ` Para Matemáticas, incluye los dos recursos complementarios (${mathResourceLabels.join(" y ")}) para ${subtopic}, cada uno como bloque independiente, vinculado a esta actividad y mencionado en el paso donde se usa.` : "";
  const prompt = `Usa design_activity para crear una sola propuesta de la sección ${section}. Usa sessionId=${session.id}, targetUnitId=${session.activeUnitId}, baseRevision=${Number(activeUnit?.revision || 0)}, section=${section}${sectionId ? `, sectionId=${sectionId}` : ""}${category ? `, category=${category}` : ""}${subtopic ? `, subtopic=${subtopic}` : ""} y resourceTypes=${JSON.stringify(resourceTypes)}.${mathResourceInstruction}${brief ? ` Instrucción adicional: ${brief}` : ""} Consulta la definición vigente, la lectura completa y la memoria editorial. Genera la actividad y cada recurso seleccionado dentro de la misma propuesta, como bloques separados para aprobarlos independientemente. La consigna de la actividad debe nombrar cada recurso y explicar exactamente en qué paso se usa. No apruebes el contenido.`;
  const resourceToolMap = {
    worksheet: "design_worksheet",
    annex: "design_annex",
    cutout: "design_cutout",
    "video-script": "design_video_script"
  };
  const resourceLabelMap = {
    worksheet: "ficha",
    annex: "anexo",
    cutout: "recortable",
    "video-script": "video"
  };
  const resourceToolKeys = resourceTypes.map((t) => resourceToolMap[t]).filter(Boolean);
  const requestedTools = ["design_activity", ...resourceToolKeys];
  const resourceLabelsText = resourceTypes.map((t) => resourceLabelMap[t]).filter(Boolean).join(", ");
  const displayText = `Diseñar actividad de ${section}${resourceLabelsText ? ` (con ${resourceLabelsText})` : ""}`;
  return runMcpChatAgent(prompt, {
    status: `Diseñando ${section}...`,
    requestedTools,
    displayText
  });
}

function selectedResourceContentTypes(selections = {}) {
  return [
    selections.fichas && "worksheet",
    selections.anexos && "annex",
    selections.recortables && "cutout",
    selections.videos && "video-script"
  ].filter(Boolean);
}

function getMathResourceSelections(category = "", subtopic = "", workflowItems = []) {
  const normalizedCategory = String(category || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const normalizedSubtopic = String(subtopic || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!normalizedCategory.includes("matemat") && !normalizedSubtopic.includes("matemat")) return null;

  const numberedSubtopic = normalizedSubtopic.match(/matemat(?:icas)?\s*(\d+)/);
  const mathItems = workflowItems.filter((item) => {
    const itemCategory = String(item.category || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return itemCategory.includes("matemat");
  });
  const workflowIndex = mathItems.findIndex((item) => String(item.subtopic || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === normalizedSubtopic);
  const index = numberedSubtopic ? Math.max(0, Number(numberedSubtopic[1]) - 1) : Math.max(0, workflowIndex);
  const primaryType = index % 6 < 3 ? "fichas" : index % 6 === 3 ? "recortables" : "anexos";
  const additionalType = ["anexos", "recortables", "anexos", "fichas", "fichas", "recortables"][index % 6];
  return {
    fichas: primaryType === "fichas" || additionalType === "fichas",
    anexos: primaryType === "anexos" || additionalType === "anexos",
    recortables: primaryType === "recortables" || additionalType === "recortables",
    videos: false
  };
}

function bindProposalActions() {
  document.addEventListener("click", event => {
    handleProposalClick(event).catch(error => toast(error.message || "No se pudo guardar el recurso."));
  });
}

async function handleProposalClick(event) {
    const reviewButton = event.target.closest?.("[data-review-resource]");
    if (reviewButton) {
      const proposalId = reviewButton.closest("[data-proposal-id]")?.dataset.proposalId;
      const proposal = store.getState().session.proposals.find(item => item.id === proposalId);
      if (!proposal) return;
      const index = reviewButton.dataset.resourceProposalIndex;
      const resource = index === undefined ? proposal : extractResourceBlocks(proposal.html)[Number(index)];
      if (!resource) return;
      const alreadyApproved = store.getState().session.accepted.resources.find(item => item.sourceProposalId === proposal.id && (index === undefined || item.code === resource.code));
      if (alreadyApproved) return editResource(alreadyApproved.id);
      const assertCurrentUnit = () => {
        if (proposal.targetUnitId && proposal.targetUnitId !== store.getState().session.activeUnitId) throw new Error("Abre la unidad de este recurso para revisarlo.");
      };
      const approve = async () => {
        assertCurrentUnit();
        if (proposal.validation?.ok === false) throw new Error("El recurso requiere corrección antes de aprobarlo.");
        const wrapper = document.createElement("div");
        wrapper.dataset.proposalId = proposal.id;
        const button = document.createElement("button");
        if (index === undefined) button.dataset.proposalAction = "accept";
        else { wrapper.dataset.resourceProposalIndex = index; button.dataset.resourceProposalAction = "accept"; }
        wrapper.append(button);
        await handleProposalClick({ target: button });
      };
      const saveDraft = async nextHtml => {
        assertCurrentUnit();
        const current = store.getState().session;
        const latest = current.proposals.find(item => item.id === proposal.id);
        if (!latest || latest.status === "approved") throw new Error("La propuesta cambió. Vuelve a abrirla.");
        let html = nextHtml;
        if (index !== undefined) {
          const doc = new DOMParser().parseFromString(latest.html, "text/html");
          const nodes = doc.querySelectorAll("[data-resource-type], [data-resource-section='true'], .resource-ficha, .resource-anexo, .resource-recortable, .resource-video, .guion-video");
          if (!nodes[Number(index)]) throw new Error("El recurso cambió. Vuelve a abrirlo.");
          nodes[Number(index)].outerHTML = nextHtml;
          html = doc.body.innerHTML;
        }
        store.patchSession({ proposals: current.proposals.map(item => item.id === proposal.id ? { ...item, html } : item) });
        resource.html = nextHtml;
        if (!await persist()) throw new Error("No se pudo guardar el cambio en Firebase.");
      };
      openResourceReview({ title: resource.title || resource.code || "Recurso", html: resource.html,
        onApprove: approve, onSave: saveDraft,
        onEdit: () => openResourceEditorModal(resource, saveDraft),
        onRegenerate: () => { assertCurrentUnit(); return regenerateResourceDraft(resource, proposal); }
      });
      return;
    }
    const resourceButton = event.target.closest?.("[data-resource-proposal-action]");
    if (resourceButton) {
      const resourceCard = resourceButton.closest("[data-resource-proposal-index]");
      const proposalId = resourceCard?.closest("[data-proposal-id]")?.dataset.proposalId || "";
      const proposal = (store.getState().session.proposals || []).find((item) => item.id === proposalId);
      if (!proposal) return;
      const resources = extractResourceBlocks(proposal.html);
      const index = Number(resourceCard?.dataset.resourceProposalIndex ?? -1);
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
        if (!await persist()) throw new Error("No se pudo guardar. El recurso permanece abierto para reintentar.");
      }
      if (action === "reject") {
        store.addPreference(`No repetir el recurso ${buildResourceContextLabel(resource.type)} rechazado; corrige el diseño del material en la siguiente generación.`);
        flashWorkingStatus();
        if (!await persist()) throw new Error("No se pudo guardar. El recurso permanece abierto para reintentar.");
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
    if (proposal.status === "approved" && action === "accept") return;

    if (action === "accept") {
      const beforeApproval = store.getState().session;
      if (proposal.validation?.ok === false) {
        store.addMessage({ role: "assistant", text: "Esa propuesta todavía no cumple la estructura mínima. Pídeme corregirla antes de aceptarla." });
        return;
      }
      if (proposal.targetUnitId && proposal.targetUnitId !== session.activeUnitId) {
        store.addMessage({ role: "assistant", text: "La propuesta pertenece a otra unidad. Abre esa unidad antes de aprobarla." });
        return;
      }
      if (proposal.createdBy === "charly-mcp" || ["create", "update", "delete", "regenerate"].includes(proposal.action)) {
        let acceptedProposal = proposal.contentType === "activity"
          ? {
              ...proposal,
              html: stripResourceBlocks(proposal.html),
              ...(proposal.targetContentId
                ? {}
                : { subtopic: resolveProposalSubtopic(session, proposal), category: proposal.category || session.meta?.category || "" })
            }
          : proposal;
        if (proposal.contentType === "reading" && proposal.readingStage === "reading") {
          const illustratedReading = await ensureReadingIllustration({ title: proposal.title, html: proposal.html }, {
            sessionId: session.id,
            targetUnitId: proposal.targetUnitId || session.activeUnitId,
            model: session.meta?.model || DEFAULT_GEMINI_MODEL
          });
          acceptedProposal = {
            ...acceptedProposal,
            html: illustratedReading.html,
            artifact: {
              ...(acceptedProposal.artifact || {}),
              generatedImage: true,
              illustrationAsset: illustratedReading.illustrationAsset,
              illustrationModel: illustratedReading.illustrationModel,
              visualReview: illustratedReading.illustrationVisualReview
            }
          };
        }
        const outcome = store.applyContentProposal(acceptedProposal);
        if (!outcome?.ok) {
          throw new Error(outcome?.error || "No pude aprobar la propuesta.");
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
        } else if (["worksheet", "annex", "cutout", "video-script"].includes(proposal.contentType)) {
          const activeSession = store.getState().session;
          const activeUnit = activeSession.units?.find((u) => u.id === activeSession.activeUnitId);
          const resource = activeUnit?.accepted?.resources?.find((r) => r.id === proposal.id || r.sourceProposalId === proposal.id);

          const targetActId = proposal.targetActivityId || resource?.activityId;
          const parentActivity = activeUnit?.accepted?.activities?.find((a) => a.id === targetActId);

          if (parentActivity && resource) {
            const resCode = resource.code || resource.title || "recurso";
            const notes = [...(parentActivity.notes || []), ...(activeUnit?.accepted?.teacherNotes || [])];
            const existingNote = notes.find((note) => String(note.activityId) === String(parentActivity.id));
            if (existingNote && !String(existingNote.html || "").toLowerCase().includes(resCode.toLowerCase())) {
              store.addMessage({ role: "assistant", workflowKind: `note-update:${parentActivity.id}:${resource.id}`,
                html: `<section class="cb-workflow-suggestion"><p class="cb-panel-kicker">Nota del maestro</p><p>El recurso ${escapeHtmlText(resCode)} ya está aprobado. La nota de esta actividad necesita incorporar su uso.</p><button type="button" data-workflow-action="generate-notes" data-activity-id="${escapeAttr(parentActivity.id)}">Proponer actualización de la nota</button></section>` });
            }
          }
        }
        proposeNextWorkflowStep();
        flashWorkingStatus();
        let saved = await persist();
        if (!saved) {
          saved = await saveSession(store.getState().session).catch((err) => {
            console.error("[charly-brown] fallback save after accept failed", err);
            return null;
          });
          if (saved) store.patchSession({ storageRevision: saved.storageRevision });
        }
        if (!saved) {
          store.setSession(beforeApproval);
          throw new Error("No se pudo guardar. La propuesta permanece pendiente para reintentar.");
        }
        return;
      }
      if (proposal.contentType === "reading") {
        let reading = { ...(proposal.reading || {}), title: proposal.title, html: proposal.html };
        reading = await ensureReadingIllustration(reading, {
          sessionId: session.id,
          targetUnitId: proposal.targetUnitId || session.activeUnitId,
          model: session.meta?.model || DEFAULT_GEMINI_MODEL
        });
        const saved = await saveGeneratedReading({ reading, session }).catch(() => ({ saved: false }));
        if (saved?.saved) Object.assign(reading, { id: saved.id, collection: saved.collection, sourceLabel: "Lecturas nuevas" });
        store.patchSession({ reading, accepted: { ...session.accepted, reading } });
        flashWorkingStatus();
        let persisted = await persist();
        if (!persisted) {
          persisted = await saveSession(store.getState().session).catch(() => null);
          if (persisted) store.patchSession({ storageRevision: persisted.storageRevision });
        }
        if (!persisted) throw new Error("No se pudo guardar. El recurso permanece abierto para reintentar.");
        return;
      }
      const workMode = getWorkModeLabel(store.getState().session.meta || {});
      const activityHtml = normalizeProposalAnswers(stripResourceBlocks(proposal.html));
      store.acceptActivity({
        title: proposal.title || (workMode === "proyecto" ? "Proyecto aprobado" : "Actividad aprobada"),
        section: proposal.section || store.getState().session.meta?.category || "",
        subtopic: resolveProposalSubtopic(session, proposal),
        category: proposal.category || session.meta?.category || "",
        sourceProposalId: proposal.id,
        html: activityHtml
      });
      flashWorkingStatus();
      let activitySaved = await persist();
      if (!activitySaved) {
        activitySaved = await saveSession(store.getState().session).catch(() => null);
        if (activitySaved) store.patchSession({ storageRevision: activitySaved.storageRevision });
      }
      if (!activitySaved) {
        store.setSession(beforeApproval);
        throw new Error("No se pudo guardar. La propuesta permanece pendiente para reintentar.");
      }
      proposeNextWorkflowStep();
    }

    if (action === "reject") {
      store.addPreference("No repetir la propuesta rechazada; corregir enfoque y estructura en la siguiente generación.");
      flashWorkingStatus();
      if (!await persist()) throw new Error("No se pudo guardar. El recurso permanece abierto para reintentar.");
    }

    if (action === "regenerate" && proposal.contentType !== "reading") {
      if (proposal.contentType === "activity") await markDependentProposalsForReview(proposal.id);
      if (["worksheet", "annex", "cutout", "video-script"].includes(proposal.contentType)) await regenerateResourceDraft(proposal, proposal);
      else if (proposal.contentType === "teacher-note") await regenerateTeacherNoteProposal(proposal);
      else if (proposal.contentType === "sya") await regenerateSyaProposal(proposal);
      else await handleRegenerateProposal(proposal);
    }

    if (action === "easier") {
      if (proposal.contentType === "activity") await markDependentProposalsForReview(proposal.id);
      store.updateMeta({ difficulty: "easy" });
      if (proposal.contentType === "teacher-note") {
        await regenerateTeacherNoteProposal(proposal, "Redacta orientaciones más sencillas, guiadas y concretas.");
      } else if (["worksheet", "annex", "cutout", "video-script"].includes(proposal.contentType)) {
        await regenerateResourceDraft(proposal, { ...proposal, difficulty: "easy" });
      } else {
        await handleRefineProposal(proposal, {
          difficulty: "easy",
          userText: "Haz esta misma propuesta más fácil, más guiada y más concreta para niños pequeños, sin cambiar el tema ni el aprendizaje."
        });
      }
    }

    if (action === "harder") {
      if (proposal.contentType === "activity") await markDependentProposalsForReview(proposal.id);
      store.updateMeta({ difficulty: "challenging" });
      if (proposal.contentType === "teacher-note") {
        await regenerateTeacherNoteProposal(proposal, "Profundiza la mediación docente y añade preguntas de mayor exigencia cognitiva.");
      } else if (["worksheet", "annex", "cutout", "video-script"].includes(proposal.contentType)) {
        await regenerateResourceDraft(proposal, { ...proposal, difficulty: "challenging" });
      } else {
        await handleRefineProposal(proposal, {
          difficulty: "challenging",
          userText: "Haz esta misma propuesta más difícil sin cambiar el tema ni el subtema. Añade distractores plausibles, opciones múltiples con una sola correcta, inferencias, comparación de respuestas cercanas y evidencias más exigentes."
        });
      }
    }

    if (action === "teacher-notes") {
      await handleGenerateTeacherNotes("");
    }
}

async function markDependentProposalsForReview(activityProposalId = "") {
  const session = store.getState().session;
  const proposals = (session.proposals || []).map((item) => {
    if (item.status !== "pending" || item.artifact?.sourceActivityProposalId !== activityProposalId) return item;
    return {
      ...item,
      validation: { ok: false, errors: ["La actividad de origen cambió. Regenera este contenido antes de aprobarlo."] },
      artifact: { ...(item.artifact || {}), needsReview: true }
    };
  });
  store.patchSession({ proposals });
  if (!await persist()) throw new Error("No pude actualizar las propuestas vinculadas. Intenta de nuevo.");
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
  const targetUnitId = String(proposal.targetUnitId || session.activeUnitId || "");
  const unit = (session.units || []).find((item) => String(item.id) === targetUnitId);
  const target = (unit?.accepted?.activities || []).find((item) => String(item.id) === String(proposal.targetContentId || proposal.targetActivityId || ""));
  if (target?.subtopic) return String(target.subtopic);
  const candidates = [proposal.subtopic, proposal.title, proposal.section, session.meta?.subtopic];
  const value = candidates.map(normalizeActivitySubtopicTitle).find(Boolean);
  return formatSubtopicLabel(value || "Actividad");
}

async function handleGenerateTeacherNotes(activityId = "") {
  const session = store.getState().session;
  const activeUnit = session.units?.find((unit) => unit.id === session.activeUnitId) || session.units?.[0];
  const unitActivities = activeUnit?.accepted?.activities || session.accepted?.activities || [];
  const activity = activityId
    ? unitActivities.find((item) => String(item.id) === String(activityId) || String(item.sectionId) === String(activityId))
    : null;
  if (!unitActivities.length) {
    store.addMessage({ role: "assistant", text: "No hay actividades aprobadas para generar notas. Acepta al menos una actividad primero." });
    return;
  }
  if (!activity) {
    const prompt = "El usuario solicitó crear notas del maestro desde el botón de la unidad actual. Pregúntale para qué subtema y actividad aprobada desea la nota. Muestra los nombres disponibles de esta unidad y no generes ni guardes nada hasta que elija una opción exacta.";
    return runMcpChatAgent(prompt, {
      status: "Revisando las actividades de la unidad...",
      requestedTools: ["create_teacher_notes"],
      displayText: "Crear notas del maestro para la unidad"
    });
  }

  // Tomar en cuenta si la actividad contiene recursos complementarios vinculados
  const linkedResources = (activeUnit?.accepted?.resources || []).filter((r) => String(r.activityId) === String(activity.id));
  const existingNote = [...(activity.notes || []), ...(activeUnit?.accepted?.teacherNotes || [])]
    .find((note) => String(note.activityId) === String(activity.id));

  let resourcesDirective = "";
  if (linkedResources.length > 0) {
    const resSummary = linkedResources.map((r) => {
      const typeLabel = normalizeResourceType(r.type);
      const label = r.code || r.title || typeLabel;
      return `[${label} (${typeLabel})]`;
    }).join(", ");
    resourcesDirective = ` RECURSOS VINCULADOS A LA ACTIVIDAD: La actividad cuenta con los siguientes ${linkedResources.length} recurso(s) vinculado(s): ${resSummary}. Es OBLIGATORIO que la nota del maestro integre y detalle las orientaciones didácticas paso a paso para el uso y mediación de cada uno de estos recursos en clase. Si contiene recortables, incluye sus pautas de armado y mediación dentro de esta misma nota.`;
  }

  const targetLabel = activity.title
    ? `"${activity.title}" (${activity.subtopic})`
    : activity.subtopic || "la actividad";
  const unitLabel = activeUnit?.title ? `${activeUnit.title} · ` : (activeUnit?.meta?.unit ? `Unidad ${activeUnit.meta.unit} · ` : "");
  const displayText = `${existingNote ? "Actualizar" : "Crear"} notas del maestro para ${unitLabel}${targetLabel}${linkedResources.length ? ` articulando los recursos vinculados` : ""}.`;

  const prompt = `Usa design_teacher_note para preparar una propuesta pendiente de aprobación. Usa sessionId=${session.id}, targetUnitId=${session.activeUnitId}, baseRevision=${Number(activeUnit?.revision || 0)}, mode=single, operation=${existingNote ? "edit" : "create"}, targetActivityId=${activity.id}${existingNote ? `, targetContentId=${existingNote.id}` : ""} y subtopic=${JSON.stringify(activity.subtopic)}. Esta actividad pertenece a la unidad ${activeUnit?.meta?.unit || "1"} (${activeUnit?.title || "Unidad 1"}). Usa la lectura, la secuencia y la actividad aprobadas.${resourcesDirective} No guardes la nota directamente.`;
  if (typeof window.closeUnitDrawer === "function") {
    window.closeUnitDrawer();
  }
  return runMcpChatAgent(prompt, {
    status: `Preparando nota del maestro para ${activity.subtopic || "actividad"}...`,
    requestedTools: ["create_teacher_notes"],
    displayText
  });
}

async function handleGenerateResourceNotes(resourceId = "") {
  const session = store.getState().session;
  const resource = session.accepted.resources.find((item) => item.id === resourceId);
  if (!resource) return;
  const normType = String(resource.type || "").toLowerCase();
  if (normType.includes("cutout") || normType.includes("recort")) {
    store.addMessage({
      role: "assistant",
      text: "Los recortables no llevan una nota del maestro independiente. Sus indicaciones de uso, mediación y armado deben incluirse dentro de la nota del maestro de la actividad correspondiente."
    });
    return;
  }
  const resourceLabel = buildResourceContextLabel(resource.type);
  const activeUnit = session.units?.find((unit) => unit.id === session.activeUnitId);
  const activity = session.accepted.activities.find((item) => item.id === resource.activityId);
  if (!activity?.subtopic) {
    store.addMessage({ role: "assistant", text: "Este recurso no tiene una actividad y un subtema vinculados. Relaciónalo antes de crear su nota del maestro." });
    return;
  }
  const unitLabel = activeUnit?.title ? `${activeUnit.title} · ` : (activeUnit?.meta?.unit ? `Unidad ${activeUnit.meta.unit} · ` : "");
  const displayText = `Crear notas del maestro para ${unitLabel}el recurso "${resource.title || resource.code || resourceLabel}" (${activity.subtopic}).`;
  const prompt = `Usa design_teacher_note para preparar una propuesta pendiente de aprobación para el recurso aprobado ${resourceLabel}. Usa sessionId=${session.id}, targetUnitId=${session.activeUnitId}, baseRevision=${Number(activeUnit?.revision || 0)}, mode=resource, operation=create, targetResourceId=${resourceId}, targetActivityId=${activity.id} y subtopic=${JSON.stringify(activity.subtopic)}. Esta actividad pertenece a la unidad ${activeUnit?.meta?.unit || "1"} (${activeUnit?.title || "Unidad 1"}). Usa la lectura y la secuencia vigentes. No guardes la nota directamente.`;
  if (typeof window.closeUnitDrawer === "function") {
    window.closeUnitDrawer();
  }
  return runMcpChatAgent(prompt, { status: `Preparando una propuesta para ${resourceLabel.toLowerCase()}...`, requestedTools: ["create_teacher_notes"], displayText });
}
window.handleGenerateTeacherNotes = handleGenerateTeacherNotes;
window.handleGenerateResourceNotes = handleGenerateResourceNotes;

function editActivity(activityId = "", nextHtml = undefined) {
  const session = store.getState().session;
  const activity = session.accepted.activities.find((item) => item.id === activityId);
  if (!activity) return;

  if (nextHtml !== undefined) {
    store.updateActivity(activityId, { html: nextHtml });
    persist();
    return;
  }

  openActivityEditorModal(activity, (nextHtml) => {
    store.updateActivity(activityId, { html: nextHtml });
    persist();
  });
}

function editReadingSection(part = "narrative", inlineNextHtml = undefined) {
  const session = store.getState().session;
  const reading = session.accepted?.reading;
  if (!reading) return;
  const sections = reading.sections || {};

  const applyUpdate = (nextHtml) => {
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
      next.sections.narrativeHtml = nextHtml;
      next.html = nextHtml;
    }
    store.updateReading(next);
    persist();
  };

  if (inlineNextHtml !== undefined) {
    applyUpdate(inlineNextHtml);
    return;
  }

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

function editResource(resourceId = "", inlineNextHtml = undefined) {
  const session = store.getState().session;
  const resource = session.accepted.resources.find((item) => item.id === resourceId);
  if (!resource) return;
  const unitId = session.activeUnitId;
  const save = async nextHtml => {
    if (store.getState().session.activeUnitId !== unitId) throw new Error("Vuelve a la unidad de este recurso para guardar.");
    store.updateResource(resourceId, { html: nextHtml });
    if (!await persist()) throw new Error("No se pudo guardar el cambio en Firebase.");
  };

  if (inlineNextHtml !== undefined) {
    save(inlineNextHtml).catch(err => console.error(err));
    return;
  }

  openResourceReview({ title: resource.title || resource.code || "Recurso aprobado", html: resource.html, approved: true,
    onSave: save,
    onEdit: () => openResourceEditorModal(resource, save),
    onRegenerate: () => regenerateResource(resourceId)
  });
}

async function proposeExerciseStyleConversion(activityId = "") {
  const session = store.getState().session;
  const unit = session.units?.find((item) => item.id === session.activeUnitId);
  const activity = unit?.accepted?.activities?.find((item) => item.id === activityId);
  if (!activity?.html) return toast("Selecciona una actividad aprobada con contenido.");
  const previousHtml = activity.artifact?.exerciseStylePreviousHtml || "";
  const restore = Boolean(previousHtml);
  const result = restore
    ? { html: previousHtml, exerciseDynamics: activity.artifact?.exerciseDynamics || {}, changed: true }
    : convertExerciseStyles(activity.html);
  if (!result.changed && !result.exerciseDynamics.detected?.length) {
    return toast("No encontré tipos del catálogo para convertir en esta actividad.");
  }
  const id = createId("proposal");
  store.addProposal({
    id, action: "update", contentType: "activity", targetUnitId: unit.id,
    targetContentId: activity.id, targetActivityId: activity.id,
    baseRevision: Number(unit.revision || 0),
    title: activity.title || "Actividad", section: activity.section || "", sectionId: activity.sectionId || "",
    category: activity.category || "", subtopic: activity.subtopic || "", html: result.html,
    artifact: { ...(activity.artifact || {}), exerciseDynamics: result.exerciseDynamics,
      exerciseStylePreviousHtml: restore ? "" : activity.html, styleOnly: true }
  });
  store.addMessage({ role: "assistant", proposalId: id, text: restore
    ? "Revisa la restauración de los estilos anteriores antes de aprobarla."
    : "Revisa la unificación de estilos antes de aprobarla." });
  if (!await persist()) toast("No se pudo guardar la propuesta de estilos.");
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

async function adjustApprovedActivityDifficulty(activityId = "", requestedDifficulty = "easier", stepIndex = null) {
  const session = store.getState().session;
  const activity = session.accepted?.activities?.find((item) => item.id === activityId);
  if (!activity?.html) return;
  const harder = requestedDifficulty === "harder";
  const selectedScope = Number.isInteger(stepIndex) ? `únicamente el bloque ${stepIndex + 1}` : "todos los bloques del subtema";
  const userText = `Envía a revisión la actividad aprobada completa y devuelve una versión ${harder ? "más difícil" : "más fácil"}. Ajusta ${selectedScope}; conserva sin cambios los demás bloques, el propósito, las respuestas correctas, la lectura y los recursos vinculados. No apruebes el cambio: crea una propuesta pendiente de aprobación.`;
  const difficulty = harder ? "challenging" : "easy";
  const plainActivity = stripHtml(activity.html).replace(/\s+/g, " ").trim();
  store.addMessage({ role: "user", text: `${userText}\n\nActividad completa enviada como contexto:\n${plainActivity}` });
  chatController?.showTransientStatus(harder ? "Preparando una versión más desafiante…" : "Preparando una versión más accesible…");
  try {
    const refinementSession = buildActivityRegenerationSession(session, activity);
    const result = await refineActivities({ session: refinementSession, currentHtml: activity.html, difficulty, userText, model: refinementSession.meta?.model }).catch((error) => ({ error }));
    if (result.error) {
      store.addMessage({ role: "assistant", text: `No pude preparar la propuesta: ${result.error.message}` });
      return;
    }
    const unit = (session.units || []).find((item) => item.id === session.activeUnitId);
    let proposedHtml = result.html;
    if (Number.isInteger(stepIndex)) {
      proposedHtml = preserveUnselectedActivitySteps(activity.html, result.html, stepIndex);
      if (!proposedHtml) {
        store.addMessage({ role: "assistant", text: "No pude identificar con seguridad el ejercicio seleccionado en la versión nueva; conserva el contenido aprobado y vuelve a intentarlo." });
        return;
      }
    }
    const proposal = {
      id: createId("proposal"), title: activity.title || activity.subtopic || "Actividad ajustada",
      section: activity.section, html: proposedHtml, validation: result.validation, styleReview: result.styleReview,
      action: "update", contentType: "activity", targetUnitId: session.activeUnitId,
      targetContentId: activity.id, baseRevision: Number(unit?.revision || 0)
    };
    store.addProposal(proposal);
    store.addMessage({ role: "assistant", html: renderProposalMessage(proposal) });
    await persist();
  } finally {
    chatController?.clearTransientStatus();
  }
}

async function regenerateApprovedActivityStep(activityId = "", stepIndex = -1) {
  const session = store.getState().session;
  const activity = session.accepted?.activities?.find((item) => item.id === activityId);
  if (!activity?.html || !Number.isInteger(stepIndex) || stepIndex < 0) return;
  const selectedStep = stepIndex + 1;
  const userText = `Regenera por completo únicamente el ejercicio ${selectedStep} de esta actividad. Conserva exactamente el propósito, grado, subtema, lectura y recursos vinculados. Devuelve la actividad completa con el ejercicio ${selectedStep} renovado y los demás en su lugar; no cambies los demás ejercicios. Crea una propuesta pendiente de aprobación, no la apruebes.\n\nActividad completa enviada como contexto:\n${stripHtml(activity.html).replace(/\s+/g, " ").trim()}`;
  const refinementSession = buildActivityRegenerationSession(session, activity);
  store.addMessage({ role: "user", text: userText });
  chatController?.showTransientStatus(`Regenerando el ejercicio ${selectedStep}…`);
  try {
    const result = await refineActivities({ session: refinementSession, currentHtml: activity.html, difficulty: refinementSession.meta?.difficulty || "normal", userText, model: refinementSession.meta?.model }).catch((error) => ({ error }));
    if (result.error) {
      store.addMessage({ role: "assistant", text: `No pude regenerar el ejercicio: ${result.error.message}` });
      return;
    }
    const proposedHtml = preserveUnselectedActivitySteps(activity.html, result.html, stepIndex);
    if (!proposedHtml) {
      store.addMessage({ role: "assistant", text: "No pude identificar el mismo ejercicio en la nueva versión. El contenido aprobado permanece intacto." });
      return;
    }
    const unit = (session.units || []).find((item) => item.id === session.activeUnitId);
    const proposal = {
      id: createId("proposal"), title: activity.title || activity.subtopic || "Ejercicio regenerado",
      section: activity.section, html: proposedHtml, validation: result.validation, styleReview: result.styleReview,
      action: "update", contentType: "activity", targetUnitId: session.activeUnitId,
      targetContentId: activity.id, baseRevision: Number(unit?.revision || 0)
    };
    store.addProposal(proposal);
    store.addMessage({ role: "assistant", html: renderProposalMessage(proposal) });
    await persist();
  } finally {
    chatController?.clearTransientStatus();
  }
}

function preserveUnselectedActivitySteps(originalHtml = "", revisedHtml = "", selectedIndex = -1) {
  if (typeof DOMParser === "undefined") return "";
  const parse = (html) => {
    const doc = new DOMParser().parseFromString(`<main>${html}</main>`, "text/html");
    const root = doc.querySelector("main");
    let steps = Array.from(root.querySelectorAll("ol.steps-numbered > li, ol.steps.steps-numbered > li, ol.steps > li"));
    if (!steps.length) steps = Array.from(root.querySelectorAll(".activity"));
    return { root, steps };
  };
  const original = parse(originalHtml);
  const revised = parse(revisedHtml);
  if (!original.steps.length || original.steps.length !== revised.steps.length || selectedIndex < 0 || selectedIndex >= original.steps.length) return "";
  revised.steps.forEach((step, index) => {
    if (index !== selectedIndex) step.replaceWith(original.steps[index].cloneNode(true));
  });
  return revised.root.innerHTML;
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

async function regenerateResource(resourceId = "", difficulty = "") {
  const resource = store.getState().session.accepted.resources.find(item => item.id === resourceId);
  if (resource) return regenerateResourceDraft(resource, { targetContentId: resource.id, difficulty });
}

async function regenerateResourceDraft(resource, proposal = {}) {
  const session = store.getState().session;
  const type = proposal.contentType && proposal.contentType !== "activity" ? proposal.contentType : contentTypeForResource(resource.type);
  const tool = { worksheet: "design_worksheet", annex: "design_annex", cutout: "design_cutout", "video-script": "design_video_script" }[type];
  const activeUnit = session.units?.find((u) => u.id === session.activeUnitId);
  const pendingActivityProposalId = resource.pendingActivityProposalId || proposal.artifact?.sourceActivityProposalId || "";
  const activityId = resource.activityId || proposal.targetActivityId || (pendingActivityProposalId ? activeUnit?.accepted?.activities?.find(item => item.sourceProposalId === pendingActivityProposalId)?.id : "") || "";
  if (!tool || (!activityId && !pendingActivityProposalId)) throw new Error("No encontré la actividad vinculada para regenerar este recurso.");
  const imageRequirement = ["cutout", "annex"].includes(type)
    ? " Genera la imagen con Gemini mediante el especialista. Debe mostrar ilustraciones de las piezas u objetos, no formas vacías con etiquetas. No uses SVG, canvas ni reutilices la imagen anterior. Si falla la generación de imagen, informa el error y no propongas un sustituto construido por código."
    : "";
  const difficultyDirective = proposal.difficulty === "easy"
    ? " Haz esta propuesta más fácil, más guiada, accesible y concreta para los alumnos."
    : proposal.difficulty === "challenging"
    ? " Haz esta propuesta más difícil, retadora y con mayor nivel de exigencia, análisis o inferencia."
    : "";
  const diffSuffix = proposal.difficulty === "easy" ? " (más fácil)" : proposal.difficulty === "challenging" ? " (más difícil)" : "";
  const displayText = `Regenerar recurso "${resource.title || resource.code || "recurso"}"${diffSuffix}.`;
  const result = await runMcpChatAgent(`Usa ${tool} para regenerar únicamente este recurso. sessionId=${session.id}, targetUnitId=${session.activeUnitId}${activityId ? `, targetActivityId=${activityId}` : `, sourceActivityProposalId=${pendingActivityProposalId}`}${proposal.targetContentId ? `, targetContentId=${proposal.targetContentId}` : ""}. Conserva el propósito y el código ${resource.code || ""}.${difficultyDirective}${imageRequirement} Crea una propuesta nueva pendiente de aprobación, sin aprobarla. Recurso actual: ${stripHtml(resource.html || "").slice(0, 12000)}`, {
    status: `Regenerando recurso${diffSuffix} con su especialista…`,
    requestedTools: [tool],
    displayText
  });
  if (!result?.session) throw new Error("No se pudo regenerar. Revisa el mensaje del chat.");
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
  const displayText = `Regenerar propuesta de actividad para ${proposal.title || section || "la actividad"}.`;
  const prompt = `Usa design_activity para regenerar una sola propuesta de actividad de la sección ${section || "activa"}. Usa sessionId=${session.id}, targetUnitId=${session.activeUnitId}, baseRevision=${Number(activeUnit?.revision || 0)}${section ? `, section=${section}` : ""}${sectionId ? `, sectionId=${sectionId}` : ""}${targetContentId ? ` y targetContentId=${targetContentId}` : ""}. Vuelve a leer completa la lectura narrativa aprobada y diseña nuevamente la actividad basándote principalmente en esa narración: sus hechos, personajes, ideas, situaciones y vocabulario contextualizado. Toma la secuencia y alcance completa como marco curricular. La tabla de sinónimos y las preguntas existentes son solo apoyo secundario y no deben definir el ejercicio. Conserva el propósito y el subtema de esta propuesta, pero crea consignas y respuestas nuevas. No generes recursos, no apruebes el contenido y no uses otra herramienta de creación.`;
  return runMcpChatAgent(prompt, {
    status: "Releyendo la lectura y regenerando la actividad...",
    requestedTools: ["design_activity"],
    displayText
  });
}

async function regenerateTeacherNoteProposal(proposal = {}, directive = "") {
  const session = store.getState().session;
  const activeUnit = session.units?.find((unit) => unit.id === session.activeUnitId);
  const mode = ["resource", "source"].includes(proposal.artifact?.noteMode) ? proposal.artifact.noteMode : "single";
  const targetResourceId = String(proposal.artifact?.targetResourceId || "");
  const targetActivityId = String(proposal.targetActivityId || "");
  const displayText = `Generar otra propuesta de notas del maestro para ${proposal.title || "la actividad"}.`;
  const prompt = `Usa design_teacher_note para generar otra propuesta de esta nota del maestro. Usa sessionId=${session.id}, targetUnitId=${session.activeUnitId}, baseRevision=${Number(activeUnit?.revision || 0)}, mode=${mode}, operation=new-proposal${targetActivityId ? `, targetActivityId=${targetActivityId}` : ""}${targetResourceId ? `, targetResourceId=${targetResourceId}` : ""}${proposal.artifact?.sourceActivityProposalId ? `, sourceActivityProposalId=${proposal.artifact.sourceActivityProposalId}` : ""}, subtopic=${JSON.stringify(proposal.subtopic)}, title=${JSON.stringify(proposal.title || "Nota del maestro")}, sourceKind=note. Conserva la relación con la misma unidad, subtema, actividad o recurso. Usa como sourceContent la propuesta anterior y crea una alternativa; no guardes ni apruebes nada. ${directive} Propuesta anterior: ${stripHtml(proposal.html || "").slice(0, 12000)}`;
  return runMcpChatAgent(prompt, { status: "Generando otra propuesta de nota...", requestedTools: ["create_teacher_notes"], displayText });
}

async function regenerateApprovedTeacherNote(noteId = "") {
  const session = store.getState().session;
  const unit = session.units?.find((item) => item.id === session.activeUnitId);
  const note = [
    ...(unit?.accepted?.teacherNotes || []),
    ...(unit?.accepted?.activities || []).flatMap((item) => item.notes || []),
    ...(unit?.accepted?.resources || []).flatMap((item) => item.notes || [])
  ].find((item) => String(item.id) === String(noteId));
  if (!note) throw new Error("La nota seleccionada ya no existe.");
  const mode = note.mode === "resource" ? "resource" : note.mode === "source" ? "source" : "single";
  const prompt = `Usa design_teacher_note para preparar otra propuesta de esta página exacta de nota. sessionId=${session.id}, targetUnitId=${unit.id}, baseRevision=${Number(unit.revision || 0)}, targetContentId=${note.id}, mode=${mode}, operation=edit, subtopic=${JSON.stringify(note.subtopic)}, title=${JSON.stringify(note.title)}, sourceKind=note${note.activityId ? `, targetActivityId=${note.activityId}` : ""}${note.resourceId ? `, targetResourceId=${note.resourceId}` : ""}. Usa su contenido aprobado como base, conserva su vínculo y no apruebes automáticamente.`;
  return runMcpChatAgent(prompt, { status: "Regenerando esta nota del maestro...", requestedTools: ["design_teacher_note"] });
}

async function regenerateSyaProposal(proposal = {}) {
  const session = store.getState().session;
  const unit = session.units?.find((item) => item.id === session.activeUnitId);
  const prompt = `Usa design_sya_change para crear una nueva propuesta pendiente. sessionId=${session.id}, targetUnitId=${unit?.id}, baseRevision=${Number(unit?.revision || 0)}, operation=${proposal.artifact?.operation || "revise-unit"}, subtopic=${JSON.stringify(proposal.subtopic || "")}. Conserva el original y revisa esta propuesta anterior: ${JSON.stringify(proposal.artifact?.sya || {}).slice(0, 18000)}. No apliques cambios directamente.`;
  return runMcpChatAgent(prompt, { status: "Preparando otra propuesta de Secuencia y Alcance...", requestedTools: ["design_sya_change"] });
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

  document.addEventListener("charly:request-create-activity", (event) => {
    const { subtopic, isPlaceholder, unitId } = event.detail;
    const input = document.getElementById("cbComposerInput");
    const form = document.getElementById("cbComposer");
    if (!input || !form) return;

    const session = store.getState().session;
    const activeUnit = session.units?.find((u) => u.id === (unitId || session.activeUnitId));
    const unitNumber = activeUnit?.meta?.unit || "1";
    const unitText = activeUnit?.title ? `${activeUnit.title} (Unidad ${unitNumber})` : `Unidad ${unitNumber}`;

    let prompt = `Crea una actividad para ${unitText}, subtema: ${subtopic}. `;
    if (!isPlaceholder) {
      prompt += `Como ya existe una actividad para este subtema, crea una dinámica o pregunta diferente, pero con la misma estructura. `;
    }
    prompt += `En la instrucción de la actividad, la primer frase completa hasta el primer punto y seguido o dos puntos debe ir en **negrita**, y lo que sigue de la instrucción en texto normal. targetUnitId=${unitId || session.activeUnitId}`;

    selectedAgentTools.add("design_activity");
    syncComposerToolsButton();
    syncComposerActiveToolsChips();
    renderComposerToolsMenu();

    input.value = prompt;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();

    if (typeof window.closeUnitDrawer === "function") {
      window.closeUnitDrawer();
    }

    // Auto-submit the form if we want the prompt to be sent immediately:
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
  });

  document.addEventListener("charly:unit-sya-updated", async (event) => {
    const { unitId, subtopic, fieldKey, value } = event.detail || {};
    const state = store.getState();
    const currentUnit = state.session?.accepted?.units?.find(u => u.id === unitId) || state.session?.unit;
    if (currentUnit) {
      currentUnit.accepted = currentUnit.accepted || {};
      currentUnit.accepted.sya = currentUnit.accepted.sya || {};
      currentUnit.accepted.sya[`${subtopic}_${fieldKey}`] = value;
      if (currentUnit.sya) currentUnit.sya[`${subtopic}_${fieldKey}`] = value;
    }
    await persistCurrentSession({ silent: true });
    toast(`Eje ${fieldKey} actualizado para ${subtopic}`);
  });

  document.getElementById("cbAutomateUnitBtn")?.addEventListener("click", createAutomatedUnit);
  document.getElementById("cbConfigureSubtopicsBtn")?.addEventListener("click", () => {
    const grade = store.getState().session?.academicMeta?.grade || store.getState().session?.meta?.grade || "Primero";
    openSubtopicsSettingsModal({
      currentGrade: grade,
      onSave: async () => {
        const meta = store.getState().session.meta;
        renderCategoryAndSubtopicControls(meta);
        await persist();
      }
    });
  });

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

  const inspectorHandle = document.getElementById("cbInspectorResizeHandle");
  inspectorHandle?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = Number(getComputedStyle(document.documentElement).getPropertyValue("--cb-inspector-width").replace("px", "")) || DEFAULT_INSPECTOR_WIDTH;
    inspectorHandle.setPointerCapture?.(event.pointerId);
    document.body.classList.add("cb-is-resizing-panel");

    const move = (moveEvent) => {
      const nextWidth = startWidth + (startX - moveEvent.clientX);
      setInspectorPanelWidth(nextWidth);
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.body.classList.remove("cb-is-resizing-panel");
      localStorage.setItem("cbInspectorPanelWidth", String(getInspectorPanelWidth()));
      syncComposerFooterLayout();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  });
  inspectorHandle?.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setInspectorPanelWidth((getInspectorPanelWidth() || DEFAULT_INSPECTOR_WIDTH) + (event.key === "ArrowLeft" ? 16 : -16));
    localStorage.setItem("cbInspectorPanelWidth", String(getInspectorPanelWidth()));
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

function bindProductionProgressModalControls() {
  const modal = document.getElementById("cbProductionProgressModal");
  modal?.addEventListener("click", (event) => {
    if (event.target.matches?.("[data-production-modal-close]") || event.target.closest?.("[data-production-modal-close]")) {
      closeProductionProgressModal();
      if (!unitAutomationRun) {
        document.getElementById("cbAutomationSpinnerPanel")?.remove();
        renderAll(store.getState());
      }
    }
  });
  window.addEventListener("cb:open-production-modal", () => {
    productionModalManuallyDismissed = false;
    openProductionProgressModal();
  });
  window.addEventListener("cb:close-production-modal", closeProductionProgressModal);
  document.addEventListener("click", (event) => {
    if (event.target.matches?.("#cbOpenProductionModalBtn, #cbOpenProductionModalBtn *") || event.target.closest?.("#cbOpenProductionModalBtn")) {
      event.preventDefault();
      productionModalManuallyDismissed = false;
      openProductionProgressModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal?.hidden) closeProductionProgressModal();
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
    const files = await downloadApprovedFiles({ session: store.getState().session, sessionId, format: selectedExportFormat });
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
  root.addEventListener("cb:sya-edit", (event) => {
    withUnit(event.detail?.unitId || "", () => editSyaForCurrentSession(event.detail || {}));
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
  document.getElementById("cbSyaImproveFields")?.addEventListener("click", improveSyaSectionFields);
}

async function improveSyaSectionFields() {
  const section = activeSyaEditorSection;
  const session = store.getState().session;
  const button = document.getElementById("cbSyaImproveFields");
  const status = document.getElementById("cbSyaImproveStatus");
  const fields = Object.fromEntries(["T", "AE", "C", "P"].map((key) => [key, document.querySelector(`[data-sya-section-field="${key}"]`)?.value || ""]));
  if (!section || !session.activeUnitId || !button) return;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  if (status) status.textContent = "Consultando el programa sintético oficial y mejorando la secuencia…";
  try {
    const result = await improveSyaForUnit(session.activeUnitId, section.subtopic, section.category, fields);
    Object.entries(result.fields).forEach(([key, value]) => {
      const field = document.querySelector(`[data-sya-section-field="${key}"]`);
      if (field) field.value = value;
    });
    if (status) status.innerHTML = renderSyaImprovementInfo(result);
  } catch (error) {
    if (status) status.textContent = error.message || "No se pudo mejorar la secuencia.";
    toast(error.message || "No se pudo mejorar la secuencia.");
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

async function improveSyaForUnit(unitId = "", subtopic = "", category = "", fields = {}) {
  const session = store.getState().session;
  if (!unitId || !session.units?.some((unit) => unit.id === unitId)) throw new Error("No encontré la unidad a la que pertenece este subtema.");
  return improveCharlySya({ sessionId: session.id, targetUnitId: unitId, category, subtopic, fields });
}

async function saveSyaFieldsForUnit(unitId = "", subtopic = "", fields = {}) {
  const session = store.getState().session;
  const baseKey = resolveSyaBaseKeyForSubtopic(subtopic);
  let found = false;
  const units = (session.units || []).map((unit) => {
    if (unit.id !== unitId) return unit;
    found = true;
    const accepted = { ...(unit.accepted || {}), sya: { ...(unit.accepted?.sya || unit.sya || {}) } };
    Object.entries(fields).forEach(([fieldKey, value]) => {
      accepted.sya[`${baseKey}_${fieldKey}`] = String(value || "").trim();
    });
    return { ...unit, sya: accepted.sya, accepted, revision: Number(unit.revision || 0) + 1, updatedAt: new Date().toISOString() };
  });
  if (!found) throw new Error("La unidad ya no está disponible para guardar estos cambios.");
  store.setSession({ ...session, units });
  await persist();
}

function renderSyaImprovementInfo(result = {}) {
  const sources = (result.sources || []).map((source) => `<a href="${escapeAttr(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtmlText(source.title || "Documento SEP")}</a>`).join(" · ");
  return `<span>${escapeHtmlText(result.alignment || `Campos alineados al Plan de Estudio 2022, Fase ${result.phase}.`)}</span>${sources ? `<span class="cb-sya-improve-sources">Fuentes oficiales: ${sources}</span>` : ""}`;
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
    pendingResourcesModalResolver?.({ action: "save", value: { ...pendingResourceSelections, ...(resourceCountMode ? { counts: { ...pendingResourceCounts } } : {}) } });
  });
  modal?.addEventListener("input", (event) => {
    const input = event.target.closest?.("[data-resource-count]");
    if (!input) return;
    const key = input.dataset.resourceCount;
    pendingResourceCounts[key] = Math.min(key === "videos" ? 2 : 3, Math.max(1, Number(input.value) || 1));
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
    if (action === "generate-notes") await handleGenerateTeacherNotes(button.dataset.activityId || "");
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
  const composerToolsBtn = document.getElementById("cbComposerToolsBtn");
  const composerToolsMenu = document.getElementById("cbComposerToolsMenu");
  const composerActiveTools = document.getElementById("cbComposerActiveTools");
  const composerModelBtn = document.getElementById("cbComposerModelBtn");
  const composerModelMenu = document.getElementById("cbComposerModelMenu");

  openBtn?.addEventListener("click", openSettingsModal);

  composerToolsBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleComposerToolsMenu();
  });

  composerToolsMenu?.addEventListener("click", (event) => {
    if (event.target.closest?.("#cbComposerToolsClearBtn")) {
      selectedAgentTools.clear();
      renderComposerToolsMenu();
      return;
    }
    const option = event.target.closest?.("[data-composer-tool-id]");
    if (!option) return;
    const toolId = option.dataset.composerToolId;
    if (selectedAgentTools.has(toolId)) {
      selectedAgentTools.delete(toolId);
    } else {
      selectedAgentTools.add(toolId);
    }
    renderComposerToolsMenu();
  });

  composerActiveTools?.addEventListener("click", (event) => {
    const removeBtn = event.target.closest?.("[data-remove-tool]");
    if (removeBtn) {
      selectedAgentTools.delete(removeBtn.dataset.removeTool);
      renderComposerToolsMenu();
      return;
    }
    if (event.target.closest?.("#cbComposerActiveToolsClearBtn")) {
      selectedAgentTools.clear();
      renderComposerToolsMenu();
    }
  });

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
    if (!event.target.closest?.("#cbComposerToolsBtn, #cbComposerToolsMenu")) toggleComposerToolsMenu(false);
    if (!event.target.closest?.("#cbComposerModelBtn, #cbComposerModelMenu")) toggleComposerModelMenu(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      toggleComposerToolsMenu(false);
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

function getInspectorPanelWidth() {
  return Number(getComputedStyle(document.documentElement).getPropertyValue("--cb-inspector-width").replace("px", "")) || 0;
}

function setInspectorPanelWidth(width = DEFAULT_INSPECTOR_WIDTH) {
  const safe = Math.min(MAX_INSPECTOR_WIDTH, Math.max(MIN_INSPECTOR_WIDTH, Number(width) || DEFAULT_INSPECTOR_WIDTH));
  document.documentElement.style.setProperty("--cb-inspector-width", `${safe}px`);
  syncComposerFooterLayout();
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
  if (sendBtn) {
    sendBtn.disabled = false;
    sendBtn.setAttribute("aria-label", busy ? "Detener generación" : "Enviar mensaje");
    sendBtn.title = busy ? "Detener generación" : "Enviar mensaje";
    const icon = sendBtn.querySelector("i");
    if (icon) icon.className = `fas ${busy ? "fa-stop" : "fa-paper-plane"}`;
    sendBtn.classList.toggle("is-stop", !!busy);
  }
  if (modelBtn) modelBtn.disabled = !!busy;
  if (notesBtn) notesBtn.disabled = !!busy;
}


let saveQueue = Promise.resolve();
function persist(options = {}) {
  const requestedSessionId = store.getState().session.id;
  const operation = saveQueue.then(() => {
    if (store.getState().session.id !== requestedSessionId) return null;
    return persistCurrentSession(options);
  });
  saveQueue = operation.catch(() => null);
  return operation;
}

async function persistCurrentSession({ silent = false } = {}) {
  const session = store.getState().session;
  if (!session?.id) return null;
  const isSavedSession = Number(session.storageRevision || 0) > 0
    || store.getState().sessions.some((item) => item.id === session.id);

  const activeUnit = session.units?.find((unit) => unit.id === session.activeUnitId);
  if (activeUnit?.automation?.status === "running" || unitAutomationRun?.persistentId) {
    if (!silent) console.info("[charly-brown] Autoguardado aplazado: la producción posee la unidad activa.");
    return null;
  }
  let saved = null;
  try {
    saved = await saveSession({ ...session, title: buildTitle(session) }, { create: !isSavedSession });
  } catch (error) {
    if (String(error?.code || "").includes("REVISION_CONFLICT")) {
      const sessions = await listSessions().catch(() => []);
      const latest = sessions.find((item) => item.id === session.id);
      if (latest && store.getState().session.id === session.id) {
        const activeUnitId = latest.units?.some((unit) => unit.id === session.activeUnitId)
          ? session.activeUnitId
          : latest.activeUnitId;

        // Preservar actividades y recursos recién aprobados por el usuario
        const localUnits = store.getState().session.units || [];
        const mergedUnits = (latest.units || []).map((remoteUnit) => {
          const localUnit = localUnits.find((u) => u.id === remoteUnit.id);
          if (!localUnit) return remoteUnit;
          const localActs = localUnit.accepted?.activities || [];
          const remoteActs = [...(remoteUnit.accepted?.activities || [])];
          for (const localAct of localActs) {
            if (!localAct || !localAct.html) continue;
            const idx = remoteActs.findIndex((a) => a.id === localAct.id || (localAct.subtopic && isSameSubtopicKey(a.subtopic, localAct.subtopic)));
            if (idx >= 0) {
              if (!remoteActs[idx].html || (localAct.acceptedAt || "") > (remoteActs[idx].acceptedAt || "")) {
                remoteActs[idx] = localAct;
              }
            } else {
              remoteActs.push(localAct);
            }
          }
          return {
            ...remoteUnit,
            // Una reconciliación de revisión no debe perder el PDF ni el turno que lo adjuntó.
            messages: [...(remoteUnit.messages || []), ...(localUnit.messages || []).filter((message) =>
              !(remoteUnit.messages || []).some((savedMessage) => savedMessage.id === message.id))],
            sourceAttachments: localUnit.sourceAttachmentsManaged ? localUnit.sourceAttachments : remoteUnit.sourceAttachments,
            sourceAttachmentsManaged: localUnit.sourceAttachmentsManaged || remoteUnit.sourceAttachmentsManaged,
            accepted: {
              ...remoteUnit.accepted,
              activities: remoteActs,
              resources: Array.isArray(localUnit.accepted?.resources) && localUnit.accepted.resources.length ? localUnit.accepted.resources : remoteUnit.accepted?.resources
            }
          };
        });

        const reconciled = { ...latest, units: mergedUnits, activeUnitId, storageRevision: latest.storageRevision };
        store.setSessions(sessions);
        store.setSession(reconciled);
        syncMetaControls(store.getState().session);
        saved = await saveSession({ ...reconciled, title: buildTitle(reconciled) }, { create: false }).catch(() => null);
        toast("La sesión se actualizó con la versión más reciente del servidor.");
      }
      console.warn("[charly-brown] stale session write prevented", error);
      return saved;
    }
    toast(`No se guardó en Firebase: ${error.message}`);
    console.error("[charly-brown] saveSession failed", error);
    return null;
  }
  if (saved && store.getState().session.id === saved.id) {
    store.patchSession({ storageRevision: saved.storageRevision });
  }
  if (saved) {
    const sessions = store.getState().sessions;
    store.setSessions(sessions.some((item) => item.id === saved.id)
      ? sessions.map((item) => (item.id === saved.id ? saved : item))
      : [saved, ...sessions]);
  }
  if (saved && !silent) toast("Sesión guardada");
  return saved;
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
  const update = () => {
    syncComposerFooterLayout();
    syncPanelResizeHandles();
  };
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
  syncPanelResizeHandles();
}

function syncPanelResizeHandles() {
  const positionHandle = (handle, panel, edge = "left") => {
    if (!handle || !panel || panel.getClientRects().length === 0) return;
    const rect = panel.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    handle.style.position = "fixed";
    handle.style.top = `${Math.max(0, Math.round(rect.top))}px`;
    handle.style.bottom = `${Math.max(0, Math.round(window.innerHeight - rect.bottom))}px`;
    handle.style.left = `${Math.round((edge === "right" ? rect.right : rect.left) - 4)}px`;
    handle.style.right = "auto";
  };

  positionHandle(
    document.getElementById("cbSessionsResizeHandle"),
    document.querySelector(".cb-unit-sessions"),
    "right"
  );
  positionHandle(
    document.getElementById("cbAcceptedResizeHandle"),
    document.querySelector(".cb-accepted-panel"),
    "left"
  );
  const inspectorHandle = document.getElementById("cbInspectorResizeHandle");
  if (inspectorHandle?.style.position) {
    for (const property of ["position", "top", "bottom", "left", "right"]) {
      inspectorHandle.style.removeProperty(property);
    }
  }
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
  const label = String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\bDeLetras\b/g, "de Letras")
    .trim();
  if (label === "Geografia") return "Geografía";
  if (label === "Mi Localidad") return "Geografía: mi localidad";
  return label;
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

async function editSyaForCurrentSession(target = {}) {
  await handleLoadSya({ silent: false, replaceExisting: true });
  const session = store.getState().session;
  const activeSya = session.accepted?.sya || session.sya || null;
  const originalSya = session.accepted?.syaOriginal || session.syaOriginal || activeSya;
  if (!activeSya) {
    toast("Primero carga la secuencia y alcance.");
    return;
  }

  const raw = await openSyaEditorModal(activeSya, session.meta || {}, target);
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
  const activeUnit = session.units?.find((unit) => unit.id === session.activeUnitId);
  const activity = activeUnit?.accepted?.activities?.find((item) => String(item.id) === String(activityId));
  if (!activity) return toast("La actividad vinculada ya no existe.");
  const selected = await openResourcesModal(undefined, { allowMultiple: true });
  if (!selected) return;
  const labels = Object.entries(selected).filter(([key, enabled]) => key !== "counts" && enabled).map(([key]) => ({ fichas: "ficha", anexos: "anexo", recortables: "recortable", videos: "video como producto final" }[key])).filter(Boolean);
  if (!labels.length) {
    proposeNextWorkflowStep();
    return;
  }
  if (typeof window.closeUnitDrawer === "function") {
    window.closeUnitDrawer();
  }
  const toolByType = { fichas: "design_worksheet", anexos: "design_annex", recortables: "design_cutout", videos: "design_video_script" };
  const failures = [];
  for (const [key, tool] of Object.entries(toolByType)) {
    if (!selected[key]) continue;
    const count = Math.min(key === "videos" ? 2 : 3, Math.max(1, Number(selected.counts?.[key] || 1)));
    for (let number = 1; number <= count; number += 1) {
      const current = store.getState().session;
      const currentUnit = current.units?.find((unit) => unit.id === activeUnit.id);
      if (!currentUnit || current.activeUnitId !== activeUnit.id) return toast("La unidad cambió. Revisa las propuestas creadas antes de continuar.");
      const prompt = `Usa ${tool} para crear la propuesta ${number} de ${count} de ${key} para la actividad aprobada exacta. sessionId=${current.id}, targetUnitId=${activeUnit.id}, baseRevision=${Number(currentUnit.revision || 0)}, targetActivityId=${activity.id}, subtopic=${JSON.stringify(activity.subtopic || "")}, sección=${JSON.stringify(activity.section || "")}. Debe ser diferente de los recursos existentes y quedar pendiente de aprobación. No modifiques directamente la actividad.`;
      const result = await runMcpChatAgent(prompt, { status: `Diseñando ${key} ${number}/${count}...`, requestedTools: [tool], displayText: `Diseñar ${key} ${number}/${count} para «${activity.title || activity.subtopic || "la actividad"}»` });
      if (result?.error) {
        failures.push(`${key} ${number}`);
        toast(`Se interrumpió la generación de ${key}. Revisa el estado del chat antes de reintentar.`);
        return;
      }
      if (!(result?.usedTools || []).some((item) => item.name === tool && item.ok)) failures.push(`${key} ${number}`);
    }
  }
  if (failures.length) toast(`Faltaron propuestas: ${failures.join(", ")}. Puedes volver a solicitar solo esos recursos.`);
}
window.handleGenerateResourcesForActivity = handleGenerateResourcesForActivity;

function handleRemoveResource(id, unitId) {
  if (!id) return;
  withUnit(unitId, () => {
    store.removeResource(id, unitId);
    persist();
  });
}
window.handleRemoveResource = handleRemoveResource;

function openSyaEditorModal(initialValue = "", meta = {}, target = {}) {
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
  if (target.subtopic) openSyaSectionEditor(target.category || "", target.subtopic);
  return new Promise((resolve) => {
    pendingSyaModalResolver = (result) => {
      pendingSyaModalResolver = null;
      closeSyaEditorModal();
      if (!result || result.action !== "save") return resolve(null);
      return resolve(result.value);
    };
  });
}

function openResourcesModal(initialValue = pendingResourceSelections, { allowMultiple = false } = {}) {
  const modal = document.getElementById("cbResourcesModal");
  if (!modal) return Promise.resolve(null);
  pendingResourceSelections = {
    fichas: Boolean(initialValue?.fichas),
    anexos: Boolean(initialValue?.anexos),
    recortables: Boolean(initialValue?.recortables),
    videos: Boolean(initialValue?.videos)
  };
  resourceCountMode = allowMultiple;
  pendingResourceCounts = { fichas: 1, anexos: 1, recortables: 1, videos: 1 };
  const countsPanel = modal.querySelector("#cbResourceCounts");
  if (countsPanel) countsPanel.hidden = !allowMultiple;
  countsPanel?.querySelectorAll("[data-resource-count]").forEach((input) => { input.value = "1"; });
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
  const improveButton = document.getElementById("cbSyaImproveFields");
  if (improveButton) { improveButton.disabled = false; improveButton.removeAttribute("aria-busy"); }
  const improveStatus = document.getElementById("cbSyaImproveStatus");
  if (improveStatus) improveStatus.textContent = "";
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

function buildUnitDataEditor(meta = {}, step = 1, viewMode = "hud") {
  const level = "Primaria";
  const grades = getGradesForLevel(level);
  const grade = meta.grade && grades.includes(meta.grade) ? meta.grade : grades[0] || "Primero";
  const trimester = String(meta.trimester || "1");
  const mode = String(meta.mode || "Alumno");
  const edition = String(meta.edition || "10va");
  const categories = Object.keys(getCategoriesForGrade(grade));
  const category = meta.category || ALL_OPTION;

  if (viewMode === "classic") {
    return `
      <div class="cb-shadcn-form">
        <input type="hidden" data-unit-field="level" value="Primaria">
        <div style="display:flex; justify-content:flex-end; margin-bottom:0.5rem;">
          <button type="button" class="cb-text-button" data-hud-toggle-view="hud" style="font-size:0.78rem; color:var(--cb-up-accent);">
            <i class="fas fa-wand-magic-sparkles" style="margin-right:4px;"></i> Volver a Asistente HUD
          </button>
        </div>
        <div class="cb-shadcn-section">
          <div class="cb-shadcn-section-header">
            <span class="cb-shadcn-kicker">1. DATOS EDITORIALES</span>
            <h3 class="cb-shadcn-title">Destinatario y edición</h3>
          </div>
          <div class="cb-shadcn-grid cb-shadcn-grid--book-meta">
            ${field("Voy a crear para", `
              <select class="cb-shadcn-select" data-unit-field="mode">
                ${["Alumno", "Maestro"].map((item) => `<option value="${escapeAttr(item)}"${item === mode ? " selected" : ""}>${escapeHtmlText(item)}</option>`).join("")}
              </select>
            `)}
            ${field("Edición", `
              <select class="cb-shadcn-select" data-unit-field="edition">
                ${buildEditionOptions().map((item) => `<option value="${escapeAttr(item)}"${item === edition ? " selected" : ""}>${escapeHtmlText(item)}</option>`).join("")}
              </select>
            `)}
          </div>
        </div>

        <div class="cb-shadcn-section">
          <div class="cb-shadcn-section-header">
            <span class="cb-shadcn-kicker">2. UBICACIÓN CURRICULAR</span>
            <h3 class="cb-shadcn-title">Grado, Trimestre y Campo</h3>
          </div>
          <div class="cb-shadcn-grid cb-shadcn-grid--3cols">
            ${field("Grado Escolar", `
              <select class="cb-shadcn-select" data-unit-field="grade">
                ${grades.map((item) => `<option value="${escapeAttr(item)}"${item === grade ? " selected" : ""}>${escapeHtmlText(item)}</option>`).join("")}
              </select>
            `)}
            ${field("Trimestre", `
              <select class="cb-shadcn-select" data-unit-field="trimester">
                ${["1", "2", "3"].map((item) => `<option value="${escapeAttr(item)}"${item === trimester ? " selected" : ""}>${escapeHtmlText(item)}</option>`).join("")}
              </select>
            `)}
            ${field("Categoría / Campo", `
              <select class="cb-shadcn-select" data-unit-field="category">
                ${[ALL_OPTION, ...categories].map((item) => `<option value="${escapeAttr(item)}"${item === category ? " selected" : ""}>${escapeHtmlText(item)}</option>`).join("")}
              </select>
            `)}
          </div>
        </div>
      </div>
    `;
  }

  // --- HUD AGENT WIZARD MODE ---
  const currentStep = Math.max(2, Math.min(4, Number(step) || 2));

  const questions = {
    2: {
      title: "¿Qué libro crearemos?",
      desc: ""
    },
    3: {
      title: "¿En qué trimestre del ciclo escolar nos enfocaremos?",
      desc: "Define el periodo curricular para organizar los aprendizajes y las metodologías."
    },
    4: {
      title: "¿Para qué edición editorial será?",
      desc: ""
    }
  };

  const gradeDetails = {
    "Primero": { badge: "Fase 3", desc: "Alfabetización inicial, trazos y grafomotricidad básica." },
    "Segundo": { badge: "Fase 3", desc: "Consolidación de lectura, escritura y cálculo inicial." },
    "Tercero": { badge: "Fase 4", desc: "Comprensión lectora, producción de textos y proyectos locales." },
    "Cuarto": { badge: "Fase 4", desc: "Habilidades reflexivas, redacción autónoma e indagación." },
    "Quinto": { badge: "Fase 5", desc: "Análisis crítico, contraste de fuentes y pensamiento formal." },
    "Sexto": { badge: "Fase 5", desc: "Pensamiento crítico, argumentación, debates y egreso escolar." }
  };

  const trimesters = [
    { key: "1", label: "Trimestre 1", icon: "fa-calendar-check", badge: "Inicio", desc: "Diagnóstico inicial, integración grupal y conceptos base del ciclo escolar." },
    { key: "2", label: "Trimestre 2", icon: "fa-chart-line", badge: "Desarrollo", desc: "Profundización conceptual, desarrollo de proyectos y ejercitación sistemática." },
    { key: "3", label: "Trimestre 3", icon: "fa-trophy", badge: "Cierre anual", desc: "Consolidación de aprendizajes, evaluación formativa-sumativa y metas anuales." }
  ];

  return `
    <div class="cb-hud-wizard" data-hud-step="${currentStep}" data-hud-view="hud">
      <!-- Hidden inputs for seamless readUnitDataEditor compatibility -->
      <input type="hidden" data-unit-field="level" value="${escapeAttr(level)}">
      <input type="hidden" data-unit-field="grade" value="${escapeAttr(grade)}">
      <input type="hidden" data-unit-field="trimester" value="${escapeAttr(trimester)}">
      <input type="hidden" data-unit-field="mode" value="${escapeAttr(mode)}">
      <input type="hidden" data-unit-field="edition" value="${escapeAttr(edition)}">
      <input type="hidden" data-unit-field="category" value="${escapeAttr(category)}">

      <div class="cb-hud-agent-banner">
        <div class="cb-hud-agent-bubble">
          <h4>${escapeHtmlText(questions[currentStep].title)}</h4>
          ${questions[currentStep].desc ? `<p>${escapeHtmlText(questions[currentStep].desc)}</p>` : ""}
        </div>
        <button type="button" class="cb-hud-classic-toggle" data-hud-toggle-view="classic" title="Ver como formulario">
          Vista formulario
        </button>
      </div>

      <nav class="cb-hud-stepper" aria-label="Progreso de configuración">
        <button type="button" class="cb-hud-step-indicator ${currentStep === 2 ? 'is-active' : currentStep > 2 ? 'is-done' : ''}" data-hud-nav-step="2">
          <span class="cb-hud-step-badge">${currentStep > 2 ? '<i class="fas fa-check" aria-hidden="true"></i>' : '1'}</span>
          <span>Grado</span>
        </button>
        <div class="cb-hud-step-line" aria-hidden="true"></div>
        <button type="button" class="cb-hud-step-indicator ${currentStep === 3 ? 'is-active' : currentStep > 3 ? 'is-done' : ''}" data-hud-nav-step="3">
          <span class="cb-hud-step-badge">${currentStep > 3 ? '<i class="fas fa-check" aria-hidden="true"></i>' : '2'}</span>
          <span>Trimestre</span>
        </button>
        <div class="cb-hud-step-line" aria-hidden="true"></div>
        <button type="button" class="cb-hud-step-indicator ${currentStep === 4 ? 'is-active' : ''}" data-hud-nav-step="4">
          <span class="cb-hud-step-badge">3</span>
          <span>Edición</span>
        </button>
      </nav>

      <!-- Step Content -->
      <div class="cb-hud-step-body">
        ${currentStep === 2 ? `
          <div class="cb-hud-cards-grid cb-hud-cards-grid--grades">
            ${grades.map((grd, idx) => {
              const detail = gradeDetails[grd] || { badge: `Grado ${idx + 1}`, desc: "Desarrollo de aprendizajes por campo formativo." };
              return `
                <button type="button" class="cb-hud-option-card ${grd === grade ? 'is-selected' : ''}" data-hud-select-field="grade" data-hud-value="${escapeAttr(grd)}" aria-pressed="${grd === grade}">
                  <div class="cb-hud-option-header">
                    <span class="cb-hud-grade-mark">${idx + 1}°</span>
                    <span class="cb-hud-option-badge">${escapeHtmlText(detail.badge)}</span>
                  </div>
                  <div class="cb-hud-option-title">${escapeHtmlText(grd)}</div>
                  <div class="cb-hud-option-desc">${escapeHtmlText(detail.desc)}</div>
                </button>
              `;
            }).join('')}
          </div>
        ` : ''}

        ${currentStep === 3 ? `
          <div class="cb-hud-cards-grid">
            ${trimesters.map((t) => `
              <button type="button" class="cb-hud-option-card ${t.key === trimester ? 'is-selected' : ''}" data-hud-select-field="trimester" data-hud-value="${escapeAttr(t.key)}" aria-pressed="${t.key === trimester}">
                <div class="cb-hud-option-header">
                  <div class="cb-hud-option-icon"><i class="fas ${t.icon}"></i></div>
                  <span class="cb-hud-option-badge">${escapeHtmlText(t.badge)}</span>
                </div>
                <div class="cb-hud-option-title">${escapeHtmlText(t.label)}</div>
                <div class="cb-hud-option-desc">${escapeHtmlText(t.desc)}</div>
              </button>
            `).join('')}
          </div>
        ` : ''}

        ${currentStep === 4 ? `
          <div class="cb-hud-edition-step">
            <input type="hidden" data-unit-field="mode" value="Alumno">
            <input type="hidden" data-unit-field="category" value="${escapeAttr(category || ALL_OPTION)}">
            <div class="cb-hud-edition-question" style="max-width: 480px; margin: 1.5rem auto 1rem auto; width: 100%;">
              <label class="cb-shadcn-label" style="font-size: 15px; font-weight: 600; margin-bottom: 0.75rem; display: block; color: var(--cb-up-text);">Edición Editorial</label>
              <select class="cb-shadcn-select" data-unit-field="edition" style="width: 100%; height: 46px; font-size: 14.5px;">
                ${buildEditionOptions().map((item) => `<option value="${escapeAttr(item)}"${item === edition ? " selected" : ""}>${escapeHtmlText(item)}</option>`).join("")}
              </select>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Navigation buttons -->
      <div class="cb-hud-nav-bar">
        <button type="button" class="cb-text-button" data-hud-action="prev" ${currentStep === 2 ? 'disabled' : ''}>
          <i class="fas fa-arrow-left" style="margin-right:4px;"></i> Anterior
        </button>
        ${currentStep < 4 ? `
          <button type="button" class="cb-chip-action cb-chip-action--primary" data-hud-action="next">
            <span>Siguiente</span>
            <i class="fas fa-arrow-right" style="margin-left:4px;"></i>
          </button>
        ` : `
          <button type="button" class="cb-chip-action cb-chip-action--primary" data-hud-action="complete">
            <i class="fas fa-check" style="margin-right:4px;"></i>
            <span>Guardar configuración</span>
          </button>
        `}
      </div>
    </div>
  `;
}

function bindUnitDataEditorEvents(editor, meta, wizardState) {
  // Manejo de clics en tarjetas de opciones del HUD Wizard
  editor.querySelectorAll("[data-hud-select-field]").forEach((card) => {
    card.addEventListener("click", () => {
      const fieldName = card.dataset.hudSelectField;
      const value = card.dataset.hudValue;
      if (!fieldName || !value) return;

      const currentVals = readUnitDataEditor(editor);
      const updatedDraft = { ...meta, ...currentVals, [fieldName]: value };
      let normalized = updatedDraft;
      if (fieldName === "level") normalized = syncMetaForLevelAndGrade(updatedDraft);
      else if (fieldName === "grade") normalized = syncCategorySubtopicForGrade(updatedDraft);

      // Auto-avanzar al siguiente paso si es nivel, grado o trimestre
      if (wizardState.step < 4) {
        wizardState.step += 1;
      }
      wizardState.meta = normalized;
      renderWizard();
    });
  });

  // Manejo de selects dentro del wizard
  editor.querySelectorAll("select[data-unit-field]").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const fieldName = e.target.dataset.unitField;
      const val = e.target.value;
      wizardState.meta = { ...meta, ...readUnitDataEditor(editor), [fieldName]: val };
      if (fieldName === "level") wizardState.meta = syncMetaForLevelAndGrade(wizardState.meta);
      else if (fieldName === "grade") wizardState.meta = syncCategorySubtopicForGrade(wizardState.meta);
      renderWizard();
    });
  });

  // Navegación por stepper numérico
  editor.querySelectorAll("[data-hud-nav-step]").forEach((stepBtn) => {
    stepBtn.addEventListener("click", () => {
      const targetStep = Number(stepBtn.dataset.hudNavStep);
      if (targetStep >= 2 && targetStep <= 4) {
        wizardState.step = targetStep;
        wizardState.meta = { ...meta, ...readUnitDataEditor(editor) };
        renderWizard();
      }
    });
  });

  // Botón Anterior
  editor.querySelector("[data-hud-action='prev']")?.addEventListener("click", () => {
    if (wizardState.step > 2) {
      wizardState.step -= 1;
      wizardState.meta = { ...meta, ...readUnitDataEditor(editor) };
      renderWizard();
    }
  });

  // Botón Siguiente
  editor.querySelector("[data-hud-action='next']")?.addEventListener("click", () => {
    if (wizardState.step < 4) {
      wizardState.step += 1;
      wizardState.meta = { ...meta, ...readUnitDataEditor(editor) };
      renderWizard();
    }
  });

  // Botón Completar
  editor.querySelector("[data-hud-action='complete']")?.addEventListener("click", () => {
    editor.saveConfiguration?.();
  });

  // Alternar vista clásica / HUD
  editor.querySelectorAll("[data-hud-toggle-view]").forEach((toggleBtn) => {
    toggleBtn.addEventListener("click", () => {
      wizardState.viewMode = toggleBtn.dataset.hudToggleView || "hud";
      wizardState.meta = { ...meta, ...readUnitDataEditor(editor) };
      renderWizard();
    });
  });

  function renderWizard() {
    const modal = document.getElementById("cbUnitDataModal");
    if (modal?.dataset.mode === "new-session") {
      const button = document.getElementById("cbUnitDataModalSave");
      if (button) button.disabled = wizardState.viewMode !== "classic" && wizardState.step < 4;
    }
    editor.innerHTML = buildUnitDataEditor(wizardState.meta, wizardState.step, wizardState.viewMode);
    bindUnitDataEditorEvents(editor, wizardState.meta, wizardState);
  }
}

function buildNewUnitEditor(meta = {}, units = [], readings = [], initialReadingMode = "existing") {
  const academic = store.getState().session?.academicMeta || {};
  const baseMeta = { ...academic, ...(meta || {}) };
  const current = Number.parseInt(String(baseMeta.unit || ""), 10);
  const suggested = Number.isFinite(current) && current < 10
    ? String(current + 1)
    : String(Math.min((Array.isArray(units) ? units.length : 0) + 1, 10));

  const targetMeta = {
    level: baseMeta.level || "Primaria",
    grade: baseMeta.grade || "Primero",
    trimester: baseMeta.trimester || "1",
    unit: suggested
  };

  const autoMatchedReading = pickExactReadingForMeta(readings, targetMeta) ||
    readings.find(r => isExactReadingMatch(r, targetMeta)) ||
    readings.find(r => sameGrade(r.meta?.grado, targetMeta.grade) && sameNumericSlot(r.meta?.unidad, targetMeta.unit) && sameNumericSlot(r.meta?.trimestre, targetMeta.trimester)) ||
    readings.find(r => sameGrade(r.meta?.grado, targetMeta.grade) && sameNumericSlot(r.meta?.unidad, targetMeta.unit)) ||
    null;

  const autoSelectedRef = autoMatchedReading ? readingReference(autoMatchedReading) : "";
  const effectiveReadingMode = autoMatchedReading
    ? (initialReadingMode === "chat" || initialReadingMode === "none" ? initialReadingMode : "existing")
    : (initialReadingMode || "existing");
  const suggestedTitle = autoMatchedReading?.title || "";

  const initialFilters = {
    grade: targetMeta.grade,
    trimester: targetMeta.trimester,
    unit: targetMeta.unit
  };

  return `
    <div class="cb-shadcn-form">
      <div class="cb-shadcn-section">
        <div class="cb-shadcn-section-header">
          <span class="cb-shadcn-kicker">1. IDENTIFICACIÓN</span>
          <h3 class="cb-shadcn-title">Datos de la Unidad</h3>
        </div>
        <div class="cb-shadcn-grid cb-shadcn-grid--unit-id">
          ${field("Unidad", `
            <select class="cb-shadcn-select" data-unit-field="unit">
              ${["proyecto", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((item) => `<option value="${escapeAttr(item)}"${item === suggested ? " selected" : ""}>${escapeHtmlText(item === "proyecto" ? "Proyecto" : `Unidad ${item}`)}</option>`).join("")}
            </select>
          `)}
          ${field("Título o Tema Central", `<input class="cb-shadcn-input" type="text" data-unit-field="title" maxlength="120" value="${escapeAttr(suggestedTitle)}" data-auto-filled="${suggestedTitle ? "true" : "false"}" placeholder="Ej. El Universo y los Planetas...">`)}
        </div>
      </div>

      <div class="cb-shadcn-section">
        <div class="cb-shadcn-section-header">
          <span class="cb-shadcn-kicker">2. CONTENIDO NARRATIVO</span>
          <h3 class="cb-shadcn-title">Modo de Lectura</h3>
        </div>
        <div class="cb-shadcn-radio-grid" role="radiogroup" aria-label="Modo de lectura">
          ${readingModeOption("existing", "Elegir existente", effectiveReadingMode === "existing", "Biblioteca de lecturas ASC o nuevas.", "fa-book-open")}
          ${readingModeOption("chat", "Crear con el chat", effectiveReadingMode === "chat", "El agente la redacta en el chat por etapas.", "fa-comments")}
          ${readingModeOption("none", "Sin lectura", effectiveReadingMode === "none", "Iniciar directo con las actividades.", "fa-bolt")}
        </div>
      </div>

      <section class="cb-new-unit-reading-picker" data-new-unit-reading-picker>
        <div class="cb-shadcn-section-header">
          <span class="cb-shadcn-kicker">3. BIBLIOTECA</span>
          <h3 class="cb-shadcn-title">Seleccionar Lectura Curricular</h3>
        </div>
        <div class="cb-new-unit-reading-toolbar">
          <div class="cb-shadcn-search-wrap">
            <i class="fas fa-search cb-shadcn-search-icon" aria-hidden="true"></i>
            <input type="search" class="cb-shadcn-input cb-shadcn-input--search" data-new-unit-reading-search placeholder="Buscar por título, tema o palabra clave...">
          </div>
          <select class="cb-shadcn-select" data-new-unit-reading-filter="grade">${buildReadingFilterOptions(readings, "grado", "Todos los grados", targetMeta.grade)}</select>
          <select class="cb-shadcn-select" data-new-unit-reading-filter="trimester">${buildReadingFilterOptions(readings, "trimestre", "Todos los trimestres", targetMeta.trimester)}</select>
          <select class="cb-shadcn-select" data-new-unit-reading-filter="unit">${buildReadingFilterOptions(readings, "unidad", "Todas las unidades", targetMeta.unit)}</select>
        </div>
        <div class="cb-new-unit-reading-lists" data-new-unit-reading-lists>
          ${renderNewUnitReadingLists(readings, initialFilters, autoSelectedRef)}
        </div>
      </section>
    </div>
  `;
}

function buildEditUnitEditor(unit = {}) {
  const currentUnit = String(unit?.meta?.unit || "1");
  return `
    <div class="cb-shadcn-form">
      <div class="cb-shadcn-section">
        <div class="cb-shadcn-section-header">
          <span class="cb-shadcn-kicker">EDICIÓN</span>
          <h3 class="cb-shadcn-title">Identificación de la Unidad</h3>
        </div>
        <div class="cb-shadcn-grid cb-shadcn-grid--unit-id">
          ${field("Unidad", `
            <select class="cb-shadcn-select" data-unit-field="unit">
              ${["proyecto", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((item) => `<option value="${escapeAttr(item)}"${item === currentUnit ? " selected" : ""}>${escapeHtmlText(item === "proyecto" ? "Proyecto" : `Unidad ${item}`)}</option>`).join("")}
            </select>
          `)}
          ${field("Título o Tema Central", `<input class="cb-shadcn-input" type="text" data-unit-field="title" maxlength="120" value="${escapeAttr(unit?.title || "")}" placeholder="Tema o título de la unidad">`)}
        </div>
      </div>
    </div>
  `;
}

function readingModeOption(value, title, checked, description, icon = "fa-book-open") {
  return `
    <label class="cb-shadcn-radio-card">
      <input type="radio" name="cb-reading-mode" data-unit-field="readingMode" value="${escapeAttr(value)}"${checked ? " checked" : ""}>
      <div class="cb-shadcn-radio-content">
        <div class="cb-shadcn-radio-header">
          <span class="cb-shadcn-radio-icon-wrap"><i class="fas ${icon}" aria-hidden="true"></i></span>
          <strong class="cb-shadcn-radio-title">${escapeHtmlText(title)}</strong>
        </div>
        <small class="cb-shadcn-radio-desc">${escapeHtmlText(description)}</small>
      </div>
    </label>
  `;
}

function renderNewUnitReadingLists(readings = [], filters = {}, selectedRef = "") {
  let filtered = filterNewUnitReadings(readings, filters);
  if (!filtered.length && filters.trimester) {
    const relaxed = filterNewUnitReadings(readings, { ...filters, trimester: "" });
    if (relaxed.length) filtered = relaxed;
  }
  if (!filtered.length && filters.unit) {
    const relaxed = filterNewUnitReadings(readings, { ...filters, trimester: "", unit: "" });
    if (relaxed.length) filtered = relaxed;
  }
  if (!filtered.length) {
    filtered = filterNewUnitReadings(readings, { search: filters.search || "" });
  }

  return [
    ["lecturasNuevas", "Lecturas Nuevas", "fa-sparkles"],
    ["lecturasASC", "Lecturas ASC", "fa-book"]
  ].map(([collection, label, icon]) => {
    const items = filtered.filter((reading) => reading.collection === collection);
    return `
      <section class="cb-new-unit-reading-group" data-reading-collection="${escapeAttr(collection)}">
        <header class="cb-shadcn-group-header">
          <div class="cb-shadcn-group-title">
            <i class="fas ${icon}" aria-hidden="true"></i>
            <strong>${escapeHtmlText(label)}</strong>
          </div>
          <span class="cb-shadcn-badge cb-shadcn-badge--count">${items.length}</span>
        </header>
        <div class="cb-shadcn-group-body">
          ${items.length ? items.map((reading) => renderNewUnitReadingChoice(reading, selectedRef)).join("") : `<div class="cb-shadcn-empty"><i class="far fa-folder-open"></i><p>Sin lecturas para estos filtros.</p></div>`}
        </div>
      </section>
    `;
  }).join("");
}

function renderNewUnitReadingChoice(reading = {}, selectedRef = "") {
  const reference = readingReference(reading);
  const isSelected = Boolean(selectedRef && reference === selectedRef);
  const questions = reading.sections?.questions?.length || reading.questions?.length || 0;
  const synonyms = reading.sections?.synonyms?.length || 0;
  const unitLabel = reading.meta?.unidad ? `Unidad ${reading.meta.unidad}` : "";
  const gradeLabel = reading.meta?.grado ? `Grado ${reading.meta.grado}` : "";
  const trimLabel = reading.meta?.trimestre ? `Trimestre ${reading.meta.trimestre}` : "";

  return `
    <label class="cb-shadcn-reading-card${isSelected ? " cb-shadcn-reading-card--selected" : ""}" data-reading-search-text="${escapeAttr([reading.title, reading.text, reading.meta?.nivel, reading.meta?.grado, reading.meta?.trimestre, reading.meta?.unidad].join(" "))}" data-reading-ref="${escapeAttr(reference)}">
      <input type="radio" name="cb-new-unit-reading" data-unit-field="readingRef" value="${escapeAttr(reference)}"${isSelected ? " checked" : ""}>
      <div class="cb-shadcn-reading-body">
        <div class="cb-shadcn-reading-head">
          <strong class="cb-shadcn-reading-title">${escapeHtmlText(reading.title || "Lectura sin título")}</strong>
          <span class="cb-shadcn-reading-check" aria-hidden="true"><i class="fas fa-check"></i></span>
        </div>
        <div class="cb-shadcn-reading-badges">
          ${reading.meta?.nivel ? `<span class="cb-shadcn-badge">${escapeHtmlText(reading.meta.nivel)}</span>` : ""}
          ${gradeLabel ? `<span class="cb-shadcn-badge">${escapeHtmlText(gradeLabel)}</span>` : ""}
          ${trimLabel ? `<span class="cb-shadcn-badge">${escapeHtmlText(trimLabel)}</span>` : ""}
          ${unitLabel ? `<span class="cb-shadcn-badge cb-shadcn-badge--accent">${escapeHtmlText(unitLabel)}</span>` : ""}
        </div>
        <p class="cb-shadcn-reading-snippet">${escapeHtmlText(String(reading.text || "").slice(0, 100))}...</p>
        <div class="cb-shadcn-reading-footer">
          <span><i class="fas fa-spell-check" aria-hidden="true"></i> ${synonyms} sinónimos</span>
          <span><i class="fas fa-question-circle" aria-hidden="true"></i> ${questions} preguntas</span>
        </div>
      </div>
    </label>
  `;
}

function buildReadingFilterOptions(readings = [], key = "grado", allLabel = "Todos", selectedValue = "") {
  const values = [...new Set(readings.map((reading) => String(reading.meta?.[key] || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const matchesSelected = (val) => {
    if (!selectedValue) return false;
    if (key === "grado") return sameGrade(val, selectedValue) || val === selectedValue;
    if (key === "trimestre" || key === "unidad") return sameNumericSlot(val, selectedValue) || val === selectedValue;
    return val === selectedValue;
  };
  return [`<option value="">${escapeHtmlText(allLabel)}</option>`, ...values.map((value) => {
    let display = value;
    if (key === "unidad") {
      display = value.toLowerCase().includes("unidad") || value.toLowerCase().includes("proyecto") ? value : `Unidad ${value}`;
    } else if (key === "trimestre") {
      display = value.toLowerCase().includes("trimestre") ? value : `Trimestre ${value}`;
    }
    const isSelected = matchesSelected(value);
    return `<option value="${escapeAttr(value)}"${isSelected ? " selected" : ""}>${escapeHtmlText(display)}</option>`;
  })].join("");
}

function bindNewUnitReadingControls(editor) {
  const getFilters = () => ({
    search: editor.querySelector("[data-new-unit-reading-search]")?.value || "",
    grade: editor.querySelector("[data-new-unit-reading-filter='grade']")?.value || "",
    trimester: editor.querySelector("[data-new-unit-reading-filter='trimester']")?.value || "",
    unit: editor.querySelector("[data-new-unit-reading-filter='unit']")?.value || ""
  });

  const getActiveUnit = () => editor.querySelector("[data-unit-field='unit']")?.value || "1";

  const refresh = (preferredRef = null) => {
    const filters = getFilters();
    let currentSelectedRef = preferredRef !== null
      ? preferredRef
      : (editor.querySelector("input[name='cb-new-unit-reading']:checked")?.value || "");

    if (!currentSelectedRef) {
      const activeUnit = getActiveUnit();
      const currentTargetMeta = {
        grade: filters.grade,
        trimester: filters.trimester,
        unit: filters.unit || activeUnit
      };
      const autoMatch = pickExactReadingForMeta(currentReadingOptions, currentTargetMeta) ||
        currentReadingOptions.find(r => sameGrade(r.meta?.grado, currentTargetMeta.grade) && sameNumericSlot(r.meta?.unidad, currentTargetMeta.unit)) || null;
      if (autoMatch) currentSelectedRef = readingReference(autoMatch);
    }

    const lists = editor.querySelector("[data-new-unit-reading-lists]");
    if (lists) {
      lists.innerHTML = renderNewUnitReadingLists(currentReadingOptions, filters, currentSelectedRef);
      if (currentSelectedRef) {
        const selectedCard = lists.querySelector(`[data-reading-ref="${CSS.escape(currentSelectedRef)}"]`);
        if (selectedCard) {
          const radio = selectedCard.querySelector("input[type='radio']");
          if (radio) radio.checked = true;
          selectedCard.classList.add("cb-shadcn-reading-card--selected");
          setTimeout(() => selectedCard.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
        }
      }
    }
  };

  editor.querySelector("[data-unit-field='unit']")?.addEventListener("change", (event) => {
    const newUnit = String(event.target.value || "1");
    const unitFilter = editor.querySelector("[data-new-unit-reading-filter='unit']");
    if (unitFilter) {
      const matchOpt = Array.from(unitFilter.options).find(opt => sameNumericSlot(opt.value, newUnit) || opt.value === newUnit);
      unitFilter.value = matchOpt ? matchOpt.value : "";
    }
    const gradeVal = editor.querySelector("[data-new-unit-reading-filter='grade']")?.value || "";
    const trimVal = editor.querySelector("[data-new-unit-reading-filter='trimester']")?.value || "";
    const newTargetMeta = { grade: gradeVal, trimester: trimVal, unit: newUnit };
    const newMatch = pickExactReadingForMeta(currentReadingOptions, newTargetMeta) ||
      currentReadingOptions.find(r => sameGrade(r.meta?.grado, newTargetMeta.grade) && sameNumericSlot(r.meta?.unidad, newTargetMeta.unit)) || null;
    const newRef = newMatch ? readingReference(newMatch) : "";

    const titleInput = editor.querySelector("[data-unit-field='title']");
    if (titleInput && newMatch?.title && (!titleInput.value || titleInput.dataset.autoFilled === "true")) {
      titleInput.value = newMatch.title;
      titleInput.dataset.autoFilled = "true";
    }

    refresh(newRef);
  });

  editor.querySelector("[data-unit-field='title']")?.addEventListener("input", (e) => {
    e.target.dataset.autoFilled = "false";
  });

  editor.querySelector("[data-new-unit-reading-search]")?.addEventListener("input", () => refresh());
  editor.querySelectorAll("[data-new-unit-reading-filter]").forEach((control) => {
    control.addEventListener("change", () => refresh());
  });

  editor.querySelector("[data-new-unit-reading-lists]")?.addEventListener("change", (event) => {
    if (event.target?.name === "cb-new-unit-reading") {
      const ref = event.target.value;
      const reading = findReadingByReference(ref);
      if (reading?.title) {
        const titleInput = editor.querySelector("[data-unit-field='title']");
        if (titleInput && (!titleInput.value || titleInput.dataset.autoFilled === "true")) {
          titleInput.value = reading.title;
          titleInput.dataset.autoFilled = "true";
        }
      }
      editor.querySelectorAll(".cb-shadcn-reading-card").forEach((card) => {
        card.classList.toggle("cb-shadcn-reading-card--selected", card.dataset.readingRef === ref);
      });
      const existingRadio = editor.querySelector("input[name='cb-reading-mode'][value='existing']");
      if (existingRadio && !existingRadio.checked) {
        existingRadio.checked = true;
        syncNewUnitReadingMode(editor);
      }
    }
  });

  syncNewUnitReadingMode(editor);

  setTimeout(() => {
    const selected = editor.querySelector(".cb-shadcn-reading-card input:checked")?.closest(".cb-shadcn-reading-card");
    selected?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, 100);
}

function syncNewUnitReadingMode(editor) {
  const mode = editor.querySelector("input[name='cb-reading-mode']:checked")?.value || "existing";
  const picker = editor.querySelector("[data-new-unit-reading-picker]");
  if (picker) picker.hidden = mode !== "existing";
}

function filterNewUnitReadings(readings = [], { search = "", grade = "", trimester = "", unit = "" } = {}) {
  const needle = normalizeForLocalIntent(search);
  const normalizedUnit = normalizeNumericSlot(unit);
  return readings.filter((reading) => {
    if (grade && !sameGrade(reading.meta?.grado, grade) && String(reading.meta?.grado || "") !== grade) return false;
    if (trimester && !sameNumericSlot(reading.meta?.trimestre, trimester) && String(reading.meta?.trimestre || "") !== trimester) return false;
    if (unit) {
      const readingUnit = normalizeNumericSlot(reading.meta?.unidad);
      if (readingUnit !== normalizedUnit && String(reading.meta?.unidad || "") !== unit) return false;
    }
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
    <div class="cb-shadcn-field">
      <label class="cb-shadcn-label">${escapeHtmlText(label)}</label>
      ${control}
    </div>
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
  if (key === "AE") return "Proceso de desarrollo de aprendizaje (PDA · clave AE)";
  if (key === "C") return "Contenido (C)";
  if (key === "P") return "Proceso o práctica (P)";
  return formatSyaEditorLabel(key);
}

function buildEditableSyaGroups(source = {}, meta = {}) {
  const catalog = getCategoriesForGrade(normalizeSyaEditorGrade(meta.grade, meta.level));
  const groups = Object.entries(catalog).map(([category, subtopics]) => ({
    category,
    items: subtopics.map((subtopic) => {
      const baseKey = resolveSyaBaseKeyForSubtopic(subtopic);
      return {
        subtopic,
        fields: buildSubtopicSyaFields(source, subtopic),
        keys: { T: `${baseKey}_T`, AE: `${baseKey}_AE`, C: `${baseKey}_C`, P: `${baseKey}_P` }
      };
    })
  }));
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

function normalizeSyaEditorGrade(value = "", level = "Primaria") {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const words = ["primero", "segundo", "tercero", "cuarto", "quinto", "sexto"];
  const wordMatch = words.find((word) => normalized.includes(word));
  if (wordMatch) return wordMatch[0].toUpperCase() + wordMatch.slice(1);
  const number = normalized.match(/(?:^|\D)([1-6])(?:\D|$)/)?.[1];
  if (number) return getGradesForLevel(level).find((_grade, index) => index === Number(number) - 1) || raw;
  return raw;
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
  if (safe.includes("Comprensión") || safe.includes("Comprension")) return "Lectura";
  if (safe.includes("Ortografía") || safe.includes("Ortografia")) return "Ortografia";
  if (safe.includes("Gramática") || safe.includes("Gramatica")) return "Gramatica";
  if (safe.includes("Expresión escrita") || safe.includes("ExpresionEscrita")) return "ExpresionEscrita";
  if (safe.includes("Expresión oral") || safe.includes("ExpresionOral")) return "ExpresionOral";
  if (safe.includes("Conocimiento del medio") || safe.includes("ConocimientoDelMedio")) return "ConocimientoDelMedio";
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

// escapeHtmlText y escapeAttr son aliases de escapeHtml importada desde ui-components.js
const escapeHtmlText = escapeHtml;
const escapeAttr = escapeHtml;

boot().catch((error) => {
  console.error("[charly-brown] boot failed", error);
  toast("No se pudo iniciar Charly Brown.");
});
