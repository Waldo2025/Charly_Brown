import { escapeHtml, formatRelativeDate } from "./dom.js";
import { IMAGE_CREATOR_SESSION_TITLE } from "./constants.js";

export function renderSessionList(container, sessions = [], activeSessionId = "") {
  if (!container) return;
  if (!Array.isArray(sessions) || !sessions.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = sessions.map((session) => {
    const isActive = String(session?.id || "") === String(activeSessionId || "");
    const title = String(session?.title || IMAGE_CREATOR_SESSION_TITLE).trim() || IMAGE_CREATOR_SESSION_TITLE;
    const updatedAt = session?.updatedAt?.toDate ? session.updatedAt.toDate() : (session?.updatedAt || session?.createdAt || null);
    return `
      <article class="ic-session-card ${isActive ? "is-active" : ""}" data-session-id="${escapeHtml(session.id)}">
        <button type="button" class="ic-session-card__open" data-session-action="open" data-session-id="${escapeHtml(session.id)}">
          <span class="ic-session-card__title">${escapeHtml(title)}</span>
          <span class="ic-session-card__meta">${escapeHtml(formatRelativeDate(updatedAt))}</span>
        </button>
        <div class="ic-session-card__actions">
          <button type="button" class="ic-session-mini-btn" data-session-action="rename" data-session-id="${escapeHtml(session.id)}" title="Renombrar">
            <i class="fas fa-pen"></i>
          </button>
          <button type="button" class="ic-session-mini-btn" data-session-action="archive" data-session-id="${escapeHtml(session.id)}" title="${session.archived ? "Desarchivar" : "Archivar"}">
            <i class="fas fa-box-archive"></i>
          </button>
          <button type="button" class="ic-session-mini-btn is-danger" data-session-action="delete" data-session-id="${escapeHtml(session.id)}" title="Eliminar">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </article>
    `;
  }).join("");
}
