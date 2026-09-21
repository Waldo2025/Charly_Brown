function formatSessionDate(value = "") {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function createPodcasterAdminSessionBrowser(deps = {}) {
  const {
    els,
    state,
    sessionStore,
    escapeHtml,
    isCurrentUserAdmin,
    resolveCurrentUid,
    setActiveSession,
    persistSessions,
    setGenerationStatus,
    addChatMessage
  } = deps;

  let usersLoaded = false;
  let lastFocusedElement = null;
  let requestToken = 0;

  function syncVisibility() {
    const visible = isCurrentUserAdmin?.() === true;
    if (els.openAdminUserVideosBtn) {
      els.openAdminUserVideosBtn.hidden = !visible;
      els.openAdminUserVideosBtn.disabled = !visible;
      els.openAdminUserVideosBtn.setAttribute?.("aria-hidden", String(!visible));
      if (visible) els.openAdminUserVideosBtn.removeAttribute?.("tabindex");
      else els.openAdminUserVideosBtn.setAttribute?.("tabindex", "-1");
    }
    if (!visible && els.adminUserVideosModal?.hidden === false) close();
  }

  function setStatus(message = "", tone = "") {
    if (!els.adminUserVideosStatus) return;
    els.adminUserVideosStatus.textContent = String(message || "");
    els.adminUserVideosStatus.classList.toggle("is-error", tone === "error");
  }

  function renderSessions(sessions = []) {
    if (!els.adminUserVideosList) return;
    if (!sessions.length) {
      els.adminUserVideosList.innerHTML = '<div class="session-list-empty">Este usuario no tiene sesiones de video.</div>';
      return;
    }
    els.adminUserVideosList.innerHTML = sessions.map((session) => `
      <article class="admin-user-video-item" role="listitem">
        <div class="admin-user-video-copy">
          <strong class="admin-user-video-title" title="${escapeHtml(session.title || "Sesión sin título")}">${escapeHtml(session.title || "Sesión sin título")}</strong>
          <span class="admin-user-video-meta">
            <span>${escapeHtml(formatSessionDate(session.updatedAt))}</span>
            ${session.archived === true ? '<span class="admin-user-video-archived"><i class="fas fa-box-archive" aria-hidden="true"></i>Archivada</span>' : ""}
          </span>
        </div>
        <button class="admin-user-video-open-btn" type="button" data-action="open-admin-user-video"
          data-session-id="${escapeHtml(session.id)}" title="Abrir en el editor"
          aria-label="Abrir ${escapeHtml(session.title || "sesión")} en el editor">
          <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
        </button>
      </article>
    `).join("");
  }

  async function loadUsers() {
    const token = ++requestToken;
    setStatus("Cargando usuarios...");
    if (els.adminUserVideosSelect) els.adminUserVideosSelect.disabled = true;
    try {
      const users = await sessionStore.listAdminUsers();
      if (token !== requestToken) return;
      if (els.adminUserVideosSelect) {
        els.adminUserVideosSelect.innerHTML = [
          '<option value="">Selecciona un usuario</option>',
          ...users.map((user) => {
            const label = user.email && user.email !== user.displayName
              ? `${user.displayName} · ${user.email}`
              : user.displayName;
            return `<option value="${escapeHtml(user.uid)}">${escapeHtml(label)}</option>`;
          })
        ].join("");
        els.adminUserVideosSelect.disabled = false;
      }
      usersLoaded = true;
      setStatus(users.length ? "Selecciona un usuario para consultar sus videos." : "No hay otros usuarios disponibles.");
    } catch (error) {
      if (token !== requestToken) return;
      setStatus(error?.message || "No se pudieron cargar los usuarios.", "error");
    }
  }

  async function loadUserSessions(ownerId = "") {
    const owner = String(ownerId || "").trim();
    const token = ++requestToken;
    renderSessions([]);
    if (!owner) {
      setStatus("Selecciona un usuario para consultar sus videos.");
      if (els.adminUserVideosList) els.adminUserVideosList.innerHTML = "";
      return;
    }
    setStatus("Cargando sesiones de video...");
    try {
      const sessions = await sessionStore.listAdminVideoSessions(owner);
      if (token !== requestToken) return;
      renderSessions(sessions);
      setStatus(`${sessions.length} ${sessions.length === 1 ? "sesión de video" : "sesiones de video"}. Las archivadas también pueden editarse como administrador.`);
    } catch (error) {
      if (token !== requestToken) return;
      if (els.adminUserVideosList) els.adminUserVideosList.innerHTML = "";
      setStatus(error?.message || "No se pudieron cargar las sesiones.", "error");
    }
  }

  async function openSession(sessionId = "") {
    const key = String(sessionId || "").trim();
    if (!key || isCurrentUserAdmin?.() !== true) return;
    setStatus("Abriendo sesión en el editor...");
    try {
      const session = await sessionStore.loadSingleSessionFromCloud(key, resolveCurrentUid?.());
      if (!session) throw new Error("No se encontró la sesión seleccionada.");
      const currentIndex = state.sessions.findIndex((item) => String(item?.id || "").trim() === key);
      if (currentIndex >= 0) state.sessions.splice(currentIndex, 1, session);
      else state.sessions.unshift(session);
      persistSessions?.();
      close({ restoreFocus: false });
      await setActiveSession(key, { forceHydrate: false });
      setGenerationStatus?.(session.archived === true ? "Sesión archivada abierta como administrador" : "Sesión de otro usuario abierta", "is-live");
    } catch (error) {
      setStatus(error?.message || "No se pudo abrir la sesión.", "error");
      addChatMessage?.("system", `No se pudo abrir la sesión seleccionada (${error?.message || "error desconocido"}).`);
    }
  }

  function open() {
    if (isCurrentUserAdmin?.() !== true || !els.adminUserVideosModal) return;
    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    els.adminUserVideosModal.hidden = false;
    if (!usersLoaded) void loadUsers();
    requestAnimationFrame(() => els.adminUserVideosSelect?.focus());
  }

  function close(options = {}) {
    requestToken += 1;
    if (els.adminUserVideosModal) els.adminUserVideosModal.hidden = true;
    if (options.restoreFocus !== false) (lastFocusedElement || els.openAdminUserVideosBtn)?.focus?.();
  }

  function bindEvents() {
    if (!els.openAdminUserVideosBtn || els.openAdminUserVideosBtn.dataset.adminBrowserBound === "true") return;
    els.openAdminUserVideosBtn.dataset.adminBrowserBound = "true";
    els.openAdminUserVideosBtn.addEventListener("click", open);
    els.closeAdminUserVideosBtn?.addEventListener("click", () => close());
    els.adminUserVideosModal?.addEventListener("click", (event) => {
      if (event.target.closest("[data-action='close-admin-user-videos-modal']")) close();
      const openButton = event.target.closest("[data-action='open-admin-user-video']");
      if (openButton) void openSession(openButton.dataset.sessionId);
    });
    els.adminUserVideosSelect?.addEventListener("change", (event) => void loadUserSessions(event.target.value));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && els.adminUserVideosModal?.hidden === false) {
        event.preventDefault();
        close();
      }
    });
    syncVisibility();
  }

  return { bindEvents, syncVisibility, open, close };
}
