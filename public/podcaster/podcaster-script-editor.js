/**
 * Podcaster Studio - Script Table Editor Module
 * Handles script rendering, row editor markup builders, field updates,
 * and SortableJS drag-and-drop integration.
 */
import { requirePodcasterScriptGeneratorApiFunction } from "./podcaster-script-generator-registry.js";
import {
  requirePodcasterScriptEditorRuntime,
  registerPodcasterScriptEditorRuntime
} from "./podcaster-runtime-registry.js";

// Local Sortable reference
let scriptSortable = null;

const escapeHtml = typeof window.escapeHtml === "function"
  ? window.escapeHtml
  : (value = "") => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function getScriptEditorRuntime() {
  return requirePodcasterScriptEditorRuntime();
}

function autoSizeScriptTextarea(textarea) {
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  textarea.style.overflowY = "hidden";
  textarea.style.resize = "none";
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function autoSizeScriptTextareas(root = null) {
  const scope = root && typeof root.querySelectorAll === "function" ? root : document;
  scope.querySelectorAll("textarea.dialog-editor, textarea[data-field='notes']").forEach((node) => {
    autoSizeScriptTextarea(node);
  });
}

/**
 * Renders the entire script table based on the active session's rows.
 */
function renderScript(session) {
  const runtime = getScriptEditorRuntime();
  const script = session.script || {};
  const rows = runtime.getSessionRows(session);
  const panelCopy = runtime.getPanelModeCopy(session);
  const els = runtime.els || {};

  if (els.sidepanel) {
    els.sidepanel.classList.toggle("is-video-mode", panelCopy.videoMode);
  }
  if (els.scriptPanelTitle) {
    els.scriptPanelTitle.textContent = panelCopy.videoMode ? "Tabla de guion de video creativo" : "Tabla de diálogo";
  }
  if (els.scriptPanelSubtitle) {
    els.scriptPanelSubtitle.textContent = panelCopy.videoMode
      ? "Vista video: Tiempo, Guion, Descripción de escena, Texto en pantalla, Transición y Elemento visual."
      : "Vista podcast: lista compacta editable tipo inspector.";
  }
  if (els.openVideoEditorBtn) {
    els.openVideoEditorBtn.hidden = !panelCopy.videoMode;
    els.openVideoEditorBtn.disabled = !panelCopy.videoMode || rows.length === 0;
    els.openVideoEditorBtn.setAttribute("title", "Pasar guión al editor de video Snoopy Creator");
    els.openVideoEditorBtn.setAttribute("aria-label", "Pasar guión al editor de video Snoopy Creator");
  }
  if (els.toggleCollapseAllRowsBtn) {
    const resolveAllCollapsed = typeof window.areAllScriptRowsCollapsed === "function"
      ? window.areAllScriptRowsCollapsed
      : () => false;
    const allCollapsed = rows.length > 0 && resolveAllCollapsed(session);
    els.toggleCollapseAllRowsBtn.disabled = rows.length === 0;
    els.toggleCollapseAllRowsBtn.setAttribute("title", allCollapsed ? "Expandir escenas" : "Colapsar escenas");
    els.toggleCollapseAllRowsBtn.setAttribute("aria-label", allCollapsed ? "Expandir escenas" : "Colapsar escenas");
    els.toggleCollapseAllRowsBtn.classList.toggle("is-active", allCollapsed);
    const icon = els.toggleCollapseAllRowsBtn.querySelector("i");
    if (icon) {
      icon.className = allCollapsed ? "fas fa-expand-alt" : "fas fa-compress-alt";
    }
  }
  if (els.hostSummary) {
    els.hostSummary.textContent = (script.hosts || []).join(", ") || "Host A, Host B";
  }
  if (els.durationSummary) {
    els.durationSummary.textContent = runtime.secondsToClock(runtime.countTotalDuration(rows));
  }

  const buildScriptRowCard = (row, index) => {
    const activeVisualProposal = window.resolveActiveVisualProposal(row);
    return `
    <article class="script-row${window.isScriptRowCollapsed(row.id, session) ? " is-collapsed" : ""}" data-row-id="${escapeHtml(row.id)}" tabindex="-1">
      <div class="script-row-head">
        <div class="row-head-left">
          <button class="script-row-collapse-btn" type="button" data-action="toggle-script-row-collapse" data-row-id="${escapeHtml(row.id)}" aria-expanded="${window.isScriptRowCollapsed(row.id, session) ? "false" : "true"}" aria-label="${window.isScriptRowCollapsed(row.id, session) ? "Expandir escena" : "Colapsar escena"}" title="${window.isScriptRowCollapsed(row.id, session) ? "Expandir escena" : "Colapsar escena"}">
            <i class="fas fa-chevron-down" aria-hidden="true"></i>
          </button>
          <span class="row-chip">${panelCopy.videoMode ? "Secuencia" : "Escena"} ${index + 1}</span>
          ${activeVisualProposal ? `<span class="row-chip row-chip-proposal-new">Propuesta nueva</span>` : ""}
          ${panelCopy.videoMode ? "" : `<span class="row-chip">${escapeHtml(String(row.speaker || "").trim() || "Host A")}</span>`}
          ${(panelCopy.videoMode || panelCopy.videoPodcastMode) && String(row?.publicSceneLibraryId || "").trim()
        ? `<span class="row-chip row-chip-public">Pública</span>`
        : ""}
          ${(() => {
        if (!(panelCopy.videoMode || panelCopy.videoPodcastMode)) return "";
        const reference = window.resolveRowReferenceAsset(String(row.id || "").trim(), session);
        if (!reference) return "";
        const label = reference.kind === "video"
          ? `Ref video: ${reference.name}`
          : reference.imageCount > 1
            ? `${reference.imageCount} refs`
            : `Ref: ${reference.name}`;
        return `<span class="row-chip">${escapeHtml(label)}</span>`;
      })()}
          <span class="row-chip row-chip-elapsed" data-row-play-elapsed="${escapeHtml(row.id)}">0:00</span>
        </div>
        <div class="row-actions">
          <button class="row-icon-btn row-play-btn" type="button" data-action="play-row-audio" data-row-id="${escapeHtml(row.id)}" title="Reproducir escena">
            <i class="fas fa-play"></i>
          </button>
          <div class="row-menu-container">
            <button class="row-icon-btn btn-row-menu-toggle" type="button" title="Acciones" aria-label="Menú de acciones">
              <i class="fas fa-ellipsis-v"></i>
            </button>
            <div class="row-floating-menu">
              <button class="row-menu-item ${window.hasActiveDisfluencyConfig(window.getRowDisfluencyConfig(row)) ? "is-active" : ""}" type="button" data-action="toggle-disfluency-config" data-row-id="${escapeHtml(row.id)}">
                <i class="fas fa-comment-dots"></i> Configurar muletillas
              </button>
              ${(panelCopy.videoMode || panelCopy.videoPodcastMode)
        ? (() => {
          const ref = window.resolveRowReferenceAsset(String(row.id || "").trim(), session);
          return `
                    <button class="row-menu-item" type="button" data-action="attach-row-reference-image" data-row-id="${escapeHtml(row.id)}">
                      <i class="fas fa-paperclip"></i> Adjuntar referencia
                    </button>
                    <button class="row-menu-item" type="button" data-action="publish-scene-to-library" data-row-id="${escapeHtml(row.id)}">
                      <i class="fas fa-globe"></i> ${String(row?.publicSceneLibraryId || "").trim() ? "Actualizar en librería" : "Publicar en librería"}
                    </button>
                    ${ref ? `<button class="row-menu-item" type="button" data-action="clear-row-reference-image" data-row-id="${escapeHtml(row.id)}"><i class="fas fa-times"></i> Quitar referencia</button>` : ""}
                  `;
        })()
        : ""}
              <button class="row-menu-item" type="button" data-action="save-row-audio-storage" data-row-id="${escapeHtml(row.id)}">
                <i class="fas fa-save"></i> Guardar en Storage
              </button>
              <button class="row-menu-item" type="button" data-action="duplicate-row" data-row-id="${escapeHtml(row.id)}">
                <i class="fas fa-copy"></i> Duplicar escena
              </button>
              <div class="row-menu-divider"></div>
              <button class="row-menu-item row-menu-item-danger" type="button" data-action="delete-row" data-row-id="${escapeHtml(row.id)}">
                <i class="fas fa-trash"></i> Eliminar
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="script-row-body">
        ${buildScriptRowEditorMarkup(session, row, index)}
      </div>
    </article>
  `;
  };

  if (els.scriptTableBody) {
    els.scriptTableBody.innerHTML = rows.flatMap((row, index) => ([
      buildScriptRowCard(row, index),
      index < rows.length - 1
        ? `
          <button class="script-row-insert" type="button" data-action="insert-row-at" data-insert-index="${index + 1}" aria-label="Añadir escena aquí" title="Añadir escena aquí">
            <span class="script-row-insert-plus" aria-hidden="true"><i class="fas fa-plus"></i></span>
          </button>
        `
        : ""
    ])).join("");
    autoSizeScriptTextareas(els.scriptTableBody);
  }

  if (scriptSortable) {
    scriptSortable.destroy();
    scriptSortable = null;
  }

  if (window.Sortable && els.scriptTableBody) {
    scriptSortable = window.Sortable.create(els.scriptTableBody, {
      animation: 150,
      handle: ".script-row-head",
      draggable: ".script-row",
      filter: ".script-row-insert, .script-row-head button, .script-row-head [role='button']",
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      onEnd(evt) {
        const activeSession = window.getActiveSession();
        const activeRows = getScriptEditorRuntime().getSessionRows(activeSession);
        if (activeRows.length < 2) return;
        const rowById = new Map(activeRows.map((row) => [String(row?.id || "").trim(), row]));
        const domIds = [...els.scriptTableBody.querySelectorAll(".script-row[data-row-id]")]
          .map((node) => String(node?.dataset?.rowId || "").trim())
          .filter(Boolean);
        if (!domIds.length) return;
        const nextRows = domIds.map((id) => rowById.get(id)).filter(Boolean);
        const missing = activeRows.filter((row) => !domIds.includes(String(row?.id || "").trim()));
        if (missing.length) nextRows.push(...missing);
        const oldSignature = activeRows.map((row) => String(row?.id || "").trim()).join("|");
        const nextSignature = nextRows.map((row) => String(row?.id || "").trim()).join("|");
        if (oldSignature === nextSignature) return;
        window.upsertActiveSession((sessionData) => ({
          ...sessionData,
          script: {
            ...sessionData.script,
            rows: nextRows
          }
        }), { render: false });
        window.scheduleSessionLocalPersist("structure");
        queueMicrotask(() => {
          window.reflowTimelineClipsByScriptOrder(window.getActiveSession(), { persist: true });
          window.render();
        });
      }
    });
  }

  if (typeof window.updateRowPlayButtons === "function") {
    window.updateRowPlayButtons();
  }
  if (typeof window.syncRowDisfluencyModal === "function") {
    window.syncRowDisfluencyModal(session);
  }
}

/**
 * Builds the editor markup inside each row's dropdown/expanded panel.
 */
function buildScriptRowEditorMarkup(session, row, index = -1) {
  const panelCopy = window.getPanelModeCopy(session);
  const isVideo = panelCopy.videoMode;
  const safeIndex = Number.isFinite(index) && index >= 0 ? index : 0;
  const host = String(row?.speaker || "Host A").trim() || "Host A";

  const buildOptions = (optionsList = [], selectedValue = "") => {
    if (typeof window.buildOptions === "function") {
      return window.buildOptions(optionsList, selectedValue);
    }
    return optionsList
      .map((opt) => {
        const val = typeof opt === "string" ? opt : opt.value;
        const label = typeof opt === "string" ? opt : opt.label;
        const isSel = String(val).trim().toLowerCase() === String(selectedValue).trim().toLowerCase();
        return `<option value="${escapeHtml(val)}"${isSel ? " selected" : ""}>${escapeHtml(label)}</option>`;
      })
      .join("");
  };

  const buildVoiceOptions = (selectedValue = "") => {
    if (typeof window.buildVoiceOptions === "function") {
      return window.buildVoiceOptions(selectedValue);
    }
    const list = window.VOICES || [];
    return list
      .map((voice) => {
        const isSel = String(voice.name || "").trim().toLowerCase() === String(selectedValue || "").trim().toLowerCase();
        return `<option value="${escapeHtml(voice.name)}"${isSel ? " selected" : ""}>${escapeHtml(voice.displayName || voice.name)}</option>`;
      })
      .join("");
  };

  const buildSpeakerOptionsForRow = (sessionData, selectedSpeaker = "") => {
    if (typeof window.buildSpeakerOptionsForRow === "function") {
      return window.buildSpeakerOptionsForRow(sessionData, selectedSpeaker);
    }
    const opts = window.getSpeakerOptions(sessionData);
    return opts
      .map((opt) => {
        const isSel = String(opt).trim().toLowerCase() === String(selectedSpeaker).trim().toLowerCase();
        const disp = window.resolveSpeakerDisplayName(opt, sessionData);
        return `<option value="${escapeHtml(opt)}"${isSel ? " selected" : ""}>${escapeHtml(disp)}</option>`;
      })
      .join("");
  };

  const videoPreset = window.resolveActiveVideoPreset?.(session) || "creative";
  if (isVideo && videoPreset === "creative") {
    const creativeRow = window.normalizeCreativeRow(row, safeIndex, { videoPreset });
    const creativeRowEditorVisualNotes = window.resolveVisualNotesEditorValue(row);
    const activeVisualProposal = window.resolveActiveVisualProposal(creativeRow);
    return `
      <div class="script-row-grid">
        <!-- El campo Tiempo (durationSec) ha sido removido para evitar confusión con la velocidad del audio -->
        <label class="row-field wide">
          <span class="row-field-head">
            <span>Guion</span>
            <span class="row-field-inline-actions">
              ${String(creativeRow.publicSceneLibraryId || "").trim() ? `<span class="row-chip row-chip-public">Pública</span>` : ""}
              <button class="row-icon-btn row-field-mini-btn" type="button" data-action="open-gemini-creativity" data-row-id="${escapeHtml(creativeRow.id)}" title="Ajustar creatividad de Gemini" aria-label="Ajustar creatividad de Gemini">
                <i class="fas fa-sliders-h" aria-hidden="true"></i>
              </button>
              <button class="row-icon-btn row-field-mini-btn" type="button" data-action="rewrite-voiceover-text" data-row-id="${escapeHtml(creativeRow.id)}" title="Reformular guion con Gemini (más corto, sin perder esencia)" aria-label="Reformular guion con Gemini">
                <i class="fas fa-magic" aria-hidden="true"></i>
              </button>
              <button class="row-icon-btn row-field-mini-btn" type="button" data-action="restore-voiceover-text" data-row-id="${escapeHtml(creativeRow.id)}" title="Restaurar guion original" aria-label="Restaurar guion original"${String(creativeRow.voiceOverOriginalText || "").trim() ? "" : " disabled"}>
                <i class="fas fa-undo-alt" aria-hidden="true"></i>
              </button>
            </span>
          </span>
          <textarea rows="4" data-field="voiceOverText" data-row-id="${escapeHtml(creativeRow.id)}">${escapeHtml(creativeRow.voiceOverText || "")}</textarea>
        </label>
        <label class="row-field wide">
          <span>Descripción de escena</span>
          <textarea rows="4" data-field="sceneDescription" data-row-id="${escapeHtml(creativeRow.id)}">${escapeHtml(creativeRow.sceneDescription || "")}</textarea>
        </label>
        <label class="row-field wide">
          <span class="row-field-head">
            <span>Texto en pantalla</span>
            <span class="row-field-inline-actions">
              <button class="row-icon-btn row-field-mini-btn" type="button" data-action="copy-voiceover-to-onscreen-text" data-row-id="${escapeHtml(creativeRow.id)}" title="Copiar guión → texto en pantalla" aria-label="Copiar guión a texto en pantalla">
                <i class="fas fa-level-down-alt" aria-hidden="true"></i>
              </button>
            </span>
          </span>
          <input type="text" data-field="onScreenText" data-row-id="${escapeHtml(creativeRow.id)}" value="${escapeHtml(creativeRow.onScreenText || "")}" placeholder="Opcional">
        </label>
        <label class="row-field wide">
          <span>Transición</span>
          <textarea rows="2" data-field="transition" data-row-id="${escapeHtml(creativeRow.id)}">${escapeHtml(creativeRow.transition || creativeRow.visualNotes || "")}</textarea>
        </label>
        <label class="row-field wide">
          <span class="row-field-head">
            <span class="row-field-title-inline">
              Elemento visual
              ${(() => {
        const proposals = Array.isArray(creativeRow?.visualNotesProposals) ? creativeRow.visualNotesProposals : [];
        const resolved = Array.isArray(creativeRow?.visualNotesResolvedProposals) ? creativeRow.visualNotesResolvedProposals : [];
        const hasProposals = proposals.length > 0 || !!activeVisualProposal;
        const allRealized = proposals.length > 0 && proposals.every(p => resolved.includes(p));
        if (!hasProposals) return "";
        return `<span class="proposal-badge ${allRealized ? "is-realized" : "is-pending"}">PROPUESTA</span>`;
      })()}
            </span>
            <span class="row-field-inline-actions">
              <button class="row-icon-btn row-field-mini-btn" type="button" data-action="open-gemini-creativity" data-row-id="${escapeHtml(creativeRow.id)}" title="Ajustar creatividad de Gemini" aria-label="Ajustar creatividad de Gemini">
                <i class="fas fa-sliders-h" aria-hidden="true"></i>
              </button>
              <button class="row-icon-btn row-field-mini-btn" type="button" data-action="rewrite-visual-notes" data-row-id="${escapeHtml(creativeRow.id)}" title="Regenerar elemento visual con Gemini (más detallado)" aria-label="Regenerar elemento visual con Gemini">
                <i class="fas fa-magic" aria-hidden="true"></i>
              </button>
            </span>
          </span>
          <textarea rows="3" data-field="visualNotes" data-row-id="${escapeHtml(creativeRow.id)}">${escapeHtml(creativeRowEditorVisualNotes)}</textarea>

          <!-- PROPUESTA ACTIVA (SELECCIONADA) -->
          ${(() => {
        const displayedActiveVisualProposal = window.resolveDisplayedVisualProposal(creativeRow);
        if (!displayedActiveVisualProposal) return "";
        return `
            <div class="row-active-proposal${window.isVisualProposalResolved(creativeRow, displayedActiveVisualProposal) ? " is-resolved" : ""}">
              <div class="row-active-proposal-head">
                <span class="row-active-proposal-label">Propuesta Activa</span>
                <button class="row-icon-btn proposal-action-btn is-warning" type="button" data-action="delete-visual-proposal-text" data-row-id="${escapeHtml(creativeRow.id)}" data-proposal-text="${escapeHtml(displayedActiveVisualProposal)}" title="Marcar propuesta como realizada">
                  <i class="fas fa-times-circle"></i>
                </button>
              </div>
              <div class="row-active-proposal-text">${escapeHtml(displayedActiveVisualProposal)}</div>
            </div>
          `;
      })()}
          
          <!-- SECCIÓN DE PROPUESTAS MULTIPLES (HISTORIAL) -->
          ${(() => {
        const proposals = Array.isArray(creativeRow.visualNotesProposals) ? [...creativeRow.visualNotesProposals] : [];
        const displayedActiveVisualProposal = window.resolveDisplayedVisualProposal(creativeRow);
        const filteredProposals = proposals.filter(p => p !== displayedActiveVisualProposal);

        if (filteredProposals.length === 0) return "";
        return `
              <div class="row-proposals-list">
                <span class="row-proposals-list-label">Otras propuestas disponibles</span>
                ${filteredProposals.map((text, idx) => `
                  <div class="proposal-item${window.isVisualProposalResolved(creativeRow, text) ? " is-resolved" : ""}">
                    <textarea class="proposal-item-text" readonly rows="2">${escapeHtml(text)}</textarea>
                    <div class="proposal-item-actions">
                      <button class="row-icon-btn proposal-action-btn is-primary" type="button" data-action="apply-visual-proposal-text" data-row-id="${escapeHtml(creativeRow.id)}" data-proposal-text="${escapeHtml(text)}" title="Seleccionar esta propuesta como oficial">
                        <i class="fas fa-thumbtack"></i>
                      </button>
                      <button class="row-icon-btn proposal-action-btn is-success" type="button" data-action="delete-visual-proposal-text" data-row-id="${escapeHtml(creativeRow.id)}" data-proposal-text="${escapeHtml(text)}" title="Marcar propuesta como realizada (Tachar)">
                        <i class="fas fa-check-circle"></i>
                      </button>
                    </div>
                  </div>
                `).join("")}
              </div>
            `;
      })()}
        </label>
      </div>
    `;
  }

  const scenario = window.resolveScenarioForVideoMode(session, host);
  const podcastReferenceSections = !isVideo
    ? buildPodcastReferenceSectionsMarkup(session, host)
    : "";
  const imagePrompts = window.normalizeVideoImagePrompts(row?.imagePrompts || []).map((prompt) => (
    window.isEducationalVideoMode(session)
      ? requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")(prompt)
      : prompt
  ));
  return `
    <textarea class="dialog-editor" data-field="text" data-row-id="${escapeHtml(row.id)}">${escapeHtml(row.text)}</textarea>
    <div class="script-row-grid">
      <label class="global-speaker-field global-speaker-field-scenario global-speaker-field-scenario-wide">
        <span>${escapeHtml(panelCopy.rowScenarioLabel)}</span>
        <input data-field="scenario" data-host-name="${escapeHtml(host)}" type="text" value="${escapeHtml(scenario)}" placeholder="${escapeHtml(panelCopy.rowScenarioPlaceholder)}">
      </label>
      ${podcastReferenceSections}
      ${isVideo ? `
        <label class="row-field wide">
          <span>${escapeHtml(panelCopy.scenePromptLabel)}</span>
          <textarea rows="3" data-field="scenePrompt" data-row-id="${escapeHtml(row.id)}" placeholder="${escapeHtml(panelCopy.scenePromptPlaceholder)}">${escapeHtml(window.isEducationalVideoMode(session) ? window.normalizeVideoScenePrompt(row.scenePrompt || "", row, session) : (row.scenePrompt || ""))}</textarea>
        </label>
        <label class="row-field wide">
          <span>${escapeHtml(panelCopy.videoDirectiveLabel)}</span>
          <textarea rows="2" data-field="videoDirective" data-row-id="${escapeHtml(row.id)}" placeholder="${escapeHtml(panelCopy.videoDirectivePlaceholder)}">${escapeHtml(window.isEducationalVideoMode(session) ? requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")(row.videoDirective || "") : (row.videoDirective || ""))}</textarea>
        </label>
        <label class="row-field wide">
          <span>${escapeHtml(panelCopy.imagePromptsLabel)}</span>
          <textarea rows="4" data-field="imagePrompts" data-row-id="${escapeHtml(row.id)}" placeholder="${escapeHtml(panelCopy.imagePromptsPlaceholder)}">${escapeHtml(imagePrompts.join("\n"))}</textarea>
        </label>
      ` : ""}
      <label class="row-field">
        <span>Locutor</span>
        <select data-field="speaker" data-row-id="${escapeHtml(row.id)}">
          ${buildSpeakerOptionsForRow(session, row.speaker)}
        </select>
      </label>
      <label class="row-field">
        <span>Expresión</span>
        <select data-field="expression" data-row-id="${escapeHtml(row.id)}">
          ${buildOptions(window.EXPRESSIONS, row.expression)}
        </select>
      </label>
      <label class="row-field">
        <span>Voz</span>
        <select data-field="voiceName" data-speaker="${escapeHtml(row.speaker)}" data-row-id="${escapeHtml(row.id)}">
          ${buildVoiceOptions(window.resolveConfiguredSpeakerVoiceForGeneration(row, session))}
        </select>
      </label>
      <!-- El campo Duración (durationSec) ha sido removido para evitar confusión con la velocidad del audio -->
      <label class="row-field">
        <span>Media</span>
        <select data-field="mediaCue" data-row-id="${escapeHtml(row.id)}">
          ${buildOptions(window.MEDIA_CUES, row.mediaCue)}
        </select>
      </label>
      <label class="row-field wide">
        <span class="row-field-head">
          <span class="row-field-title-inline">
            Notas
            ${(() => {
      const proposals = Array.isArray(row?.visualNotesProposals) ? row.visualNotesProposals : [];
      const resolved = Array.isArray(row?.visualNotesResolvedProposals) ? row.visualNotesResolvedProposals : [];
      const hasProposals = proposals.length > 0 || !!window.resolveActiveVisualProposal(row);
      const allRealized = proposals.length > 0 && proposals.every(p => resolved.includes(p));
      if (!hasProposals) return "";
      return `<span class="proposal-badge ${allRealized ? "is-realized" : "is-pending"}">PROPUESTA</span>`;
    })()}
          </span>
          ${window.resolveActiveVisualProposal(row) ? `
            <span class="row-field-inline-actions">
              <button class="row-icon-btn row-field-mini-btn proposal-action-btn is-success" type="button" data-action="apply-visual-proposal-text" data-row-id="${escapeHtml(row.id)}" data-proposal-text="${escapeHtml(window.resolveActiveVisualProposal(row))}" title="Aceptar y aplicar propuesta de cambio visual">
                <i class="fas fa-check-circle"></i>
              </button>
            </span>
          ` : ""}
        </span>
        <textarea rows="2" data-field="notes" data-row-id="${escapeHtml(row.id)}">${escapeHtml(row.notes || "")}</textarea>

        <!-- PROPUESTA ACTIVA (SELECCIONADA) -->
        ${(() => {
      const displayedActiveVisualProposal = window.resolveDisplayedVisualProposal(row);
      if (!displayedActiveVisualProposal) return "";
      return `
          <div class="row-active-proposal${window.isVisualProposalResolved(row, displayedActiveVisualProposal) ? " is-resolved" : ""}">
            <div class="row-active-proposal-head">
              <span class="row-active-proposal-label">Propuesta Activa</span>
              <button class="row-icon-btn proposal-action-btn is-warning" type="button" data-action="delete-visual-proposal-text" data-row-id="${escapeHtml(row.id)}" data-proposal-text="${escapeHtml(displayedActiveVisualProposal)}" title="Marcar propuesta como realizada">
                <i class="fas fa-times-circle"></i>
              </button>
            </div>
            <div class="row-active-proposal-text">${escapeHtml(displayedActiveVisualProposal)}</div>
          </div>
        `;
    })()}
        
        <!-- SECCIÓN DE PROPUESTAS MULTIPLES (HISTORIAL) -->
        ${(() => {
      const proposals = Array.isArray(row.visualNotesProposals) ? [...row.visualNotesProposals] : [];
      const displayedActiveVisualProposal = window.resolveDisplayedVisualProposal(row);
      const filteredProposals = proposals.filter(p => p !== displayedActiveVisualProposal);

      if (filteredProposals.length === 0) return "";
      return `
            <div class="row-proposals-list">
              <span class="row-proposals-list-label">Otras propuestas disponibles</span>
              ${filteredProposals.map((text, idx) => `
                <div class="proposal-item${window.isVisualProposalResolved(row, text) ? " is-resolved" : ""}">
                  <textarea class="proposal-item-text" readonly rows="2">${escapeHtml(text)}</textarea>
                  <div class="proposal-item-actions">
                    <button class="row-icon-btn proposal-action-btn is-success" type="button" data-action="apply-visual-proposal-text" data-row-id="${escapeHtml(row.id)}" data-proposal-text="${escapeHtml(text)}" title="Seleccionar esta propuesta">
                      <i class="fas fa-check-circle"></i>
                    </button>
                    <button class="row-icon-btn proposal-action-btn is-danger" type="button" data-action="delete-visual-proposal-text" data-row-id="${escapeHtml(row.id)}" data-proposal-text="${escapeHtml(text)}" title="Marcar propuesta como realizada">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              `).join("")}
            </div>
          `;
    })()}
      </label>
    </div>
  `;
}

function buildPodcastReferenceSectionsMarkup(session, speaker = "Host A") {
  const host = String(speaker || "").trim() || "Host A";
  const speakerReferenceMap = typeof window.getSpeakerReferenceImageMap === "function"
    ? (window.getSpeakerReferenceImageMap(session) || {})
    : {};
  const speakerReference = speakerReferenceMap[host] || null;
  const globalScenarioDeck = typeof window.getGlobalScenarioDeck === "function"
    ? window.getGlobalScenarioDeck(session)
    : { activeId: "", items: [] };
  const activeScenarioId = String(globalScenarioDeck?.activeId || "").trim();
  const activeScenario = Array.isArray(globalScenarioDeck?.items)
    ? (globalScenarioDeck.items.find((item) => String(item?.id || "").trim() === activeScenarioId) || globalScenarioDeck.items[0] || null)
    : null;
  const scenarioReferenceMap = typeof window.getScenarioReferenceImageMap === "function"
    ? (window.getScenarioReferenceImageMap(session) || {})
    : {};
  const scenarioReference = activeScenario ? (scenarioReferenceMap[String(activeScenario.id || "").trim()] || null) : null;

  return `
    <div class="script-row-reference-grid">
      <div class="inspector-row-reference">
        <div class="inspector-row-reference-head">
          <span>Locutor de referencia</span>
          <span class="inspector-row-reference-name">${speakerReference ? escapeHtml(speakerReference.name || host) : "Sin referencia"}</span>
        </div>
        <div class="podcast-portrait-actions inspector-row-reference-actions">
          <button class="row-icon-btn" type="button" data-action="attach-speaker-reference-image" data-speaker="${escapeHtml(host)}" title="Adjuntar imagen de referencia del locutor">
            <i class="fas fa-paperclip"></i>
          </button>
          ${speakerReference ? `<button class="row-icon-btn" type="button" data-action="clear-speaker-reference-image" data-speaker="${escapeHtml(host)}" title="Quitar referencia del locutor"><i class="fas fa-times"></i></button>` : ""}
        </div>
        ${speakerReference
          ? `<div class="inspector-row-reference-preview"><img src="${escapeHtml(window.resolveReferenceImagePreviewUrl(speakerReference))}" alt="${escapeHtml(speakerReference.name || host)}"></div>`
          : `<div class="inspector-row-reference-empty">Adjunta una imagen de referencia para ${escapeHtml(window.resolveSpeakerDisplayName(host, session))}.</div>`}
      </div>
      <div class="inspector-row-reference">
        <div class="inspector-row-reference-head">
          <span>Escenario</span>
          <span class="inspector-row-reference-name">${activeScenario ? escapeHtml(activeScenario.title || "Escenario activo") : "Sin escenario"}</span>
        </div>
        <div class="podcast-scenario-actions inspector-row-reference-actions">
          ${activeScenario ? `<button class="row-icon-btn" type="button" data-action="attach-scenario-reference-image" data-scenario-id="${escapeHtml(String(activeScenario.id || "").trim())}" title="Adjuntar imagen de referencia del escenario">
            <i class="fas fa-paperclip"></i>
          </button>` : ""}
          ${activeScenario && scenarioReference ? `<button class="row-icon-btn" type="button" data-action="clear-scenario-reference-image" data-scenario-id="${escapeHtml(String(activeScenario.id || "").trim())}" title="Quitar referencia del escenario"><i class="fas fa-times"></i></button>` : ""}
        </div>
        ${activeScenario
          ? (scenarioReference
            ? `<div class="inspector-row-reference-preview"><img src="${escapeHtml(window.resolveReferenceImagePreviewUrl(scenarioReference))}" alt="${escapeHtml(scenarioReference.name || activeScenario.title || "Escenario")}"></div>`
            : `<div class="inspector-row-reference-empty">Escenario activo: ${escapeHtml(activeScenario.title || "Escenario")}. Puedes adjuntar una referencia visual para guiarlo.</div>`)
          : `<div class="inspector-row-reference-empty">Selecciona o genera un escenario global para los locutores.</div>`}
      </div>
    </div>
  `;
}

/**
 * Builds the inspector-specific script row editor card markup.
 */
function buildInspectorScriptRowMarkup(session, row, index = -1) {
  const safeIndex = Number.isFinite(index) && index >= 0 ? index : 0;
  const panelCopy = window.getPanelModeCopy(session);
  const isVideo = panelCopy.videoMode === true;
  const activeVisualProposal = window.resolveActiveVisualProposal(row);
  const rowId = String(row?.id || "").trim();
  const speaker = String(row?.speaker || "").trim() || "Host A";
  const rowReference = ((panelCopy.videoMode || panelCopy.videoPodcastMode) && rowId)
    ? window.resolveRowReferenceAsset(rowId, session)
    : null;
  const rowReferenceImages = ((panelCopy.videoMode || panelCopy.videoPodcastMode) && rowId)
    ? (window.getRowReferenceImageListMap(session)[rowId] || [])
    : [];
  const podcastReferenceSections = !isVideo
    ? buildPodcastReferenceSectionsMarkup(session, speaker)
    : "";
  return `
    <article class="script-row script-row-inspector" data-row-id="${escapeHtml(row.id)}">
      <div class="script-row-head script-row-head-inspector">
        <div class="row-head-left">
          <span class="row-chip">${panelCopy.videoMode ? "Secuencia" : "Escena"} ${safeIndex + 1}</span>
          ${activeVisualProposal ? `<span class="row-chip row-chip-proposal-new">Propuesta nueva</span>` : ""}
          ${panelCopy.videoMode ? "" : `<span class="row-chip">${escapeHtml(String(row.speaker || "").trim() || "Host A")}</span>`}
        </div>
        ${(panelCopy.videoMode || panelCopy.videoPodcastMode)
      ? `
            <div class="row-actions row-actions-inspector">
              <button class="row-icon-btn" type="button" data-action="attach-row-reference-image" data-row-id="${escapeHtml(row.id)}" title="Adjuntar imagen o video de referencia de la escena" aria-label="Adjuntar imagen o video de referencia de la escena">
                <i class="fas fa-paperclip"></i>
              </button>
              ${rowReference
        ? `<button class="row-icon-btn" type="button" data-action="clear-row-reference-image" data-row-id="${escapeHtml(row.id)}" title="Quitar referencia de la escena" aria-label="Quitar referencia de la escena"><i class="fas fa-times"></i></button>`
        : ""}
            </div>
          `
      : ""}
      </div>
      ${(panelCopy.videoMode || panelCopy.videoPodcastMode)
      ? `
          <div class="inspector-row-reference">
            <div class="inspector-row-reference-head">
              <span>${rowReference?.kind === "video" ? "Video de referencia" : "Referencia visual"}</span>
              <span class="inspector-row-reference-name">${rowReference?.kind === "video"
        ? escapeHtml(rowReference.name)
        : rowReferenceImages.length > 1
          ? `${rowReferenceImages.length} imagenes`
          : rowReference
            ? escapeHtml(rowReference.name)
            : "Sin referencia"
      }</span>
            </div>
            ${rowReference
        ? `<div class="inspector-row-reference-preview">${rowReference.kind === "video"
          ? `<video src="${escapeHtml(rowReference.dataUrl || window.resolveStorageVideoUrl(rowReference.downloadUrl, rowReference.storagePath))}" muted playsinline controls preload="metadata"></video>`
          : rowReferenceImages.length > 1
            ? `<div class="inspector-row-reference-gallery">${rowReferenceImages.map((image, imageIndex) => `<img src="${escapeHtml(window.resolveReferenceImagePreviewUrl(image))}" alt="${escapeHtml(image.name || `Referencia ${imageIndex + 1}`)}">`).join("")}</div>`
            : `<img src="${escapeHtml(window.resolveReferenceImagePreviewUrl(rowReference))}" alt="${escapeHtml(rowReference.name)}">`
        }</div>`
        : `<div class="inspector-row-reference-empty">Adjunta una imagen o video para guiar el video de esta escena.</div>`}
          </div>
        `
      : ""}
      ${podcastReferenceSections}
      ${buildScriptRowEditorMarkup(session, row, safeIndex)}
    </article>
  `;
}

/**
 * Builds a blank script row model with default speaker and expressions.
 */
function buildBlankScriptRow(session = null, options = {}) {
  const activeSession = session || window.getActiveSession();
  const panelCopy = window.getPanelModeCopy(activeSession);
  const speakerOptions = window.getSpeakerOptions(activeSession);
  const fallbackSpeaker = speakerOptions[0] || "Host A";
  const speaker = panelCopy.videoMode ? "Narrador" : String(options.speaker || fallbackSpeaker).trim() || fallbackSpeaker;
  const expression = panelCopy.videoMode ? "Neutral" : String(options.expression || "Neutral").trim() || "Neutral";
  const durationSec = panelCopy.videoMode ? window.VIDEO_SCENE_MAX_SEC : 6;
  const base = {
    id: window.makeId("row"),
    speaker,
    voiceName: window.resolveSpeakerVoiceName(speaker, activeSession),
    voiceNameSource: "host",
    expression,
    durationSec,
    mediaCue: "Sin media",
    text: "",
    notes: "",
    scenePrompt: "",
    imagePrompts: [],
    disfluencyConfig: { ...(window.DEFAULT_DISFLUENCY_CONFIG || {}) }
  };
  if (!panelCopy.videoMode) return base;
  return {
    ...base,
    voiceOverText: "",
    voiceOverOriginalText: "",
    sceneDescription: "",
    onScreenText: "",
    transition: "",
    visualNotes: "",
    geminiCreativityLevel: 3
  };
}

/**
 * Determines whether script updates should happen during dynamic keypress 'input' events.
 */
function shouldHandleScriptFieldOnInput(event) {
  const target = event.target.closest("[data-row-id][data-field]");
  if (!target) return false;
  const field = target.dataset.field;
  return (
    field === "text" ||
    field === "notes" ||
    field === "voiceOverText" ||
    field === "sceneDescription" ||
    field === "onScreenText" ||
    field === "transition" ||
    field === "visualNotes"
  );
}

/**
 * Handles individual field updates on a script row (triggered by input/change events).
 */
function handleScriptFieldUpdate(event) {
  const target = event.target.closest("[data-row-id][data-field]");
  if (!target) return;
  if (target.matches?.("textarea.dialog-editor, textarea[data-field='notes']")) {
    autoSizeScriptTextarea(target);
  }
  const rowId = target.dataset.rowId;
  const field = target.dataset.field;
  const session = window.getActiveSession();
  const els = window.els || {};
  const isLiveInput = String(event?.type || "").trim().toLowerCase() === "input";
  const sessionUpdateReason = field === "durationSec" ? "structure" : "script-edit";
  const baseSessionUpdateOptions = {
    persist: false,
    recordHistory: !isLiveInput,
    autosaveReason: sessionUpdateReason
  };
  const rawValue = field === "durationSec"
    ? Number(target.value || 0)
    : field === "disfluencyEnabled" || field === "stutterEnabled" || field === "relateWithPreviousScene"
      ? Boolean(target.checked)
      : target.value;
  const affectsMontagePreview = field === "voiceOverText"
    || field === "sceneDescription"
    || field === "onScreenText"
    || field === "visualNotes"
    || field === "transition"
    || field === "durationSec";

  if (field === "disfluencyEnabled" || field === "fillerLevel" || field === "errorLevel" || field === "stutterEnabled" || field === "stutterLevel") {
    const limits = window.DISFLUENCY_LEVEL_MAX || { fillerLevel: 10, errorLevel: 10, stutterLevel: 10 };
    const levelValue = field === "disfluencyEnabled" || field === "stutterEnabled"
      ? rawValue
      : Math.max(
        0,
        Math.min(
          field === "fillerLevel"
            ? limits.fillerLevel
            : field === "errorLevel"
              ? limits.errorLevel
              : limits.stutterLevel,
          Number(rawValue) || 0
        )
      );
    window.upsertActiveSession((current) => ({
      ...current,
      script: {
        ...current.script,
        rows: (current.script?.rows || []).map((row) => (
          row.id === rowId
            ? {
              ...row,
              disfluencyConfig: window.normalizeDisfluencyConfig({
                ...window.getRowDisfluencyConfig(row),
                ...(field === "disfluencyEnabled" ? { enabled: Boolean(levelValue) } : {}),
                ...(field === "fillerLevel" ? { fillerLevel: levelValue } : {}),
                ...(field === "errorLevel" ? { errorLevel: levelValue } : {}),
                ...(field === "stutterEnabled" ? { stutterEnabled: Boolean(levelValue) } : {}),
                ...(field === "stutterLevel" ? { stutterLevel: levelValue } : {})
              })
            }
            : row
        ))
      }
    }), { ...baseSessionUpdateOptions, render: false });
    if (typeof window.updateRowDisfluencyButtonState === "function") {
      window.updateRowDisfluencyButtonState(rowId);
    }
    if (typeof window.syncRowDisfluencyModal === "function") {
      window.syncRowDisfluencyModal(window.getActiveSession());
    }
    return;
  }
  const value = field === "speaker" ? window.normalizeSpeakerLabel(rawValue, "Host A") : rawValue;
  if (field === "voiceName") {
    const row = getScriptEditorRuntime().getSessionRows(session).find((entry) => entry.id === rowId) || null;
    const speaker = String(row?.speaker || target.dataset.speaker || "").trim() || "Host A";
    if (typeof window.logPodcasterLiveDebug === "function") {
      window.logPodcasterLiveDebug("voice-change", {
        rowId,
        speaker,
        value
      });
    }
    window.stopRowAudio();
    window.stopGeminiLiveSession().catch(() => { });
    window.upsertActiveSession((current) => ({
      ...current,
      script: {
        ...current.script,
        rows: window.normalizeRows(current.script.rows).map((entry) => (
          entry.id === rowId
            ? window.normalizeRowVoiceConfig({
              ...entry,
              voiceName: value,
              voiceNameSource: "row",
              lastEditedAt: Date.now()
            }, current, {
              speaker
            })
            : entry
        ))
      }
    }), { ...baseSessionUpdateOptions, render: false });
    return;
  }

  const nextRender = !isLiveInput && (field === "speaker" || field === "scenePrompt" || field === "imagePrompts");
  if (field === "speaker") {
    if (typeof window.logPodcasterLiveDebug === "function") {
      window.logPodcasterLiveDebug("speaker-change", {
        rowId,
        from: session?.script?.rows?.find((row) => row.id === rowId)?.speaker,
        to: value
      });
    }
    window.stopRowAudio();
    window.stopGeminiLiveSession().catch(() => { });
  }
  if (field === "scenePrompt") {
    window.upsertActiveSession((current) => ({
      ...current,
      script: {
        ...current.script,
        rows: (current.script?.rows || []).map((row) => (
          row.id === rowId
            ? {
              ...row,
              scenePrompt: window.isEducationalVideoMode(current)
                ? requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")(String(target.value || "").replace(/\s+/g, " ").trim())
                : String(target.value || "").replace(/\s+/g, " ").trim()
            }
            : row
        ))
      }
    }), { ...baseSessionUpdateOptions, render: nextRender });
    return;
  }
  if (field === "videoDirective") {
    window.upsertActiveSession((current) => ({
      ...current,
      script: {
        ...current.script,
        rows: (current.script?.rows || []).map((row) => (
          row.id === rowId
            ? {
              ...row,
              videoDirective: window.isEducationalVideoMode(current)
                ? requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")(String(target.value || "").replace(/\s+/g, " ").trim())
                : String(target.value || "").replace(/\s+/g, " ").trim()
            }
            : row
        ))
      }
    }), { ...baseSessionUpdateOptions, render: nextRender });
    return;
  }
  if (field === "imagePrompts") {
    const videoPreset = window.resolveActiveVideoPreset(session);
    const prompts = window.normalizeVideoImagePrompts(target.value || "").map((prompt) => (
      videoPreset !== "creative" && window.isEducationalVideoMode(session)
        ? requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")(prompt)
        : prompt
    ));
    window.upsertActiveSession((current) => ({
      ...current,
      script: {
        ...current.script,
        rows: (current.script?.rows || []).map((row) => (
          row.id === rowId
            ? {
              ...row,
              imagePrompts: prompts
            }
            : row
        ))
      }
    }), { ...baseSessionUpdateOptions, render: nextRender });
    return;
  }
  if (window.isCreativeVideoMode(session) && (field === "voiceOverText" || field === "sceneDescription" || field === "onScreenText" || field === "visualNotes" || field === "transition" || field === "durationSec")) {
    const videoPreset = window.resolveActiveVideoPreset(session);
    window.upsertActiveSession((current) => ({
      ...current,
      script: {
        ...current.script,
        hosts: ["Narrador"],
        rows: window.normalizeRows(current.script.rows).map((row, index) => (
          row.id === rowId
            ? window.normalizeCreativeRow({
              ...row,
              [field]: value,
              ...(field === "sceneDescription"
                ? {
                  scenePrompt: value,
                  Descripción: value,
                  descripcionEscena: value,
                  descripcionDeEscena: value,
                  sceneDescriptionEditedStored: true
                }
                : {}),
              ...(field === "onScreenText"
                ? {
                  onScreenTextNoSummarize: true
                }
                : {}),
              ...(field === "visualNotes"
                ? {
                  visualNotesEditedText: value,
                  visualNotesEditedStored: true,
                  visualNotesProposal: ""
                }
                : {}),
              lastEditedAt: Date.now()
            }, index, {
              videoPreset,
              ...(field === "visualNotes" ? { preserveExactVisualNotes: true } : {})
            })
            : window.normalizeCreativeRow(row, index, { videoPreset })
        ))
      }
    }), { ...baseSessionUpdateOptions, render: !isLiveInput });
    if (field === "onScreenText") {
      const nextText = String(rawValue || "").replace(/\s+/g, " ").trim();
      if (typeof window.syncOnScreenTextClipVisibilityFromRowText === "function") {
        window.syncOnScreenTextClipVisibilityFromRowText(rowId, nextText, {
          render: false,
          autosave: false,
          persist: false,
          recordHistory: false
        });
      }
      if (window.podcastVideoState?.enabled && typeof window.renderPodcastVideoTimeline === "function") {
        window.renderPodcastVideoTimeline(window.getActiveSession(), { lightweight: true });
      }
    }
    if (affectsMontagePreview && els.montageExportModal && !els.montageExportModal.hidden) {
      if (typeof window.scheduleMontageExportPreviewRefresh === "function") {
        window.scheduleMontageExportPreviewRefresh(isLiveInput ? 320 : 120);
      }
    }
    return;
  }
  window.upsertActiveSession((current) => ({
    ...current,
    ...(field === "speaker"
      ? {
        speakerVoiceMap: {
          ...window.getSpeakerVoiceMap(current),
          [value]: window.getSpeakerVoiceMap(current)[value] || window.resolveSpeakerVoiceName(value, current)
        },
        speakerExpressionMap: {
          ...window.getSpeakerExpressionMap(current),
          [value]: window.getSpeakerExpressionMap(current)[value] || "Neutral"
        },
        speakerNameMap: {
          ...window.getSpeakerNameMap(current),
          [value]: window.getSpeakerNameMap(current)[value] || window.DEFAULT_SPEAKER_NAME_MAP[value] || value
        },
        speakerScenarioMap: {
          ...window.getSpeakerScenarioMap(current),
          [value]: window.resolveActiveVideoPreset(current) !== "creative" && window.isEducationalVideoMode(current)
            ? requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")(window.getSpeakerScenarioMap(current)[value] || window.DEFAULT_SPEAKER_SCENARIO_MAP[value] || "Cabina premium de podcast")
            : window.getSpeakerScenarioMap(current)[value] || window.DEFAULT_SPEAKER_SCENARIO_MAP[value] || "Cabina premium de podcast"
        }
      }
      : {}),
    script: {
      ...current.script,
      rows: window.normalizeRows(current.script.rows).map((row) => (
        row.id === rowId
          ? (
            field === "speaker"
              ? window.normalizeRowVoiceConfig({
                ...row,
                speaker: value,
                voiceName: window.getSpeakerVoiceMap(current)[value] || window.resolveSpeakerVoiceName(value, current),
                voiceNameSource: "host",
                lastEditedAt: Date.now()
              }, current, {
                speaker: value
              })
              : { ...row, [field]: value, lastEditedAt: Date.now() }
          )
          : row
      ))
    }
  }), { ...baseSessionUpdateOptions, render: nextRender });
  if (field === "durationSec") {
    if (typeof window.refreshSessionMeta === "function") {
      window.refreshSessionMeta();
    }
    if (typeof window.renderSessions === "function") {
      window.renderSessions();
    }
  }
  if (affectsMontagePreview && els.montageExportModal && !els.montageExportModal.hidden) {
    if (typeof window.scheduleMontageExportPreviewRefresh === "function") {
      window.scheduleMontageExportPreviewRefresh(isLiveInput ? 320 : 120);
    }
  }
}

// --- Module Exports & API ---
const podcasterScriptEditorApi = {
  renderScript,
  buildScriptRowEditorMarkup,
  buildInspectorScriptRowMarkup,
  buildBlankScriptRow,
  shouldHandleScriptFieldOnInput,
  handleScriptFieldUpdate
};

registerPodcasterScriptEditorRuntime(podcasterScriptEditorApi);
window.PodcasterScriptEditor = podcasterScriptEditorApi;
Object.assign(window, podcasterScriptEditorApi);
