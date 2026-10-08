import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  buildDownloadFileName,
  dataUrlToAttachment,
  filesToAttachments,
  resultImageToAttachment
} from "./attachments.js?v=2026-09-07.9";
import { uploadGeneratedResults } from "./assets-store.js";
import { renderAttachmentTray, renderChatFeed } from "./chat-renderer.js?v=2026-09-08.20";
import { bindComposer, clearComposer, formatMatrixAsMarkdownTable, renderComposerCapsules, setComposerDisabled, syncComposerModeMenu } from "./composer.js?v=2026-09-07.14";
import { IMAGE_CREATOR_SESSION_TITLE } from "./constants.js?v=2026-09-07.1";
import { getImageCreatorDom } from "./dom.js?v=2026-09-07.15";
import { initializeOptionsPanel, initializeFloatingFormatPanel, syncFloatingFormatPanel, applyOptionsToPanel, readOptionsFromPanel, syncOptionsPresentation } from "./options-panel.js?v=2026-09-11.1";
import { generateImagesViaGemini } from "./api.js?v=2026-09-11.1";
import { resolveImageCreatorMode } from "./payloads.js?v=2026-09-14.1";
import { downloadPreparedBlob, prepareMetadataFreeImage } from "./image-download.js?v=2026-09-07.1";
import { createImageCreatorSessionStore } from "./sessions-store.js?v=2026-09-11.1";
import { renderSessionList } from "./sidebar.js";
import { createImageCreatorState, deriveSessionTitleFromPrompt } from "./state.js?v=2026-09-07.13";
import { buildLocalizedEditPrompt, buildLocalizedTextEditPrompt, buildTextRemovalPrompt, createRegionEditor } from "./region-editor.js?v=2026-09-07.10";
import { overlayExactTextOnImage } from "./text-overlay.js?v=2026-09-07.1";
import { VideoScriptWorkflow } from "./video-script-workflow.js";

const elements = getImageCreatorDom();
const state = {
  ...createImageCreatorState(),
  resultAssetCache: new Map()
};
let videoScriptWorkflow = null;
const IMAGE_CREATOR_MOBILE_MEDIA = "(max-width: 960px), (hover: none) and (pointer: coarse) and (max-width: 1366px)";
const sessionStore = createImageCreatorSessionStore();
let unsubscribeSessions = null;
let regionEditor = null;
let imageViewerRestoreFocusTo = null;
let imageInfoRestoreFocusTo = null;
const LOCALIZED_REFERENCE_MAX_DIMENSION = 3072;
const LOCALIZED_REFERENCE_TARGET_BYTES = 3 * 1024 * 1024;

function makeId(prefix = "msg") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function getActiveSession() {
  return state.activeSession;
}

function setComposerError(message = "") {
  state.composerError = String(message || "").trim();
  if (!elements.composerError) return;
  elements.composerError.textContent = state.composerError;
  elements.composerError.classList.toggle("hidden", !state.composerError);
}

function setComposerMeta(message = "") {
  state.composerMeta = String(message || "").trim();
  if (!elements.composerMeta) return;
  elements.composerMeta.textContent = state.composerMeta;
  elements.composerMeta.classList.toggle("hidden", !state.composerMeta);
}

function reflectSessionHeader() {
  if (elements.activeSessionTitle) {
    elements.activeSessionTitle.textContent = getActiveSession()?.title || IMAGE_CREATOR_SESSION_TITLE;
  }
  if (elements.userBadge) {
    elements.userBadge.textContent = state.currentUser?.email || "Sin sesión";
  }
}

function reflectSessionList() {
  const filtered = state.sessions.filter((session) => {
    if (!state.searchTerm) return true;
    const title = String(session?.title || "").toLowerCase();
    return title.includes(state.searchTerm);
  });
  renderSessionList(elements.sessionList, filtered, state.activeSessionId);
  if (elements.sessionStatus) {
    elements.sessionStatus.textContent = filtered.length
      ? `${filtered.length} sesión(es)`
      : "Sin sesiones";
  }
}

function reflectResultControls() {
  const resultContext = getLatestResultContext();
  elements.chatFeed?.querySelectorAll("[data-result-action]").forEach((button) => {
    button.disabled = state.isGenerating;
  });
  elements.imageViewer?.querySelectorAll("[data-viewer-result-action]").forEach((button) => {
    button.disabled = state.isGenerating;
  });
  if (elements.imageViewerAnnotateBtn) elements.imageViewerAnnotateBtn.disabled = state.isGenerating;
  if (resultContext) {
    const selector = `.ic-result-card[data-message-id="${CSS.escape(resultContext.message.id)}"][data-result-index="${resultContext.resultIndex}"]`;
    elements.chatFeed?.querySelector(selector)?.classList.add("is-selected");
  }
}

function renderAll() {
  if (!videoScriptWorkflow) {
    videoScriptWorkflow = new VideoScriptWorkflow({
      state,
      elements,
      renderAll,
      persistActiveSession
    });
  }
  reflectSessionHeader();
  reflectSessionList();
  renderChatFeed(elements.chatFeed, state.activeSession);
  if (elements.chatFeed && videoScriptWorkflow?.currentScript?.scenes) {
    videoScriptWorkflow.attachToolbarEvents(elements.chatFeed, videoScriptWorkflow.currentScript.scenes);
  }
  reflectResultControls();
  renderAttachmentTray(elements.attachmentTray, state.composerAttachments);

  const isRightPanelOpen = state.optionsPanelOpen !== false && state.chatPanelOpen !== false;
  elements.panelsGrid?.classList.toggle("is-chat-collapsed", !isRightPanelOpen);
  if (elements.floatingFormatPanel) {
    elements.floatingFormatPanel.classList.toggle("hidden", !isRightPanelOpen);
    elements.floatingFormatPanel.setAttribute("aria-hidden", isRightPanelOpen ? "false" : "true");
    elements.floatingFormatPanel.inert = !isRightPanelOpen;
  }
  if (elements.toggleOptionsBtn) {
    elements.toggleOptionsBtn.setAttribute("aria-expanded", isRightPanelOpen ? "true" : "false");
  }
  if (elements.toggleChatBtn) {
    elements.toggleChatBtn.setAttribute("aria-expanded", isRightPanelOpen ? "true" : "false");
    elements.toggleChatBtn.setAttribute("aria-label", isRightPanelOpen ? "Ocultar parámetros" : "Mostrar parámetros");
    elements.toggleChatBtn.title = `Arrastra para mover · ${isRightPanelOpen ? "Ocultar parámetros" : "Mostrar parámetros"}`;
  }
  if (typeof window.refreshChatTogglePosition === "function") {
    window.refreshChatTogglePosition();
  }
  syncComposerModeMenu(elements, state.options.mode);
  renderComposerCapsules(elements, state.options, state.composerTable, {
    onRemoveMode: () => {
      state.options.mode = "generate";
      syncComposerModeMenu(elements, "generate");
      applyOptionsToPanel(elements, state.options);
      renderAll();
      elements.promptInput?.focus();
    },
    onRemoveTable: () => {
      state.composerTable = null;
      renderAll();
      elements.promptInput?.focus();
    }
  });
}

function setOptionsPanelOpen(open, { restoreFocus = false } = {}) {
  state.optionsPanelOpen = open === true;
  state.chatPanelOpen = open === true;
  renderAll();
  if (state.optionsPanelOpen) {
    applyOptionsToPanel(elements, state.options);
    window.setTimeout(() => elements.closeFloatingFormatBtn?.focus(), 40);
  } else if (restoreFocus) {
    elements.toggleOptionsBtn?.focus();
  }
}

const setFloatingFormatPanelOpen = setOptionsPanelOpen;

function setActiveSession(sessionId = "") {
  closeImageViewer({ restoreFocus: false });
  state.activeSessionId = String(sessionId || "").trim();
  state.activeSession = state.sessions.find((session) => session.id === state.activeSessionId) || null;
  state.selectedResultRef = null;
  state.pendingRevision = null;
  if (state.activeSession && videoScriptWorkflow) {
    videoScriptWorkflow.rehydrateFromSession(state.activeSession);
  }
  renderAll();
}

async function ensureSessionExists() {
  if (state.activeSessionId && state.activeSession) return state.activeSessionId;
  const user = state.currentUser || await sessionStore.waitForUser();
  const sessionId = await sessionStore.createSession(user);
  return sessionId;
}

async function persistActiveSession() {
  const activeSession = getActiveSession();
  if (!activeSession?.id) return;
  await sessionStore.persistSession(activeSession);
}

function clearPendingRevision({ render = false } = {}) {
  if (!state.pendingRevision) return;
  const { activeSessionId, assistantMessageId, userMessageId } = state.pendingRevision;
  const activeSession = state.sessions.find((session) => session.id === activeSessionId) || state.activeSession;
  if (activeSession?.session?.messages) {
    activeSession.session.messages = activeSession.session.messages.filter((message) => (
      message.id !== assistantMessageId && message.id !== userMessageId
    ));
  }
  state.pendingRevision = null;
  state.sessions = state.sessions.map((session) => (session.id === activeSession.id ? activeSession : session));
  if (state.activeSession?.id === activeSession.id) state.activeSession = activeSession;
  if (render) renderAll();
}

function resetComposerState() {
  state.composerAttachments = [];
  state.pendingVariationSource = null;
  setComposerMeta("");
  clearComposer(elements);
  renderAttachmentTray(elements.attachmentTray, state.composerAttachments);
}

function cacheResultAssets(results = []) {
  for (const result of Array.isArray(results) ? results : []) {
    const resultId = String(result?.id || "").trim();
    const dataUrl = String(result?.dataUrl || "").trim();
    if (!resultId || !dataUrl) continue;
    state.resultAssetCache.set(resultId, {
      id: resultId,
      dataUrl,
      mimeType: String(result?.mimeType || "").trim(),
      width: Number(result?.width || 0) || 0,
      height: Number(result?.height || 0) || 0
    });
  }
}

function resolveCachedResultAsset(result = {}) {
  const resultId = String(result?.id || "").trim();
  if (resultId && state.resultAssetCache.has(resultId)) {
    return {
      ...result,
      ...state.resultAssetCache.get(resultId)
    };
  }
  return result;
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("blob_base64_failed"));
    reader.readAsDataURL(blob);
  });
}

async function ensureResultAssetDataUrl(result = {}) {
  const resolved = resolveCachedResultAsset(result);
  const existingDataUrl = String(resolved?.dataUrl || "").trim();
  if (existingDataUrl) return existingDataUrl;

  const downloadUrl = String(resolved?.downloadUrl || "").trim();
  if (!downloadUrl) return "";
  const response = await fetch(downloadUrl);
  if (!response.ok) throw new Error("result_asset_fetch_failed");
  const blob = await response.blob();
  const dataUrl = await readBlobAsDataUrl(blob);
  cacheResultAssets([{
    ...resolved,
    dataUrl,
    mimeType: blob.type || resolved?.mimeType || "image/png"
  }]);
  return dataUrl;
}

async function queueNewSession() {
  setComposerError("");
  closeImageViewer({ restoreFocus: false });
  const user = state.currentUser || await sessionStore.waitForUser();
  const sessionId = await sessionStore.createSession(user);
  state.activeSessionId = sessionId;
  state.activeSession = null;
  state.selectedResultRef = null;
  state.pendingRevision = null;
  resetComposerState();
  renderAll();
  return sessionId;
}

async function handleFilesSelected(fileList) {
  try {
    setComposerError("");
    const attachments = await filesToAttachments(fileList);
    state.composerAttachments = [...state.composerAttachments, ...attachments].slice(0, 3);
    const panelOptions = readOptionsFromPanel(elements);
    state.options = {
      ...panelOptions,
      mode: resolveImageCreatorMode(panelOptions.mode, state.composerAttachments)
    };
    applyOptionsToPanel(elements, state.options);
    if (elements.attachmentInput) elements.attachmentInput.value = "";
    renderAttachmentTray(elements.attachmentTray, state.composerAttachments);
  } catch (error) {
    const message = error?.message === "attachment_too_large"
      ? "Cada referencia debe pesar menos de 4 MB y se comprimirá antes de enviarse."
      : "No fue posible procesar la imagen de referencia.";
    setComposerError(message);
  }
}

function buildUserMessage({ prompt, requestPrompt = "", options, attachments }) {
  const message = {
    id: makeId("usr"),
    role: "user",
    mode: options.mode,
    prompt,
    options,
    attachments,
    results: [],
    error: "",
    createdAt: new Date().toISOString()
  };
  if (requestPrompt && requestPrompt !== prompt) message.requestPrompt = requestPrompt;
  return message;
}

function buildAssistantMessage({ prompt, options, results = [], error = "" }) {
  return {
    id: makeId("ast"),
    role: "assistant",
    mode: options.mode,
    prompt,
    options,
    attachments: [],
    results,
    note: "",
    error,
    createdAt: new Date().toISOString()
  };
}

function buildPendingAssistantMessage({ prompt, options }) {
  return {
    id: makeId("ast"),
    role: "assistant",
    mode: options.mode,
    prompt,
    options,
    attachments: [],
    results: [],
    note: "Generando imagen...",
    error: "",
    isPending: true,
    createdAt: new Date().toISOString()
  };
}

async function submitPrompt({
  requestPrompt = "",
  displayPrompt = "",
  resultTransformer = null,
  requireRevisionReview = false,
  revisionSourceResult = null
} = {}) {
  if (state.isGenerating) return;
  const typedPrompt = String(elements.promptInput?.value || "").trim();
  const attachedTable = state.composerTable;
  let prompt = String(requestPrompt || typedPrompt).trim();
  let visiblePrompt = String(displayPrompt || typedPrompt || requestPrompt).trim();

  if (attachedTable && attachedTable.matrix) {
    const tableMarkdown = formatMatrixAsMarkdownTable(attachedTable.matrix);
    if (!prompt) {
      prompt = `Crea un guion y escenas educativas a partir de los datos de la siguiente tabla:\n\n${tableMarkdown}`;
      visiblePrompt = `Tabla de Excel adjunta (${attachedTable.rowCount} filas × ${attachedTable.colCount} columnas)`;
    } else {
      prompt = `${prompt}\n\nDatos de tabla adjunta:\n${tableMarkdown}`;
    }
    state.composerTable = null;
  }

  if (!prompt || !visiblePrompt) {
    setComposerError("Escribe un prompt antes de generar.");
    return;
  }
  setComposerError("");
  const panelOptions = readOptionsFromPanel(elements);
  state.options = {
    ...panelOptions,
    mode: resolveImageCreatorMode(panelOptions.mode, state.composerAttachments)
  };
  applyOptionsToPanel(elements, state.options);

  const options = { ...state.options };
  const attachments = [...state.composerAttachments];

  const isScriptRequest = state.options.mode === "video_script"
    || /guion|video|escena|podcaster|timeline/i.test(prompt)
    || Boolean(videoScriptWorkflow?.currentScript);
  if (isScriptRequest && attachments.length === 0) {
    state.isGenerating = true;
    setComposerDisabled(elements, true);
    try {
      const sessionId = await ensureSessionExists();
      let activeSession = state.sessions.find((session) => session.id === sessionId) || state.activeSession;
      if (!activeSession) {
        activeSession = {
          id: sessionId,
          ownerId: state.currentUser?.uid || "",
          ownerEmail: state.currentUser?.email || "",
          title: IMAGE_CREATOR_SESSION_TITLE,
          archived: false,
          lastPrompt: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          session: {
            messages: []
          }
        };
        state.sessions = [activeSession, ...state.sessions.filter((session) => session.id !== sessionId)];
        state.activeSessionId = sessionId;
        state.activeSession = activeSession;
      }
      const userMessage = {
        id: makeId("msg"),
        role: "user",
        prompt: visiblePrompt,
        createdAt: new Date().toISOString()
      };
      activeSession.session.messages.push(userMessage);
      renderAll();

      let parsedScenes = attachedTable?.matrix
        ? videoScriptWorkflow.detectScenesFromTable(attachedTable.matrix)
        : null;

      let reply = "";
      if (!parsedScenes || !parsedScenes.length) {
        reply = await videoScriptWorkflow.sendAgentMessage(prompt);
        parsedScenes = videoScriptWorkflow.parseScriptFromReply(reply);
      }

      let assistantMessage;
      if (parsedScenes && parsedScenes.length) {
        videoScriptWorkflow.currentScript = { scenes: parsedScenes };
        assistantMessage = {
          id: makeId("msg"),
          role: "assistant",
          html: videoScriptWorkflow.renderScriptTable(parsedScenes),
          note: "He detectado las columnas del guion y preparado las escenas para generar sus imágenes:",
          createdAt: new Date().toISOString()
        };
      } else {
        assistantMessage = {
          id: makeId("msg"),
          role: "assistant",
          note: reply || "No fue posible detectar las columnas del guion.",
          createdAt: new Date().toISOString()
        };
      }
      activeSession.session.messages.push(assistantMessage);
      await persistActiveSession();
      renderAll();
    } catch (err) {
      setComposerError(err.message || "Error procesando el guion.");
    } finally {
      state.isGenerating = false;
      setComposerDisabled(elements, false);
      clearComposer(elements);
    }
    return;
  }

  const requestMode = resolveImageCreatorMode(options.mode, attachments);
  if ((options.mode === "edit" || options.mode === "variation") && attachments.length < 1) {
    setComposerError("Este modo requiere al menos una imagen de referencia.");
    return;
  }
  if (requestMode === "compose" && attachments.length < 2) {
    setComposerError("Componer requiere al menos dos referencias.");
    return;
  }
  const requestOptions = {
    ...options,
    mode: requestMode
  };
  state.options = {
    ...requestOptions
  };
  applyOptionsToPanel(elements, state.options);
  const targetRevisionSourceResult = requireRevisionReview === true
    ? (revisionSourceResult || getSourceResultForRevision())
    : null;
  const shouldReviewEdit = Boolean(requireRevisionReview === true && targetRevisionSourceResult);
  if (state.pendingRevision) clearPendingRevision();

  state.isGenerating = true;
  setComposerDisabled(elements, true);
  const revisionSource = shouldReviewEdit ? targetRevisionSourceResult : null;
  const sessionId = await ensureSessionExists();
  let activeSession = state.sessions.find((session) => session.id === sessionId) || state.activeSession;
  if (!activeSession) {
    activeSession = {
      id: sessionId,
      ownerId: state.currentUser?.uid || "",
      ownerEmail: state.currentUser?.email || "",
      title: IMAGE_CREATOR_SESSION_TITLE,
      archived: false,
      lastPrompt: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      session: {
        messages: []
      }
    };
    state.sessions = [activeSession, ...state.sessions.filter((session) => session.id !== sessionId)];
    state.activeSessionId = sessionId;
    state.activeSession = activeSession;
  }

  const userMessage = buildUserMessage({ prompt: visiblePrompt, requestPrompt: prompt, options: requestOptions, attachments });
  const pendingAssistantMessage = buildPendingAssistantMessage({ prompt: visiblePrompt, options: requestOptions });
  const optimisticMessages = [...(activeSession.session.messages || []), userMessage, pendingAssistantMessage];
  activeSession = {
    ...activeSession,
    title: activeSession.title === IMAGE_CREATOR_SESSION_TITLE
      ? deriveSessionTitleFromPrompt(visiblePrompt, IMAGE_CREATOR_SESSION_TITLE)
      : activeSession.title,
    lastPrompt: visiblePrompt,
    session: {
      messages: optimisticMessages
    }
  };
  state.sessions = state.sessions.map((session) => (session.id === activeSession.id ? activeSession : session));
  state.activeSession = activeSession;
  renderAll();

  try {
    let results = await generateImagesViaGemini({
      mode: requestMode,
      prompt,
      options: requestOptions,
      attachments
    });
    if (typeof resultTransformer === "function") {
      results = await Promise.all(results.map((result, index) => resultTransformer(result, index)));
    }
    const decoratedResults = results.map((result) => ({
      ...result,
      sourceMessageId: userMessage.id
    }));
    cacheResultAssets(decoratedResults);
    const storedResults = await uploadGeneratedResults(decoratedResults, {
      uid: state.currentUser?.uid || "",
      sessionId: activeSession.id,
      messageId: pendingAssistantMessage.id
    });
    const assistantMessage = buildAssistantMessage({
      prompt: visiblePrompt,
      options: requestOptions,
      results: storedResults
    });
    assistantMessage.sourceMessageId = userMessage.id;
    const nextSession = {
      ...activeSession,
      lastPrompt: visiblePrompt,
      title: !activeSession.title || activeSession.title === IMAGE_CREATOR_SESSION_TITLE
        ? deriveSessionTitleFromPrompt(visiblePrompt, IMAGE_CREATOR_SESSION_TITLE)
        : activeSession.title,
      session: {
        messages: optimisticMessages.map((message) => (
          message.id === pendingAssistantMessage.id
            ? assistantMessage
            : message
        ))
      }
    };
    state.sessions = state.sessions.map((session) => (session.id === nextSession.id ? nextSession : session));
    state.activeSession = nextSession;
    state.selectedResultRef = null;
    if (shouldReviewEdit && revisionSource) {
      state.pendingRevision = {
        activeSessionId: nextSession.id,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        sourceResult: revisionSource,
        proposedResults: storedResults,
        originalPrompt: String(revisionSource?.prompt || visiblePrompt),
        proposedPrompt: String(visiblePrompt)
      };
      renderAll();
      await openRevisionViewer(state.pendingRevision);
    } else {
      renderAll();
      await persistActiveSession();
      resetComposerState();
      closeImageViewer({ restoreFocus: false });
    }
  } catch (error) {
    const assistantMessage = buildAssistantMessage({
      prompt: visiblePrompt,
      options: requestOptions,
      results: [],
      error: String(error?.message || "No fue posible generar imágenes.")
    });
    const nextSession = {
      ...activeSession,
      session: {
        messages: optimisticMessages.map((message) => (
          message.id === pendingAssistantMessage.id
            ? assistantMessage
            : message
        ))
      }
    };
    state.sessions = state.sessions.map((session) => (session.id === nextSession.id ? nextSession : session));
    state.activeSession = nextSession;
    state.selectedResultRef = null;
    renderAll();
    if (!shouldReviewEdit) {
      await persistActiveSession();
    }
  } finally {
    state.isGenerating = false;
    setComposerDisabled(elements, false);
    reflectResultControls();
  }
}

async function acceptPendingRevision() {
  const pending = state.pendingRevision;
  if (!pending) return;
  const activeSession = state.sessions.find((session) => session.id === pending.activeSessionId)
    || state.activeSession;
  if (!activeSession) return;
  const messages = Array.isArray(activeSession.session?.messages) ? [...activeSession.session.messages] : [];
  const sourceResult = resolveCachedResultAsset(pending.sourceResult || {});
  const nextSession = {
    ...activeSession,
    lastPrompt: pending.proposedPrompt || activeSession.lastPrompt,
    title: !activeSession.title || activeSession.title === IMAGE_CREATOR_SESSION_TITLE
      ? deriveSessionTitleFromPrompt(pending.proposedPrompt || "", IMAGE_CREATOR_SESSION_TITLE)
      : activeSession.title,
    session: {
      messages
    }
  };
  nextSession.session.messages = nextSession.session.messages.map((message) => {
    if (message.id !== pending.assistantMessageId) return message;
    return {
      ...message,
      sourceMessageId: message.sourceMessageId || sourceResult?.id || "",
      isPending: false
    };
  });
  state.pendingRevision = null;
  state.sessions = state.sessions.map((session) => (session.id === nextSession.id ? nextSession : session));
  state.activeSession = nextSession;
  state.selectedResultRef = null;
  closeImageViewer();
  renderAll();
  await persistActiveSession();
  resetComposerState();
}

async function continueFromPendingRevision() {
  const pending = state.pendingRevision;
  if (!pending) return;
  const firstResult = Array.isArray(pending.proposedResults) ? pending.proposedResults[0] : null;
  if (!firstResult) {
    setComposerError("No quedó disponible una propuesta para continuar.");
    return;
  }
  const attachment = await resultImageToAttachment(firstResult).catch(() => null);
  if (!attachment) {
    setComposerError("No fue posible preparar la imagen propuesta para continuar.");
    return;
  }
  state.composerAttachments = [{ ...attachment, hiddenInChat: true }];
  state.selectedResultRef = null;
  state.options = {
    ...state.options,
    mode: "edit",
    model: "gemini-3-pro-image"
  };
  applyOptionsToPanel(elements, state.options);
  clearPendingRevision();
  closeImageViewer();
  renderAll();
  setComposerMeta("Siguiendo desde la propuesta aceptada para editar de nuevo.");
}

function rejectPendingRevision() {
  const pending = state.pendingRevision;
  if (!pending) return;
  clearPendingRevision({ render: true });
  state.selectedResultRef = null;
  closeImageViewer();
}

async function handleSessionAction(action = "", sessionId = "") {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  if (action === "open") {
    setActiveSession(sessionId);
    return;
  }
  if (action === "rename") {
    const nextTitle = window.prompt("Nuevo nombre para la sesión", session.title || IMAGE_CREATOR_SESSION_TITLE);
    if (nextTitle === null) return;
    await sessionStore.renameSession(sessionId, nextTitle);
    return;
  }
  if (action === "archive") {
    await sessionStore.archiveSession(sessionId, !session.archived);
    return;
  }
  if (action === "delete") {
    const confirmed = window.confirm(`Eliminar la sesión "${session.title || IMAGE_CREATOR_SESSION_TITLE}"?`);
    if (!confirmed) return;
    await sessionStore.deleteSession(sessionId);
  }
}

function closeSessionMenus({ restoreFocus = false } = {}) {
  const openTrigger = elements.sessionList?.querySelector('.ic-session-menu-trigger[aria-expanded="true"]');
  elements.sessionList?.querySelectorAll("[data-session-menu]").forEach((menu) => menu.classList.add("hidden"));
  elements.sessionList?.querySelectorAll(".ic-session-menu-trigger").forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
  if (restoreFocus) openTrigger?.focus();
}

function setMobileSessionsOpen(open, { restoreFocus = false } = {}) {
  const isMobileLayout = window.matchMedia(IMAGE_CREATOR_MOBILE_MEDIA).matches;
  const shouldOpen = isMobileLayout && open === true;
  elements.sessionRail?.classList.toggle("is-mobile-open", shouldOpen);
  if (elements.sessionRail) elements.sessionRail.inert = isMobileLayout && !shouldOpen;
  elements.mobileBackdrop?.classList.toggle("hidden", !shouldOpen);
  elements.mobileSessionsBtn?.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  if (shouldOpen) {
    window.setTimeout(() => elements.sessionSearchInput?.focus(), 180);
  } else if (restoreFocus) {
    elements.mobileSessionsBtn?.focus();
  }
}

function initializeMobileLayout() {
  let wasMobile = null;
  const syncLayout = () => {
    const isMobile = window.matchMedia(IMAGE_CREATOR_MOBILE_MEDIA).matches;
    if (isMobile) {
      if (wasMobile !== true) setMobileSessionsOpen(false);
      wasMobile = true;
      return;
    }
    if (wasMobile !== false) {
      elements.sessionRail?.classList.remove("is-mobile-open");
      if (elements.sessionRail) elements.sessionRail.inert = false;
      elements.mobileBackdrop?.classList.add("hidden");
      elements.mobileSessionsBtn?.setAttribute("aria-expanded", "false");
    }
    wasMobile = false;
  };
  syncLayout();
  window.addEventListener("resize", syncLayout);
}

function toggleSessionMenu(trigger) {
  const sessionId = trigger?.getAttribute("data-session-id");
  const menu = elements.sessionList?.querySelector(`[data-session-menu="${CSS.escape(sessionId || "")}"]`);
  if (!menu) return;
  const shouldOpen = menu.classList.contains("hidden");
  closeSessionMenus();
  if (!shouldOpen) return;
  const rect = trigger.getBoundingClientRect();
  menu.style.left = `${Math.max(8, rect.right - 154)}px`;
  menu.style.top = `${Math.min(window.innerHeight - 116, rect.bottom + 5)}px`;
  menu.classList.remove("hidden");
  trigger.setAttribute("aria-expanded", "true");
  menu.querySelector('[role="menuitem"]')?.focus();
}

function initializeResizablePanels() {
  const root = document.documentElement;
  const sessionWidthKey = "ic-session-width-v2";
  const toolsWidthKey = "ic-tools-width-v2";
  const savedSessions = Number(localStorage.getItem(sessionWidthKey));
  const savedTools = Number(localStorage.getItem(toolsWidthKey));
  const savedWidthsFit = savedSessions + savedTools <= window.innerWidth - 430;
  if (savedWidthsFit && savedSessions >= 210 && savedSessions <= 320) root.style.setProperty("--ic-session-width", `${savedSessions}px`);
  if (savedWidthsFit && savedTools >= 290 && savedTools <= 400) root.style.setProperty("--ic-tools-width", `${savedTools}px`);

  const resize = (kind, delta, startingWidth) => {
    const isSessions = kind === "sessions";
    const min = isSessions ? 210 : 290;
    const otherProperty = isSessions ? "--ic-tools-width" : "--ic-session-width";
    const otherWidth = parseFloat(getComputedStyle(root).getPropertyValue(otherProperty));
    const shellWidth = document.getElementById("imageCreatorApp")?.clientWidth || window.innerWidth;
    const configuredMax = isSessions ? 320 : 400;
    const max = Math.max(min, Math.min(configuredMax, shellWidth - otherWidth - 330));
    const value = Math.round(Math.min(max, Math.max(min, startingWidth + (isSessions ? delta : -delta))));
    const property = isSessions ? "--ic-session-width" : "--ic-tools-width";
    root.style.setProperty(property, `${value}px`);
    return value;
  };

  elements.resizers.forEach((resizer) => {
    resizer.addEventListener("pointerdown", (event) => {
      if (window.matchMedia(IMAGE_CREATOR_MOBILE_MEDIA).matches) return;
      const kind = resizer.dataset.resizer;
      const property = kind === "sessions" ? "--ic-session-width" : "--ic-tools-width";
      const startWidth = parseFloat(getComputedStyle(root).getPropertyValue(property));
      const startX = event.clientX;
      let finalWidth = startWidth;
      resizer.setPointerCapture(event.pointerId);
      resizer.classList.add("is-dragging");
      const onMove = (moveEvent) => { finalWidth = resize(kind, moveEvent.clientX - startX, startWidth); };
      const onUp = () => {
        resizer.classList.remove("is-dragging");
        resizer.removeEventListener("pointermove", onMove);
        localStorage.setItem(kind === "sessions" ? sessionWidthKey : toolsWidthKey, String(finalWidth));
      };
      resizer.addEventListener("pointermove", onMove);
      resizer.addEventListener("pointerup", onUp, { once: true });
      resizer.addEventListener("pointercancel", onUp, { once: true });
    });
    resizer.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const kind = resizer.dataset.resizer;
      const property = kind === "sessions" ? "--ic-session-width" : "--ic-tools-width";
      const current = parseFloat(getComputedStyle(root).getPropertyValue(property));
      const value = resize(kind, event.key === "ArrowRight" ? 12 : -12, current);
      localStorage.setItem(kind === "sessions" ? sessionWidthKey : toolsWidthKey, String(value));
    });
  });
}

const IMAGE_CREATOR_THEME_KEY = "ic-workspace-theme-v1";
const IMAGE_CREATOR_CHAT_PANEL_KEY = "ic-chat-panel-open-v1";
const IMAGE_CREATOR_CHAT_FAB_POSITION_KEY = "ic-chat-fab-position-v2";
const IMAGE_CREATOR_THEMES = {
  dark: { label: "Oscuro", icon: "fa-moon" },
  light: { label: "Claro", icon: "fa-sun" },
  mid: { label: "Gris", icon: "fa-circle-half-stroke" }
};

function applyWorkspaceTheme(theme = "dark") {
  const normalized = IMAGE_CREATOR_THEMES[theme] ? theme : "dark";
  const config = IMAGE_CREATOR_THEMES[normalized];
  document.documentElement.dataset.icTheme = normalized;
  document.body.dataset.icTheme = normalized;
  const button = document.getElementById("icThemeToggleBtn");
  if (button) {
    button.innerHTML = `<i class="fas ${config.icon}" aria-hidden="true"></i>`;
    button.setAttribute("aria-label", `Tema actual: ${config.label}. Cambiar tema`);
    button.title = `Tema actual: ${config.label}`;
  }
  try {
    localStorage.setItem(IMAGE_CREATOR_THEME_KEY, normalized);
  } catch (_) {
    // El tema sigue funcionando aunque el navegador bloquee almacenamiento local.
  }
}

function initializeWorkspaceTheme() {
  const button = document.getElementById("icThemeToggleBtn");
  button?.addEventListener("click", () => {
    const order = ["dark", "light", "mid"];
    const current = document.body.dataset.icTheme || "dark";
    applyWorkspaceTheme(order[(order.indexOf(current) + 1) % order.length]);
  });
  let savedTheme = "dark";
  try {
    savedTheme = localStorage.getItem(IMAGE_CREATOR_THEME_KEY) || "dark";
  } catch (_) {
    // Usa el tema oscuro predeterminado.
  }
  applyWorkspaceTheme(savedTheme);
}

function initializeChatPanelVisibility() {
  try {
    state.chatPanelOpen = localStorage.getItem(IMAGE_CREATOR_CHAT_PANEL_KEY) !== "false";
  } catch (_) {
    state.chatPanelOpen = true;
  }
}

function toggleChatPanel() {
  state.chatPanelOpen = !state.chatPanelOpen;
  try {
    localStorage.setItem(IMAGE_CREATOR_CHAT_PANEL_KEY, String(state.chatPanelOpen));
  } catch (_) {
    // La visibilidad sigue funcionando aunque el almacenamiento esté bloqueado.
  }
  renderAll();
  elements.toggleChatBtn?.focus();
}

function initializeMovableChatToggle() {
  const button = elements.toggleChatBtn;
  const shell = document.getElementById("imageCreatorApp");
  if (!button || !shell) return;
  let savedPosition = null;
  let suppressClick = false;

  try {
    const parsed = JSON.parse(localStorage.getItem(IMAGE_CREATOR_CHAT_FAB_POSITION_KEY) || "null");
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) savedPosition = parsed;
  } catch (_) {
    savedPosition = null;
  }

  const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
  const getBounds = () => ({
    width: shell.clientWidth,
    height: shell.clientHeight,
    buttonWidth: button.offsetWidth || 46,
    buttonHeight: button.offsetHeight || 46
  });
  const normalizePosition = (left, top) => {
    const bounds = getBounds();
    return {
      left: clamp(left, 8, bounds.width - bounds.buttonWidth - 8),
      top: clamp(top, 8, bounds.height - bounds.buttonHeight - 8)
    };
  };
  const positionButton = ({ left, top }) => {
    const safe = normalizePosition(left, top);
    button.style.left = `${safe.left}px`;
    button.style.top = `${safe.top}px`;
    button.style.right = "auto";
    return safe;
  };
  const defaultPosition = () => {
    const bounds = getBounds();
    return normalizePosition(
      bounds.width - bounds.buttonWidth - 14,
      14
    );
  };
  const persistPosition = (position) => {
    const bounds = getBounds();
    savedPosition = {
      x: position.left / Math.max(1, bounds.width - bounds.buttonWidth),
      y: position.top / Math.max(1, bounds.height - bounds.buttonHeight)
    };
    try {
      localStorage.setItem(IMAGE_CREATOR_CHAT_FAB_POSITION_KEY, JSON.stringify(savedPosition));
    } catch (_) {
      // El botón sigue siendo movible aunque el almacenamiento esté bloqueado.
    }
  };

  const updateButtonPlacement = () => {
    const bounds = getBounds();
    const isPanelOpen = state.optionsPanelOpen !== false && state.chatPanelOpen !== false;

    if (!isPanelOpen) {
      const currentY = savedPosition?.y != null
        ? savedPosition.y * Math.max(1, bounds.height - bounds.buttonHeight)
        : 14;
      positionButton({
        left: bounds.width - bounds.buttonWidth - 14,
        top: currentY
      });
      button.classList.add("is-docked-right");
    } else {
      button.classList.remove("is-docked-right");
      if (savedPosition?.x != null && savedPosition?.y != null) {
        positionButton({
          left: savedPosition.x * Math.max(1, bounds.width - bounds.buttonWidth),
          top: savedPosition.y * Math.max(1, bounds.height - bounds.buttonHeight)
        });
      } else {
        positionButton(defaultPosition());
      }
    }
  };

  window.refreshChatTogglePosition = updateButtonPlacement;
  updateButtonPlacement();
  window.addEventListener("resize", updateButtonPlacement);

  button.addEventListener("click", (event) => {
    if (suppressClick) {
      event.preventDefault();
      suppressClick = false;
      return;
    }
    toggleChatPanel();
  });
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const startRect = button.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const start = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      left: startRect.left - shellRect.left,
      top: startRect.top - shellRect.top
    };
    let dragged = false;
    button.setPointerCapture(event.pointerId);

    const onMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - start.pointerX;
      const deltaY = moveEvent.clientY - start.pointerY;
      if (!dragged && Math.hypot(deltaX, deltaY) < 5) return;
      dragged = true;
      button.classList.add("is-dragging");
      positionButton({ left: start.left + deltaX, top: start.top + deltaY });
    };
    const onUp = (upEvent) => {
      button.classList.remove("is-dragging");
      button.removeEventListener("pointermove", onMove);
      button.removeEventListener("pointerup", onUp);
      button.removeEventListener("pointercancel", onUp);
      if (dragged) {
        suppressClick = upEvent?.type === "pointerup";
        const currentPos = positionButton({ left: button.offsetLeft, top: button.offsetTop });
        const isPanelOpen = state.optionsPanelOpen !== false && state.chatPanelOpen !== false;
        if (isPanelOpen) {
          persistPosition(currentPos);
        } else {
          const bounds = getBounds();
          savedPosition = {
            x: savedPosition?.x != null ? savedPosition.x : 0.65,
            y: currentPos.top / Math.max(1, bounds.height - bounds.buttonHeight)
          };
          try {
            localStorage.setItem(IMAGE_CREATOR_CHAT_FAB_POSITION_KEY, JSON.stringify(savedPosition));
          } catch (_) {}
        }
      }
    };
    button.addEventListener("pointermove", onMove);
    button.addEventListener("pointerup", onUp, { once: true });
    button.addEventListener("pointercancel", onUp, { once: true });
  });
}

function getLatestResultContext() {
  const session = getActiveSession();
  const messages = session?.session?.messages || [];
  if (state.selectedResultRef) {
    const selectedMessage = messages.find((message) => message.id === state.selectedResultRef.messageId);
    const selectedResult = selectedMessage?.results?.[state.selectedResultRef.resultIndex];
    if (selectedResult) {
      return { session, message: selectedMessage, result: selectedResult, resultIndex: state.selectedResultRef.resultIndex };
    }
  }
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const results = Array.isArray(messages[messageIndex]?.results) ? messages[messageIndex].results : [];
    if (results.length) {
      return { session, message: messages[messageIndex], result: results[results.length - 1], resultIndex: results.length - 1 };
    }
  }
  return null;
}

function isReviewableEditMode(mode = "") {
  return String(mode || "").trim() === "edit";
}

async function openRevisionViewer(pendingRevision = null) {
  if (!pendingRevision || !elements.imageViewer || !elements.imageViewerOriginalImage || !elements.imageViewerProposedImage) return;
  const { sourceResult, proposedResults, originalPrompt, proposedPrompt } = pendingRevision;
  imageViewerRestoreFocusTo = elements.chatFeed;
  const sourceResolved = sourceResult ? resolveCachedResultAsset(sourceResult) : null;
  const proposed = Array.isArray(proposedResults) ? proposedResults[0] : null;
  const proposedResolved = proposed ? resolveCachedResultAsset(proposed) : null;
  if (!sourceResolved || !proposedResolved) return;

  const sourceSource = await ensureResultAssetDataUrl(sourceResolved).catch(() => String(sourceResolved.dataUrl || sourceResolved.originalDataUrl || ""));
  const proposalSource = await ensureResultAssetDataUrl(proposedResolved).catch(() => String(proposedResolved.dataUrl || ""));

  if (!sourceSource || !proposalSource) {
    setComposerError("No fue posible preparar la comparación de la propuesta.");
    return;
  }

  elements.imageViewerProposedImage.src = proposalSource;
  elements.imageViewerOriginalImage.src = sourceSource;
  elements.imageViewerProposedImage.alt = `Propuesta: ${proposedPrompt || "Imagen propuesta"}`;
  elements.imageViewerOriginalImage.alt = `Original: ${originalPrompt || "Imagen origen"}`;
  if (elements.imageViewerMeta) elements.imageViewerMeta.textContent = originalPrompt || "Original";
  if (elements.imageViewerMetaRight) elements.imageViewerMetaRight.textContent = proposedPrompt || "Propuesta";
  if (elements.imageViewerCompareLabel) {
    elements.imageViewerCompareLabel.textContent = "Comparación: original vs propuesta";
  }
  elements.imageViewerReviewBar?.classList.remove("hidden");
  elements.imageViewerMenu?.classList.add("hidden");
  if (elements.imageViewerMenuTrigger) elements.imageViewerMenuTrigger.classList.add("hidden");
  if (elements.imageViewerAnnotateBtn) elements.imageViewerAnnotateBtn.classList.add("hidden");
  if (elements.imageViewerImage) elements.imageViewerImage.classList.add("hidden");
  elements.imageViewer?.classList.remove("hidden");
  elements.imageViewer?.setAttribute("aria-hidden", "false");
  elements.imageViewerComparison?.classList.remove("hidden");
  window.setTimeout(() => elements.imageViewerAcceptRevisionBtn?.focus(), 40);
}

function closeRevisionViewer() {
  if (!elements.imageViewerReviewBar) return;
  elements.imageViewerReviewBar.classList.add("hidden");
  if (elements.imageViewerMenu) elements.imageViewerMenu.classList.add("hidden");
  if (elements.imageViewerMenuTrigger) elements.imageViewerMenuTrigger.classList.remove("hidden");
  if (elements.imageViewerAnnotateBtn) elements.imageViewerAnnotateBtn.classList.remove("hidden");
  if (elements.imageViewerImage) elements.imageViewerImage.classList.remove("hidden");
  elements.imageViewerComparison?.classList.add("hidden");
}

function getSourceResultForRevision() {
  const context = getLatestResultContext();
  if (!context) return null;
  const result = context.result || null;
  return result ? resolveCachedResultAsset(result) : null;
}

async function handleQuickResultAction(action) {
  const context = getLatestResultContext();
  if (!context) return;
  const { session, result, resultIndex } = context;
  if (action === "download-web" || action === "download-original") {
    const asset = resolveCachedResultAsset(result);
    const assetDataUrl = await ensureResultAssetDataUrl(asset);
    if (assetDataUrl) {
      const prepared = await prepareMetadataFreeImage(assetDataUrl, {
        mode: action === "download-web" ? "web" : "original",
        originalExtension: state.options.downloadFormat
      });
      const fileName = buildDownloadFileName({
        title: `${session.title || "image-creator"}-${action === "download-web" ? "web" : "original-limpia"}`,
        index: resultIndex + 1,
        extension: prepared.extension
      });
      downloadPreparedBlob(prepared.blob, fileName);
      return;
    }
    setComposerError("No fue posible preparar una copia limpia de esta imagen.");
    return;
  }
  if (action === "variation") {
    try {
      const asset = resolveCachedResultAsset(result);
      const dataUrl = await ensureResultAssetDataUrl(asset);
      state.composerAttachments = [await resultImageToAttachment({ ...asset, dataUrl })];
      state.options.mode = "variation";
      applyOptionsToPanel(elements, state.options);
      setComposerMeta("Variación preparada con la última imagen. Ajusta el prompt y vuelve a generar.");
      renderAll();
    } catch (_) {
      setComposerError("No fue posible preparar la variación desde este resultado.");
    }
  }
}

async function openLocalizedEditor(trigger = null, editorMode = "region") {
  const context = getLatestResultContext();
  if (!context || !regionEditor) return;
  try {
    setComposerError("");
    const asset = resolveCachedResultAsset(context.result);
    const dataUrl = await ensureResultAssetDataUrl(asset);
    if (!dataUrl) throw new Error("No se encontró la imagen seleccionada.");
    await regionEditor.open({ dataUrl, trigger, mode: editorMode });
  } catch (error) {
    setComposerError(error?.message || "No fue posible abrir el editor de región.");
  }
}

async function applyLocalizedEdit({ annotatedDataUrl = "", instruction = "", tool = "marker" } = {}) {
  const context = getLatestResultContext();
  if (!context) throw new Error("Selecciona una imagen para editar.");
  const asset = resolveCachedResultAsset(context.result);
  const cleanDataUrl = await ensureResultAssetDataUrl(asset);
  if (!cleanDataUrl) throw new Error("No fue posible recuperar la imagen original.");

  const originalAttachment = await resultImageToAttachment({
    ...asset,
    dataUrl: cleanDataUrl,
    fileName: "imagen-original-sin-marcas"
  }, {
    maxDimension: LOCALIZED_REFERENCE_MAX_DIMENSION,
    targetBytes: LOCALIZED_REFERENCE_TARGET_BYTES
  });
  const markedAttachment = await dataUrlToAttachment(annotatedDataUrl, {
    name: "mapa-zona-marcada.jpg",
    source: "region-markup"
  });

  state.composerAttachments = [
    { ...originalAttachment, hiddenInChat: true },
    { ...markedAttachment, hiddenInChat: true }
  ];
  state.options = { ...state.options, mode: "edit", model: "gemini-3-pro-image", imageSize: state.options.imageSize === "4K" ? "4K" : "2K", count: 1 };
  applyOptionsToPanel(elements, state.options);
  const requestPrompt = buildLocalizedEditPrompt(instruction, tool);
  elements.promptInput.value = instruction;
  setComposerMeta("Aplicando el cambio en la zona señalada...");
  regionEditor.close({ restoreFocus: false });
  renderAll();
  await submitPrompt({
    requestPrompt,
    displayPrompt: instruction,
    requireRevisionReview: true,
    revisionSourceResult: asset
  });
}

async function applyLocalizedTextEdit({
  annotatedDataUrl = "",
  tool = "marker",
  regionBounds = null,
  currentText = "",
  newText = "",
  textRenderMode = "integrated",
  fontStyle = "sans",
  textColor = "#ffffff"
} = {}) {
  const context = getLatestResultContext();
  if (!context) throw new Error("Selecciona una imagen para editar.");
  const asset = resolveCachedResultAsset(context.result);
  const cleanDataUrl = await ensureResultAssetDataUrl(asset);
  if (!cleanDataUrl) throw new Error("No fue posible recuperar la imagen original.");
  const originalAttachment = await resultImageToAttachment({
    ...asset,
    dataUrl: cleanDataUrl,
    fileName: "imagen-original-texto"
  }, {
    maxDimension: LOCALIZED_REFERENCE_MAX_DIMENSION,
    targetBytes: LOCALIZED_REFERENCE_TARGET_BYTES
  });
  const markedAttachment = await dataUrlToAttachment(annotatedDataUrl, {
    name: "mapa-texto-marcado.jpg",
    source: "region-markup"
  });
  const exactMode = textRenderMode === "exact";
  const requestPrompt = exactMode
    ? buildTextRemovalPrompt({ currentText, tool })
    : buildLocalizedTextEditPrompt({ currentText, newText, fontStyle, tool });
  state.composerAttachments = [
    { ...originalAttachment, hiddenInChat: true },
    { ...markedAttachment, hiddenInChat: true }
  ];
  state.options = {
    ...state.options,
    mode: "edit",
    model: "gemini-3-pro-image",
    count: 1
  };
  applyOptionsToPanel(elements, state.options);
  elements.promptInput.value = `Reemplazar texto por “${newText}”`;
  setComposerMeta(exactMode ? "Limpiando el fondo y componiendo el texto exacto..." : "Editando texto con Lucy Pro...");
  regionEditor.close({ restoreFocus: false });
  renderAll();
  await submitPrompt({
    requestPrompt,
    displayPrompt: `Reemplazar texto por “${newText}”`,
    requireRevisionReview: true,
    revisionSourceResult: asset,
    resultTransformer: exactMode
      ? async (result) => ({
        ...result,
        ...await overlayExactTextOnImage(result.dataUrl, {
          text: newText,
          bounds: regionBounds,
          fontStyle,
          color: textColor
        })
      })
      : null
  });
}

function getSourceMessageForResult(resultContext = getLatestResultContext()) {
  const messages = getActiveSession()?.session?.messages || [];
  const resultMessageIndex = resultContext ? messages.findIndex((item) => item.id === resultContext.message.id) : -1;
  const sourceMessageId = resultContext?.result?.sourceMessageId;
  return messages.find((item) => item.id === sourceMessageId)
    || (resultMessageIndex > 0 ? messages.slice(0, resultMessageIndex).reverse().find((item) => item?.role === "user") : null)
    || [...messages].reverse().find((item) => item?.role === "user");
}

async function regenerateSelectedResult() {
  const sourceMessage = getSourceMessageForResult();
  const context = getLatestResultContext();
  if (!sourceMessage || !context) {
    setComposerError("No hay una imagen válida para regenerar.");
    return;
  }
  const currentResult = resolveCachedResultAsset(context.result);
  const attachment = currentResult ? await resultImageToAttachment(currentResult).catch(() => null) : null;
  const fallbackAttachments = Array.isArray(sourceMessage.attachments) ? sourceMessage.attachments : [];
  state.composerAttachments = attachment ? [attachment] : [...fallbackAttachments];
  state.options = {
    ...state.options,
    ...(sourceMessage.options || {}),
    mode: "edit"
  };
  applyOptionsToPanel(elements, state.options);
  elements.promptInput.value = sourceMessage.requestPrompt || sourceMessage.prompt || "Regenerar imagen";
  setComposerMeta("Regenerando imagen a partir de esta referencia.");
  renderAll();
  await submitPrompt({
    requestPrompt: sourceMessage.requestPrompt || sourceMessage.prompt || "",
    displayPrompt: sourceMessage.prompt || "Regenerar imagen"
  });
}

function selectResultCard(card) {
  if (!card) return;
  state.selectedResultRef = {
    messageId: card.getAttribute("data-message-id"),
    resultIndex: Number(card.getAttribute("data-result-index") || 0)
  };
  elements.chatFeed?.querySelectorAll(".ic-result-card").forEach((item) => item.classList.toggle("is-selected", item === card));
}

function closeResultMenus({ restoreFocus = false } = {}) {
  const openTrigger = elements.chatFeed?.querySelector('[data-result-menu-toggle][aria-expanded="true"]');
  elements.chatFeed?.querySelectorAll("[data-result-menu]").forEach((menu) => menu.classList.add("hidden"));
  elements.chatFeed?.querySelectorAll("[data-result-menu-toggle]").forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
  if (restoreFocus) openTrigger?.focus();
}

function toggleResultMenu(trigger) {
  const card = trigger?.closest(".ic-result-card");
  const menu = card?.querySelector("[data-result-menu]");
  if (!menu || state.isGenerating) return;
  const shouldOpen = menu.classList.contains("hidden");
  closeResultMenus();
  if (!shouldOpen) return;
  selectResultCard(card);
  menu.classList.remove("hidden");
  trigger.setAttribute("aria-expanded", "true");
  menu.querySelector('[role="menuitem"]')?.focus();
}

function closeImageViewerMenu({ restoreFocus = false } = {}) {
  elements.imageViewerMenu?.classList.add("hidden");
  elements.imageViewerMenuTrigger?.setAttribute("aria-expanded", "false");
  if (restoreFocus) elements.imageViewerMenuTrigger?.focus();
}

function closeImageViewer({ restoreFocus = true } = {}) {
  closeImageViewerMenu();
  const hasActiveReview = elements.imageViewerReviewBar && !elements.imageViewerReviewBar.classList.contains("hidden");
  if (hasActiveReview) clearPendingRevision({ render: true });
  elements.imageViewer?.classList.add("hidden");
  elements.imageViewer?.setAttribute("aria-hidden", "true");
  if (restoreFocus) imageViewerRestoreFocusTo?.focus?.();
  closeRevisionViewer();
}

function closeImageInfo({ restoreFocus = true } = {}) {
  elements.imageInfoModal?.classList.add("hidden");
  elements.imageInfoModal?.setAttribute("aria-hidden", "true");
  if (restoreFocus) imageInfoRestoreFocusTo?.focus?.();
}

function decodeDataUrlDimensions(dataUrl = "") {
  const source = String(dataUrl || "").trim();
  if (!source) return Promise.resolve({ width: 0, height: 0 });
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({
      width: Number(image.naturalWidth || 0) || 0,
      height: Number(image.naturalHeight || 0) || 0
    });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = source;
  });
}

async function openImageInfo(result = {}, trigger = null) {
  if (!elements.imageInfoModal) return;
  imageInfoRestoreFocusTo = trigger || document.activeElement;
  const asset = resolveCachedResultAsset(result);
  const dataUrl = String(asset?.dataUrl || "").trim() || await ensureResultAssetDataUrl(asset).catch(() => "");
  const measured = await decodeDataUrlDimensions(dataUrl);
  const width = Number(asset?.width || measured.width || 0) || 0;
  const height = Number(asset?.height || measured.height || 0) || 0;
  const created = asset?.createdAt ? new Date(asset.createdAt) : null;
  if (elements.imageInfoModel) elements.imageInfoModel.textContent = String(asset?.model || "No disponible");
  if (elements.imageInfoFormat) {
    elements.imageInfoFormat.textContent = [asset?.mimeType || "imagen", asset?.aspectRatio, asset?.imageSize]
      .filter(Boolean)
      .join(" · ");
  }
  if (elements.imageInfoDimensions) elements.imageInfoDimensions.textContent = width && height ? `${width} × ${height} px` : String(asset?.imageSize || "No disponible");
  if (elements.imageInfoCreated) elements.imageInfoCreated.textContent = created && !Number.isNaN(created.getTime()) ? created.toLocaleString("es-MX") : "No disponible";
  elements.imageInfoModal.classList.remove("hidden");
  elements.imageInfoModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => elements.imageInfoCloseButtons?.[0]?.focus(), 40);
}

async function openImageViewer(card, trigger = null) {
  if (!card || !elements.imageViewer || !elements.imageViewerImage) return;
  selectResultCard(card);
  const context = getLatestResultContext();
  if (!context) return;
  const pending = state.pendingRevision;
  if (pending?.assistantMessageId && context.message?.id === pending.assistantMessageId) {
    await openRevisionViewer(pending);
    return;
  }
  imageViewerRestoreFocusTo = trigger || card.querySelector("[data-open-image-viewer]");
  closeResultMenus();
  closeImageViewerMenu();
  const previewSource = String(context.result?.dataUrl || context.result?.downloadUrl || "").trim();
  elements.imageViewerImage.src = previewSource;
  elements.imageViewerImage.alt = context.message?.prompt || "Imagen generada ampliada";
  if (elements.imageViewerMeta) {
    elements.imageViewerMeta.textContent = [context.result?.model, context.result?.aspectRatio, context.result?.imageSize]
      .filter(Boolean)
      .join(" · ");
  }
  elements.imageViewer.classList.remove("hidden");
  elements.imageViewer.setAttribute("aria-hidden", "false");
  window.setTimeout(() => elements.imageViewerCloseButtons?.[0]?.focus(), 40);
  try {
    const asset = resolveCachedResultAsset(context.result);
    const fullSource = await ensureResultAssetDataUrl(asset);
    if (fullSource && !elements.imageViewer.classList.contains("hidden")) elements.imageViewerImage.src = fullSource;
  } catch (_) {
    // Conserva la vista previa disponible si falla la descarga full-res.
  }
}

function toggleImageViewerMenu() {
  if (!elements.imageViewerMenu || state.isGenerating) return;
  const shouldOpen = elements.imageViewerMenu.classList.contains("hidden");
  closeImageViewerMenu();
  if (!shouldOpen) return;
  elements.imageViewerMenu.classList.remove("hidden");
  elements.imageViewerMenuTrigger?.setAttribute("aria-expanded", "true");
  elements.imageViewerMenu.querySelector('[role="menuitem"]')?.focus();
}

async function handleResultMenuAction(action = "", actionElement = null) {
  const card = actionElement?.closest(".ic-result-card");
  const fromViewer = Boolean(actionElement?.closest("#icImageViewer"));
  if (state.isGenerating || (!card && !fromViewer)) return;
  if (card) selectResultCard(card);
  if (!getLatestResultContext()) return;
  const restoreTarget = card?.querySelector("[data-result-menu-toggle]") || imageViewerRestoreFocusTo;
  if (fromViewer) closeImageViewerMenu();
  else closeResultMenus();
  if (action === "download-web" || action === "download-original") {
    try {
      setComposerError("");
      await handleQuickResultAction(action);
    } catch (_) {
      setComposerError("No fue posible limpiar y preparar la imagen para descargar.");
    }
    return;
  }
  if (action === "info") {
    const context = getLatestResultContext();
    if (context) await openImageInfo(context.result, restoreTarget);
    return;
  }
  if (fromViewer) closeImageViewer({ restoreFocus: false });
  if (action === "variation") {
    await handleQuickResultAction(action);
    return;
  }
  if (action === "annotate") {
    await openLocalizedEditor(restoreTarget);
    return;
  }
  if (action === "edit-text") {
    await openLocalizedEditor(restoreTarget, "text");
    return;
  }
  if (action === "regenerate") await regenerateSelectedResult();
}

function moveMenuFocus(event, menu) {
  if (!menu || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return false;
  const items = Array.from(menu.querySelectorAll('[role="menuitem"]:not(:disabled)'));
  if (!items.length) return false;
  event.preventDefault();
  const currentIndex = items.indexOf(document.activeElement);
  const nextIndex = event.key === "Home" ? 0
    : event.key === "End" ? items.length - 1
      : event.key === "ArrowDown" ? (currentIndex + 1 + items.length) % items.length
        : (currentIndex - 1 + items.length) % items.length;
  items[nextIndex].focus();
  return true;
}

function bindGlobalEvents() {
  elements.newSessionBtn?.addEventListener("click", async () => {
    await queueNewSession();
    setMobileSessionsOpen(false, { restoreFocus: true });
  });
  elements.sessionSearchInput?.addEventListener("input", (event) => {
    state.searchTerm = String(event.target.value || "").trim().toLowerCase();
    reflectSessionList();
  });
  elements.sessionList?.addEventListener("click", async (event) => {
    const actionEl = event.target.closest("[data-session-action]");
    if (!actionEl) return;
    const action = actionEl.getAttribute("data-session-action");
    const sessionId = actionEl.getAttribute("data-session-id");
    if (action === "menu") {
      toggleSessionMenu(actionEl);
      return;
    }
    closeSessionMenus();
    try {
      await handleSessionAction(action, sessionId);
      if (action === "open") setMobileSessionsOpen(false, { restoreFocus: true });
    } catch (_) {
      setComposerError("No fue posible actualizar la sesión. Inténtalo de nuevo.");
    }
  });
  elements.toggleOptionsBtn?.addEventListener("click", () => {
    setOptionsPanelOpen(!state.optionsPanelOpen, { restoreFocus: state.optionsPanelOpen });
  });
  elements.floatingFormatTrigger?.addEventListener("click", () => {
    setOptionsPanelOpen(!state.optionsPanelOpen, { restoreFocus: state.optionsPanelOpen });
  });
  elements.floatingFormatTab?.addEventListener("click", () => {
    setOptionsPanelOpen(!state.optionsPanelOpen, { restoreFocus: state.optionsPanelOpen });
  });
  elements.closeFloatingFormatBtn?.addEventListener("click", () => {
    setOptionsPanelOpen(false, { restoreFocus: true });
  });
  elements.closeOptionsBtn?.addEventListener("click", () => {
    setOptionsPanelOpen(false, { restoreFocus: true });
  });
  elements.imageViewerMenuTrigger?.addEventListener("click", toggleImageViewerMenu);
  elements.imageViewerAnnotateBtn?.addEventListener("click", () => {
    const restoreTarget = imageViewerRestoreFocusTo;
    closeImageViewer({ restoreFocus: false });
    void openLocalizedEditor(restoreTarget, "region");
  });
  elements.imageViewerAcceptRevisionBtn?.addEventListener("click", () => {
    void acceptPendingRevision();
  });
  elements.imageViewerContinueRevisionBtn?.addEventListener("click", () => {
    void continueFromPendingRevision();
  });
  elements.imageViewerRejectRevisionBtn?.addEventListener("click", () => {
    rejectPendingRevision();
  });
  elements.imageViewerCloseButtons?.forEach((button) => button.addEventListener("click", () => closeImageViewer()));
  elements.imageViewer?.addEventListener("pointerdown", (event) => {
    if (event.target === elements.imageViewer) closeImageViewer();
  });
  elements.imageViewer?.addEventListener("click", (event) => {
    const actionElement = event.target.closest("[data-viewer-result-action]");
    if (actionElement) void handleResultMenuAction(actionElement.getAttribute("data-viewer-result-action"), actionElement);
  });
  elements.imageViewer?.addEventListener("keydown", (event) => {
    moveMenuFocus(event, event.target.closest("#icImageViewerMenu"));
  });
  elements.imageInfoCloseButtons?.forEach((button) => button.addEventListener("click", () => closeImageInfo()));
  elements.imageInfoModal?.addEventListener("pointerdown", (event) => {
    if (event.target === elements.imageInfoModal) closeImageInfo();
  });
  elements.mobileSessionsBtn?.addEventListener("click", () => {
    const isOpen = elements.mobileSessionsBtn.getAttribute("aria-expanded") === "true";
    setMobileSessionsOpen(!isOpen, { restoreFocus: isOpen });
  });
  elements.mobileBackdrop?.addEventListener("click", () => setMobileSessionsOpen(false, { restoreFocus: true }));
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".ic-session-card")) closeSessionMenus();
    if (!event.target.closest(".ic-result-card")) closeResultMenus();
    const isMobile = window.matchMedia(IMAGE_CREATOR_MOBILE_MEDIA).matches;
    if (isMobile && state.optionsPanelOpen) {
      const isInside = elements.floatingFormatPanel?.contains(event.target);
      const isTrigger = elements.toggleOptionsBtn?.contains(event.target) ||
                        elements.toggleChatBtn?.contains(event.target);
      if (!isInside && !isTrigger) {
        setOptionsPanelOpen(false);
      }
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!elements.imageInfoModal?.classList.contains("hidden")) {
        closeImageInfo();
        return;
      }
      if (!elements.imageViewer?.classList.contains("hidden")) {
        closeImageViewer();
        return;
      }
      if (state.optionsPanelOpen) {
        setOptionsPanelOpen(false, { restoreFocus: true });
        return;
      }
      closeSessionMenus({ restoreFocus: true });
      closeResultMenus({ restoreFocus: true });
      setMobileSessionsOpen(false, { restoreFocus: true });
    }
  });
  elements.attachmentTray?.addEventListener("click", (event) => {
    const removeEl = event.target.closest("[data-attachment-action='remove']");
    if (!removeEl) return;
    const attachmentId = removeEl.getAttribute("data-attachment-id");
    state.composerAttachments = state.composerAttachments.filter((item) => item.id !== attachmentId);
    renderAttachmentTray(elements.attachmentTray, state.composerAttachments);
  });
  elements.chatFeed?.addEventListener("click", (event) => {
    const suggestionBtn = event.target.closest("[data-empty-prompt]");
    if (suggestionBtn) {
      const promptText = suggestionBtn.getAttribute("data-empty-prompt");
      if (promptText.includes("guion")) {
        state.options.mode = "video_script";
        applyOptionsToPanel(elements, state.options);
      }
      if (elements.promptInput) {
        elements.promptInput.value = promptText;
        elements.promptInput.focus();
      }
      return;
    }
    const menuToggle = event.target.closest("[data-result-menu-toggle]");
    if (menuToggle) {
      toggleResultMenu(menuToggle);
      return;
    }
    const actionElement = event.target.closest("[data-result-action]");
    if (actionElement) {
      void handleResultMenuAction(actionElement.getAttribute("data-result-action"), actionElement);
      return;
    }
    if (event.target.closest("[data-result-menu]")) return;
    const preview = event.target.closest("[data-open-image-viewer]");
    if (preview) {
      void openImageViewer(preview.closest(".ic-result-card"), preview);
      return;
    }
    closeResultMenus();
    selectResultCard(event.target.closest(".ic-result-card"));
  });
  elements.chatFeed?.addEventListener("keydown", (event) => {
    const menu = event.target.closest("[data-result-menu]");
    moveMenuFocus(event, menu);
  });
}

function bootstrapSessionSubscription(user) {
  if (unsubscribeSessions) unsubscribeSessions();
  unsubscribeSessions = sessionStore.subscribe(
    user.uid,
    async (sessions) => {
      state.sessions = sessions;
      sessions.forEach((session) => {
        const messages = Array.isArray(session?.session?.messages) ? session.session.messages : [];
        messages.forEach((message) => cacheResultAssets(message?.results));
      });
      if (!sessions.length) {
        const newSessionId = await sessionStore.createSession(user);
        state.activeSessionId = newSessionId;
        return;
      }
      const fallbackSession = sessions[0] || null;
      const preferredSession = sessions.find((session) => session.id === state.activeSessionId) || fallbackSession;
      state.activeSessionId = preferredSession?.id || "";
      state.activeSession = preferredSession;
      if (preferredSession && videoScriptWorkflow) {
        videoScriptWorkflow.rehydrateFromSession(preferredSession);
      }
      renderAll();
    },
    () => setComposerError("No fue posible sincronizar las sesiones desde Firebase.")
  );
}

function initialize() {
  // Escape the fixed application shell stacking context so the gallery can
  // cover the global header and sidebar as a true viewport-level lightbox.
  if (elements.imageViewer?.parentElement !== document.body) {
    document.body.append(elements.imageViewer);
  }
  if (elements.regionEditor?.parentElement !== document.body) {
    document.body.append(elements.regionEditor);
  }
  if (elements.imageInfoModal?.parentElement !== document.body) {
    document.body.append(elements.imageInfoModal);
  }
  initializeOptionsPanel(elements, state.options, (updatedOptions) => {
    state.options = { ...state.options, ...updatedOptions };
    applyOptionsToPanel(elements, state.options);
    renderAll();
  });
  regionEditor = createRegionEditor(elements, {
    onApply: (payload) => payload?.editorMode === "text"
      ? applyLocalizedTextEdit(payload)
      : applyLocalizedEdit(payload)
  });
  bindComposer(elements, {
    onSubmit: () => {
      void submitPrompt();
    },
    onFilesSelected: (files) => {
      void handleFilesSelected(files);
    },
    onTableAttached: (tableData) => {
      state.composerTable = tableData;
      renderAll();
    },
    onClear: () => {
      state.composerTable = null;
      renderAll();
    },
    onModeSelected: (mode) => {
      state.options.mode = mode;
      syncComposerModeMenu(elements, mode);
      applyOptionsToPanel(elements, state.options);
      renderAll();
      if (mode === "video_script" && elements.promptInput && !elements.promptInput.value.trim()) {
        elements.promptInput.value = "Crea un guion educativo sobre: ";
      }
      elements.promptInput?.focus();
    },
    onVideoScript: () => {
      state.options.mode = "video_script";
      syncComposerModeMenu(elements, "video_script");
      applyOptionsToPanel(elements, state.options);
      renderAll();
      if (elements.promptInput) {
        if (!elements.promptInput.value.trim()) {
          elements.promptInput.value = "Crea un guion educativo sobre: ";
        }
        elements.promptInput.focus();
        elements.promptInput.setSelectionRange(
          elements.promptInput.value.length,
          elements.promptInput.value.length
        );
      }
    }
  });
  bindGlobalEvents();
  initializeWorkspaceTheme();
  initializeChatPanelVisibility();
  initializeMovableChatToggle();
  initializeResizablePanels();
  initializeMobileLayout();
  renderAll();

  function dismissGlobalLoader() {
    const loader = document.getElementById("icGlobalLoader");
    if (loader && !loader.classList.contains("is-hidden")) {
      loader.classList.add("is-hidden");
      window.setTimeout(() => {
        try { loader.remove(); } catch (_) {}
      }, 450);
    }
  }

  window.setTimeout(dismissGlobalLoader, 2500);

  onAuthStateChanged(sessionStore.auth, (user) => {
    dismissGlobalLoader();
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    state.currentUser = user;
    bootstrapSessionSubscription(user);
    reflectSessionHeader();
  });
}

initialize();
