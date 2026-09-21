import { escapeHtml } from "./ui-components.js";

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
  const raw = String(text || "");
  // Try sync window.marked first (may already be loaded)
  if (typeof window !== "undefined" && window.marked && typeof window.marked.parse === "function") {
    try { return window.marked.parse(raw); } catch (_) { /* fall through */ }
  }
  // Try cached instance
  if (_markedInstance && typeof _markedInstance.parse === "function") {
    try { return _markedInstance.parse(raw); } catch (_) { /* fall through */ }
  }
  // Basic fallback: preserve line breaks
  return escapeHtml(raw).replace(/\n/g, "<br>");
}

// ---------------------------------------------------------------------------
// Chat controller
// ---------------------------------------------------------------------------
export function createChatController({ root, store, onAction, onUserMessage } = {}) {
  const messagesEl = root.querySelector("#cbMessages");
  const form = root.querySelector("#cbComposer");
  const input = root.querySelector("#cbComposerInput");
  const resizeHandle = root.querySelector("#cbComposerResizeHandle");
  const specificationsModal = root.querySelector("#cbSpecificationsModal");
  const specificationsBody = root.querySelector("#cbSpecificationsModalBody");
  let transientStatusEl = null;
  let specificationsReturnFocus = null;

  const scrollToBottom = (force = false) => {
    if (!messagesEl) return;
    const threshold = 120;
    const distFromBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
    if (force || distFromBottom < threshold) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  };

  const render = (state) => {
    const messages = state.session.messages || [];
    messagesEl.innerHTML = messages.length ? messages.map(renderMessage).join("") : renderWelcome();
    scrollToBottom();
    root.querySelector("#cbActiveSessionTitle").textContent = formatSessionHeading(state.session);
  };

  store.subscribe(render);

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = String(input?.value || "").trim();
    if (!text) return;
    input.value = "";
    onUserMessage?.(text);
  });

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
    if (action === "copy") {
      navigator.clipboard?.writeText(String(message.text || "")).then(() => {
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
        <textarea rows="4" wrap="soft" aria-label="Editar pregunta">${escapeHtml(message.text || "")}</textarea>
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

  const showTransientStatus = (label = "Generando...") => {
    if (!messagesEl) return;
    clearTransientStatus();
    transientStatusEl = document.createElement("article");
    transientStatusEl.className = "cb-message cb-message--assistant cb-message--transient";
    transientStatusEl.setAttribute("data-transient-status", "true");
    transientStatusEl.innerHTML = `<div class="cb-message-bubble">${renderWorkingStatus(label)}</div>`;
    messagesEl.appendChild(transientStatusEl);
    scrollToBottom(true);
  };

  const clearTransientStatus = () => {
    transientStatusEl?.remove();
    transientStatusEl = null;
  };

  return { render, showTransientStatus, clearTransientStatus, scrollToBottom };
}

function formatSessionHeading(session = {}) {
  const activeUnit = (session.units || []).find((unit) => unit.id === session.activeUnitId);
  const title = String(activeUnit?.title || "Nueva unidad").trim();
  const unit = String(session.meta?.unit || "").trim();
  if (!unit || title === "Nueva unidad") return title;

  const unitLabel = unit.toLowerCase() === "proyecto" ? "Proyecto" : `Unidad ${unit}`;
  return title.toLocaleLowerCase("es").startsWith(unitLabel.toLocaleLowerCase("es"))
    ? title
    : `${unitLabel} · ${title}`;
}

// ---------------------------------------------------------------------------
// Proposal message renderer
// ---------------------------------------------------------------------------
function renderProposalToolbarButton({ action, label, icon, resource = false } = {}) {
  const actionAttribute = resource ? "data-resource-proposal-action" : "data-proposal-action";
  return `<button type="button" ${actionAttribute}="${escapeHtml(action)}" aria-label="${escapeHtml(label)}"><i class="${escapeHtml(icon)}" aria-hidden="true"></i><span class="cb-proposal-tooltip" role="tooltip">${escapeHtml(label)}</span></button>`;
}

export function renderProposalMessage({ id = "", title = "", html = "", validation = null, contentType = "activity", citations = [], readingStage = "reading" } = {}) {
  const valid = validation?.ok !== false;
  const isProject = /proyecto/i.test(String(title || ""));
  const isReading = contentType === "reading";
  const readingLabel = readingStage === "synonyms" ? "Sinónimos" : readingStage === "comprehension" ? "Comprensión" : "Lectura";
  const acceptLabel = isReading ? `Aprobar ${readingLabel.toLowerCase()}` : isProject ? "Aceptar proyecto" : "Aceptar actividades";
  const parts = splitProposalHtml(html);
  return `
    <div class="cb-proposal" data-proposal-id="${escapeHtml(id)}">
      <h3>${escapeHtml(title || "Propuesta")}</h3>
      ${valid ? "" : `<p class="cb-warning">La estructura necesita corrección: ${escapeHtml((validation?.errors || []).join(", "))}</p>`}
      <details class="cb-proposal-part cb-proposal-part--activities" open>
        <summary class="cb-proposal-summary">
          <p class="cb-panel-kicker">${isReading ? readingLabel : "Actividades"}</p>
        </summary>
        <div class="cb-proposal-html">${parts.activitiesHtml || html || ""}</div>
        ${renderCitations(citations)}
        <div class="cb-proposal-actions" role="toolbar" aria-label="Acciones de la propuesta" aria-orientation="horizontal">
          ${renderProposalToolbarButton({ action: "accept", label: acceptLabel, icon: "fas fa-check" })}
          ${renderProposalToolbarButton({ action: "reject", label: "No usar", icon: "fas fa-xmark" })}
          ${isReading ? "" : `${renderProposalToolbarButton({ action: "regenerate", label: "Regenerar la actividad", icon: "fas fa-rotate-right" })}
          ${renderProposalToolbarButton({ action: "easier", label: isProject ? "Simplificar proyecto" : "Hacer más fácil", icon: "fas fa-arrow-down-short-wide" })}
          ${renderProposalToolbarButton({ action: "harder", label: isProject ? "Hacer proyecto más retador" : "Hacer más difícil", icon: "fas fa-arrow-up-short-wide" })}
          ${renderProposalToolbarButton({ action: "teacher-notes", label: isProject ? "Notas del proyecto" : "Crear notas del maestro", icon: "fas fa-pen-nib" })}`}
        </div>
      </details>
      ${parts.resources.length ? `
        <div class="cb-proposal-part cb-proposal-part--resources">
          <p class="cb-panel-kicker">Materiales</p>
          <div class="cb-proposal-resources">
            ${parts.resources.map((resource, index) => `
              <details class="cb-approved-card cb-resource-card" data-resource-proposal-index="${index}">
                <summary class="cb-proposal-summary">
                  <div class="cb-approved-card-head">
                    <strong>${escapeHtml(resource.title || resource.code || "Recurso")}</strong>
                    <div class="cb-resource-chip">${escapeHtml(resource.code || resource.type || "Recurso")}</div>
                  </div>
                </summary>
                <div class="cb-approved-html">${resource.html || ""}</div>
                <div class="cb-proposal-actions cb-proposal-actions--resource" role="toolbar" aria-label="Acciones del recurso" aria-orientation="horizontal">
                  ${renderProposalToolbarButton({ action: "accept", label: "Aprobar recurso", icon: "fas fa-check", resource: true })}
                  ${renderProposalToolbarButton({ action: "reject", label: "No usar", icon: "fas fa-xmark", resource: true })}
                </div>
              </details>
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
  const resources = Array.from(doc.querySelectorAll("[data-resource-type], [data-resource-section='true'], .resource-ficha, .resource-anexo, .resource-recortable, .resource-video, .guion-video")).map((node) => {
    const type = String(node.getAttribute("data-resource-type") || "").trim();
    const title = String(node.querySelector("h1,h2,h3,h4,strong")?.textContent || node.textContent || "").trim();
    return {
      type,
      title,
      code: title || type || "Recurso",
      html: node.outerHTML
    };
  });
  resources.forEach((node) => node.remove?.());
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

function renderMessage(message = {}) {
  const html = normalizeProposalToolbarIcons(message.html);

  if (message.role === "user") {
    return `
      <article class="cb-message cb-message--user" data-message-id="${escapeHtml(message.id || "")}">
        <div class="cb-message-bubble cb-message-bubble--question">
          <div class="cb-message-question-text">${escapeHtml(message.text || "")}</div>
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

function renderWorkingStatus() {
  const label = "Respondiendo";
  return `
    <div class="cb-working-status" aria-live="polite" aria-label="${label}">
      <span class="cb-working-label">${label}</span>
      <span class="cb-working-dots" aria-hidden="true">
        <span></span><span></span><span></span>
      </span>
    </div>
  `;
}
