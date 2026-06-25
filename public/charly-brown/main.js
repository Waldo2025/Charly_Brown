import { createEmptySession, createStore } from "./state.js";
import { saveSession, listSessions, deleteSession, duplicateSession } from "./sessions-store.js";
import { renderSessionSidebar } from "./session-sidebar.js";
import { renderAcceptedPanel } from "./accepted-panel.js";
import { createChatController, renderProposalMessage } from "./chat-controller.js";
import { generateActivities, generateChatReply, generateReading, refineActivities } from "./unit-generator.js";
import { getStaticGeminiTextModels, listGeminiModels } from "./gemini-client.js";
import { generateTeacherNotes } from "./teacher-notes-generator.js";
import { loadSyaForMeta } from "./sya-service.js";
import { listReadingsForUnit, saveGeneratedReading } from "./reading-service.js";
import { ALL_OPTION, getCategoriesForGrade, getGradesForLevel, getWorkModeLabel, isProjectSelection } from "./unit-contracts.js";
import { routeUserIntent } from "./user-intent.js";
import { createId, toast, stripHtml } from "./ui-components.js";
import { ensureApprovedUserAccess } from "./auth-guard.js";

const root = document;
const store = createStore(createEmptySession());
let currentReadingOptions = [];
let readingFilter = "";
let geminiModelOptions = getStaticGeminiTextModels();
let readingLoadTimer = null;
let readingLoadSeq = 0;
let syaLoadTimer = null;
let syaLoadSeq = 0;
let transientNoticeTimer = null;
const DEFAULT_ACCEPTED_WIDTH = 360;
const MIN_ACCEPTED_WIDTH = 280;
const MAX_ACCEPTED_WIDTH = 760;
const SETUP_PANEL_COLLAPSED_KEY = "cbSetupPanelCollapsed";
let chatController = null;

export async function boot() {
  const access = await ensureApprovedUserAccess();
  if (!access.allowed) return;
  const defaultMeta = syncMetaForLevelAndGrade(createEmptySession().meta);
  renderGradeOptions(defaultMeta.level, defaultMeta.grade);
  renderCategoryAndSubtopicControls(defaultMeta);
  renderEditionOptions(defaultMeta.edition);
  bindMetaControls();
  bindAcceptedPanelControls();
  bindSetupPanelToggle();
  bindComposerFooterLayout();
  bindSyaEditingControls();
  renderGeminiModelOptions();
  chatController = createChatController({ root, store, onAction: handleAction, onUserMessage: handleUserMessage });
  bindProposalActions();
  store.subscribe(renderAll);
  await refreshSessions();
  loadGeminiModelOptions();
  scheduleReadingsReload({ silent: true, delay: 0 });
  scheduleSyaReload({ silent: true, delay: 0, replaceExisting: true });
  await persist();
  flashWorkingStatus();
}

async function loadGeminiModelOptions() {
  const models = await listGeminiModels().catch(() => getStaticGeminiTextModels());
  geminiModelOptions = models.length ? models : getStaticGeminiTextModels();
  renderGeminiModelOptions(store.getState().session.meta?.model);
}

function renderGeminiModelOptions(selectedModel = "") {
  const select = document.getElementById("cbModelSelect");
  if (!select) return;
  const current = selectedModel || select.value || store.getState().session.meta?.model || "gemini-2.5-flash-lite";
  const hasCurrent = geminiModelOptions.some((model) => model.id === current);
  const models = hasCurrent ? geminiModelOptions : [{ id: current, label: current, source: "session" }, ...geminiModelOptions];
  select.innerHTML = models.map((model) => `
    <option value="${escapeAttr(model.id)}"${model.id === current ? " selected" : ""}>${escapeHtmlText(model.label || model.id)}</option>
  `).join("");
}

function renderAll(state) {
  updateProjectModeUi(state.session?.meta || {});
  renderSessionSidebar({
    root,
    sessions: state.sessions,
    activeId: state.session.id,
    onNew: newSession,
    onSelect: selectSession,
    onRename: renameSession,
    onDuplicate: duplicateSelectedSession,
    onDelete: deleteSelectedSession
  });
  renderAcceptedPanel({
    root,
    session: state.session,
    readingOptions: currentReadingOptions,
    readingFilter,
    onRefreshReadings: handleSelectReading,
    onFilterReadings: (value) => {
      readingFilter = value;
      renderAll(store.getState());
    },
    onUseReading: useReadingById,
    onEditActivity: editActivity,
    onRegenerateActivity: regenerateActivity,
    onRemoveActivity: (id) => {
      store.removeActivity(id);
      persist();
    },
    onGenerateNotesForActivity: (id) => handleGenerateTeacherNotes(id),
    onGenerateGlobalNotes: () => handleGenerateTeacherNotes("")
  });
  syncComposerFooterLayout();
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
    cbEditionInput: "edition",
    cbModelSelect: "model"
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

async function newSession() {
  const session = createEmptySession({ title: "Nueva unidad" });
  store.setSession(session);
  syncMetaControls(session);
  await persist();
  await refreshSessions();
  scheduleReadingsReload({ silent: true, delay: 0 });
  scheduleSyaReload({ silent: true, delay: 0, replaceExisting: true });
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
  if (!store.getState().sessions.length) await newSession();
}

async function handleUserMessage(text) {
  store.addMessage({ role: "user", text });
  store.addPreference(text.startsWith("Recuerda:") ? text.replace(/^Recuerda:\s*/i, "") : "");
  await persist();
  const intent = routeUserIntent(text);
  if (intent === "chat") return handleFreeChat(text);
  await handleAction(intent, text);
}

async function handleAction(action, userText = "") {
  if (action === "reading") return handleGenerateReading(userText);
  if (action === "select-reading") return handleSelectReading();
  if (action === "sya") return handleLoadSya({ silent: false, replaceExisting: true });
  if (action === "activities") return handleGenerateActivities(userText);
  if (action === "teacher-notes") return handleGenerateTeacherNotes("");
}

async function handleFreeChat(text = "") {
  const local = resolveLocalChatResponse(text);
  if (local) {
    store.addMessage(local);
    await persist();
    return;
  }
  const session = store.getState().session;
  const result = await generateChatReply({ session, userText: text, model: session.meta?.model }).catch((error) => ({ error }));
  if (result.error) return store.addMessage({ role: "assistant", text: `No pude responder el chat: ${result.error.message}` });
  store.addMessage({ role: "assistant", text: result.text || "Listo. ¿Qué quieres ajustar ahora?" });
  await persist();
}

async function handleGenerateReading(userText = "") {
  chatController?.showTransientStatus("Working");
  try {
    const current = store.getState().session;
    const result = await generateReading({ session: current, userText, model: current.meta?.model }).catch((error) => ({ error }));
    if (result.error) return store.addMessage({ role: "assistant", text: `No pude generar la lectura: ${result.error.message}` });
    const session = store.getState().session;
    const saved = await saveGeneratedReading({ reading: result, session }).catch(() => ({ saved: false }));
    if (saved?.saved) {
      result.id = saved.id;
      result.collection = saved.collection;
      result.sourceLabel = "Lecturas nuevas";
    }
    store.patchSession({ reading: result, accepted: { ...session.accepted, reading: result } });
    store.addMessage({ role: "assistant", html: `<strong>Lectura lista.</strong><div class="cb-proposal-html">${result.html}</div>` });
    flashWorkingStatus();
    await persist();
  } finally {
    chatController?.clearTransientStatus();
  }
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
  if (!replaceExisting && (session.accepted?.sya || session.sya)) {
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

async function handleGenerateActivities(userText = "") {
  await ensureSyaReadyForGeneration();
  const session = store.getState().session;
  const workMode = getWorkModeLabel(session.meta || {});
  chatController?.showTransientStatus("Working");
  try {
    const result = await generateActivities({ session, userText, model: session.meta?.model }).catch((error) => ({ error }));
    if (result.error) return store.addMessage({ role: "assistant", text: `No pude generar activities: ${result.error.message}` });
    const proposal = { id: createId("proposal"), title: workMode === "proyecto" ? "Proyecto generado" : "Activities generadas", html: result.html, validation: result.validation };
    store.addProposal(proposal);
    store.addMessage({ role: "assistant", html: renderProposalMessage(proposal) });
    flashWorkingStatus();
    await persist();
  } finally {
    chatController?.clearTransientStatus();
  }
}

function bindProposalActions() {
  document.addEventListener("click", async (event) => {
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
      const workMode = getWorkModeLabel(store.getState().session.meta || {});
      store.acceptActivity({ title: proposal.title || (workMode === "proyecto" ? "Proyecto aprobado" : "Activity aprobada"), html: proposal.html });
      flashWorkingStatus();
      await persist();
    }

    if (action === "reject") {
      store.addPreference("No repetir la propuesta rechazada; corregir enfoque y estructura en la siguiente generación.");
      flashWorkingStatus();
      await persist();
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
  });
}

function useReadingById(id = "") {
  const reading = currentReadingOptions.find((item) => item.id === id);
  if (!reading) return;
  const session = store.getState().session;
  const acceptedReading = {
    id: reading.id,
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
  store.patchSession({ reading: acceptedReading, accepted: { ...session.accepted, reading: acceptedReading } });
  toast(`Lectura seleccionada: ${reading.title}`);
  persist();
}

async function handleGenerateTeacherNotes(activityId = "") {
  const session = store.getState().session;
  const activities = activityId
    ? session.accepted.activities.filter((item) => item.id === activityId)
    : session.accepted.activities;
  if (!activities.length) {
    flashWorkingStatus();
    return;
  }
  chatController?.showTransientStatus("Working");
  try {
    const result = await generateTeacherNotes({
      activities,
      context: {
        session: session.meta,
        reading: session.accepted.reading || session.reading,
        sya: session.accepted.sya || session.sya,
        syaOriginal: session.accepted.syaOriginal || session.syaOriginal,
        preferences: session.preferences
      },
      mode: activityId ? "single" : "global",
      model: session.meta?.model
    }).catch((error) => ({ error }));
    if (result.error) return store.addMessage({ role: "assistant", text: `No pude generar notas: ${result.error.message}` });
    store.addTeacherNotes({ html: result.html, mode: activityId ? "single" : "global" }, activityId);
    store.addMessage({ role: "assistant", html: `<strong>Notas del maestro listas.</strong><div class="cb-proposal-html">${result.html}</div>` });
    flashWorkingStatus();
    await persist();
  } finally {
    chatController?.clearTransientStatus();
  }
}

function editActivity(activityId = "") {
  const session = store.getState().session;
  const activity = session.accepted.activities.find((item) => item.id === activityId);
  if (!activity) return;
  const next = prompt("Edita el HTML de la activity aprobada", activity.html || "");
  if (!next) return;
  store.setSession({
    ...session,
    accepted: {
      ...session.accepted,
      activities: session.accepted.activities.map((item) => item.id === activityId ? { ...item, html: next } : item)
    }
  });
  persist();
}

async function regenerateActivity(activityId = "") {
  const session = store.getState().session;
  const activity = session.accepted.activities.find((item) => item.id === activityId);
  if (!activity) return;
  flashWorkingStatus();
  store.removeActivity(activityId);
  await handleGenerateActivities(`Regenera esta activity aprobada mejorando claridad y estructura:\n${stripHtml(activity.html)}`);
}

async function handleRefineProposal(proposal = {}, { difficulty = "normal", userText = "" } = {}) {
  await ensureSyaReadyForGeneration();
  const session = store.getState().session;
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
      title: difficulty === "challenging" || difficulty === "expert" ? "Activities generadas · más difícil" : "Activities generadas · más fácil",
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

function resolveLocalChatResponse(text = "") {
  const session = store.getState().session;
  const reading = session.accepted?.reading || session.reading || null;
  const value = normalizeForLocalIntent(text);
  if (!reading) return null;
  if (/\b(muestra|muestrame|ver|ensena|enseñame|pega|dame)\b.*\b(lectura|texto)\b/.test(value)) {
    return {
      role: "assistant",
      html: `<strong>${reading.title || "Lectura seleccionada"}</strong><div class="cb-proposal-html">${reading.html || `<p>${stripHtml(reading.text || "")}</p>`}</div>`
    };
  }
  return null;
}

function bindAcceptedPanelControls() {
  const shell = document.querySelector(".cb-unit-shell");
  const toggle = document.getElementById("cbToggleAcceptedBtn");
  const handle = document.getElementById("cbAcceptedResizeHandle");
  const savedWidth = Number(localStorage.getItem("cbAcceptedPanelWidth") || DEFAULT_ACCEPTED_WIDTH);
  setAcceptedPanelWidth(savedWidth);

  toggle?.addEventListener("click", () => {
    const hidden = !shell?.classList.contains("is-accepted-hidden");
    shell?.classList.toggle("is-accepted-hidden", hidden);
    toggle.textContent = hidden ? "Mostrar panel" : "Ocultar panel";
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

function bindSyaEditingControls() {
  root.addEventListener("cb:sya-edit", () => {
    editSyaForCurrentSession();
  });
  root.addEventListener("cb:sya-restore", () => {
    restoreOriginalSyaForCurrentSession();
  });
}

function updateProjectModeUi(meta = {}) {
  const isProject = isProjectSelection(meta);
  const generateBtn = document.querySelector('[data-chat-action="activities"]');
  const notesBtn = document.querySelector('[data-chat-action="teacher-notes"]');
  if (generateBtn) generateBtn.textContent = isProject ? "Generar proyecto" : "Generar actividades";
  if (notesBtn) notesBtn.textContent = isProject ? "Crear notas del proyecto" : "Crear notas";
  document.body.classList.toggle("cb-project-mode", isProject);
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
  const safe = Math.min(MAX_ACCEPTED_WIDTH, Math.max(MIN_ACCEPTED_WIDTH, Number(width) || DEFAULT_ACCEPTED_WIDTH));
  document.documentElement.style.setProperty("--cb-accepted-width", `${safe}px`);
  syncComposerFooterLayout();
}

function getAcceptedPanelWidth() {
  return Number(getComputedStyle(document.documentElement).getPropertyValue("--cb-accepted-width").replace("px", "")) || DEFAULT_ACCEPTED_WIDTH;
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

async function persist() {
  const session = store.getState().session;
  const saved = await saveSession({ ...session, title: buildTitle(session) }).catch((error) => {
    toast(`No se guardó en Firebase: ${error.message}`);
    console.error("[charly-brown] saveSession failed", error);
    return null;
  });
  if (saved) toast("Sesión guardada");
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
  const session = store.getState().session;
  const activeSya = session.accepted?.sya || session.sya || null;
  const originalSya = session.accepted?.syaOriginal || session.syaOriginal || activeSya;
  if (!activeSya) {
    toast("Primero carga la secuencia y alcance.");
    return;
  }

  const raw = prompt(
    "Edita la secuencia y alcance en formato JSON. Se conservará la original y Gemini usará esta versión editada para generar actividades.",
    JSON.stringify(activeSya, null, 2)
  );
  if (raw == null) return;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    store.addMessage({ role: "assistant", text: `No pude guardar la secuencia editada: JSON inválido. ${error.message}` });
    return;
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
