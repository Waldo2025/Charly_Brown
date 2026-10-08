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

export function getVisibleUserPrompt(message = {}) {
  const prompt = String(message?.prompt || "").trim();
  if (!prompt) return "";
  const localizedMatch = prompt.match(/Cambio solicitado:\s*([\s\S]*?)\s+Modifica exclusivamente la región señalada\./i);
  return localizedMatch?.[1]?.trim() || prompt;
}

export function formatContentWithTables(text = "") {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let currentTableLines = [];

  const flushTable = () => {
    if (currentTableLines.length >= 2) {
      const matrix = currentTableLines.map((l) =>
        l.split("|").slice(1, -1).map((c) => c.trim())
      );
      if (matrix.length >= 2) {
        const header = matrix[0];
        const dataRows = matrix.slice(2);
        const tableHtml = `
          <div class="ic-table-responsive">
            <table class="ic-markdown-table">
              <thead>
                <tr>${header.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>
              </thead>
              <tbody>
                ${dataRows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}
              </tbody>
            </table>
          </div>
        `;
        blocks.push(tableHtml);
        currentTableLines = [];
        return;
      }
    }
    if (currentTableLines.length > 0) {
      blocks.push(`<p>${currentTableLines.map(escapeHtml).join("<br>")}</p>`);
      currentTableLines = [];
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      currentTableLines.push(trimmed);
    } else {
      flushTable();
      if (trimmed.length > 0) {
        blocks.push(`<p>${escapeHtml(trimmed)}</p>`);
      }
    }
  });
  flushTable();

  return blocks.length ? blocks.join("") : `<p>${escapeHtml(text)}</p>`;
}

function renderUserMessage(message = {}) {
  const allAttachments = Array.isArray(message.attachments) ? message.attachments : [];
  const isLocalizedEdit = Boolean(message?.requestPrompt)
    || allAttachments.some((attachment) => attachment?.source === "region-markup")
    || /Referencia 2 es únicamente un mapa visual/i.test(String(message?.prompt || ""));
  const attachments = !isLocalizedEdit
    ? allAttachments.filter((attachment) => attachment?.hiddenInChat !== true)
    : [];
  const visiblePrompt = getVisibleUserPrompt(message);
  return `
    <article class="ic-message ic-message--user" data-message-id="${escapeHtml(message.id)}">
      <div class="ic-message__meta">
        <span>Tú</span>
        <time>${escapeHtml(formatRelativeDate(message.createdAt))}</time>
      </div>
      <div class="ic-message__body">
        ${formatContentWithTables(visiblePrompt)}
        ${attachments.length ? `<div class="ic-chip-row">${attachments.map(renderAttachmentChip).join("")}</div>` : ""}
      </div>
    </article>
  `;
}

function renderImageResult(result = {}, message = {}, index = 0) {
  const imageSrc = String(result?.dataUrl || result?.downloadUrl || "").trim();
  const menuId = `icResultMenu-${String(message.id || "result")}-${index}`;
  return `
    <figure class="ic-result-card" data-message-id="${escapeHtml(message.id)}" data-result-index="${index}">
      <button type="button" class="ic-result-preview" data-open-image-viewer aria-label="Abrir imagen ${index + 1} en vista ampliada">
        <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(message.prompt || "Imagen generada")}">
      </button>
      <div class="ic-result-card__tools">
        <button
          type="button"
          class="ic-result-quick-action"
          data-result-action="annotate"
          aria-label="Señalar una zona de la imagen ${index + 1}"
          title="Señalar"
        >
          <i class="fas fa-highlighter" aria-hidden="true"></i>
        </button>
        <button
          type="button"
          class="ic-result-menu-trigger"
          data-result-menu-toggle
          aria-label="Abrir herramientas de la imagen ${index + 1}"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-controls="${escapeHtml(menuId)}"
        >
          <i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>
        </button>
      </div>
      <div id="${escapeHtml(menuId)}" class="ic-result-menu hidden" data-result-menu role="menu" aria-label="Herramientas de imagen">
        <button type="button" role="menuitem" class="ic-result-menu__rich" data-result-action="download-web"><i class="fas fa-globe"></i><span><strong>Preparar para web</strong><small>WebP · máximo 1920 px</small></span></button>
        <button type="button" role="menuitem" class="ic-result-menu__rich" data-result-action="download-original"><i class="fas fa-download"></i><span><strong>Descarga original</strong><small>Resolución completa · sin metadatos</small></span></button>
        <button type="button" role="menuitem" data-result-action="variation"><i class="fas fa-shuffle"></i><span>Variar</span></button>
        <button type="button" role="menuitem" data-result-action="edit-text"><i class="fas fa-font"></i><span>Editar texto</span></button>
        <button type="button" role="menuitem" data-result-action="regenerate"><i class="fas fa-rotate-right"></i><span>Regenerar</span></button>
        <button type="button" role="menuitem" data-result-action="info"><i class="fas fa-circle-info"></i><span>Ver información</span></button>
      </div>
    </figure>
  `;
}

function renderAssistantMessage(message = {}) {
  const results = Array.isArray(message.results) ? message.results : [];
  const error = String(message.error || "").trim();
  const note = String(message.note || "").trim();
  const isPending = message?.isPending === true;
  if (results.length) {
    return `<div class="ic-result-grid" role="group" aria-label="Imágenes generadas">${results.map((result, index) => renderImageResult(result, message, index)).join("")}</div>`;
  }
  return `
    <article class="ic-message ic-message--assistant ${isPending ? "ic-message--pending" : ""}" data-message-id="${escapeHtml(message.id)}">
      <div class="ic-message__meta">
        <span>Lucy Studio</span>
        <time>${escapeHtml(formatRelativeDate(message.createdAt))}</time>
      </div>
      <div class="ic-message__body">
        ${isPending ? `
          <div class="ic-pending-preview-card" aria-live="polite" aria-busy="true">
            <div class="ic-pending-shimmer-sweep" aria-hidden="true"></div>
            <div class="ic-pending-stage">
              <div class="ic-pending-thumb-wrap">
                <img src="imagecreator/lucyStudio1.png" alt="Generando..." class="ic-pending-logo">
                <div class="ic-pending-orbital-ring" aria-hidden="true"></div>
              </div>
              <div class="ic-pending-meta">
                <strong class="ic-pending-title">Creando imagen con Lucy Studio...</strong>
                <span class="ic-pending-prompt">${escapeHtml(message.prompt || "Generando arte visual en alta resolución...")}</span>
              </div>
            </div>
          </div>
        ` : ""}
        ${message.html ? message.html : (note ? `<p class="ic-message__note">${escapeHtml(note)}</p>` : "")}
        ${error ? `<p class="ic-message__error">${escapeHtml(error)}</p>` : ""}
      </div>
    </article>
  `;
}

export function renderChatFeed(container, session = null) {
  if (!container) return;
  const messages = Array.isArray(session?.session?.messages) ? session.session.messages : [];
  if (!messages.length) {
    container.innerHTML = `
      <section class="ic-empty-state">
        <div class="ic-empty-state__icon"><i class="fas fa-images"></i></div>
        <h3>${escapeHtml(session?.title || IMAGE_CREATOR_SESSION_TITLE)}</h3>
        <p>Describe una imagen o crea guiones educativos con imágenes de referencia para Podcaster.</p>
        <div class="ic-empty-state__suggestions">
          <button type="button" class="ic-empty-suggestion" data-empty-prompt="Crea un guion educativo para Podcaster sobre el ciclo del agua">
            <i class="fa-solid fa-clapperboard"></i>
            <span>Guion de Video para Podcaster</span>
          </button>
          <button type="button" class="ic-empty-suggestion" data-empty-prompt="Ilustración 3D de un laboratorio de ciencias futurista">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <span>Ilustración 3D</span>
          </button>
        </div>
      </section>
    `;
    return;
  }
  container.innerHTML = messages.map((message) => (
    message.role === "assistant"
      ? renderAssistantMessage(message)
      : renderUserMessage(message)
  )).join("");
  const scrollToLatest = () => {
    container.scrollTop = container.scrollHeight;
  };
  scrollToLatest();
  container.querySelectorAll(".ic-result-card img").forEach((image) => {
    if (!image.complete) image.addEventListener("load", scrollToLatest, { once: true });
  });
}

export function renderAttachmentTray(container, attachments = []) {
  if (!container) return;
  if (!Array.isArray(attachments) || !attachments.length) {
    container.innerHTML = "";
    container.classList.add("hidden");
    return;
  }
  container.classList.remove("hidden");
  const cards = attachments.map((attachment, index) => {
    const isMarked = attachment?.source === "region-markup";
    const sourceLabel = isMarked ? "Zona señalada" : attachment?.source === "generated" ? "Imagen original" : "Referencia";
    return `
      <figure class="ic-attachment-card ${isMarked ? "is-marked" : ""}" data-attachment-id="${escapeHtml(attachment.id || String(index))}">
        <div class="ic-attachment-card__preview">
          <img
            src="${escapeHtml(attachment.originalDataUrl || attachment.dataUrl || "")}"
            alt="${escapeHtml(attachment.name || "referencia")}"
            title="${escapeHtml(attachment.name || "referencia")}"
          >
          <span class="ic-attachment-card__badge">${escapeHtml(sourceLabel)}</span>
        </div>
        <figcaption class="ic-attachment-card__meta">
          <span>${escapeHtml(attachment.name || "referencia")}</span>
          <button type="button" class="ic-attachment-remove" data-attachment-action="remove" data-attachment-id="${escapeHtml(attachment.id || String(index))}" aria-label="Quitar ${escapeHtml(attachment.name || "referencia")}">
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </figcaption>
      </figure>
    `;
  }).join("");
  container.innerHTML = `
    <div class="ic-attachment-tray__header">
      <div><i class="fas fa-images" aria-hidden="true"></i><strong>Referencias</strong></div>
      <span>${attachments.length}/3</span>
    </div>
    <div class="ic-attachment-tray__grid">${cards}</div>
  `;
}
