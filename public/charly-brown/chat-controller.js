import { escapeHtml } from "./ui-components.js";
import { COMPOSER_AGENT_TOOLS } from "./workflow.js";
import { formatIcTags } from "./unit-drawer.js";
import { auth } from "../js/firebase-instance.js";
import { formatFriendlyChatMessage } from "./friendly-chat-messages.js";
import { sanitizeMarkdownHtml } from "./safe-markdown-html.js";
import { normalizeProposalAnswers } from "./proposal-answer-markup.js";
export { formatFriendlyChatMessage };
import {
  startBackgroundUpload,
  cancelActiveUpload,
  savePendingUploadToDb,
  getPendingUploadsFromDb
} from "./chat-attachment-uploader.js";

export function getFileIconClass(name = "", type = "") {
  const ext = String(name || "").split(".").pop().toLowerCase();
  const mime = String(type || "").toLowerCase();
  if (ext === "pdf" || mime === "application/pdf") return "fa-file-pdf";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext) || mime.startsWith("image/")) return "fa-file-image";
  if (["docx", "doc"].includes(ext) || mime.includes("word")) return "fa-file-word";
  if (["xlsx", "xls", "csv"].includes(ext) || mime.includes("sheet") || mime.includes("excel") || mime.includes("csv")) return "fa-file-excel";
  if (ext === "idml" || mime.includes("idml")) return "fa-file-lines";
  return "fa-file-lines";
}

// ---------------------------------------------------------------------------
// Markdown rendering — lazy-load marked.js
// ---------------------------------------------------------------------------
let _markedInstance = null;

async function loadMarked() {
  if (_markedInstance) return _markedInstance;
  try {
    const mod = await import("/vendor/marked/marked.umd.js");
    _markedInstance = mod.marked ?? mod.default ?? (typeof window !== "undefined" ? window.marked : null);
    if (_markedInstance) {
      _markedInstance.setOptions({ breaks: true, gfm: true });
    }
  } catch (_) {
    _markedInstance = null;
  }
  return _markedInstance;
}

// Call eagerly so it's loaded by the time messages arrive
loadMarked();

function parseMarkdown(text = "") {
  const raw = readableAssistantText(String(text || ""));
  const optionRegex = /(?:^|\n)\s*(?:[-*•]|\d+\.)?\s*\[\[PLAN_OPTION:\s*(.*?)\s*\]\]\s*(?=\n|$)/g;
  const hasOptions = optionRegex.test(raw);

  let mainText = raw;
  let buttonsHtml = "";

  if (hasOptions) {
    const labels = [];
    mainText = raw.replace(optionRegex, (_match, label) => {
      labels.push(label.trim());
      return "\n";
    }).trim();

    buttonsHtml = `\n<div class="cb-plan-options">\n${labels.map((label) =>
      `  <button type="button" class="cb-plan-option" data-plan-option="${escapeHtml(label)}">${escapeHtml(label)}</button>`
    ).join("\n")}\n</div>\n`;
  }

  const renderMd = (content) => {
    if (typeof window !== "undefined" && window.marked && typeof window.marked.parse === "function") {
      try { return window.marked.parse(content); } catch (_) {}
    }
    if (_markedInstance && typeof _markedInstance.parse === "function") {
      try { return _markedInstance.parse(content); } catch (_) {}
    }
    return escapeHtml(content).replace(/\n/g, "<br>");
  };

  if (!hasOptions) {
    return sanitizeMarkdownHtml(renderMd(raw));
  }

  return sanitizeMarkdownHtml(`${renderMd(mainText)}${buttonsHtml}`);
}

function readableAssistantText(source = "") {
  // Models occasionally return HTML despite being asked for conversational text.
  // Convert only recognizable markup to Markdown so the existing renderer can
  // present headings, lists and emphasis without exposing literal tags.
  if (!/<\/?(?:h[1-6]|p|div|ul|ol|li|br|strong|b|em|i|hr|blockquote|pre|code)\b/i.test(source)) return source;
  try {
    const doc = new DOMParser().parseFromString(source, "text/html");
    const render = (node) => Array.from(node.childNodes).map((child) => {
      if (child.nodeType === Node.TEXT_NODE) return child.textContent || "";
      if (child.nodeType !== Node.ELEMENT_NODE) return "";
      const tag = child.tagName.toLowerCase();
      const inner = render(child).trim();
      if (/^h[1-6]$/.test(tag)) return `\n${"#".repeat(Number(tag[1]))} ${inner}\n\n`;
      if (tag === "li") return `- ${inner}\n`;
      if (tag === "br" || tag === "hr") return "\n";
      if (tag === "strong" || tag === "b") return `**${inner}**`;
      if (tag === "em" || tag === "i") return `*${inner}*`;
      if (tag === "p" || tag === "div" || tag === "ul" || tag === "ol" || tag === "blockquote") return `${inner}\n\n`;
      if (tag === "code" || tag === "pre") return `\`${inner}\``;
      return inner;
    }).join("");
    return render(doc.body).replace(/\n{3,}/g, "\n\n").trim();
  } catch (_) { return source; }
}

// ---------------------------------------------------------------------------
// Chat controller
// ---------------------------------------------------------------------------
export function createChatController({ root, store, onAction, onUserMessage, onDeleteSourceFile, onCancel } = {}) {
  const messagesEl = root.querySelector("#cbMessages");
  const form = root.querySelector("#cbComposer");
  const input = root.querySelector("#cbComposerInput");
  const resizeHandle = root.querySelector("#cbComposerResizeHandle");
  const specificationsModal = root.querySelector("#cbSpecificationsModal");
  const specificationsBody = root.querySelector("#cbSpecificationsModalBody");
  const attachBtn = root.querySelector("#cbComposerAttachBtn");
  const fileInput = root.querySelector("#cbComposerFileInput");
  const attachmentsContainer = root.querySelector("#cbComposerAttachments");
  const sourcePanel = root.querySelector("#cbSourceFilesPanel");
  const sourceList = root.querySelector("#cbSourceFilesList");
  const sourceCount = root.querySelector("#cbSourceFilesCount");
  const sourceAddBtn = root.querySelector("#cbSourceFilesAddBtn");
  const dropZone = root.querySelector("#cbComposerDropZone");
  const composerShell = root.querySelector(".cb-composer-input-shell");
  let transientStatusEl = null;
  let transientSessionId = "";
  let specificationsReturnFocus = null;
  let dragCounter = 0;

  let currentSessionId = store?.getState?.()?.session?.id || "";

  const getSessionAttachmentsKey = (sid) => (sid ? `cb_chat_attachments_${sid}` : "cb_chat_attachments_default");
  const getSessionDraftKey = (sid) => (sid ? `cb_chat_draft_${sid}` : "cb_chat_draft_default");

  const saveDraft = (sid, value) => {
    const key = getSessionDraftKey(sid);
    try {
      if (value.trim()) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch (error) {
      if (error?.name !== "QuotaExceededError") console.warn("No se pudo guardar el borrador del chat", error);
      // El texto permanece en el editor y se puede enviar aunque falle el guardado local.
    }
  };

  const loadAttachedFilesFromStorage = (sid = currentSessionId) => {
    try {
      const key = getSessionAttachmentsKey(sid);
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  };

  const saveAttachedFilesToStorage = (sid = currentSessionId) => {
    try {
      const key = getSessionAttachmentsKey(sid);
      const readyFiles = attachedFiles
        .filter((f) => !f.uploading && !f.error && (f.storagePath || f.downloadUrl))
        .map(({ name, size, type, storagePath, downloadUrl, gsUri, extractionStoragePath }) => ({
          name, size, type, storagePath, downloadUrl, gsUri, extractionStoragePath
        }));
      if (readyFiles.length) {
        localStorage.setItem(key, JSON.stringify(readyFiles));
      } else {
        localStorage.removeItem(key);
      }
    } catch (_) {}
  };

  let attachedFiles = loadAttachedFilesFromStorage(currentSessionId);
  let lastSourceSessionId = "";
  let lastSourceCount = 0;

  const getSourceFiles = (session = {}) => {
    const unit = (session.units || []).find((item) => item.id === session.activeUnitId);
    const files = unit?.sourceAttachments?.length ? unit.sourceAttachments
      : unit?.sourceAttachmentsManaged ? []
        : (unit?.messages || []).filter((message) => message.role === "user").flatMap((message) => message.attachments || []);
    return [...new Map(files.filter((file) => file?.storagePath || file?.downloadUrl)
      .map((file) => [file.storagePath || file.downloadUrl, file])).values()];
  };

  const categoryFor = (file) => {
    const name = String(file.name || "").toLowerCase();
    const type = String(file.type || "").toLowerCase();
    if (name.endsWith(".pdf") || type === "application/pdf") return "PDF";
    if (/\.(docx?|idml)$/.test(name) || /word|idml/.test(type)) return "Documentos";
    if (/\.(xlsx?|csv)$/.test(name) || /sheet|excel|csv/.test(type)) return "Hojas de cálculo";
    if (/\.(png|jpe?g|webp|gif)$/.test(name) || type.startsWith("image/")) return "Imágenes";
    return "Otros";
  };

  const renderSourceFiles = (session = {}) => {
    if (!sourceList) return;
    const files = getSourceFiles(session);
    if (sourceCount) sourceCount.textContent = String(files.length);
    if (sourceAddBtn) sourceAddBtn.disabled = files.length + attachedFiles.length >= 10;
    if (sourcePanel && (lastSourceSessionId !== session.id || files.length > lastSourceCount)) sourcePanel.open = files.length > 0;
    lastSourceSessionId = session.id || "";
    lastSourceCount = files.length;
    if (!files.length) {
      sourceList.innerHTML = '<p class="cb-source-files-empty">Aún no hay archivos. Adjunta uno para consultarlo en este chat.</p>';
      return;
    }
    const groups = new Map();
    files.forEach((file) => {
      const category = categoryFor(file);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(file);
    });
    sourceList.innerHTML = [...groups].map(([category, items]) => `
      <section class="cb-source-files-group" aria-label="${escapeHtml(category)}">
        <p class="cb-source-files-group-title">${escapeHtml(category)} · ${items.length}</p>
        ${items.map((file) => `<div class="cb-source-file-row">
          <i class="fas ${getFileIconClass(file.name, file.type)}" aria-hidden="true"></i>
          <span class="cb-source-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
          <span class="cb-source-file-size">${file.size ? `${Math.ceil(Number(file.size) / 1024)} KB` : ""}</span>
          <button type="button" class="cb-source-file-delete" data-delete-source="${escapeHtml(file.storagePath || "")}" ${file.storagePath ? "" : "disabled"} aria-label="Eliminar ${escapeHtml(file.name)}" title="Eliminar archivo de esta unidad y Storage"><i class="fas fa-trash" aria-hidden="true"></i></button>
        </div>`).join("")}
      </section>`).join("");
  };

  const scrollToBottom = (force = false) => {
    if (!messagesEl) return;
    const threshold = 120;
    const distFromBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
    if (force || distFromBottom < threshold) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  };

  const renderAttachedFiles = () => {
    if (!attachmentsContainer) return;
    if (!attachedFiles.length) {
      attachmentsContainer.hidden = true;
      attachmentsContainer.innerHTML = "";
      attachBtn?.classList.remove("has-files");
      return;
    }
    attachmentsContainer.hidden = false;
    attachBtn?.classList.add("has-files");
    attachmentsContainer.innerHTML = attachedFiles.map((item) => {
      const pct = Number(item.progress || 0);
      return `
        <div class="cb-attachment-chip ${item.uploading ? "is-uploading" : ""}" data-attachment-id="${escapeHtml(item.id || item.storagePath || item.name)}" style="--upload-pct: ${pct}%;">
          <div class="cb-attachment-chip-layer cb-chip-layer-base">
            ${item.uploading
              ? `<span class="cb-attachment-loader" aria-hidden="true"></span>`
              : `<i class="fas ${getFileIconClass(item.name, item.type)} cb-attachment-icon"></i>`}
            <span class="cb-attachment-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
            <button type="button" class="cb-attachment-remove" data-remove-attachment="${escapeHtml(item.id || item.storagePath || item.name)}" aria-label="${item.uploading ? 'Cancelar subida' : 'Quitar archivo'}" title="${item.uploading ? 'Cancelar subida' : 'Quitar archivo'}">
              <i class="fas fa-times"></i>
            </button>
          </div>

          ${item.uploading ? `
            <div class="cb-attachment-chip-layer cb-chip-layer-fill" aria-hidden="true" style="clip-path: inset(0 calc(100% - ${pct}%) 0 0);">
              <span class="cb-attachment-loader" aria-hidden="true"></span>
              <span class="cb-attachment-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
              <button type="button" class="cb-attachment-remove" tabindex="-1" aria-hidden="true">
                <i class="fas fa-times"></i>
              </button>
            </div>
          ` : ""}
        </div>
      `;
    }).join("");
  };

  // Renderizar adjuntos persistidos al cargar
  renderAttachedFiles();

  const handleUploadProgress = ({ id, progress }) => {
    const target = attachedFiles.find((f) => f.id === id);
    if (!target) return;
    target.progress = progress;
    const chipEl = attachmentsContainer?.querySelector(`[data-attachment-id="${id}"]`);
    if (chipEl) {
      chipEl.style.setProperty("--upload-pct", `${progress}%`);
      const fillLayer = chipEl.querySelector(".cb-chip-layer-fill");
      if (fillLayer) {
        fillLayer.style.clipPath = `inset(0 calc(100% - ${progress}%) 0 0)`;
      }
    }
  };

  const uploadFiles = async (files = []) => {
    if (!files || !files.length) return;
    if (getSourceFiles(store.getState().session).length + attachedFiles.filter((file) => !file.error).length + files.length > 10) {
      alert("Puedes tener hasta 10 archivos por unidad. Elimina alguno en la sección de archivos antes de añadir más.");
      return;
    }
    const user = (typeof window !== "undefined" && window.__CHARLY_TEST_USER__) || auth?.currentUser;
    const uid = user?.uid || "anonymous";
    const sessionId = store.getState().session.id || "session";

    for (const file of files) {
      const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const pendingItem = {
        id,
        name: file.name,
        size: file.size,
        type: file.type,
        progress: 0,
        uploading: true
      };
      attachedFiles.push(pendingItem);
      renderAttachedFiles();

      // Persistir el archivo en IndexedDB para que sobreviva recargas de página
      await savePendingUploadToDb({
        id,
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        sessionId,
        uid
      });

      startBackgroundUpload({
        id,
        file,
        name: file.name,
        type: file.type,
        uid,
        sessionId,
        onProgress: handleUploadProgress
      }).then((result) => {
        const target = attachedFiles.find((f) => f.id === id);
        if (target) {
          Object.assign(target, result, { uploading: false, progress: 100 });
          saveAttachedFilesToStorage();
          renderAttachedFiles();
        }
      }).catch((err) => {
        if (err?.code === "storage/canceled") return;
        console.warn("[charly-attachments] Fallo al subir archivo:", file.name, err);
        const target = attachedFiles.find((f) => f.id === id);
        if (target) {
          target.uploading = false;
          target.error = true;
          renderAttachedFiles();
        }
      });
    }
  };

  // Reanudar subidas pendientes desde IndexedDB si se reinició o recargó la página
  const resumePendingUploads = async (targetSid = "") => {
    const sessionId = targetSid || currentSessionId || store.getState().session.id || "session";
    const user = (typeof window !== "undefined" && window.__CHARLY_TEST_USER__) || auth?.currentUser;
    const uid = user?.uid || "anonymous";
    try {
      const pendingList = await getPendingUploadsFromDb(sessionId);
      if (!pendingList || !pendingList.length) return;

      for (const pending of pendingList) {
        if (attachedFiles.some((f) => f.id === pending.id && !f.uploading)) continue;
        let item = attachedFiles.find((f) => f.id === pending.id);
        if (!item) {
          item = {
            id: pending.id,
            name: pending.name,
            size: pending.size,
            type: pending.type,
            progress: 0,
            uploading: true
          };
          attachedFiles.push(item);
          renderAttachedFiles();
        }

        startBackgroundUpload({
          id: pending.id,
          file: pending.file,
          name: pending.name,
          type: pending.type,
          uid: pending.uid || uid,
          sessionId: pending.sessionId || sessionId,
          onProgress: handleUploadProgress
        }).then((result) => {
          const target = attachedFiles.find((f) => f.id === pending.id);
          if (target) {
            Object.assign(target, result, { uploading: false, progress: 100 });
            saveAttachedFilesToStorage();
            renderAttachedFiles();
          }
        }).catch((err) => {
          if (err?.code === "storage/canceled") return;
          console.warn("[charly-attachments] Fallo al subir archivo:", pending.name, err);
          const target = attachedFiles.find((f) => f.id === pending.id);
          if (target) {
            target.uploading = false;
            target.error = true;
            renderAttachedFiles();
          }
        });
      }
    } catch (_) {}
  };

  void resumePendingUploads();
  if (auth && typeof auth.onAuthStateChanged === "function") {
    auth.onAuthStateChanged((user) => {
      if (user?.uid) {
        void resumePendingUploads();
      }
    });
  }

  attachBtn?.addEventListener("click", () => {
    fileInput?.click();
  });
  sourceAddBtn?.addEventListener("click", () => fileInput?.click());
  sourceList?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-source]");
    const storagePath = button?.dataset.deleteSource;
    if (!storagePath || !onDeleteSourceFile) return;
    button.disabled = true;
    try { await onDeleteSourceFile(storagePath); }
    catch (error) { button.disabled = false; alert(`No se pudo eliminar el archivo: ${error.message}`); }
  });

  attachmentsContainer?.addEventListener("click", (event) => {
    const removeBtn = event.target.closest("[data-remove-attachment]");
    if (!removeBtn) return;
    const key = removeBtn.dataset.removeAttachment;
    if (key) {
      cancelActiveUpload(key);
      attachedFiles = attachedFiles.filter((item) => (item.id !== key && item.storagePath !== key && item.name !== key));
      saveAttachedFilesToStorage();
      renderAttachedFiles();
    }
  });

  fileInput?.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    fileInput.value = "";
    await uploadFiles(files);
  });

  const showDropZone = (show) => {
    if (!dropZone) return;
    dropZone.hidden = !show;
  };

  const handleDragEnter = (event) => {
    event.preventDefault();
    if (event.dataTransfer?.types?.includes("Files")) {
      dragCounter++;
      showDropZone(true);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) {
      showDropZone(false);
    }
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    dragCounter = 0;
    showDropZone(false);
    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    if (droppedFiles.length) {
      await uploadFiles(droppedFiles);
    }
  };

  composerShell?.addEventListener("dragenter", handleDragEnter);
  composerShell?.addEventListener("dragover", handleDragOver);
  composerShell?.addEventListener("dragleave", handleDragLeave);
  composerShell?.addEventListener("drop", handleDrop);

  messagesEl?.addEventListener("dragenter", handleDragEnter);
  messagesEl?.addEventListener("dragover", handleDragOver);
  messagesEl?.addEventListener("dragleave", handleDragLeave);
  messagesEl?.addEventListener("drop", handleDrop);

  let lastRenderedSessionId = "";

  const render = (state) => {
    const nextSessionId = state?.session?.id || "";
    const isNewSession = Boolean(nextSessionId && nextSessionId !== lastRenderedSessionId);
    lastRenderedSessionId = nextSessionId;
    renderSourceFiles(state?.session);

    const messages = state?.session?.messages || [];
    messagesEl.innerHTML = messages.length ? messages.map(message => {
      const id = message.proposalId || String(message.html || "").match(/data-proposal-id="([^"]+)"/)?.[1];
      const proposal = (state.session.proposals || []).find(item => item.id === id);
      return renderMessage(proposal ? { ...message, html: renderProposalMessage(proposal) } : message, state.session);
    }).join("") : renderWelcome();
    if (transientStatusEl && transientSessionId === nextSessionId) messagesEl.appendChild(transientStatusEl);
    if (typeof window.renderMathInElement === "function") {
      window.renderMathInElement(messagesEl, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
          { left: "$", right: "$", display: false }
        ],
        throwOnError: false,
        trust: false
      });
    }
    scrollToBottom(isNewSession);
    const titleElement = root.querySelector("#cbActiveSessionTitle");
    if (titleElement) titleElement.textContent = formatSessionHeading(state.session);
  };

  const syncSessionComposer = (newSessionId) => {
    if (!newSessionId || newSessionId === currentSessionId) return;

    if (currentSessionId) {
      saveAttachedFilesToStorage(currentSessionId);
      if (input) {
        saveDraft(currentSessionId, input.value);
      }
    }

    currentSessionId = newSessionId;
    attachedFiles = loadAttachedFilesFromStorage(currentSessionId);
    renderAttachedFiles();
    void resumePendingUploads(currentSessionId);

    if (input) {
      const sessionDraft = localStorage.getItem(getSessionDraftKey(currentSessionId)) || "";
      input.value = sessionDraft;
    }

    requestAnimationFrame(() => scrollToBottom(true));
  };

  store.subscribe((state) => {
    const nextSessionId = state?.session?.id || "";
    if (nextSessionId && nextSessionId !== currentSessionId) {
      syncSessionComposer(nextSessionId);
    }
    render(state);
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = String(input?.value || "").trim();
    if (!text && !attachedFiles.length) return;
    if (attachedFiles.some((f) => f.uploading)) {
      alert("Espera a que terminen de subirse los archivos adjuntos.");
      return;
    }
    const filesToSend = [...attachedFiles];
    attachedFiles = [];
    localStorage.removeItem(getSessionAttachmentsKey(currentSessionId));
    renderAttachedFiles();
    if (input) {
      input.value = "";
      localStorage.removeItem(getSessionDraftKey(currentSessionId));
    }
    onUserMessage?.(text, { attachments: filesToSend });
  });

  if (input) {
    const savedDraft = localStorage.getItem(getSessionDraftKey(currentSessionId));
    if (savedDraft) {
      input.value = savedDraft;
    }
    input.addEventListener("input", () => {
      saveDraft(currentSessionId, input.value);
    });
  }

  input?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    form?.requestSubmit();
  });

  resizeHandle?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = input?.getBoundingClientRect().height || 70;
    resizeHandle.setPointerCapture?.(event.pointerId);
    resizeHandle.classList.add("is-resizing");
    const move = (moveEvent) => {
      if (!input) return;
      const nextHeight = Math.max(70, Math.min(280, startHeight + startY - moveEvent.clientY));
      input.style.height = `${nextHeight}px`;
    };
    const stop = () => {
      resizeHandle.classList.remove("is-resizing");
      resizeHandle.removeEventListener("pointermove", move);
      resizeHandle.removeEventListener("pointerup", stop);
      resizeHandle.removeEventListener("pointercancel", stop);
    };
    resizeHandle.addEventListener("pointermove", move);
    resizeHandle.addEventListener("pointerup", stop);
    resizeHandle.addEventListener("pointercancel", stop);
  });

  root.querySelectorAll("[data-chat-action]").forEach((button) => {
    button.addEventListener("click", () => onAction?.(button.dataset.chatAction));
  });

  messagesEl?.addEventListener("click", (event) => {
    const cancelBtn = event.target.closest?.(".cb-analyzing-cancel-btn");
    if (cancelBtn) {
      event.preventDefault();
      event.stopPropagation();
      onCancel?.();
      return;
    }
    const planOption = event.target.closest?.("[data-plan-option]");
    if (planOption && !planOption.disabled) {
      const answer = planOption.dataset.planOption || "";
      planOption.closest(".cb-plan-options")?.querySelectorAll("[data-plan-option]").forEach((button) => {
        button.disabled = true;
        button.classList.toggle("is-chosen", button === planOption);
      });
      onUserMessage?.(`Elijo: ${answer}`);
      return;
    }
    const specificationsButton = event.target.closest?.("[data-message-specifications]");
    if (specificationsButton) {
      const id = specificationsButton.closest("[data-message-id]")?.dataset.messageId || "";
      const message = (store.getState().session.messages || []).find((item) => item.id === id);
      const details = String(message?.specifications || "").trim();
      if (details && specificationsModal && specificationsBody) {
        specificationsReturnFocus = specificationsButton;
        specificationsBody.innerHTML = parseMarkdown(details);
        specificationsModal.hidden = false;
        specificationsModal.setAttribute("aria-hidden", "false");
        specificationsModal.inert = false;
        specificationsModal.querySelector(".cb-modal-close")?.focus();
      }
      return;
    }
    const welcomeButton = event.target.closest?.("[data-welcome-action]");
    if (welcomeButton) {
      onAction?.(welcomeButton.dataset.welcomeAction);
      return;
    }
    const actionButton = event.target.closest?.("[data-question-action]");
    if (!actionButton) return;
    const article = actionButton.closest("[data-message-id]");
    const id = article?.dataset.messageId || "";
    const message = (store.getState().session.messages || []).find((item) => item.id === id);
    if (!message) return;
    const action = actionButton.dataset.questionAction;
    const session = store.getState().session;
    const friendlyText = message.displayText || formatFriendlyChatMessage(message.text, session) || message.text;
    if (action === "copy") {
      navigator.clipboard?.writeText(String(friendlyText || "")).then(() => {
        actionButton.classList.add("is-copied");
        actionButton.setAttribute("aria-label", "Texto copiado");
        actionButton.innerHTML = `<i class="fas fa-check" aria-hidden="true"></i>`;
      }).catch(() => {});
    }
    if (action === "edit") {
      const bubble = article.querySelector(".cb-message-bubble--question");
      if (!bubble) return;
      bubble.classList.add("is-editing");
      bubble.innerHTML = `<form class="cb-question-edit-form" data-question-edit-form>
        <textarea rows="4" wrap="soft" aria-label="Editar pregunta">${escapeHtml(friendlyText || "")}</textarea>
      </form>`;
      const editor = bubble.querySelector("textarea");
      editor?.focus();
      editor?.setSelectionRange(editor.value.length, editor.value.length);
    }
  });

  const closeSpecificationsModal = () => {
    if (!specificationsModal || specificationsModal.hidden) return;
    const active = document.activeElement;
    if (active && specificationsModal.contains(active) && typeof active.blur === "function") active.blur();
    specificationsModal.hidden = true;
    specificationsModal.setAttribute("aria-hidden", "true");
    specificationsModal.inert = true;
    specificationsBody.innerHTML = "";
    specificationsReturnFocus?.focus();
    specificationsReturnFocus = null;
  };

  specificationsModal?.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-specifications-close]")) closeSpecificationsModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSpecificationsModal();
  });

  messagesEl?.addEventListener("keydown", (event) => {
    const editor = event.target.closest?.("[data-question-edit-form] textarea");
    if (!editor || event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      render(store.getState());
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      editor.form?.requestSubmit();
    }
  });

  messagesEl?.addEventListener("submit", (event) => {
    const editForm = event.target.closest?.("[data-question-edit-form]");
    if (!editForm) return;
    event.preventDefault();
    const id = editForm.closest("[data-message-id]")?.dataset.messageId || "";
    const text = String(editForm.querySelector("textarea")?.value || "").trim();
    if (!id || !text) return;
    onUserMessage?.(text, { replaceMessageId: id });
  });

  const showTransientStatus = (customLabel = "", options = {}) => {
    if (!messagesEl) return;
    const attachments = Array.isArray(options?.attachments) ? options.attachments : [];
    const progressPct = options?.progressPct != null ? Math.min(100, Math.max(0, Math.round(options.progressPct))) : null;
    const statusText = String(customLabel || (attachments.length ? "Analizando archivo..." : "Respondiendo...")).trim();

    // Si la tarjeta ya existe en el DOM, actualizar el texto y el porcentaje in-place para evitar parpadeos
    if (transientStatusEl && transientStatusEl.isConnected) {
      const statusLabelEl = transientStatusEl.querySelector(".cb-status-label");
      if (statusLabelEl) {
        statusLabelEl.textContent = statusText;
        statusLabelEl.title = statusText;
      }
      if (progressPct != null) {
        const pctValEl = transientStatusEl.querySelector(".cb-analyzing-pct-val");
        if (pctValEl) pctValEl.textContent = `${progressPct}%`;
      }
      const workingLabelEl = transientStatusEl.querySelector(".cb-working-label");
      if (workingLabelEl) {
        workingLabelEl.textContent = String(statusText || "Respondiendo").replace(/(\.{3}|…)+/g, "").trim();
      }
      if (statusLabelEl || workingLabelEl) return;
    }

    clearTransientStatus();
    transientStatusEl = document.createElement("article");
    transientSessionId = currentSessionId;
    transientStatusEl.className = "cb-message cb-message--assistant cb-message--transient";
    transientStatusEl.setAttribute("data-transient-status", "true");
    if (attachments.length) {
      transientStatusEl.innerHTML = renderAnalyzingCard(statusText, attachments, progressPct);
    } else {
      transientStatusEl.innerHTML = `<div class="cb-message-bubble">${renderWorkingStatus(statusText)}</div>`;
    }
    messagesEl.appendChild(transientStatusEl);
    scrollToBottom(true);
  };

  const clearTransientStatus = () => {
    transientStatusEl?.remove();
    transientStatusEl = null;
    transientSessionId = "";
  };

  return { render, showTransientStatus, clearTransientStatus, scrollToBottom, syncSessionComposer };
}

function formatSessionHeading(session = {}) {
  return String(session.title || "").trim() || "Nueva sesión";
}

// ---------------------------------------------------------------------------
// Proposal message renderer
// ---------------------------------------------------------------------------
function renderProposalToolbarButton({ action, label, icon, resource = false } = {}) {
  const actionAttribute = resource ? "data-resource-proposal-action" : "data-proposal-action";
  return `<button type="button" ${actionAttribute}="${escapeHtml(action)}" aria-label="${escapeHtml(label)}"><i class="${escapeHtml(icon)}" aria-hidden="true"></i><span class="cb-proposal-tooltip" role="tooltip">${escapeHtml(label)}</span></button>`;
}

export function renderProposalMessage({ id = "", title = "", html = "", validation = null, contentType = "activity", citations = [], readingStage = "reading", artifact = null } = {}) {
  const isResource = ["worksheet", "annex", "cutout", "video-script"].includes(contentType);
  const resourceLabels = { worksheet: "Ficha de refuerzo", annex: "Anexo", cutout: "Recortable", "video-script": "Guion de video" };
  const valid = validation?.ok !== false;
  const isProject = /proyecto/i.test(String(title || ""));
  const isReading = contentType === "reading";
  const isTeacherNote = contentType === "teacher-note";
  const isSya = contentType === "sya";
  const readingLabel = readingStage === "synonyms" ? "Sinónimos" : readingStage === "comprehension" ? "Comprensión" : "Lectura";

  const kickerLabel = isResource
    ? (resourceLabels[contentType] || "Recurso complementario")
    : isReading
    ? readingLabel
    : isSya
    ? "Secuencia y Alcance"
    : isTeacherNote
    ? "Nota del maestro"
    : "Actividades";

  const acceptLabel = isResource
    ? `Aprobar ${resourceLabels[contentType]?.toLowerCase() || "recurso"}`
    : isReading
    ? `Aprobar ${readingLabel.toLowerCase()}`
    : isSya
    ? "Aplicar Secuencia y Alcance"
    : isTeacherNote
    ? "Aprobar nota del maestro"
    : isProject
    ? "Aceptar proyecto"
    : "Aceptar actividades";

  const regenerateLabel = isResource
    ? `Generar otra propuesta de ${resourceLabels[contentType]?.toLowerCase() || "recurso"}`
    : isReading
    ? ""
    : isSya
    ? "Generar otra propuesta curricular"
    : isTeacherNote
    ? "Generar otra propuesta de nota"
    : "Regenerar la actividad";

  const parts = isResource ? { activitiesHtml: html, resources: [] } : splitProposalHtml(html);
  const contentHtml = isSya
    ? `<div class="cb-sya-proposal-fields">${Object.entries(artifact?.sya || {}).filter(([key]) => !key.startsWith("__")).map(([key, value]) => `<p><strong>${escapeHtml(key)}</strong>: ${escapeHtml(String(value || ""))}</p>`).join("")}</div>`
    : formatIcTags(normalizeWordSearchGrids(normalizeProposalAnswers(parts.activitiesHtml || html || "")));

  return `
    <div class="cb-proposal" data-proposal-id="${escapeHtml(id)}">
      <h3>${escapeHtml(title || (isResource ? resourceLabels[contentType] : "Propuesta"))}</h3>
      ${valid ? "" : `<p class="cb-warning">La estructura necesita corrección: ${escapeHtml((validation?.errors || []).join(", "))}</p>`}
      <details class="cb-proposal-part cb-proposal-part--${isResource ? `resource cb-proposal-part--${contentType}` : (isReading ? 'reading' : isTeacherNote ? 'teacher-note' : isSya ? 'sya' : 'activities')}" open>
        <summary class="cb-proposal-summary">
          <p class="cb-panel-kicker">${kickerLabel}</p>
        </summary>
        <div class="cb-proposal-html ${isResource ? `cb-proposal-html--resource cb-proposal-html--${contentType}` : ''}">${contentHtml}</div>
        ${renderCitations(citations)}
        <div class="cb-proposal-actions" role="toolbar" aria-label="Acciones de la propuesta" aria-orientation="horizontal">
          ${renderProposalToolbarButton({ action: "accept", label: acceptLabel, icon: "fas fa-check" })}
          ${renderProposalToolbarButton({ action: "reject", label: "No usar", icon: "fas fa-xmark" })}
          ${isReading ? "" : renderProposalToolbarButton({ action: "regenerate", label: regenerateLabel, icon: "fas fa-rotate-right" })}
          ${isReading || isSya ? "" : `
          ${renderProposalToolbarButton({ action: "easier", label: isProject ? "Simplificar proyecto" : "Hacer más fácil", icon: "fas fa-arrow-down-short-wide" })}
          ${renderProposalToolbarButton({ action: "harder", label: isProject ? "Hacer proyecto más retador" : "Hacer más difícil", icon: "fas fa-arrow-up-short-wide" })}
          ${isResource || isTeacherNote ? "" : renderProposalToolbarButton({ action: "teacher-notes", label: isProject ? "Notas del proyecto" : "Crear notas del maestro", icon: "fas fa-pen-nib" })}
          `}
        </div>
      </details>
      ${parts.resources.length ? `
        <div class="cb-proposal-part cb-proposal-part--resources">
          <p class="cb-panel-kicker">Materiales</p>
          <div class="cb-proposal-resources">
            ${parts.resources.map((resource, index) => `
              <button type="button" class="cb-approved-card cb-resource-review-trigger" data-review-resource data-resource-proposal-index="${index}">
                <strong>${escapeHtml(resource.title || resource.code || "Recurso")}</strong>
                <span>${escapeHtml(resource.code || resource.type || "Material")} · Revisar →</span>
              </button>
            `).join("")}
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function renderCitations(citations = []) {
  const items = Array.isArray(citations) ? citations.filter((item) => item?.url) : [];
  if (!items.length) return "";
  return `<aside class="cb-citations"><strong>Fuentes verificadas</strong><ol>${items.map((item) => `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || item.url)}</a></li>`).join("")}</ol></aside>`;
}

// ---------------------------------------------------------------------------
// HTML splitting helpers
// ---------------------------------------------------------------------------
function splitProposalHtml(html = "") {
  if (typeof DOMParser === "undefined") {
    return { activitiesHtml: html || "", resources: [] };
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${String(html || "")}</div>`, "text/html");
  const resourceNodes = Array.from(doc.querySelectorAll("[data-resource-type], [data-resource-section='true'], .resource-ficha, .resource-anexo, .resource-recortable, .resource-video, .guion-video"));
  const resources = resourceNodes.map((node) => {
    const type = String(node.getAttribute("data-resource-type") || "").trim();
    const title = String(node.querySelector("h1,h2,h3,h4,strong")?.textContent || node.textContent || "").trim();
    return {
      type,
      title,
      code: title || type || "Recurso",
      html: node.outerHTML
    };
  });
  resourceNodes.forEach(node => node.remove());
  return {
    activitiesHtml: doc.body.innerHTML.replace(/^<div>|<\/div>$/g, ""),
    resources
  };
}

// ---------------------------------------------------------------------------
// Message renderers
// ---------------------------------------------------------------------------
function normalizeProposalToolbarIcons(html = "") {
  const source = String(html || "");
  if (!source.includes('data-proposal-action="easier"')) return source;

  const template = document.createElement("template");
  template.innerHTML = source;
  const regenerateButton = template.content.querySelector('[data-proposal-action="regenerate"]');
  const easierIcon = template.content.querySelector('[data-proposal-action="easier"] i');
  const harderIcon = template.content.querySelector('[data-proposal-action="harder"] i');
  if (!regenerateButton) {
    const easierButton = template.content.querySelector('[data-proposal-action="easier"]');
    easierButton?.insertAdjacentHTML("beforebegin", renderProposalToolbarButton({ action: "regenerate", label: "Regenerar la actividad", icon: "fas fa-rotate-right" }));
  }
  if (easierIcon) easierIcon.className = "fas fa-arrow-down-short-wide";
  if (harderIcon) harderIcon.className = "fas fa-arrow-up-short-wide";
  return template.innerHTML;
}

export function normalizeWordSearchGrids(source = "") {
  if (!source || !source.includes("cb-word-search-grid")) return source;
  const template = document.createElement("template");
  template.innerHTML = source;
  const grids = template.content.querySelectorAll(".cb-word-search-grid");
  grids.forEach((grid) => {
    const spans = grid.querySelectorAll("span");
    const count = spans.length;
    if (!count) return;

    const styleAttr = grid.getAttribute("style") || "";
    const match = styleAttr.match(/repeat\(\s*(\d+)/i);
    let cols = match ? parseInt(match[1], 10) : 0;
    if (!cols || cols < 3) {
      if (count % 10 === 0) cols = 10;
      else if (count % 12 === 0) cols = 12;
      else if (count % 8 === 0) cols = 8;
      else if (count % 14 === 0) cols = 14;
      else cols = Math.round(Math.sqrt(count)) || 10;
    }
    grid.style.setProperty("--cb-grid-cols", String(cols));
    grid.style.setProperty("grid-template-columns", `repeat(${cols}, 28px)`);
  });
  return template.innerHTML;
}

function renderMessage(message = {}, session = null) {
  const html = formatIcTags(normalizeWordSearchGrids(normalizeProposalToolbarIcons(message.html)));

  if (message.role === "user") {
    const tools = Array.isArray(message.requestedTools) ? message.requestedTools : [];
    const toolsHtml = tools.length
      ? `<div class="cb-message-tools">
          ${tools.map((tId) => {
            const tool = COMPOSER_AGENT_TOOLS.find((t) => t.id === tId || (t.id === "create_teacher_notes" && tId === "design_teacher_note")) || { name: tId, icon: "fa-screwdriver-wrench" };
            return `
              <span class="cb-message-tool-chip">
                <i class="fas ${escapeHtml(tool.icon || "fa-screwdriver-wrench")}"></i>
                <span>${escapeHtml(tool.name)}</span>
              </span>
            `;
          }).join("")}
        </div>`
      : "";

    const attachmentsHtml = Array.isArray(message.attachments) && message.attachments.length
      ? `<div class="cb-message-attachments" style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px;">
          ${message.attachments.map((att) => `
            <span class="cb-attachment-chip" style="font-size: 10px; height: 22px; padding: 0 6px; background: rgba(255,255,255,0.85); border-color: rgba(0,0,0,0.1);">
              <i class="fas ${escapeHtml(getFileIconClass(att.name, att.type))} cb-attachment-icon"></i>
              <span class="cb-attachment-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
            </span>
          `).join("")}
        </div>`
      : "";

    const displayText = message.displayText || formatFriendlyChatMessage(message.text, session);

    return `
      <article class="cb-message cb-message--user" data-message-id="${escapeHtml(message.id || "")}">
        <div class="cb-message-bubble cb-message-bubble--question">
          ${toolsHtml}
          ${attachmentsHtml}
          <div class="cb-message-question-text">${escapeHtml(displayText || message.text || "")}</div>
          <div class="cb-message-question-meta">
            <time datetime="${escapeHtml(message.createdAt || "")}">${escapeHtml(formatMessageTime(message.createdAt))}</time>
            <button type="button" data-question-action="copy" aria-label="Copiar pregunta" title="Copiar"><i class="fas fa-copy" aria-hidden="true"></i></button>
            <button type="button" data-question-action="edit" aria-label="Editar pregunta" title="Editar"><i class="fas fa-pen" aria-hidden="true"></i></button>
          </div>
        </div>
      </article>
    `;
  }

  // Proposal messages get rendered without extra detail/summary wrapper
  if (message.role === "assistant" && html.includes('data-proposal-id="')) {
    return `
      <article class="cb-message cb-message--${escapeHtml(message.role || "assistant")}" data-message-id="${escapeHtml(message.id || "")}">
        <div class="cb-message-bubble">
          <div class="cb-message-body">${html}</div>
        </div>
      </article>
    `;
  }

  // Render Markdown for assistant text messages
  let bodyContent;
  if (message.html) {
    bodyContent = message.html;
  } else if (message.role === "assistant" && message.text) {
    bodyContent = parseMarkdown(message.text);
  } else {
    bodyContent = escapeHtml(message.text || "");
  }
  const specificationsButton = message.role === "assistant" && String(message.specifications || "").trim()
    ? `<button type="button" class="cb-message-specifications-button" data-message-specifications aria-label="Ver especificaciones" title="Ver especificaciones"><i class="fas fa-clipboard-list" aria-hidden="true"></i></button>`
    : "";

  return `
    <article class="cb-message cb-message--${escapeHtml(message.role || "assistant")}" data-message-id="${escapeHtml(message.id || "")}">
      <div class="cb-message-bubble">
        ${specificationsButton}
        <div class="cb-message-body">${bodyContent}</div>
      </div>
    </article>
  `;
}

function formatMessageTime(value = "") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function renderWelcome() {
  return `
    <article class="cb-message cb-message--assistant">
      <div class="cb-message-bubble">
        <strong>Crea una unidad nueva.</strong>
        <p>Planéala con el chat y, cuando las propuestas estén listas, apruébalas para colocarlas en el panel derecho. Cuando aceptes actividades o un proyecto, aparecerán a la derecha y desde ahí podrás crear notas del maestro.</p>
        <div class="cb-welcome-actions" aria-label="Elegir cómo comenzar la unidad">
          <button type="button" data-welcome-action="start-select-reading">
            <i class="fas fa-book-open" aria-hidden="true"></i>
            <span>Seleccionar lectura</span>
          </button>
          <button type="button" class="cb-text-button" data-welcome-action="start-create-reading">
            <i class="fas fa-pen-nib" aria-hidden="true"></i>
            <span>Crear una lectura</span>
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderWorkingStatus(label = "Respondiendo") {
  const safeLabel = escapeHtml(String(label || "Respondiendo").replace(/(\.{3}|…)+/g, "").trim());
  return `
    <div class="cb-working-status" aria-live="polite" aria-label="${safeLabel}">
      <span class="cb-working-label">${safeLabel}</span>
      <span class="cb-working-dots" aria-hidden="true">
        <span></span><span></span><span></span>
      </span>
    </div>
  `;
}

export function renderAnalyzingCard(statusText = "Analizando archivo...", attachments = [], progressPct = null) {
  const safeStatus = escapeHtml(String(statusText || "Analizando archivo...").trim());
  const primaryAtt = attachments[0] || {};
  const isMulti = attachments.length > 1;
  const fileName = String(primaryAtt.name || "Archivo").trim();
  const ext = fileName.split(".").pop()?.toUpperCase() || "DOC";
  const iconClass = getFileIconClass(primaryAtt.name, primaryAtt.type);
  const initialPct = progressPct != null ? Math.min(100, Math.max(0, Math.round(progressPct))) : 15;

  return `
    <div class="cb-analyzing-card" role="status" aria-live="polite">
      <div class="cb-analyzing-card-header">
        <div class="cb-analyzing-progress-pct" title="Avance de análisis">
          <i class="fas fa-chart-pie"></i>
          <span class="cb-analyzing-pct-val">${initialPct}%</span>
        </div>
        <div class="cb-analyzing-counter">
          <i class="fas fa-file-waveform"></i>
          <span>${isMulti ? `${attachments.length} archivos` : "1 documento"}</span>
        </div>
      </div>

      <div class="cb-analyzing-stage">
        <div class="cb-doc-miniature-container">
          <div class="cb-doc-sheet ${primaryAtt.type?.startsWith("image/") ? "is-image" : ""}">
            <div class="cb-doc-sheet-header">
              <i class="fas ${iconClass} cb-doc-sheet-icon"></i>
              <span class="cb-doc-sheet-pill">${escapeHtml(ext)}</span>
            </div>
            <div class="cb-doc-sheet-body">
              <div class="cb-doc-line is-heading"></div>
              <div class="cb-doc-line"></div>
              <div class="cb-doc-line is-short"></div>
              <div class="cb-doc-line"></div>
              <div class="cb-doc-grid">
                <span></span><span></span><span></span><span></span>
              </div>
            </div>
            <div class="cb-doc-sheet-glow"></div>
          </div>

          <div class="cb-scanner-rig" aria-hidden="true">
            <div class="cb-scanner-lens">
              <i class="fas fa-magnifying-glass cb-lens-icon"></i>
              <div class="cb-scanner-beam"></div>
            </div>
          </div>
        </div>

        <div class="cb-analyzing-meta">
          <div class="cb-analyzing-filename" title="${escapeHtml(fileName)}">
            <span>${escapeHtml(fileName)}</span>
          </div>
          ${isMulti ? `
            <div class="cb-analyzing-extra-chips">
              ${attachments.slice(1, 3).map((att) => `
                <span class="cb-mini-extra-chip" title="${escapeHtml(att.name || '')}">
                  <i class="fas ${getFileIconClass(att.name, att.type)}"></i> ${escapeHtml(att.name || '')}
                </span>
              `).join("")}
              ${attachments.length > 3 ? `<span class="cb-mini-extra-chip">+${attachments.length - 3}</span>` : ""}
            </div>
          ` : ""}
          <div class="cb-analyzing-status-pill">
            <span class="cb-status-spinner-dot"></span>
            <span class="cb-status-label" title="${safeStatus}">${safeStatus}</span>
          </div>
          <button type="button" class="cb-analyzing-cancel-btn" title="Cancelar análisis">
            <i class="fas fa-times" aria-hidden="true"></i>
            <span>Cancelar</span>
          </button>
        </div>
      </div>
    </div>
  `;
}
