export function createPodcasterSessionRailApi(deps = {}) {
  const {
    state,
    els,
    escapeHtml,
    nowIso,
    getSessionRows,
    resolveActiveVisualProposal,
    isVisualProposalResolved,
    resolveVideoContentType,
    playbackController,
    createSession,
    resetPodcastStudioSessionUiState,
    persistSessions,
    render,
    setActiveSession,
    getActiveSession,
    normalizeSessionTitle,
    ensureSession,
    deleteSessionFromCloud,
    addChatMessage,
    setGenerationStatus,
    resolveCurrentUid,
    markDeletedSessionId,
    purgeSessionFromAllStorage,
    getSessionAcademicMetadata,
    normalizeSessionAcademicField,
    SESSION_ACADEMIC_LEVEL_OPTIONS,
    SESSION_ACADEMIC_GRADE_OPTIONS,
    SESSION_ACADEMIC_TERM_OPTIONS,
    SESSION_ACADEMIC_UNIT_OPTIONS,
    upsertSessionById,
    updateDoc,
    doc,
    firestoreDb,
    serverTimestamp,
    shareSessionWithUser
  } = deps;

  function ensureSessionThreadsForRail(session = null) {
    if (!session) return [];
    if ((!Array.isArray(session.threads) || session.threads.length === 0) && window.PodcasterThreads) {
      window.PodcasterThreads.syncActiveThreadToSession(session);
    }
    return Array.isArray(session.threads) ? session.threads : [];
  }

  function getExpandedSessionIds() {
    if (!Array.isArray(state.expandedSessionIds)) {
      state.expandedSessionIds = [];
    }
    return state.expandedSessionIds;
  }

  function isSessionExpanded(sessionId) {
    const cleanSessionId = String(sessionId || "").trim();
    if (!cleanSessionId) return false;
    return getExpandedSessionIds().includes(cleanSessionId);
  }

  function expandSession(sessionId) {
    const cleanSessionId = String(sessionId || "").trim();
    if (!cleanSessionId) return;
    if (!isSessionExpanded(cleanSessionId)) {
      state.expandedSessionIds = [...getExpandedSessionIds(), cleanSessionId];
    }
  }

  function collapseSession(sessionId) {
    const cleanSessionId = String(sessionId || "").trim();
    if (!cleanSessionId) return;
    state.expandedSessionIds = getExpandedSessionIds().filter((id) => id !== cleanSessionId);
  }

  function sessionHasPendingProposal(session = null) {
    const rows = getSessionRows(session);
    return rows.some((row) => {
      const activeProposal = resolveActiveVisualProposal(row);
      if (!activeProposal) return false;
      return !isVisualProposalResolved(row, activeProposal);
    });
  }

  function sessionHasOnlyReviewedProposals(session = null) {
    const rows = getSessionRows(session);
    let hasAnyProposal = false;
    for (const row of rows) {
      const proposals = Array.isArray(row?.visualNotesProposals)
        ? row.visualNotesProposals.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [];
      const explicitProposal = String(row?.visualNotesProposal || "").trim();
      const proposalPool = Array.from(new Set([...proposals, explicitProposal].filter(Boolean)));
      if (!proposalPool.length) continue;
      hasAnyProposal = true;
      const hasPending = proposalPool.some((proposalText) => !isVisualProposalResolved(row, proposalText));
      if (hasPending) return false;
    }
    return hasAnyProposal;
  }

  function renderSessionThreadList(session = null) {
    const threads = ensureSessionThreadsForRail(session);
    if (!threads.length) return "";
    return `
      <div class="session-thread-list" role="list" aria-label="Chats de la sesión">
        ${threads.map((thread, index) => {
          const isActiveThread = thread.id === session.activeThreadId;
          const isPublishedThread = session?.publicar === true && isActiveThread;
          return `
            <button
              class="session-thread-item${isActiveThread ? " is-active" : ""}"
              type="button"
              role="listitem"
              data-action="open-session-thread"
              data-session-id="${escapeHtml(session.id)}"
              data-thread-id="${escapeHtml(thread.id)}"
              aria-pressed="${isActiveThread ? "true" : "false"}"
            >
              <span class="session-thread-title-row">
                <span class="session-thread-title">${escapeHtml(thread.name || `Chat ${index + 1}`)}</span>
                ${isPublishedThread ? `<span class="session-thread-published-badge" aria-label="Versión publicada" title="Versión publicada"><i class="fas fa-check"></i></span>` : ""}
              </span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function getSessionRailFilterValue(value = "") {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "video" || normalized === "podcast") return normalized;
    return "all";
  }

  function getSessionRailType(session = null) {
    const uiMode = String(session?.podcastStudioUiState?.composerGenerationMode || "").trim().toLowerCase();
    if (uiMode === "video") return "video";
    if (uiMode === "script" || uiMode === "podcast") return "podcast";
    const resolvedVideoType = resolveVideoContentType(session, { assumeVideoPodcast: false });
    if (resolvedVideoType === "creative") return "video";
    return "podcast";
  }

  function syncFilterUi() {
    if (!els.sessionsRailFilter) return;
    const activeFilter = getSessionRailFilterValue(state.sessionRailFilter);
    els.sessionsRailFilter.querySelectorAll("[data-filter]").forEach((button) => {
      const filter = getSessionRailFilterValue(button.dataset.filter);
      const isActive = filter === activeFilter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function syncArchivedToggleUi() {
    if (!els.toggleArchivedSessionsBtn) return;
    const isActive = state.showArchivedSessions === true;
    els.toggleArchivedSessionsBtn.classList.toggle("is-active", isActive);
    els.toggleArchivedSessionsBtn.setAttribute("aria-pressed", isActive ? "true" : "false");
    els.toggleArchivedSessionsBtn.setAttribute("title", isActive ? "Ver sesiones activas" : "Ver sesiones archivadas");
    els.toggleArchivedSessionsBtn.setAttribute("aria-label", isActive ? "Ver sesiones activas" : "Ver sesiones archivadas");
  }

  function renderSessions() {
    const activeId = state.activeSessionId;
    const activeFilter = getSessionRailFilterValue(state.sessionRailFilter);
    const showArchived = state.showArchivedSessions === true;
    const visibleSessions = state.sessions.filter((session) => {
      const isArchived = session.archived === true;
      if (showArchived !== isArchived) return false;
      if (activeFilter === "all") return true;
      return getSessionRailType(session) === activeFilter;
    });
    els.sessionList.classList.toggle("is-archived-view", showArchived);
    els.sessionList.innerHTML = visibleSessions.map((session) => `
      <article class="session-card${session.id === activeId ? " is-active" : ""}" data-action="open-session" data-session-id="${escapeHtml(session.id)}" tabindex="0" role="button" aria-pressed="${session.id === activeId ? "true" : "false"}" aria-expanded="${isSessionExpanded(session.id) ? "true" : "false"}">
        <div class="session-card-header${sessionHasPendingProposal(session) ? " has-pending-proposal" : sessionHasOnlyReviewedProposals(session) ? " has-reviewed-proposals" : ""}">
          <span class="session-card-title">
            <i class="far fa-folder session-card-folder-icon" aria-hidden="true"></i>
            <strong>${escapeHtml(session.title || "Sesión sin título")}</strong>
          </span>
          <div class="session-card-menu">
            <button class="session-menu-btn" type="button" data-action="toggle-session-menu" data-session-id="${escapeHtml(session.id)}" aria-label="Más opciones" aria-expanded="false">
              <i class="fas fa-ellipsis-v"></i>
            </button>
            <div class="session-menu" hidden>
              <button type="button" data-action="new-session-chat" data-session-id="${escapeHtml(session.id)}">Nuevo chat</button>
              <button type="button" data-action="rename-session" data-session-id="${escapeHtml(session.id)}">Editar nombre</button>
              <button type="button" data-action="assign-session-data" data-session-id="${escapeHtml(session.id)}">Asignar datos</button>
              <button type="button" data-action="share-session" data-session-id="${escapeHtml(session.id)}">Compartir sesión</button>
              <button type="button" data-action="${session.archived === true ? "restore-session" : "archive-session"}" data-session-id="${escapeHtml(session.id)}">${session.archived === true ? "Desarchivar" : "Archivar"}</button>
              <button type="button" data-action="delete-session" data-session-id="${escapeHtml(session.id)}">Eliminar</button>
            </div>
          </div>
        </div>
        ${isSessionExpanded(session.id) ? renderSessionThreadList(session) : ""}
      </article>
    `).join("") || `<div class="session-list-empty">${showArchived ? "No hay sesiones archivadas." : "No hay sesiones activas."}</div>`;
    syncFilterUi();
    syncArchivedToggleUi();
  }

  function closeMenus() {
    els.sessionList.querySelectorAll(".session-menu").forEach((menu) => {
      menu.hidden = true;
    });
    els.sessionList.querySelectorAll(".session-menu-btn").forEach((btn) => {
      btn.setAttribute("aria-expanded", "false");
    });
  }

  function createAndOpenSession() {
    playbackController.stop({ keepStatus: true });
    const session = createSession({ title: "Nueva sesión" });
    state.sessions.unshift(session);
    state.activeSessionId = session.id;
    expandSession(session.id);
    resetPodcastStudioSessionUiState(session);
    persistSessions();
    render();
  }

  async function createSessionChat(sessionId) {
    const cleanSessionId = String(sessionId || "").trim();
    if (!cleanSessionId || !window.PodcasterThreads?.createNewThread) return;
    if (state.activeSessionId !== cleanSessionId) {
      expandSession(cleanSessionId);
      await setActiveSession(cleanSessionId);
    }
    const session = getActiveSession();
    if (!session) return;
    window.PodcasterThreads.createNewThread(session);
    state.activeSessionId = cleanSessionId;
    expandSession(cleanSessionId);
    resetPodcastStudioSessionUiState(session);
    persistSessions();
    render();
  }

  async function openSessionThread(sessionId, threadId) {
    const cleanSessionId = String(sessionId || "").trim();
    const cleanThreadId = String(threadId || "").trim();
    if (!cleanSessionId || !cleanThreadId || !window.PodcasterThreads?.switchThread) return;
    if (state.activeSessionId !== cleanSessionId) {
      expandSession(cleanSessionId);
      await setActiveSession(cleanSessionId);
    }
    const session = getActiveSession();
    if (!session) return;
    const changed = window.PodcasterThreads.switchThread(session, cleanThreadId);
    if (!changed) return;
    expandSession(cleanSessionId);
    resetPodcastStudioSessionUiState(session);
    persistSessions();
    render();
  }

  async function toggleOrOpenSession(sessionId) {
    const cleanSessionId = String(sessionId || "").trim();
    if (!cleanSessionId) return;
    if (state.activeSessionId === cleanSessionId) {
      if (isSessionExpanded(cleanSessionId)) collapseSession(cleanSessionId);
      else expandSession(cleanSessionId);
      render();
      return;
    }
    expandSession(cleanSessionId);
    await setActiveSession(cleanSessionId);
  }

  function renameSession(sessionId) {
    const session = state.sessions.find((item) => item.id === sessionId);
    if (!session) return;
    const nextTitle = window.prompt("Editar nombre de la sesión", session.title || "Nueva sesión");
    if (nextTitle === null) return;
    const normalizedTitle = normalizeSessionTitle(nextTitle);
    state.sessions = state.sessions.map((item) => (
      item.id === sessionId
        ? { ...item, title: normalizedTitle, updatedAt: nowIso() }
        : item
    ));
    persistSessions();
    render();
  }

  function archiveSession(sessionId) {
    state.sessions = state.sessions.map((session) => (
      session.id === sessionId
        ? { ...session, archived: true, updatedAt: nowIso() }
        : session
    ));
    if (state.activeSessionId === sessionId) {
      const nextVisible = state.sessions.find((session) => session.archived !== true);
      state.activeSessionId = nextVisible?.id || null;
      if (state.activeSessionId) expandSession(state.activeSessionId);
    }
    ensureSession();
    persistSessions();
    render();
  }

  function restoreSession(sessionId) {
    state.sessions = state.sessions.map((session) => (
      session.id === sessionId
        ? { ...session, archived: false, updatedAt: nowIso() }
        : session
    ));
    persistSessions();
    render();
  }

  async function deleteSession(sessionId) {
    const cleanId = String(sessionId || "").trim();
    if (!cleanId) return;
    const targetSession = state.sessions.find((session) => String(session?.id || "").trim() === cleanId) || null;
    const confirmed = window.confirm("Se eliminará la sesión de la lista y de la nube. ¿Deseas continuar?");
    if (!confirmed) return;
    try {
      await deleteSessionFromCloud(cleanId);
    } catch (error) {
      addChatMessage("system", `No se pudo eliminar la sesión (${error.message}).`);
      setGenerationStatus("Error", "");
      return;
    }
    const storageUid = String(resolveCurrentUid() || targetSession?.cloudMeta?.ownerId || "").trim();
    markDeletedSessionId(storageUid, cleanId);
    purgeSessionFromAllStorage(cleanId, storageUid);
    state.sessions = state.sessions.filter((session) => session.id !== cleanId);
    if (state.activeSessionId === cleanId) {
      const nextVisible = state.sessions.find((session) => session.archived !== true);
      state.activeSessionId = nextVisible?.id || null;
      if (state.activeSessionId) expandSession(state.activeSessionId);
    }
    ensureSession();
    persistSessions();
    render();
  }

  function bindEvents() {
    if (els.sessionsRailFilter && els.sessionsRailFilter.dataset.sessionRailBound !== "true") {
      els.sessionsRailFilter.dataset.sessionRailBound = "true";
      els.sessionsRailFilter.addEventListener("click", (event) => {
        const button = event.target.closest("[data-filter]");
        if (!button) return;
        const nextFilter = getSessionRailFilterValue(button.dataset.filter);
        if (nextFilter === state.sessionRailFilter) return;
        state.sessionRailFilter = nextFilter;
        renderSessions();
      });
    }

    if (els.toggleArchivedSessionsBtn && els.toggleArchivedSessionsBtn.dataset.sessionRailBound !== "true") {
      els.toggleArchivedSessionsBtn.dataset.sessionRailBound = "true";
      els.toggleArchivedSessionsBtn.addEventListener("click", () => {
        state.showArchivedSessions = state.showArchivedSessions !== true;
        closeMenus();
        renderSessions();
      });
    }

    if (els.sessionList && els.sessionList.dataset.sessionRailBound !== "true") {
      els.sessionList.dataset.sessionRailBound = "true";
      els.sessionList.addEventListener("click", async (event) => {
        const action = event.target.closest("[data-action]");
        if (!action) return;
        if (action.dataset.action === "toggle-session-menu") {
          event.preventDefault();
          event.stopPropagation();
          const card = action.closest(".session-card");
          const menu = card?.querySelector(".session-menu");
          const willOpen = Boolean(menu?.hidden);
          closeMenus();
          if (menu && willOpen) {
            menu.hidden = false;
            action.setAttribute("aria-expanded", "true");
          }
          return;
        }
        const sessionId = action.dataset.sessionId;
        if (action.dataset.action === "open-session") await toggleOrOpenSession(sessionId);
        if (action.dataset.action === "open-session-thread") {
          event.preventDefault();
          event.stopPropagation();
          await openSessionThread(sessionId, action.dataset.threadId);
        }
        if (action.dataset.action === "new-session-chat") {
          event.preventDefault();
          event.stopPropagation();
          closeMenus();
          await createSessionChat(sessionId);
        }
        if (action.dataset.action === "rename-session") {
          event.preventDefault();
          event.stopPropagation();
          closeMenus();
          renameSession(sessionId);
        }
        if (action.dataset.action === "assign-session-data") {
          event.preventDefault();
          event.stopPropagation();
          closeMenus();
          setAcademicDataModalOpen(sessionId);
        }
        if (action.dataset.action === "archive-session") {
          event.preventDefault();
          event.stopPropagation();
          closeMenus();
          archiveSession(sessionId);
        }
        if (action.dataset.action === "restore-session") {
          event.preventDefault();
          event.stopPropagation();
          closeMenus();
          restoreSession(sessionId);
        }
        if (action.dataset.action === "share-session") {
          event.preventDefault();
          event.stopPropagation();
          closeMenus();
          if (typeof shareSessionWithUser === "function") {
            shareSessionWithUser(sessionId);
          }
        }
        if (action.dataset.action === "delete-session") {
          event.preventDefault();
          event.stopPropagation();
          await deleteSession(sessionId);
        }
      });

      els.sessionList.addEventListener("keydown", (event) => {
        const action = event.target.closest("[data-action='open-session'], [data-action='open-session-thread']");
        if (!action) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (action.dataset.action === "open-session-thread") {
            openSessionThread(action.dataset.sessionId, action.dataset.threadId);
            return;
          }
          toggleOrOpenSession(action.dataset.sessionId);
        }
      });
    }
  }

  function setAcademicDataModalOpen(sessionId = "") {
    if (!els.sessionAcademicDataModal) return;
    const cleanId = String(sessionId || "").trim();
    const isOpen = Boolean(cleanId);
    const targetSession = isOpen
      ? state.sessions.find((session) => String(session?.id || "").trim() === cleanId) || null
      : null;
    const metadata = getSessionAcademicMetadata(targetSession);
    els.sessionAcademicDataModal.hidden = !isOpen;
    els.sessionAcademicDataModal.dataset.sessionId = cleanId;
    if (els.sessionAcademicLevelSelect) els.sessionAcademicLevelSelect.value = metadata.nivel;
    if (els.sessionAcademicGradeSelect) els.sessionAcademicGradeSelect.value = metadata.grado;
    if (els.sessionAcademicTermSelect) els.sessionAcademicTermSelect.value = metadata.trimestre;
    if (els.sessionAcademicUnitSelect) els.sessionAcademicUnitSelect.value = metadata.unidad;
  }

  async function saveAcademicData(sessionId = "") {
    const cleanId = String(sessionId || "").trim() || String(els.sessionAcademicDataModal?.dataset.sessionId || "").trim();
    if (!cleanId) return;
    const nextMetadata = {
      nivel: normalizeSessionAcademicField(els.sessionAcademicLevelSelect?.value, SESSION_ACADEMIC_LEVEL_OPTIONS),
      grado: normalizeSessionAcademicField(els.sessionAcademicGradeSelect?.value, SESSION_ACADEMIC_GRADE_OPTIONS),
      trimestre: normalizeSessionAcademicField(els.sessionAcademicTermSelect?.value, SESSION_ACADEMIC_TERM_OPTIONS),
      unidad: normalizeSessionAcademicField(els.sessionAcademicUnitSelect?.value, SESSION_ACADEMIC_UNIT_OPTIONS)
    };
    const updatedSession = upsertSessionById(cleanId, (current) => ({
      ...current,
      ...nextMetadata
    }), {
      render: cleanId === state.activeSessionId,
      persist: true,
      markDirty: true,
      autosaveReason: "session-academic-data"
    });
    if (!updatedSession) {
      setAcademicDataModalOpen("");
      return;
    }
    const cloudMeta = updatedSession?.cloudMeta || {};
    const canPatchCloud = !updatedSession?.isStub
      && Boolean(resolveCurrentUid())
      && (
        String(cloudMeta?.savedAt || "").trim()
        || String(cloudMeta?.ownerId || "").trim()
      );
    if (!canPatchCloud) {
      setAcademicDataModalOpen("");
      setGenerationStatus("Datos asignados", "Guarda la sesión para subirlos a Firebase.");
      return;
    }
    const sessionUpdatedAt = String(updatedSession.updatedAt || nowIso()).trim() || nowIso();
    try {
      await updateDoc(doc(firestoreDb, "podcaster_sessions", cleanId), {
        ...nextMetadata,
        sessionUpdatedAt,
        updatedAt: serverTimestamp(),
        "session.nivel": nextMetadata.nivel,
        "session.grado": nextMetadata.grado,
        "session.trimestre": nextMetadata.trimestre,
        "session.unidad": nextMetadata.unidad,
        "session.updatedAt": sessionUpdatedAt
      });
      if (updatedSession?.cloudMeta && typeof updatedSession.cloudMeta === "object") {
        updatedSession.cloudMeta.savedAt = sessionUpdatedAt;
      }
      setAcademicDataModalOpen("");
      setGenerationStatus("Datos asignados", "is-live");
    } catch (error) {
      addChatMessage("system", `No se pudieron guardar los datos académicos (${error.message}).`);
      setGenerationStatus("Error", "");
    }
  }

  return {
    render: renderSessions,
    bindEvents,
    closeMenus,
    toggleOrOpenSession,
    createAndOpenSession,
    createSessionChat,
    openSessionThread,
    renameSession,
    archiveSession,
    restoreSession,
    deleteSession,
    setAcademicDataModalOpen,
    saveAcademicData,
    expandSession,
    isSessionExpanded,
    getFilterValue: getSessionRailFilterValue
  };
}
