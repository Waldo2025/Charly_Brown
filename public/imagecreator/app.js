import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  buildDownloadFileName,
  filesToAttachments,
  resultImageToAttachment
} from "./attachments.js";
import { uploadGeneratedResults } from "./assets-store.js";
import { renderAttachmentTray, renderChatFeed } from "./chat-renderer.js";
import { bindComposer, clearComposer, setComposerDisabled } from "./composer.js";
import { IMAGE_CREATOR_SESSION_TITLE } from "./constants.js";
import { getImageCreatorDom } from "./dom.js";
import { initializeOptionsPanel, applyOptionsToPanel, readOptionsFromPanel, syncOptionsPresentation } from "./options-panel.js";
import { generateImagesViaGemini } from "./api.js";
import { createImageCreatorSessionStore } from "./sessions-store.js";
import { renderSessionList } from "./sidebar.js";
import { createImageCreatorState, deriveSessionTitleFromPrompt } from "./state.js";

const elements = getImageCreatorDom();
const state = {
  ...createImageCreatorState(),
  resultAssetCache: new Map()
};
const sessionStore = createImageCreatorSessionStore();
let unsubscribeSessions = null;

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
  if (elements.archiveSessionBtn) {
    const isArchived = getActiveSession()?.archived === true;
    elements.archiveSessionBtn.innerHTML = isArchived
      ? '<i class="fas fa-box-open"></i><span>Desarchivar</span>'
      : '<i class="fas fa-box-archive"></i><span>Archivar</span>';
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

function renderAll() {
  reflectSessionHeader();
  reflectSessionList();
  renderChatFeed(elements.chatFeed, state.activeSession, { downloadFormat: state.options.downloadFormat });
  renderAttachmentTray(elements.attachmentTray, state.composerAttachments);
  if (elements.optionsPanel) {
    elements.optionsPanel.classList.toggle("hidden", !state.optionsPanelOpen);
  }
  if (elements.toggleOptionsBtn) {
    elements.toggleOptionsBtn.setAttribute("aria-expanded", state.optionsPanelOpen ? "true" : "false");
  }
}

function setActiveSession(sessionId = "") {
  state.activeSessionId = String(sessionId || "").trim();
  state.activeSession = state.sessions.find((session) => session.id === state.activeSessionId) || null;
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
  const user = state.currentUser || await sessionStore.waitForUser();
  const sessionId = await sessionStore.createSession(user);
  resetComposerState();
  return sessionId;
}

async function handleFilesSelected(fileList) {
  try {
    setComposerError("");
    const attachments = await filesToAttachments(fileList);
    state.composerAttachments = [...state.composerAttachments, ...attachments].slice(0, 3);
    if (elements.attachmentInput) elements.attachmentInput.value = "";
    renderAttachmentTray(elements.attachmentTray, state.composerAttachments);
  } catch (error) {
    const message = error?.message === "attachment_too_large"
      ? "Cada referencia debe pesar menos de 4 MB y se comprimirá antes de enviarse."
      : "No fue posible procesar la imagen de referencia.";
    setComposerError(message);
  }
}

function buildUserMessage({ prompt, options, attachments }) {
  return {
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
    note: results.length ? `Se generaron ${results.length} imagen(es).` : "",
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

async function submitPrompt() {
  if (state.isGenerating) return;
  const prompt = String(elements.promptInput?.value || "").trim();
  if (!prompt) {
    setComposerError("Escribe un prompt antes de generar.");
    return;
  }
  setComposerError("");
  state.options = syncOptionsPresentation(elements, readOptionsFromPanel(elements));

  const options = { ...state.options };
  const attachments = [...state.composerAttachments];
  if ((options.mode === "edit" || options.mode === "variation") && attachments.length < 1) {
    setComposerError("Este modo requiere al menos una imagen de referencia.");
    return;
  }
  if (options.mode === "compose" && attachments.length < 2) {
    setComposerError("Componer requiere al menos dos referencias.");
    return;
  }

  state.isGenerating = true;
  setComposerDisabled(elements, true);
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

  const userMessage = buildUserMessage({ prompt, options, attachments });
  const pendingAssistantMessage = buildPendingAssistantMessage({ prompt, options });
  const optimisticMessages = [...(activeSession.session.messages || []), userMessage, pendingAssistantMessage];
  activeSession = {
    ...activeSession,
    title: activeSession.title === IMAGE_CREATOR_SESSION_TITLE
      ? deriveSessionTitleFromPrompt(prompt, IMAGE_CREATOR_SESSION_TITLE)
      : activeSession.title,
    lastPrompt: prompt,
    session: {
      messages: optimisticMessages
    }
  };
  state.sessions = state.sessions.map((session) => (session.id === activeSession.id ? activeSession : session));
  state.activeSession = activeSession;
  renderAll();

  try {
    const results = await generateImagesViaGemini({
      mode: options.mode,
      prompt,
      options,
      attachments
    });
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
      prompt,
      options,
      results: storedResults
    });
    const nextSession = {
      ...activeSession,
      lastPrompt: prompt,
      title: activeSession.title || deriveSessionTitleFromPrompt(prompt, IMAGE_CREATOR_SESSION_TITLE),
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
    renderAll();
    await persistActiveSession();
    resetComposerState();
  } catch (error) {
    const assistantMessage = buildAssistantMessage({
      prompt,
      options,
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
    renderAll();
    await persistActiveSession();
  } finally {
    state.isGenerating = false;
    setComposerDisabled(elements, false);
  }
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

async function convertDataUrlFormat(dataUrl = "", extension = "png") {
  const normalizedExtension = String(extension || "png").trim().toLowerCase();
  if (!dataUrl || dataUrl.startsWith(`data:image/${normalizedExtension};`)) {
    return dataUrl;
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Number(image.naturalWidth || image.width || 0) || 1;
      canvas.height = Number(image.naturalHeight || image.height || 0) || 1;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas_unavailable"));
        return;
      }
      ctx.drawImage(image, 0, 0);
      const mimeType = normalizedExtension === "jpg" || normalizedExtension === "jpeg"
        ? "image/jpeg"
        : normalizedExtension === "webp"
          ? "image/webp"
          : "image/png";
      resolve(canvas.toDataURL(mimeType, 0.92));
    };
    image.onerror = () => reject(new Error("image_decode_failed"));
    image.src = dataUrl;
  });
}

function downloadDataUrl(dataUrl = "", fileName = "image.png") {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function handleFeedAction(event) {
  const session = getActiveSession();
  if (!session) return;
  const resultActionEl = event.target.closest("[data-result-action]");
  if (resultActionEl) {
    const action = resultActionEl.getAttribute("data-result-action");
    const messageId = resultActionEl.getAttribute("data-message-id");
    const resultIndex = Number(resultActionEl.getAttribute("data-result-index") || 0);
    const message = (session.session.messages || []).find((item) => item.id === messageId);
    const result = message?.results?.[resultIndex];
    if (!result) return;
    if (action === "download") {
      const asset = resolveCachedResultAsset(result);
      const extension = String(state.options.downloadFormat || "png").trim() || "png";
      const fileName = buildDownloadFileName({
        title: session.title || "image-creator",
        index: resultIndex + 1,
        extension
      });
      const assetDataUrl = await ensureResultAssetDataUrl(asset);
      if (assetDataUrl) {
        const converted = await convertDataUrlFormat(assetDataUrl, extension).catch(() => assetDataUrl);
        downloadDataUrl(converted, fileName);
        return;
      }
      const downloadUrl = String(asset?.downloadUrl || "").trim();
      if (!downloadUrl) return;
      downloadDataUrl(downloadUrl, fileName);
      return;
    }
    if (action === "variation") {
      try {
        const asset = resolveCachedResultAsset(result);
        const dataUrl = await ensureResultAssetDataUrl(asset);
        const attachment = await resultImageToAttachment({
          ...asset,
          dataUrl
        });
        state.composerAttachments = [attachment];
        state.options.mode = "variation";
        applyOptionsToPanel(elements, state.options);
        setComposerMeta("Variación preparada con la imagen seleccionada. Ajusta el prompt y vuelve a generar.");
        renderAll();
      } catch (_) {
        setComposerError("No fue posible preparar la variación desde este resultado.");
      }
      return;
    }
  }

  const messageActionEl = event.target.closest("[data-message-action]");
  if (messageActionEl?.getAttribute("data-message-action") === "retry") {
    const messageId = messageActionEl.getAttribute("data-message-id");
    const assistantMessage = (session.session.messages || []).find((item) => item.id === messageId);
    if (!assistantMessage) return;
    const sourceMessage = (session.session.messages || []).find((item) => item.id === assistantMessage.results?.[0]?.sourceMessageId) || null;
    if (!sourceMessage) return;
    elements.promptInput.value = sourceMessage.prompt || "";
    state.composerAttachments = Array.isArray(sourceMessage.attachments) ? [...sourceMessage.attachments] : [];
    state.options = { ...sourceMessage.options };
    applyOptionsToPanel(elements, state.options);
    renderAll();
  }
}

function bindGlobalEvents() {
  elements.newSessionBtn?.addEventListener("click", async () => {
    await queueNewSession();
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
    await handleSessionAction(action, sessionId);
  });
  elements.archiveSessionBtn?.addEventListener("click", async () => {
    if (!state.activeSessionId) return;
    const activeSession = getActiveSession();
    await sessionStore.archiveSession(state.activeSessionId, !(activeSession?.archived === true));
  });
  elements.deleteSessionBtn?.addEventListener("click", async () => {
    if (!state.activeSessionId) return;
    await handleSessionAction("delete", state.activeSessionId);
  });
  elements.toggleOptionsBtn?.addEventListener("click", () => {
    state.optionsPanelOpen = !state.optionsPanelOpen;
    renderAll();
  });
  elements.closeOptionsBtn?.addEventListener("click", () => {
    state.optionsPanelOpen = false;
    renderAll();
  });
  [
    elements.modeSelect,
    elements.modelSelect,
    elements.aspectRatioSelect,
    elements.imageSizeSelect,
    elements.downloadFormatSelect,
    elements.countSelect
  ].forEach((control) => {
    control?.addEventListener("change", () => {
      state.options = syncOptionsPresentation(elements, readOptionsFromPanel(elements));
    });
  });
  elements.attachmentTray?.addEventListener("click", (event) => {
    const removeEl = event.target.closest("[data-attachment-action='remove']");
    if (!removeEl) return;
    const attachmentId = removeEl.getAttribute("data-attachment-id");
    state.composerAttachments = state.composerAttachments.filter((item) => item.id !== attachmentId);
    renderAttachmentTray(elements.attachmentTray, state.composerAttachments);
  });
  elements.chatFeed?.addEventListener("click", (event) => {
    void handleFeedAction(event);
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
      renderAll();
    },
    () => setComposerError("No fue posible sincronizar las sesiones desde Firebase.")
  );
}

function initialize() {
  initializeOptionsPanel(elements, state.options);
  bindComposer(elements, {
    onSubmit: () => {
      void submitPrompt();
    },
    onFilesSelected: (files) => {
      void handleFilesSelected(files);
    }
  });
  bindGlobalEvents();
  renderAll();

  onAuthStateChanged(sessionStore.auth, (user) => {
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
