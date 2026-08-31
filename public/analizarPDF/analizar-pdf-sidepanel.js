function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const CREATE_SESSION_ACTION = "create-session";
const SIDEPANEL_WIDTH_STORAGE_KEY = "cb_analizar_pdf_sidepanel_width";
const DEFAULT_SIDEPANEL_WIDTH = 240;
const MIN_SIDEPANEL_WIDTH = 180;
const MAX_SIDEPANEL_WIDTH = 460;

export function createAnalizarPdfSidepanelApi(deps = {}) {
  const {
    els,
    state,
    onCreateSession,
    onSelectSession,
    onRenameSession,
    onDeleteSession
  } = deps;

  function canResize() {
    return typeof window !== "undefined" && window.matchMedia("(min-width: 981px)").matches;
  }

  function getWidthBounds() {
    const maxViewportWidth = typeof window === "undefined" ? MAX_SIDEPANEL_WIDTH : Math.round(window.innerWidth * 0.45);
    return { min: MIN_SIDEPANEL_WIDTH, max: Math.max(MIN_SIDEPANEL_WIDTH, Math.min(MAX_SIDEPANEL_WIDTH, maxViewportWidth)) };
  }

  function setSidepanelWidth(value, persist = true) {
    const layout = document.querySelector("#analizarPdfLayout");
    if (!layout) return;
    const { min, max } = getWidthBounds();
    const width = Math.max(min, Math.min(max, Math.round(Number(value) || min)));
    layout.style.setProperty("--ap-left-panel-width", `${width}px`);
    if (persist) window.localStorage.setItem(SIDEPANEL_WIDTH_STORAGE_KEY, String(width));
  }

  function bindResizer() {
    const resizer = document.querySelector("[data-action='resize-sidepanel']");
    if (!resizer) return;
    const savedWidth = Number(window.localStorage.getItem(SIDEPANEL_WIDTH_STORAGE_KEY));
    if (savedWidth) setSidepanelWidth(savedWidth, false);
    resizer.addEventListener("pointerdown", (event) => {
      if (!canResize()) return;
      event.preventDefault();
      const layout = document.querySelector("#analizarPdfLayout");
      const startWidth = Number.parseFloat(getComputedStyle(layout).getPropertyValue("--ap-left-panel-width")) || DEFAULT_SIDEPANEL_WIDTH;
      const startX = Number(event.clientX || 0);
      resizer.classList.add("is-dragging");
      document.body.classList.add("analizar-pdf-sidepanel-resizing");
      resizer.setPointerCapture?.(event.pointerId);
      const onMove = (moveEvent) => setSidepanelWidth(startWidth + Number(moveEvent.clientX || 0) - startX);
      const finish = () => {
        resizer.classList.remove("is-dragging");
        document.body.classList.remove("analizar-pdf-sidepanel-resizing");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    });
    resizer.addEventListener("dblclick", (event) => {
      if (!canResize()) return;
      event.preventDefault();
      setSidepanelWidth(DEFAULT_SIDEPANEL_WIDTH);
    });
    resizer.setAttribute("title", "Doble clic para restaurar el ancho");
    resizer.addEventListener("keydown", (event) => {
      if (!canResize() || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const layout = document.querySelector("#analizarPdfLayout");
      const current = Number.parseFloat(getComputedStyle(layout).getPropertyValue("--ap-left-panel-width")) || DEFAULT_SIDEPANEL_WIDTH;
      setSidepanelWidth(current + (event.key === "ArrowRight" ? 16 : -16));
    });
  }

  function renderSessions() {
    const sessions = Array.isArray(state.sessions) ? state.sessions : [];
    if (!els.sessionList) return;
    if (!sessions.length) {
      els.sessionList.innerHTML = `<div class="analizar-pdf-empty-state">No hay sesiones todavía.</div>`;
      renderSessionSearchResults();
      return;
    }
    els.sessionList.innerHTML = sessions.map((session) => `
      <article class="analizar-pdf-session-card${session.id === state.activeSessionId ? " is-active" : ""}" role="listitem" data-session-id="${escapeHtml(session.id)}">
        <header>
          <div>
            <h3>${escapeHtml(session.title || "Sesión sin título")}</h3>
          </div>
          <button
            type="button"
            class="analizar-pdf-session-delete-btn"
            data-action="delete-session"
            data-session-id="${escapeHtml(session.id)}"
            data-tooltip="Eliminar sesión"
            aria-label="Eliminar sesión"
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </header>
      </article>
    `).join("");
    renderSessionSearchResults();
  }

  function normalizeSearchText(value = "") {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es")
      .trim();
  }

  function renderSessionSearchResults() {
    if (!els.sessionSearchResults || els.sessionSearchModal?.hidden) return;
    const query = normalizeSearchText(els.sessionSearchInput?.value);
    const sessions = (Array.isArray(state.sessions) ? state.sessions : []).filter((session) => (
      !query || normalizeSearchText(session?.title || "Sesión sin título").includes(query)
    ));
    if (!sessions.length) {
      els.sessionSearchResults.innerHTML = `<div class="analizar-pdf-session-search-empty">No se encontraron sesiones.</div>`;
      return;
    }
    els.sessionSearchResults.innerHTML = sessions.map((session) => {
      const revisionCount = Array.isArray(session?.revisions) ? session.revisions.length : 0;
      const isActive = session.id === state.activeSessionId;
      return `
        <button
          type="button"
          class="analizar-pdf-session-search-result${isActive ? " is-active" : ""}"
          data-action="select-search-session"
          data-session-id="${escapeHtml(session.id)}"
          role="option"
          aria-selected="${isActive ? "true" : "false"}"
        >
          <span class="analizar-pdf-session-search-dot" aria-hidden="true"></span>
          <span class="analizar-pdf-session-search-result-title">${escapeHtml(session.title || "Sesión sin título")}</span>
          <span class="analizar-pdf-session-search-result-meta">${revisionCount} ${revisionCount === 1 ? "ficha" : "fichas"}</span>
        </button>
      `;
    }).join("");
  }

  function openSessionSearch() {
    if (!els.sessionSearchModal || !els.sessionSearchInput) return;
    els.sessionSearchModal.hidden = false;
    els.sessionSearchInput.value = "";
    renderSessionSearchResults();
    window.requestAnimationFrame(() => els.sessionSearchInput?.focus({ preventScroll: true }));
  }

  function closeSessionSearch() {
    if (!els.sessionSearchModal || els.sessionSearchModal.hidden) return;
    els.sessionSearchModal.hidden = true;
    els.sessionSearchBtn?.focus({ preventScroll: true });
  }

  function bindEvents() {
    bindResizer();
    els.createSessionBtn?.addEventListener("click", () => {
      onCreateSession?.();
    });
    els.createSessionBtn?.setAttribute("data-action", CREATE_SESSION_ACTION);
    els.sessionSearchBtn?.addEventListener("click", openSessionSearch);
    els.sessionSearchInput?.addEventListener("input", renderSessionSearchResults);
    els.sessionSearchInput?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSessionSearch();
        return;
      }
      if (event.key !== "Enter") return;
      const firstResult = els.sessionSearchResults?.querySelector('[data-action="select-search-session"]');
      if (!firstResult) return;
      event.preventDefault();
      onSelectSession?.(String(firstResult.dataset.sessionId || "").trim());
      closeSessionSearch();
    });
    els.sessionSearchModal?.addEventListener("click", (event) => {
      if (event.target.closest('[data-action="close-session-search"]')) {
        closeSessionSearch();
        return;
      }
      const result = event.target.closest('[data-action="select-search-session"]');
      if (!result) return;
      onSelectSession?.(String(result.dataset.sessionId || "").trim());
      closeSessionSearch();
    });
    els.sessionSearchModal?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeSessionSearch();
    });
    els.sessionList?.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("[data-action]");
      if (actionBtn) {
        const sessionId = String(actionBtn.dataset.sessionId || "").trim();
        if (actionBtn.dataset.action === "delete-session") {
          event.stopPropagation();
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
