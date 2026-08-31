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
    saveSessionAcademicMetadata,
    loadSessionAcademicMetadata,
    resolveAcademicUnitLabel,
    resolveAcademicUnitOptions,
    resolveAcademicSubjectOptions,
    academicMetadataIsEmpty,
    mergeAcademicMetadataIntoEntity,
    matchesAcademicMetadataFilters,
    buildAcademicMetadataSummary,
    upsertSessionById,
    updateDoc,
    doc,
    getDoc,
    firestoreDb,
    serverTimestamp,
    shareSessionWithUser,
    onSessionsRendered
  } = deps;

  function ensureSessionThreadsForRail(session = null) {
    if (!session) return [];
    if ((!Array.isArray(session.threads) || session.threads.length === 0) && window.PodcasterThreads) {
      window.PodcasterThreads.syncActiveThreadToSession(session);
    }
    return Array.isArray(session.threads) ? session.threads : [];
  }

  const sessionRailStatusCache = new Map();
  let lastSessionListMarkup = null;

  const EMPTY_ADVANCED_FILTERS = Object.freeze({
    query: "",
    nivel: "",
    grado: "",
    trimestre: "",
    unidad: ""
  });

  function normalizeSearchText(value = "") {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeAdvancedFilters(filters = null) {
    const source = filters && typeof filters === "object" ? filters : {};
    return {
      query: String(source.query || "").replace(/\s+/g, " ").trim(),
      nivel: String(source.nivel || "").trim(),
      grado: String(source.grado || "").trim(),
      trimestre: String(source.trimestre || "").trim(),
      unidad: String(source.unidad || "").trim()
    };
  }

  function getAdvancedFilters() {
    const normalized = normalizeAdvancedFilters(state.sessionRailAdvancedFilters);
    state.sessionRailAdvancedFilters = normalized;
    return normalized;
  }

  function hasAdvancedFilters(filters = getAdvancedFilters()) {
    return Object.values(normalizeAdvancedFilters(filters)).some(Boolean);
  }

  function getSessionRailStatus(session = null) {
    const sessionId = String(session?.id || "").trim();
    const rows = getSessionRows(session);
    const proposalSignature = rows.map((row) => [
      String(row?.id || "").trim(),
      String(row?.visualNotesProposal || "").trim(),
      Array.isArray(row?.visualNotesProposals)
        ? row.visualNotesProposals.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [],
      Array.isArray(row?.visualNotesResolvedProposals)
        ? row.visualNotesResolvedProposals.map((entry) => String(entry || "").trim()).filter(Boolean)
        : []
    ]);
    const signature = [
      sessionId,
      String(session?.updatedAt || ""),
      session?.archived === true ? "1" : "0",
      session?.publicar === true ? "1" : "0",
      String(rows.length),
      JSON.stringify(proposalSignature)
    ].join("|");
    const cached = sessionRailStatusCache.get(sessionId);
    if (cached && cached.signature === signature) {
      return cached.value;
    }

    let hasPendingProposal = false;
    let hasAnyProposalPool = false;
    let allProposalPoolsReviewed = true;
    for (const row of rows) {
      const activeProposal = resolveActiveVisualProposal(row);
      if (activeProposal && !isVisualProposalResolved(row, activeProposal)) {
        hasPendingProposal = true;
      }
      const proposals = Array.isArray(row?.visualNotesProposals)
        ? row.visualNotesProposals.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [];
      const explicitProposal = String(row?.visualNotesProposal || "").trim();
      const proposalPool = Array.from(new Set([...proposals, explicitProposal].filter(Boolean)));
      if (!proposalPool.length) continue;
      hasAnyProposalPool = true;
      if (proposalPool.some((proposalText) => !isVisualProposalResolved(row, proposalText))) {
        allProposalPoolsReviewed = false;
      }
    }

    const value = {
      hasPendingProposal,
      hasOnlyReviewedProposals: hasAnyProposalPool && allProposalPoolsReviewed
    };
    sessionRailStatusCache.set(sessionId, { signature, value });
    return value;
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

  function setSessionVersionsExpanded(sessionId = "", expanded = false, cardElement = null) {
    const cleanSessionId = String(sessionId || "").trim();
    if (!cleanSessionId) return;
    if (expanded) expandSession(cleanSessionId);
    else collapseSession(cleanSessionId);
    const card = cardElement || Array.from(els.sessionList?.querySelectorAll?.(".session-card[data-session-id]") || [])
      .find((candidate) => String(candidate.dataset.sessionId || "").trim() === cleanSessionId) || null;
    const versions = card?.querySelector(".session-card-versions");
    const toggle = card?.querySelector('[data-action="toggle-session-versions"]');
    card?.classList.toggle("is-expanded", expanded);
    card?.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle?.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle?.setAttribute("aria-label", expanded ? "Ocultar versiones" : "Mostrar versiones");
    versions?.classList.toggle("is-collapsed", !expanded);
    versions?.setAttribute("aria-hidden", expanded ? "false" : "true");
    syncSessionVersionsHeight(card, expanded);
  }

  function syncSessionVersionsHeight(card = null, expanded = false) {
    const versions = card?.querySelector?.(".session-card-versions");
    const inner = versions?.querySelector?.(".session-card-versions-inner");
    if (!versions || !inner) return;
    const contentHeight = expanded ? Math.max(0, Math.ceil(inner.scrollHeight)) : 0;
    versions.style.setProperty("--session-versions-height", `${contentHeight}px`);
  }

  function syncSessionAcademicUnitUi(session = null) {
    if (!els.sessionAcademicUnitLabel || !els.sessionAcademicUnitSelect) return;
    const level = String(session?.nivel || els.sessionAcademicLevelSelect?.value || "").trim();
    const unitLabel = typeof resolveAcademicUnitLabel === "function"
      ? resolveAcademicUnitLabel(level)
      : (String(level).toLowerCase() === "secundaria" ? "Tema" : "Unidad");
    els.sessionAcademicUnitLabel.textContent = unitLabel;
    els.sessionAcademicUnitSelect.setAttribute("aria-label", unitLabel);
    const placeholder = els.sessionAcademicUnitSelect.querySelector("option[value='']");
    if (placeholder) placeholder.textContent = `Selecciona ${unitLabel.toLowerCase()}`;
    const options = typeof resolveAcademicUnitOptions === "function"
      ? resolveAcademicUnitOptions(level)
      : Array.from({ length: 10 }, (_, index) => ({ value: String(index + 1), label: `${unitLabel} ${index + 1}` }));
    els.sessionAcademicUnitSelect.querySelectorAll("option:not([value=''])").forEach((option, index) => {
      const nextOption = options[index];
      option.textContent = nextOption ? nextOption.label : option.textContent;
      option.value = nextOption ? nextOption.value : option.value;
    });
  }

  function syncSessionAcademicSubjectUi(session = null) {
    const fieldEl = els.sessionAcademicSubjectField || null;
    const labelEl = els.sessionAcademicSubjectLabel || null;
    const selectEl = els.sessionAcademicSubjectSelect || null;
    if (!fieldEl || !labelEl || !selectEl) return;
    const level = String(session?.nivel || els.sessionAcademicLevelSelect?.value || "").trim();
    const grade = String(session?.grado || els.sessionAcademicGradeSelect?.value || "").trim();
    const isSecondary = level.toLowerCase() === "secundaria";
    fieldEl.hidden = !isSecondary;
    if (!isSecondary) {
      selectEl.value = "";
      selectEl.innerHTML = `<option value="">Selecciona una materia</option>`;
      return;
    }
    const options = typeof resolveAcademicSubjectOptions === "function"
      ? resolveAcademicSubjectOptions(level, grade)
      : [];
    const currentValue = String(session?.materia || selectEl.value || "").trim();
    labelEl.textContent = "Materia";
    selectEl.setAttribute("aria-label", "Materia");
    selectEl.innerHTML = `<option value="">Selecciona una materia</option>${options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("")}`;
    if (options.some((option) => option.value === currentValue)) {
      selectEl.value = currentValue;
    }
  }

  function renderSessionThreadList(session = null) {
    const threads = ensureSessionThreadsForRail(session);
    if (!threads.length) return "";
    return `
      <div class="session-thread-list" role="list" aria-label="Chats de la sesión">
        ${threads.map((thread, index) => {
          const isActiveThread = thread.id === session.activeThreadId;
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
              </span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderSessionCard(session = null, activeId = "") {
    const sessionStatus = getSessionRailStatus(session);
    const isActive = session.id === activeId;
    const showSessionVersions = isActive && isSessionExpanded(session.id);
    const sessionThreadList = isActive ? renderSessionThreadList(session) : "";
    return `
      <article class="session-card${isActive ? " is-active" : ""}${showSessionVersions ? " is-expanded" : ""}" data-action="open-session" data-session-id="${escapeHtml(session.id)}" tabindex="0" role="button" aria-pressed="${isActive ? "true" : "false"}" aria-expanded="${showSessionVersions ? "true" : "false"}">
        <div class="session-card-header${sessionStatus.hasPendingProposal ? " has-pending-proposal" : sessionStatus.hasOnlyReviewedProposals ? " has-reviewed-proposals" : ""}">
          <span class="session-card-title">
            <strong>${escapeHtml(session.title || "Sesión sin título")}</strong>
            ${session?.publicar === true ? `<span class="session-card-published-badge" role="img" aria-label="Sesión publicada" title="Sesión publicada"></span>` : ""}
          </span>
          <div class="session-card-actions">
            ${isActive ? `
              <button class="session-card-collapse-btn" type="button" data-action="toggle-session-versions" data-session-id="${escapeHtml(session.id)}" aria-label="${showSessionVersions ? "Ocultar versiones" : "Mostrar versiones"}" title="${showSessionVersions ? "Ocultar versiones" : "Mostrar versiones"}" aria-expanded="${showSessionVersions ? "true" : "false"}">
                <i class="fas fa-chevron-down" aria-hidden="true"></i>
              </button>
            ` : ""}
            <div class="session-card-menu">
            <button class="session-menu-btn" type="button" data-action="toggle-session-menu" data-session-id="${escapeHtml(session.id)}" aria-label="Más opciones" aria-expanded="false">
              <i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>
            </button>
            <div class="session-menu" hidden>
              <button type="button" data-action="new-session-chat" data-session-id="${escapeHtml(session.id)}">Nuevo chat</button>
              <button type="button" data-action="rename-session" data-session-id="${escapeHtml(session.id)}">Editar nombre</button>
              <button type="button" data-action="assign-session-data" data-session-id="${escapeHtml(session.id)}">Asignar datos</button>
              <button type="button" data-action="toggle-session-publication" data-session-id="${escapeHtml(session.id)}">${session.publicar === true ? "Desactivar publicación" : "Publicar sesión"}</button>
              <button type="button" data-action="share-session" data-session-id="${escapeHtml(session.id)}">Compartir sesión</button>
              <button type="button" data-action="${session.archived === true ? "restore-session" : "archive-session"}" data-session-id="${escapeHtml(session.id)}">${session.archived === true ? "Desarchivar" : "Archivar"}</button>
              <button type="button" data-action="delete-session" data-session-id="${escapeHtml(session.id)}">Eliminar</button>
            </div>
            </div>
          </div>
        </div>
        ${isActive ? `<div class="session-card-versions${showSessionVersions ? "" : " is-collapsed"}" aria-hidden="${showSessionVersions ? "false" : "true"}"><div class="session-card-versions-inner">${sessionThreadList}</div></div>` : ""}
      </article>
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

  function getSessionsForAdvancedFilterOptions() {
    const activeFilter = getSessionRailFilterValue(state.sessionRailFilter);
    const showArchived = state.showArchivedSessions === true;
    return state.sessions.filter((session) => {
      if ((session.archived === true) !== showArchived) return false;
      return activeFilter === "all" || getSessionRailType(session) === activeFilter;
    });
  }

  function sessionMatchesAdvancedFilters(session = null, filters = getAdvancedFilters()) {
    const normalized = normalizeAdvancedFilters(filters);
    const expectedTitle = normalizeSearchText(normalized.query);
    if (expectedTitle) {
      const searchableTitle = normalizeSearchText([
        session?.title,
        session?.script?.episodeTitle
      ].filter(Boolean).join(" "));
      if (!searchableTitle.includes(expectedTitle)) return false;
    }
    const hasAcademicFilter = [normalized.nivel, normalized.grado, normalized.trimestre, normalized.unidad].some(Boolean);
    if (!hasAcademicFilter) return true;
    const metadata = getSessionAcademicMetadata(session);
    if (typeof matchesAcademicMetadataFilters === "function") {
      return matchesAcademicMetadataFilters(metadata, {
        nivel: normalized.nivel || "all",
        grado: normalized.grado || "all",
        trimestre: normalized.trimestre || "all",
        unidad: normalized.unidad || "all",
        materia: "all"
      });
    }
    return ["nivel", "grado", "trimestre", "unidad"].every((field) => (
      !normalized[field] || String(metadata?.[field] || "").trim() === normalized[field]
    ));
  }

  function setFilterSelectOptions(select, values = [], placeholder = "Todos", preferredOrder = [], formatLabel = null) {
    if (!select) return;
    const currentValue = String(select.value || "").trim();
    const order = new Map(preferredOrder.map((value, index) => [String(value), index]));
    const uniqueValues = Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)))
      .sort((left, right) => {
        const leftIndex = order.has(left) ? order.get(left) : Number.MAX_SAFE_INTEGER;
        const rightIndex = order.has(right) ? order.get(right) : Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex || left.localeCompare(right, "es", { numeric: true });
      });
    select.replaceChildren();
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = placeholder;
    select.append(emptyOption);
    uniqueValues.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = typeof formatLabel === "function" ? formatLabel(value) : value;
      select.append(option);
    });
    select.value = uniqueValues.includes(currentValue) ? currentValue : "";
  }

  function populateAdvancedFilterOptions() {
    const sessions = getSessionsForAdvancedFilterOptions();
    const level = String(els.sessionFilterLevelSelect?.value || "").trim();
    const grade = String(els.sessionFilterGradeSelect?.value || "").trim();
    const term = String(els.sessionFilterTermSelect?.value || "").trim();
    const metadataRows = sessions.map((session) => getSessionAcademicMetadata(session));
    const levelValues = metadataRows.map((metadata) => metadata?.nivel || "").filter(Boolean);
    setFilterSelectOptions(
      els.sessionFilterLevelSelect,
      levelValues.length > 0 ? levelValues : SESSION_ACADEMIC_LEVEL_OPTIONS,
      "Todos los niveles",
      SESSION_ACADEMIC_LEVEL_OPTIONS
    );
    if (level && els.sessionFilterLevelSelect) els.sessionFilterLevelSelect.value = level;
    const rowsForGrade = metadataRows.filter((metadata) => !level || metadata.nivel === level);
    const gradeValues = rowsForGrade.map((metadata) => metadata?.grado || "").filter(Boolean);
    setFilterSelectOptions(
      els.sessionFilterGradeSelect,
      gradeValues.length > 0 ? gradeValues : SESSION_ACADEMIC_GRADE_OPTIONS,
      "Todos los grados",
      SESSION_ACADEMIC_GRADE_OPTIONS
    );
    if (grade && els.sessionFilterGradeSelect?.querySelector(`option[value="${CSS.escape(grade)}"]`)) {
      els.sessionFilterGradeSelect.value = grade;
    }
    const selectedGrade = String(els.sessionFilterGradeSelect?.value || "").trim();
    const rowsForTerm = rowsForGrade.filter((metadata) => !selectedGrade || metadata.grado === selectedGrade);
    const termValues = rowsForTerm.map((metadata) => metadata?.trimestre || "").filter(Boolean);
    setFilterSelectOptions(
      els.sessionFilterTermSelect,
      termValues.length > 0 ? termValues : SESSION_ACADEMIC_TERM_OPTIONS,
      "Todos los trimestres",
      SESSION_ACADEMIC_TERM_OPTIONS
    );
    if (term && els.sessionFilterTermSelect?.querySelector(`option[value="${CSS.escape(term)}"]`)) {
      els.sessionFilterTermSelect.value = term;
    }
    const selectedTerm = String(els.sessionFilterTermSelect?.value || "").trim();
    const rowsForUnit = rowsForTerm.filter((metadata) => !selectedTerm || metadata.trimestre === selectedTerm);
    const unitValues = rowsForUnit.map((metadata) => metadata?.unidad || "").filter(Boolean);
    const unitLabel = typeof resolveAcademicUnitLabel === "function"
      ? resolveAcademicUnitLabel(level)
      : (level.toLowerCase() === "secundaria" ? "Tema" : "Unidad");
    if (els.sessionFilterUnitLabel) els.sessionFilterUnitLabel.textContent = level ? unitLabel : "Tema / Unidad";
    setFilterSelectOptions(
      els.sessionFilterUnitSelect,
      unitValues.length > 0 ? unitValues : SESSION_ACADEMIC_UNIT_OPTIONS,
      level ? `Todos los ${unitLabel.toLowerCase()}s` : "Todos los temas / unidades",
      SESSION_ACADEMIC_UNIT_OPTIONS,
      (value) => `${level ? unitLabel : "Tema / Unidad"} ${value}`
    );
    if (els.sessionFilterOptionsHint) {
      const modeLabel = state.showArchivedSessions === true ? "archivadas" : "activas";
      els.sessionFilterOptionsHint.textContent = `${sessions.length} ${sessions.length === 1 ? "sesión" : "sesiones"} ${modeLabel} disponibles para filtrar.`;
    }
  }

  function readAdvancedFilterForm() {
    return normalizeAdvancedFilters({
      query: els.sessionFilterQueryInput?.value,
      nivel: els.sessionFilterLevelSelect?.value,
      grado: els.sessionFilterGradeSelect?.value,
      trimestre: els.sessionFilterTermSelect?.value,
      unidad: els.sessionFilterUnitSelect?.value
    });
  }

  function writeAdvancedFilterForm(filters = EMPTY_ADVANCED_FILTERS) {
    const normalized = normalizeAdvancedFilters(filters);
    if (els.sessionFilterQueryInput) els.sessionFilterQueryInput.value = normalized.query;
    populateAdvancedFilterOptions();
    if (els.sessionFilterLevelSelect) els.sessionFilterLevelSelect.value = normalized.nivel;
    populateAdvancedFilterOptions();
    if (els.sessionFilterGradeSelect) els.sessionFilterGradeSelect.value = normalized.grado;
    populateAdvancedFilterOptions();
    if (els.sessionFilterTermSelect) els.sessionFilterTermSelect.value = normalized.trimestre;
    populateAdvancedFilterOptions();
    if (els.sessionFilterUnitSelect) els.sessionFilterUnitSelect.value = normalized.unidad;
  }

  function syncAdvancedFilterButtonUi() {
    if (!els.openSessionFiltersBtn) return;
    const isActive = hasAdvancedFilters();
    els.openSessionFiltersBtn.classList.toggle("is-active", isActive);
    els.openSessionFiltersBtn.setAttribute("aria-pressed", isActive ? "true" : "false");
    els.openSessionFiltersBtn.setAttribute("aria-label", isActive ? "Abrir filtros de sesiones; hay filtros activos" : "Abrir filtros de sesiones");
    els.openSessionFiltersBtn.setAttribute("title", isActive ? "Filtros activos" : "Filtrar sesiones");
  }

  function setAdvancedFilterModalOpen(isOpen = false, options = {}) {
    if (!els.sessionFiltersModal) return;
    const nextOpen = Boolean(isOpen);
    if (nextOpen) {
      writeAdvancedFilterForm(getAdvancedFilters());
      els.sessionFiltersModal.hidden = false;
      requestAnimationFrame(() => els.sessionFilterQueryInput?.focus());
      return;
    }
    els.sessionFiltersModal.hidden = true;
    if (options.restoreFocus !== false) els.openSessionFiltersBtn?.focus();
  }

  function clearAdvancedFilters() {
    state.sessionRailAdvancedFilters = { ...EMPTY_ADVANCED_FILTERS };
    writeAdvancedFilterForm(EMPTY_ADVANCED_FILTERS);
    renderSessions();
  }

  function syncFilterUi() {
    if (!els.sessionsRailFilter) return;
    const activeFilter = getSessionRailFilterValue(state.sessionRailFilter);
    const activeTerm = getAdvancedFilters().trimestre;
    els.sessionsRailFilter.querySelectorAll("[data-filter]").forEach((button) => {
      const filter = getSessionRailFilterValue(button.dataset.filter);
      const isActive = filter === activeFilter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    els.sessionsRailFilter.querySelectorAll("[data-term-filter]").forEach((button) => {
      const term = String(button.dataset.termFilter || "").trim();
      const isActive = Boolean(term) && term === activeTerm;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.setAttribute("aria-label", `${isActive ? "Quitar filtro" : "Filtrar"} por Trimestre ${term}`);
    });
  }

  function syncArchivedToggleUi() {
    if (!els.toggleArchivedSessionsBtn) return;
    const isActive = state.showArchivedSessions === true;
    els.toggleArchivedSessionsBtn.classList.toggle("is-active", isActive);
    els.toggleArchivedSessionsBtn.setAttribute("aria-pressed", isActive ? "true" : "false");
    els.toggleArchivedSessionsBtn.setAttribute("title", isActive ? "Ver sesiones activas" : "Ver sesiones archivadas");
    els.toggleArchivedSessionsBtn.setAttribute("aria-label", isActive ? "Ver sesiones activas" : "Ver sesiones archivadas");
    const icon = els.toggleArchivedSessionsBtn.querySelector("i");
    icon?.classList.toggle("fa-box-archive", !isActive);
    icon?.classList.toggle("fa-box-open", isActive);
  }

  function renderSessions() {
    const activeId = state.activeSessionId;
    const activeFilter = getSessionRailFilterValue(state.sessionRailFilter);
    const showArchived = state.showArchivedSessions === true;
    const visibleSessions = state.sessions.filter((session) => {
      const isArchived = session.archived === true;
      if (showArchived !== isArchived) return false;
      if (activeFilter !== "all" && getSessionRailType(session) !== activeFilter) return false;
      return sessionMatchesAdvancedFilters(session);
    });
    const emptyMessage = hasAdvancedFilters()
      ? "No hay sesiones que coincidan con los filtros."
      : (showArchived ? "No hay sesiones archivadas." : "No hay sesiones activas.");
    const nextMarkup = visibleSessions.map((session) => renderSessionCard(session, activeId)).join("") || `<div class="session-list-empty">${emptyMessage}</div>`;
    els.sessionList.classList.toggle("is-archived-view", showArchived);
    const didUpdate = nextMarkup !== lastSessionListMarkup;
    if (didUpdate) {
      els.sessionList.innerHTML = nextMarkup;
      lastSessionListMarkup = nextMarkup;
    }
    Array.from(els.sessionList.querySelectorAll?.(".session-card.is-active") || []).forEach((card) => {
      syncSessionVersionsHeight(card, card.classList.contains("is-expanded"));
    });
    syncFilterUi();
    syncArchivedToggleUi();
    syncAdvancedFilterButtonUi();
    onSessionsRendered?.({ didUpdate, visibleSessions });
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
      setSessionVersionsExpanded(cleanSessionId, !isSessionExpanded(cleanSessionId));
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

  async function persistSessionArchivedState(sessionId = "", archived = false) {
    const cleanSessionId = String(sessionId || "").trim();
    const targetSession = state.sessions.find((session) => String(session?.id || "").trim() === cleanSessionId) || null;
    const uid = String(resolveCurrentUid?.() || "").trim();
    const hasCloudRecord = Boolean(targetSession?.cloudMeta?.ownerId || targetSession?.cloudMeta?.savedAt);
    if (!cleanSessionId || !uid || !hasCloudRecord || !updateDoc || !doc || !firestoreDb) return false;
    const updatedAt = String(targetSession?.updatedAt || nowIso()).trim() || nowIso();
    try {
      await updateDoc(doc(firestoreDb, "podcaster_sessions", cleanSessionId), {
        archived: archived === true,
        "session.archived": archived === true,
        sessionUpdatedAt: updatedAt,
        "session.updatedAt": updatedAt,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error("[podcaster][sessions] No se pudo persistir el estado archivado.", error);
      setGenerationStatus?.("El estado de archivo quedó guardado localmente; no se pudo sincronizar con Firebase.", "");
      return false;
    }
  }

  async function archiveSession(sessionId) {
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
    await persistSessionArchivedState(sessionId, true);
  }

  async function restoreSession(sessionId) {
    state.sessions = state.sessions.map((session) => (
      session.id === sessionId
        ? { ...session, archived: false, updatedAt: nowIso() }
        : session
    ));
    persistSessions();
    render();
    await persistSessionArchivedState(sessionId, false);
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
    if (els.openSessionFiltersBtn && els.openSessionFiltersBtn.dataset.sessionRailBound !== "true") {
      els.openSessionFiltersBtn.dataset.sessionRailBound = "true";
      els.openSessionFiltersBtn.addEventListener("click", () => setAdvancedFilterModalOpen(true));
    }

    if (els.sessionFiltersModal && els.sessionFiltersModal.dataset.sessionRailBound !== "true") {
      els.sessionFiltersModal.dataset.sessionRailBound = "true";
      els.sessionFiltersModal.addEventListener("click", (event) => {
        if (event.target.closest("[data-action='close-session-filters-modal']")) {
          setAdvancedFilterModalOpen(false);
        }
      });
      els.closeSessionFiltersBtn?.addEventListener("click", () => setAdvancedFilterModalOpen(false));
      els.cancelSessionFiltersBtn?.addEventListener("click", () => setAdvancedFilterModalOpen(false));
      els.clearSessionFiltersBtn?.addEventListener("click", clearAdvancedFilters);
      els.sessionFiltersForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        state.sessionRailAdvancedFilters = readAdvancedFilterForm();
        renderSessions();
        setAdvancedFilterModalOpen(false);
      });
      els.sessionFilterLevelSelect?.addEventListener("change", () => {
        if (els.sessionFilterGradeSelect) els.sessionFilterGradeSelect.value = "";
        if (els.sessionFilterUnitSelect) els.sessionFilterUnitSelect.value = "";
        populateAdvancedFilterOptions();
      });
      els.sessionFilterGradeSelect?.addEventListener("change", () => {
        if (els.sessionFilterUnitSelect) els.sessionFilterUnitSelect.value = "";
        populateAdvancedFilterOptions();
      });
      els.sessionFilterTermSelect?.addEventListener("change", populateAdvancedFilterOptions);
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && els.sessionFiltersModal?.hidden === false) {
          event.preventDefault();
          setAdvancedFilterModalOpen(false);
        }
      });
    }

    if (els.sessionsRailFilter && els.sessionsRailFilter.dataset.sessionRailBound !== "true") {
      els.sessionsRailFilter.dataset.sessionRailBound = "true";
      els.sessionsRailFilter.addEventListener("click", (event) => {
        const termButton = event.target.closest("[data-term-filter]");
        if (termButton) {
          const requestedTerm = String(termButton.dataset.termFilter || "").trim();
          if (!SESSION_ACADEMIC_TERM_OPTIONS.includes(requestedTerm)) return;
          const currentFilters = getAdvancedFilters();
          state.sessionRailAdvancedFilters = {
            ...currentFilters,
            trimestre: currentFilters.trimestre === requestedTerm ? "" : requestedTerm
          };
          renderSessions();
          return;
        }
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
        if (action.dataset.action === "toggle-session-versions") {
          event.preventDefault();
          event.stopPropagation();
          const card = action.closest(".session-card");
          const willExpand = !isSessionExpanded(sessionId);
          setSessionVersionsExpanded(sessionId, willExpand, card);
          return;
        }
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
          void setAcademicDataModalOpen(sessionId);
        }
        if (action.dataset.action === "toggle-session-publication") {
          event.preventDefault();
          event.stopPropagation();
          closeMenus();
          await toggleSessionPublication(sessionId);
        }
        if (action.dataset.action === "archive-session") {
          event.preventDefault();
          event.stopPropagation();
          closeMenus();
          await archiveSession(sessionId);
        }
        if (action.dataset.action === "restore-session") {
          event.preventDefault();
          event.stopPropagation();
          closeMenus();
          await restoreSession(sessionId);
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

  async function setAcademicDataModalOpen(sessionId = "") {
    if (!els.sessionAcademicDataModal) return;
    const cleanId = String(sessionId || "").trim();
    const isOpen = Boolean(cleanId);
    let targetSession = isOpen
      ? state.sessions.find((session) => String(session?.id || "").trim() === cleanId) || null
      : null;
    if (isOpen) {
      let storedMetadata = null;
      if (typeof loadSessionAcademicMetadata === "function") {
        try {
          storedMetadata = await loadSessionAcademicMetadata(cleanId);
        } catch (error) {
          console.warn("[Podcaster] Error al cargar metadatos académicos desde colección:", error);
        }
      }

      if (storedMetadata) {
        const mergedSession = upsertSessionById(
          cleanId,
          (current) => mergeAcademicMetadataIntoEntity(current || targetSession || { id: cleanId }, storedMetadata),
          { render: false }
        );
        if (mergedSession) {
          targetSession = mergedSession;
        } else if (targetSession) {
          targetSession = mergeAcademicMetadataIntoEntity(targetSession, storedMetadata);
        } else {
          targetSession = mergeAcademicMetadataIntoEntity({ id: cleanId }, storedMetadata);
        }
      } else if (!targetSession && typeof getDoc === "function" && typeof doc === "function") {
        try {
          const sessionRef = doc(firestoreDb, "podcaster_sessions", cleanId);
          const sessionSnap = await getDoc(sessionRef);
          if (sessionSnap.exists()) {
            const data = sessionSnap.data() || {};
            targetSession = mergeAcademicMetadataIntoEntity(
              {
                id: cleanId,
                ...(data || {})
              },
              data
            );
            upsertSessionById(cleanId, () => targetSession, { render: false });
          }
        } catch (error) {
          console.warn("[Podcaster] No se pudo hidratar sesión para el modal académico:", error);
        }
      }
    }
    const metadata = getSessionAcademicMetadata(targetSession);
    els.sessionAcademicDataModal.hidden = !isOpen;
    els.sessionAcademicDataModal.dataset.sessionId = cleanId;
    if (els.sessionAcademicLevelSelect) els.sessionAcademicLevelSelect.value = metadata.nivel;
    if (els.sessionAcademicGradeSelect) els.sessionAcademicGradeSelect.value = metadata.grado;
    if (els.sessionAcademicTermSelect) els.sessionAcademicTermSelect.value = metadata.trimestre;
    if (els.sessionAcademicUnitSelect) els.sessionAcademicUnitSelect.value = metadata.unidad;
    syncSessionAcademicUnitUi(metadata);
    syncSessionAcademicSubjectUi(metadata);
  }

  async function saveAcademicData(sessionId = "") {
    const cleanId = String(sessionId || "").trim() || String(els.sessionAcademicDataModal?.dataset.sessionId || "").trim();
    if (!cleanId) return;
    const nextMetadata = {
      nivel: normalizeSessionAcademicField(els.sessionAcademicLevelSelect?.value, SESSION_ACADEMIC_LEVEL_OPTIONS),
      grado: normalizeSessionAcademicField(els.sessionAcademicGradeSelect?.value, SESSION_ACADEMIC_GRADE_OPTIONS),
      trimestre: normalizeSessionAcademicField(els.sessionAcademicTermSelect?.value, SESSION_ACADEMIC_TERM_OPTIONS),
      unidad: normalizeSessionAcademicField(els.sessionAcademicUnitSelect?.value, SESSION_ACADEMIC_UNIT_OPTIONS),
      materia: ""
    };
    const subjectOptions = typeof resolveAcademicSubjectOptions === "function"
      ? resolveAcademicSubjectOptions(nextMetadata.nivel, nextMetadata.grado)
      : [];
    nextMetadata.materia = normalizeSessionAcademicField(
      els.sessionAcademicSubjectSelect?.value,
      subjectOptions.map((option) => option.value)
    );
    if (String(nextMetadata.nivel || "").trim().toLowerCase() !== "secundaria") {
      nextMetadata.materia = "";
    }
    syncSessionAcademicUnitUi(nextMetadata);
    syncSessionAcademicSubjectUi(nextMetadata);
    const updatedSession = upsertSessionById(cleanId, (current) => mergeAcademicMetadataIntoEntity(current || { id: cleanId }, nextMetadata), {
      render: cleanId === state.activeSessionId,
      persist: true,
      markDirty: true,
      autosaveReason: "session-academic-data"
    });
    if (!updatedSession) {
      setAcademicDataModalOpen("");
      return;
    }
    try {
      if (typeof saveSessionAcademicMetadata === "function") {
        await saveSessionAcademicMetadata(cleanId, nextMetadata, {
          entityType: "session",
          snapshotTargets: [{
            ref: doc(firestoreDb, "podcaster_sessions", cleanId)
          }]
        });
      } else {
        const sessionUpdatedAt = String(updatedSession.updatedAt || nowIso()).trim() || nowIso();
        await updateDoc(doc(firestoreDb, "podcaster_sessions", cleanId), {
          ...nextMetadata,
          academicMetadata: {
            ...nextMetadata,
            unitLabel: typeof resolveAcademicUnitLabel === "function"
              ? resolveAcademicUnitLabel(nextMetadata.nivel)
              : (String(nextMetadata.nivel).toLowerCase() === "secundaria" ? "Tema" : "Unidad")
          },
          academicMetadataUpdatedAt: sessionUpdatedAt,
          updatedAt: serverTimestamp(),
          academicMetadataUpdatedAtIso: sessionUpdatedAt
        });
      }
      setAcademicDataModalOpen("");
      setGenerationStatus("Datos asignados", "is-live");
    } catch (error) {
      addChatMessage("system", `No se pudieron guardar los datos académicos (${error.message}).`);
      setGenerationStatus("Error", "");
    }
  }

  async function toggleSessionPublication(sessionId = "") {
    const cleanId = String(sessionId || "").trim();
    if (!cleanId) return;
    const session = state.sessions.find((item) => String(item?.id || "").trim() === cleanId) || null;
    if (!session) return;
    const nextPublished = session.publicar !== true;
    const updatedAt = nowIso();
    try {
      upsertSessionById(cleanId, (current) => ({
        ...current,
        publicar: nextPublished
      }), {
        render: true,
        persist: true,
        markDirty: true,
        autosaveReason: "session-publication-toggle"
      });
      await updateDoc(doc(firestoreDb, "podcaster_sessions", cleanId), {
        publicar: nextPublished,
        updatedAt: serverTimestamp(),
        sessionUpdatedAt: updatedAt
      });
      setGenerationStatus(nextPublished ? "Sesión publicada" : "Sesión desactivada", "is-live");
    } catch (error) {
      addChatMessage("system", `No se pudo cambiar la publicación de la sesión (${error.message}).`);
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
    syncSessionAcademicUnitUi,
    syncSessionAcademicSubjectUi,
    expandSession,
    isSessionExpanded,
    getFilterValue: getSessionRailFilterValue,
    normalizeSearchText,
    sessionMatchesAdvancedFilters,
    setAdvancedFilterModalOpen,
    clearAdvancedFilters
  };
}
