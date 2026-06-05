import { escapeHtml, formatRelativeDate } from "./dom.js";
import { IMAGE_CREATOR_SESSION_TITLE } from "./constants.js";

function renderAttachmentChip(attachment = {}) {
  return `
    <div class="ic-chip">
      <i class="fas fa-image"></i>
      <span>${escapeHtml(attachment?.name || "referencia")}</span>
    </div>
  `;
}

function renderUserMessage(message = {}) {
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  return `
    <article class="ic-message ic-message--user" data-message-id="${escapeHtml(message.id)}">
      <div class="ic-message__meta">
        <span>Tú</span>
        <time>${escapeHtml(formatRelativeDate(message.createdAt))}</time>
      </div>
      <div class="ic-message__body">
        <p>${escapeHtml(message.prompt || "")}</p>
        ${attachments.length ? `<div class="ic-chip-row">${attachments.map(renderAttachmentChip).join("")}</div>` : ""}
      </div>
    </article>
  `;
}

function renderImageResult(result = {}, message = {}, index = 0, downloadFormat = "png") {
  const imageSrc = String(result?.dataUrl || result?.downloadUrl || "").trim();
  return `
    <figure class="ic-result-card">
      <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(message.prompt || "Imagen generada")}">
      <figcaption class="ic-result-card__caption">
        <div>
          <strong>${escapeHtml(result?.model || "")}</strong>
          <span>${escapeHtml(result?.aspectRatio || "1:1")} · ${escapeHtml(result?.imageSize || "1K")}</span>
        </div>
        <div class="ic-result-card__actions">
          <button type="button" class="ic-inline-btn" data-result-action="download" data-message-id="${escapeHtml(message.id)}" data-result-index="${index}" data-download-format="${escapeHtml(downloadFormat)}">
            <i class="fas fa-download"></i>
            <span>Descargar</span>
          </button>
          <button type="button" class="ic-inline-btn" data-result-action="variation" data-message-id="${escapeHtml(message.id)}" data-result-index="${index}">
            <i class="fas fa-shuffle"></i>
            <span>Variar</span>
          </button>
        </div>
      </figcaption>
    </figure>
  `;
}

function renderAssistantMessage(message = {}, { downloadFormat = "png" } = {}) {
  const results = Array.isArray(message.results) ? message.results : [];
  const error = String(message.error || "").trim();
  const note = String(message.note || "").trim();
  const isPending = message?.isPending === true;
  return `
    <article class="ic-message ic-message--assistant ${isPending ? "ic-message--pending" : ""}" data-message-id="${escapeHtml(message.id)}">
      <div class="ic-message__meta">
        <span>Gemini</span>
        <time>${escapeHtml(formatRelativeDate(message.createdAt))}</time>
      </div>
      <div class="ic-message__body">
        ${isPending ? `
          <div class="ic-pending-row" aria-live="polite" aria-busy="true">
            <span class="ic-spinner" aria-hidden="true"></span>
            <span>Generando imagen...</span>
          </div>
        ` : ""}
        ${note ? `<p class="ic-message__note">${escapeHtml(note)}</p>` : ""}
        ${error ? `<p class="ic-message__error">${escapeHtml(error)}</p>` : ""}
        ${results.length ? `<div class="ic-result-grid">${results.map((result, index) => renderImageResult(result, message, index, downloadFormat)).join("")}</div>` : ""}
        <div class="ic-message__footer ${isPending ? "hidden" : ""}">
          <button type="button" class="ic-inline-btn" data-message-action="retry" data-message-id="${escapeHtml(message.id)}">
            <i class="fas fa-rotate-right"></i>
            <span>Reintentar</span>
          </button>
        </div>
      </div>
    </article>
  `;
}

export function renderChatFeed(container, session = null, { downloadFormat = "png" } = {}) {
  if (!container) return;
  const messages = Array.isArray(session?.session?.messages) ? session.session.messages : [];
  if (!messages.length) {
    container.innerHTML = `
      <section class="ic-empty-state">
        <div class="ic-empty-state__icon"><i class="fas fa-images"></i></div>
        <h3>${escapeHtml(session?.title || IMAGE_CREATOR_SESSION_TITLE)}</h3>
        <p>Describe una imagen, sube referencias y usa Gemini desde un chat con sesiones persistidas.</p>
      </section>
    `;
    return;
  }
  container.innerHTML = messages.map((message) => (
    message.role === "assistant"
      ? renderAssistantMessage(message, { downloadFormat })
      : renderUserMessage(message)
  )).join("");
  container.scrollTop = container.scrollHeight;
}

export function renderAttachmentTray(container, attachments = []) {
  if (!container) return;
  if (!Array.isArray(attachments) || !attachments.length) {
    container.innerHTML = "";
    container.classList.add("hidden");
    return;
  }
  container.classList.remove("hidden");
  container.innerHTML = attachments.map((attachment, index) => `
    <div class="ic-attachment-card" data-attachment-id="${escapeHtml(attachment.id || String(index))}">
      <img
        src="${escapeHtml(attachment.originalDataUrl || attachment.dataUrl || "")}"
        alt="${escapeHtml(attachment.name || "referencia")}"
        title="${escapeHtml(attachment.name || "referencia")}"
      >
      <div class="ic-attachment-card__meta">
        <span>${escapeHtml(attachment.name || "referencia")}</span>
        <button type="button" class="ic-attachment-remove" data-attachment-action="remove" data-attachment-id="${escapeHtml(attachment.id || String(index))}">
          <i class="fas fa-xmark"></i>
        </button>
      </div>
    </div>
  `).join("");
}
