import { escapeHtml } from "./dom.js";
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
    const safeId = escapeHtml(session.id);
    return `
      <article class="ic-session-card ${isActive ? "is-active" : ""}" data-session-id="${safeId}">
        <button type="button" class="ic-session-card__open" data-session-action="open" data-session-id="${safeId}" title="${escapeHtml(title)}">
          <span class="ic-session-card__title">${escapeHtml(title)}</span>
        </button>
        <button type="button" class="ic-session-menu-trigger" data-session-action="menu" data-session-id="${safeId}" aria-haspopup="menu" aria-expanded="false" aria-controls="ic-session-menu-${safeId}" aria-label="Opciones de ${escapeHtml(title)}">
          <i class="fas fa-ellipsis-vertical"></i>
        </button>
        <div id="ic-session-menu-${safeId}" class="ic-session-menu hidden" role="menu" data-session-menu="${safeId}">
          <button type="button" role="menuitem" data-session-action="rename" data-session-id="${safeId}">
            <i class="fas fa-pen"></i><span>Editar nombre</span>
          </button>
          <button type="button" role="menuitem" data-session-action="archive" data-session-id="${safeId}">
            <i class="fas ${session.archived ? "fa-box-open" : "fa-box-archive"}"></i><span>${session.archived ? "Desarchivar" : "Archivar"}</span>
          </button>
          <button type="button" role="menuitem" class="is-danger" data-session-action="delete" data-session-id="${safeId}">
            <i class="fas fa-trash"></i><span>Eliminar</span>
          </button>
        </div>
      </article>
    `;
  }).join("");
}
