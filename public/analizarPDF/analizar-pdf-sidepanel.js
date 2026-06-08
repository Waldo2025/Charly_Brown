function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const CREATE_SESSION_ACTION = "create-session";

export function createAnalizarPdfSidepanelApi(deps = {}) {
  const {
    els,
    state,
    onCreateSession,
    onSelectSession,
    onRenameSession,
    onDeleteSession
  } = deps;

  function renderSessions() {
    const sessions = Array.isArray(state.sessions) ? state.sessions : [];
    if (!els.sessionList) return;
    if (!sessions.length) {
      els.sessionList.innerHTML = `<div class="analizar-pdf-empty-state">No hay sesiones todavía.</div>`;
      return;
    }
    els.sessionList.innerHTML = sessions.map((session) => `
      <article class="analizar-pdf-session-card${session.id === state.activeSessionId ? " is-active" : ""}" role="listitem" data-session-id="${escapeHtml(session.id)}">
        <header>
          <div>
            <h3>${escapeHtml(session.title || "Sesión sin título")}</h3>
            <small>${escapeHtml(session.analysisStatus || "idle")}</small>
          </div>
          <div class="analizar-pdf-session-card-actions">
            <button type="button" class="analizar-pdf-icon-btn" data-action="delete-session" data-session-id="${escapeHtml(session.id)}" aria-label="Eliminar sesión">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </header>
      </article>
    `).join("");
  }

  function bindEvents() {
    els.createSessionBtn?.addEventListener("click", () => {
      onCreateSession?.();
    });
    els.createSessionBtn?.setAttribute("data-action", CREATE_SESSION_ACTION);
    els.sessionList?.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("[data-action]");
      if (actionBtn) {
        const sessionId = String(actionBtn.dataset.sessionId || "").trim();
        if (actionBtn.dataset.action === "delete-session") {
          onDeleteSession?.(sessionId);
          return;
        }
      }
      const card = event.target.closest("[data-session-id]");
      if (card) {
        onSelectSession?.(String(card.dataset.sessionId || "").trim());
      }
    });
  }

  return {
    renderSessions,
    bindEvents
  };
}
