import { getAgentHistory, sendAgentTurn, startAgentConversation, startAgentRun, updateAgentRun } from "../services/marcie-agent-api.js?v=20260922r4";
import { createMarcieAgentVoice } from "../services/marcie-agent-voice.js?v=20260924r11";
import { createGuideSnapshot, saveGuideWithFallback } from "./marcie-guide-storage.mjs?v=20260924r3";

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

function configurationHtml(configuration = {}) {
  const platformLabels = {
    ebsco: "EBSCO",
    cochrane: "Cochrane Library",
    redalyc: "Redalyc",
    scielo: "SciELO",
    dialnet: "Dialnet",
    base: "BASE",
    refseek: "RefSeek",
    supplemental: "Otros sitios fiables"
  };
  const selectedPlatforms = (configuration.searchPlatforms || [])
    .map((platform) => platformLabels[platform] || platform)
    .filter(Boolean);
  const audienceResources = Object.entries(configuration.resourcesByAudience || {})
    .map(([audience, resources]) => `${audience}: ${(resources || []).join(", ")}`)
    .join(" · ");
  const rows = [
    ["Videos", configuration.sourceInputs?.youtube?.map((item) => item.videoId).join(", ")],
    ["Tema", configuration.topic],
    ["Públicos", configuration.selectedAudiences?.join(", ")],
    ["Tono", configuration.tone],
    ["Extensión", Object.values(configuration.extensionsByAudience || {}).join(" · ")],
    ["Fuentes de búsqueda", selectedPlatforms.length ? selectedPlatforms.join(", ") : (configuration.sourceMode === "all" ? "Todas las fuentes fiables" : "Pendiente")],
    ["Fuentes especiales", configuration.specialSources?.join(", ")],
    ["Recursos", audienceResources || configuration.resources?.join(", ")],
    ["Vocabulario", configuration.preferredVocabulary?.join(", ") || "Sin términos nuevos"]
  ];
  return `<dl class="marcie-agent-summary">${rows.filter(([label, value]) => label !== "Videos" || value).map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "Pendiente")}</dd></div>`).join("")}</dl>`;
}

function videoResearchHtml(videoResearch = {}) {
  const videos = Array.isArray(videoResearch.videos) ? videoResearch.videos : [];
  if (!videos.length) return "";
  return `<section class="marcie-agent-video-result"><div class="marcie-agent-video-result__heading"><i data-lucide="youtube"></i><strong>${videos.length} ${videos.length === 1 ? "video analizado" : "videos analizados"}</strong></div>${videos.map((video) => `<article><strong>${escapeHtml(video.title)}</strong><span>${escapeHtml(video.channel || "Canal no identificado")}</span><p>${escapeHtml(video.summary || "")}</p></article>`).join("")}${videoResearch.warnings?.length ? `<p class="marcie-agent-video-result__warning">${escapeHtml(videoResearch.warnings.join(" "))}</p>` : ""}</section>`;
}

function articlePreviewHtml(article = {}) {
  const blocks = Array.isArray(article.blocks) ? article.blocks : [];
  return `<article class="marcie-change-preview__article">
    <h4>${escapeHtml(article.title || "Artículo sin título")}</h4>
    ${article.subtitle ? `<p class="marcie-change-preview__subtitle">${escapeHtml(article.subtitle)}</p>` : ""}
    <div class="marcie-change-preview__content">${blocks.length ? blocks.map((block) => {
      const heading = block.title ? `<strong>${escapeHtml(block.title)}</strong>` : "";
      const text = block.text ? `<p>${escapeHtml(block.text)}</p>` : "";
      const items = block.items?.length ? `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
      return `<section>${heading}${text}${items}</section>`;
    }).join("") : "<p>La propuesta no contiene bloques visibles.</p>"}</div>
    <footer>${Number(article.sourceCount || 0)} fuentes · Revisión ${Number(article.revision || 0)}</footer>
  </article>`;
}

function changePreviewHtml(changePreview = {}) {
  if (!changePreview.preview) return "";
  const findings = Array.isArray(changePreview.findings) ? changePreview.findings : [];
  const changes = Array.isArray(changePreview.changes) ? changePreview.changes : [];
  return `<section class="marcie-change-preview" aria-label="Vista previa de cambios">
    <header><span>Vista previa</span><strong>Sin aplicar</strong></header>
    ${findings.length ? `<ul class="marcie-change-preview__findings">${findings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    ${changes.length ? `<div class="marcie-change-preview__changes"><h4>${changes.length} ${changes.length === 1 ? "cambio propuesto" : "cambios propuestos"}</h4>${changes.map((change, index) => `<article><header><strong>${escapeHtml(change.label || `Cambio ${index + 1}`)}</strong>${change.rationale ? `<span>${escapeHtml(change.rationale)}</span>` : ""}</header><div><span>Antes</span><p>${escapeHtml(change.before || "Sin contenido")}</p></div><div><span>Después</span><p>${escapeHtml(change.after || "Sin contenido")}</p></div></article>`).join("")}</div>` : ""}
    <details open><summary>Versión propuesta</summary>${articlePreviewHtml(changePreview.preview)}</details>
    ${changePreview.original ? `<details><summary>Comparar con la versión actual</summary>${articlePreviewHtml(changePreview.original)}</details>` : ""}
  </section>`;
}

function optionButton(option) {
  const kind = option.kind === "antihook" ? "antihook" : (option.kind === "hook" ? "hook" : "");
  const badge = kind ? `<small class="marcie-agent-option__kind">${kind === "antihook" ? "Antihook" : "Hook"}</small>` : "";
  const actionClass = option.action === "confirm" ? " marcie-agent-option--confirm" : "";
  const selectedClass = option.selected ? " is-selected" : "";
  const pressed = option.selected ? "true" : "false";
  return `<button type="button" class="marcie-agent-option${actionClass}${selectedClass}" aria-pressed="${pressed}" data-option-id="${escapeHtml(option.id)}" data-option-action="${escapeHtml(option.action || "")}" data-option-value="${escapeHtml(option.value || option.label || "")}" data-option-kind="${escapeHtml(kind)}">${badge}<span>${escapeHtml(option.label || option.value || option.id)}</span></button>`;
}

function responseNeedsOptions(response = {}) {
  if (!response || typeof response !== "object") return false;
  const prompt = response.uiPrompt || {};
  if (prompt.type === "url_list") return true;
  return Array.isArray(prompt.options) && prompt.options.length > 0;
}

function activityLabel(input = {}) {
  const action = String(input.action || "");
  if (action === "apply_change") return "Marcie está aplicando los cambios";
  if (action === "discard_change") return "Marcie está descartando la vista previa";
  const text = String(input.text || input.value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const videoCount = Array.isArray(input.urls) ? input.urls.length : ((text.match(/https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//g) || []).length);
  if (videoCount) return `Marcie está analizando ${videoCount === 1 ? "el video" : `${videoCount} videos`}. Puedes seguir escribiendo; tus mensajes quedarán en cola.`;
  if (/corrige|corregir|reescribe|reescribir|modifica|editar|cambia el tono|acorta|amplia/.test(text)) return "Marcie está preparando una corrección";
  if (/analiza|analizar|evalua|evaluar|revisa el articulo|revision del articulo/.test(text)) return "Marcie está analizando el artículo";
  if (/verifica|verificar|comprueba|comprobar|afirmacion|referencia/.test(text)) return "Marcie está verificando las afirmaciones";
  if (/busca|buscar|investiga|investigar|mas fuentes|bibliografia/.test(text)) return "Marcie está buscando fuentes";
  if (/wordpress|borrador/.test(text)) return "Marcie está revisando el borrador";
  return "Marcie está pensando en tu solicitud";
}

function summarizeAgentInput(input = {}) {
  return {
    hasText: Boolean(String(input.text || input.value || "").trim()),
    textLength: String(input.text || input.value || "").length,
    action: input.action || "",
    selectedCount: Array.isArray(input.selectedValues) ? input.selectedValues.length : 0,
    urlCount: Array.isArray(input.urls) ? input.urls.length : 0,
    audience: input.audience || ""
  };
}

function summarizeAgentResponse(response = {}) {
  return {
    phase: response.phase || "",
    promptType: response.uiPrompt?.type || "",
    runStatus: response.runStatus || "",
    runId: response.runId || "",
    hasChangePreview: Boolean(response.changePreview?.preview),
    optionCount: Array.isArray(response.uiPrompt?.options) ? response.uiPrompt.options.length : 0
  };
}

function agentErrorCode(error = {}) {
  return error.detail?.code || error.detail?.error || error.code || error.message || "";
}

function youtubeRejectedSummary(rejectedVideos = []) {
  return rejectedVideos
    .map((item) => {
      const label = item.videoId || item.url || item.value || "una URL";
      const detail = String(item.reason || "");
      const reason = detail.includes("youtube_caption_download_empty") || detail.includes("youtube_caption_content_invalid")
        ? "YouTube muestra una transcripción, pero su descarga pública llegó vacía o ilegible; también falló la lectura directa con Gemini."
        : detail.includes("youtube_public_captions_unavailable")
          ? "Gemini no pudo leer el video y no se obtuvo una transcripción pública legible."
        : detail.includes("youtube_caption_analysis_unavailable")
          ? "No está disponible el modelo para analizar los subtítulos del video."
          : detail.includes("youtube_analysis_timeout")
            ? "El análisis tardó más de lo esperado."
            : "El analizador no pudo procesar el contenido del video.";
      return `${label}: ${reason}`;
    })
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeAgentError(error = {}) {
  const code = agentErrorCode(error);
  if (error.networkError || error.message === "Failed to fetch") {
    return `No recibí respuesta del servidor; no se pudo confirmar si la selección se guardó. Referencia: ${error.requestId || "sin ID"}. Revisa la conexión antes de volver a elegir.`;
  }
  const rejected = Array.isArray(error.detail?.rejectedVideos) ? error.detail.rejectedVideos : [];
  const rejectedText = youtubeRejectedSummary(rejected);
  if (code === "youtube_analysis_empty") {
    return rejectedText.length
      ? `No pude analizar el contenido del video. No generaré propuestas basadas solo en su título o canal. Puedes volver a intentarlo más tarde.\n${rejectedText.map((item) => `• ${item}`).join("\n")}`
      : "No pude analizar el contenido del video. No generaré propuestas basadas solo en su título o canal. Puedes volver a intentarlo más tarde.";
  }
  if (code === "youtube_analysis_timeout") return "El análisis del video tardó más de lo esperado. Inténtalo nuevamente; la URL sigue siendo válida.";
  if (code === "youtube_urls_required") return "Agrega al menos una URL pública válida de YouTube.";
  if (code === "marcie_article_revision_conflict") return "El artículo cambió desde que Marcie preparó la vista previa. Recarga la sesión antes de aplicar nuevos cambios.";
  if (code === "marcie_agent_confirmation_required") return "Primero necesito confirmar la configuración final antes de crear los artículos. Vuelve a pulsar Crear artículos si el resumen está correcto.";
  if (code === "marcie_session_id_required") return "Selecciona una sesión con un artículo activo para trabajar con Marcie.";
  return error.message || "No pude continuar con la solicitud.";
}

export function initMarcieAgentPanel({ getActiveSession, onCreateSession, onReconfigureSession, onNewSessionRequest, onNotify, userId = "" } = {}) {
  const host = document.getElementById("marcie-agent-chat-host");
  if (!host) return { startGuidedSession() {} };

  let runId = "";
  let responseState = null;
  let busy = false;
  let guide = null;
  let panelActivity = "";
  let guideActivity = "";
  let loadedSessionId = "";
  let targetSessionId = "";
  let historyRequestId = 0;
  let voiceSurface = null;
  const panelMessages = [];
  const guideMessages = [];
  const queuedTurns = [];
  const guideStorageKey = userId ? `marcie_agent_guide_v1_${userId}` : "";
  let guideStorageMode = "local";

  function persistGuide() {
    if (!guideStorageKey || !guide || guideStorageMode === "memory") return;
    const snapshot = createGuideSnapshot({
      runId, targetSessionId, responseState, messages: guideMessages, input: guide.input?.value || "",
      phase: guide.root.dataset.guidePhase || ""
    });
    guideStorageMode = saveGuideWithFallback(window.localStorage, window.sessionStorage, guideStorageKey, snapshot, guideStorageMode);
    if (guideStorageMode === "memory") {
      console.warn("[MarcieAgent] Almacenamiento del navegador lleno; la guía continuará en esta pestaña.");
    }
  }

  function clearPersistedGuide() {
    targetSessionId = "";
    if (!guideStorageKey) return;
    for (const storage of [window.localStorage, window.sessionStorage]) {
      try { storage.removeItem(guideStorageKey); } catch (_) {}
    }
    guideStorageMode = "local";
  }

  host.innerHTML = `
    <section class="marcie-agent" aria-label="Agente Marcie">
      <span class="marcie-agent__status-sr" data-agent-status aria-live="polite">Listo para ayudarte</span>
      <div class="marcie-agent__body">
        <div class="marcie-agent__messages" data-agent-messages aria-live="polite"></div>
        <div class="marcie-agent__options" data-agent-options></div>
        <form class="marcie-agent__composer" data-agent-form>
          <textarea rows="3" maxlength="4000" placeholder="Escribe una instrucción para Marcie" aria-label="Mensaje para el agente" data-agent-input></textarea>
          <div class="marcie-agent__composer-actions">
            <div class="marcie-agent__composer-tools">
              <button type="button" class="marcie-agent__tool" data-agent-mic title="Dictar mensaje" aria-label="Dictar mensaje"><i data-lucide="mic"></i></button>
            </div>
            <button type="submit" class="marcie-agent__send" data-agent-send title="Enviar" aria-label="Enviar mensaje"><i data-lucide="send"></i></button>
          </div>
        </form>
      </div>
    </section>`;

  const panel = {
    root: host,
    body: host.querySelector(".marcie-agent__body"),
    messageList: host.querySelector("[data-agent-messages]"),
    optionsHost: host.querySelector("[data-agent-options]"),
    form: host.querySelector("[data-agent-form]"),
    input: host.querySelector("[data-agent-input]"),
    mic: host.querySelector("[data-agent-mic]"),
    send: host.querySelector("[data-agent-send]"),
    status: host.querySelector("[data-agent-status]")
  };

  function closeOptionsDialog(surface) {
    if (!surface?.optionsDialog) return;
    surface.optionsDialog.hidden = true;
    if (!surface.optionsTrigger?.hidden) surface.optionsTrigger.focus();
  }

  function openOptionsDialog(surface) {
    if (!surface?.optionsDialog || !surface.optionsHost.children.length) return;
    surface.optionsDialog.hidden = false;
    surface.optionsDialog.querySelector("[data-options-close]")?.focus();
  }

  function installOptionsDialog(surface) {
    const inlineHost = surface.optionsHost;
    inlineHost.replaceChildren();
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "marcie-agent-options-trigger";
    trigger.textContent = "Elegir opciones";
    trigger.hidden = true;
    inlineHost.appendChild(trigger);
    const dialog = document.createElement("div");
    dialog.className = "marcie-agent-options-backdrop";
    dialog.hidden = true;
    const titleId = surface === panel ? "marcie-panel-options-title" : "marcie-guide-options-title";
    dialog.innerHTML = `<section class="marcie-agent-options-dialog" role="dialog" aria-modal="true" aria-labelledby="${titleId}" aria-describedby="${titleId}-question"><header><div><span>AGENTE MARCIE</span><h2 id="${titleId}">Elige cómo continuar</h2><p id="${titleId}-question" class="marcie-agent-options-dialog__question" data-options-question></p></div><button type="button" data-options-close aria-label="Cerrar opciones"><i data-lucide="x"></i></button></header><div class="marcie-agent-options-dialog__content" data-options-content></div></section>`;
    (document.fullscreenElement || document.body).appendChild(dialog);
    trigger.addEventListener("click", () => openOptionsDialog(surface));
    dialog.querySelector("[data-options-close]").addEventListener("click", () => closeOptionsDialog(surface));
    dialog.addEventListener("click", (event) => { if (event.target === dialog) closeOptionsDialog(surface); });
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeOptionsDialog(surface); return; }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll("button:not([disabled]), input:not([disabled]), textarea:not([disabled])")].filter(element => !element.hidden);
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    });
    surface.optionsTrigger = trigger;
    surface.optionsDialog = dialog;
    surface.optionsHost = dialog.querySelector("[data-options-content]");
  }

  installOptionsDialog(panel);

  function activeSurface() {
    return guide || panel;
  }

  function statusLabel(value) {
    if (value === "listening") return "Escuchando";
    if (value === "speaking") return "Hablando con Marcie";
    if (value === "processing") return "Procesando";
    return "Listo para ayudarte";
  }

  function updateMicControl(surface, value) {
    if (!surface?.mic) return;
    const holdMode = surface.root.dataset.micMode === "hold";
    const label = value === "listening"
      ? (holdMode ? "Suelta para enviar" : "Escuchando; enviaré al pausar")
      : (surface === guide ? "Pulsar para hablar" : "Dictar mensaje");
    surface.mic.setAttribute("aria-label", label);
    surface.mic.title = label;
    const visibleLabel = surface.mic.querySelector("span");
    if (visibleLabel) visibleLabel.textContent = label;
  }

  function setStatus(value) {
    if (panel.status) panel.status.textContent = statusLabel(value);
    panel.root.dataset.agentState = value;
    if (guide) {
      guide.root.dataset.agentState = value;
    }
    updateMicControl(voiceSurface || activeSurface(), value);
  }

  const voice = createMarcieAgentVoice({
    onTranscript(value) {
      const surface = voiceSurface || activeSurface();
      surface.input.value = value;
    },
    onComplete(value) {
      const surface = voiceSurface;
      voiceSurface = null;
      if (!surface?.root?.isConnected || !String(value || "").trim()) return;
      surface.input.value = String(value).trim();
      surface.form.requestSubmit();
    },
    onStateChange: setStatus,
    onError(error) {
      onNotify?.(error.message, "warning");
      setStatus("idle");
      voiceSurface = null;
    }
  });

  function renderAgentMessage(message, index) {
    const queued = message.queued ? '<small>En cola</small>' : "";
    const actions = message.role === "user"
      ? `<div class="marcie-agent-message__actions" aria-label="Acciones del mensaje">
          <button type="button" class="marcie-agent-message__action" data-agent-message-action="copy" data-agent-message-index="${index}" title="Copiar mensaje" aria-label="Copiar mensaje"><i data-lucide="copy"></i></button>
          <button type="button" class="marcie-agent-message__action" data-agent-message-action="edit" data-agent-message-index="${index}" title="Editar y volver a enviar" aria-label="Editar y volver a enviar"><i data-lucide="pencil"></i></button>
        </div>`
      : "";
    return `<div class="marcie-agent-message marcie-agent-message--${message.role}${message.queued ? " is-queued" : ""}"><div class="marcie-agent-message__text">${escapeHtml(message.text)}</div>${queued}${actions}</div>`;
  }

  async function copyAgentMessage(text) {
    const value = String(text || "");
    if (!value) return false;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }

  function bindAgentMessageActions(surface, target) {
    if (!surface?.messageList) return;
    surface.messageList.onclick = async (event) => {
      const button = event.target.closest("[data-agent-message-action]");
      if (!button) return;
      const messages = target === "guide" ? guideMessages : panelMessages;
      const message = messages[Number(button.dataset.agentMessageIndex)];
      if (!message?.text) return;
      if (button.dataset.agentMessageAction === "edit") {
        surface.input.value = message.text;
        surface.input.focus();
        surface.input.setSelectionRange(message.text.length, message.text.length);
        onNotify?.("Mensaje listo para editar y volver a enviar.", "info");
        return;
      }
      try {
        const copied = await copyAgentMessage(message.text);
        onNotify?.(copied ? "Mensaje copiado." : "No se pudo copiar el mensaje.", copied ? "success" : "warning");
      } catch (_) {
        onNotify?.("No se pudo copiar el mensaje.", "warning");
      }
    };
  }

  function renderPanelMessages() {
    const conversation = panelMessages.length
      ? panelMessages.map((message, index) => renderAgentMessage(message, index)).join("")
      : `<div class="marcie-agent__empty"><i data-lucide="wand-sparkles"></i><p>Puedo revisar, verificar y mejorar los artículos creados.</p></div>`;
    const activity = panelActivity
      ? `<div class="marcie-agent-activity" role="status" aria-live="polite"><span class="marcie-agent-activity__dots" aria-hidden="true"><span></span><span></span><span></span></span><span>${escapeHtml(panelActivity)}</span></div>`
      : "";
    panel.messageList.innerHTML = conversation + activity;
    bindAgentMessageActions(panel, "panel");
    panel.messageList.scrollTop = panel.messageList.scrollHeight;
    window.lucide?.createIcons?.();
  }

  function renderGuideMessages() {
    if (!guide?.messageList) return;
    const historyMessages = guideMessages.filter((message) => !message.queued);
    const activity = guideActivity
      ? `<div class="marcie-agent-activity" role="status" aria-live="polite"><span class="marcie-agent-activity__dots" aria-hidden="true"><span></span><span></span><span></span></span><span>${escapeHtml(guideActivity)}</span></div>`
      : "";
    guide.messageList.innerHTML = guideMessages.map((message, index) => message.queued ? "" : renderAgentMessage(message, index)).join("") + activity;
    bindAgentMessageActions(guide, "guide");
    guide.messageList.hidden = historyMessages.length === 0 && !activity;
    guide.messageList.scrollTop = guide.messageList.scrollHeight;
    renderGuideQueue();
    persistGuide();
  }

  function renderGuideQueue() {
    if (!guide?.transcriptContainer || !guide?.queueList) return;
    const pending = queuedTurns.filter((turn) => turn.target === "guide" && turn.message?.queued);
    guide.transcriptContainer.hidden = pending.length === 0;
    guide.queueList.innerHTML = pending.map((turn) => `<p class="marcie-voice-guide__queue-item">${escapeHtml(turn.message.text)}</p>`).join("");
  }

  function renderActiveMessages() {
    if (guide) renderGuideMessages();
    else renderPanelMessages();
  }

  function renderGuideQuestion(response) {
    if (!guide) return;
    guide.root.dataset.guidePhase = response.phase || "";
  }

  function bindOptionEvents(surface, prompt, wrapper) {
    if (prompt.type === "change_preview") {
      wrapper.addEventListener("click", (event) => {
        const button = event.target.closest("[data-option-id]");
        if (!button) return;
        const action = button.dataset.optionAction || button.dataset.optionId;
        if (!action) return;
        surface.optionsHost.replaceChildren();
        responseState = null;
        submit({ action, value: button.dataset.optionId, text: button.dataset.optionValue });
      });
      return;
    }
    if (prompt.type === "multi_choice") {
      const continueButton = document.createElement("button");
      continueButton.type = "button";
      continueButton.className = "marcie-agent-continue";
      continueButton.textContent = "Continuar";
      continueButton.disabled = !wrapper.querySelector(".is-selected");
      continueButton.addEventListener("click", () => submit({ selectedValues: [...wrapper.querySelectorAll(".is-selected")].map((button) => button.dataset.optionId) }));
      surface.optionsHost.appendChild(continueButton);
      wrapper.addEventListener("click", (event) => {
        const button = event.target.closest("[data-option-id]");
        if (!button) return;
        button.classList.toggle("is-selected");
        button.setAttribute("aria-pressed", button.classList.contains("is-selected") ? "true" : "false");
        continueButton.disabled = !wrapper.querySelector(".is-selected");
      });
      return;
    }
    wrapper.addEventListener("click", (event) => {
      const button = event.target.closest("[data-option-id]");
      if (!button) return;
      const action = button.dataset.optionAction || undefined;
      if (action === "confirm") return confirmAndExecuteRun(surface === guide ? "guide" : "panel");
      return submit({ action, value: button.dataset.optionId, text: button.dataset.optionValue });
    });
  }

  function renderOptions(response, target = guide ? "guide" : "panel") {
    const surface = target === "guide" ? guide : panel;
    if (!surface) return;
    const prompt = response.uiPrompt || {};
    const options = Array.isArray(prompt.options) ? prompt.options : [];
    surface.optionsDialog.querySelector("[data-options-question]").textContent = String(prompt.question || response.message || "Selecciona una opción.");
    surface.optionsHost.innerHTML = `${response.phase === "summary" ? configurationHtml(response.configuration) : ""}${response.phase === "video_topic" ? videoResearchHtml(response.videoResearch || response.configuration?.videoResearch) : ""}`;
    if (prompt.type === "url_list") {
      renderYoutubeUrlList(surface, response.configuration?.sourceInputs?.youtube || []);
      surface.optionsTrigger.hidden = false;
      openOptionsDialog(surface);
      window.lucide?.createIcons?.();
      return;
    }
    if (!options.length) return;
    const wrapper = document.createElement("div");
    wrapper.className = `${prompt.type === "change_preview" ? "marcie-agent-change-actions" : "marcie-agent-option-list"}${prompt.type === "summary" ? " marcie-agent-option-list--summary" : ""}${target === "guide" ? " marcie-voice-guide__option-list" : ""}`;
    if (response.phase === "sources") {
      wrapper.setAttribute("role", "group");
      wrapper.setAttribute("aria-label", "Elegir plataforma de investigación");
    }
    const regularOptions = prompt.type === "summary" ? options.filter((option) => option.action !== "confirm") : options;
    const confirmOption = prompt.type === "summary" ? options.find((option) => option.action === "confirm") : null;
    const optionHtml = prompt.type === "summary"
      ? `<div class="marcie-agent-option-list__secondary">${regularOptions.map(optionButton).join("")}</div>${confirmOption ? `<div class="marcie-agent-final-actions">${optionButton(confirmOption)}</div>` : ""}`
      : options.map(optionButton).join("");
    wrapper.innerHTML = `${prompt.type === "change_preview" ? changePreviewHtml(response.changePreview) : ""}${optionHtml}`;
    surface.optionsHost.appendChild(wrapper);
    bindOptionEvents(surface, prompt, wrapper);
    surface.optionsTrigger.hidden = false;
    openOptionsDialog(surface);
  }

  function renderYoutubeUrlList(surface, existing = []) {
    const editor = document.createElement("div");
    editor.className = "marcie-agent-youtube";
    editor.innerHTML = `<div class="marcie-agent-youtube__rows"></div><div class="marcie-agent-youtube__actions"><button type="button" data-add-youtube><i data-lucide="plus"></i><span>Agregar video</span></button><button type="button" class="marcie-agent-youtube__analyze" data-analyze-youtube><i data-lucide="scan-search"></i><span>Analizar videos</span></button></div><p>Solo videos públicos. Marcie no guarda el audio ni una transcripción completa.</p>`;
    const rows = editor.querySelector(".marcie-agent-youtube__rows");
    const addRow = (value = "") => {
      if (rows.children.length >= 5) return;
      const row = document.createElement("label");
      row.innerHTML = `<span data-video-progress>URL ${rows.children.length + 1}</span><input type="url" inputmode="url" placeholder="https://www.youtube.com/watch?v=..." value="${escapeHtml(value)}"><button type="button" title="Quitar video" aria-label="Quitar video"><i data-lucide="trash-2"></i></button>`;
      row.querySelector("button").addEventListener("click", () => { row.remove(); if (!rows.children.length) addRow(); });
      rows.appendChild(row);
    };
    (existing.length ? existing : [{ url: "" }]).slice(0, 5).forEach((item) => {
      const url = typeof item === "string" ? item : item?.url || (item?.videoId ? `https://www.youtube.com/watch?v=${item.videoId}` : "");
      addRow(url);
    });
    editor.querySelector("[data-add-youtube]").addEventListener("click", () => { addRow(); window.lucide?.createIcons?.(); });
    editor.querySelector("[data-analyze-youtube]").addEventListener("click", () => {
      const urls = [...rows.querySelectorAll("input")].map((input) => input.value.trim()).filter(Boolean);
      if (!urls.length) return onNotify?.("Agrega al menos una URL de YouTube.", "warning");
      rows.querySelectorAll("[data-video-progress]").forEach((status) => { status.textContent = "Analizando"; });
      if (guide) guide.root.dataset.guidePhase = "video_analysis";
      console.info("[MarcieAgent] youtube analyze requested", {
        target: surface === guide ? "guide" : "panel",
        runId: runId || "",
        urlCount: urls.length
      });
      submit({ urls });
    });
    surface.optionsHost.appendChild(editor);
  }

  function setSurfaceBusy(surface, value) {
    surface.root.dataset.requestPending = String(value);
    surface.optionsHost.querySelectorAll("button").forEach((button) => { button.disabled = value; });
  }

  function closeGuide({ cancelSpeech = true } = {}) {
    if (!guide) return;
    if (cancelSpeech) voice.cancelSpeech();
    guide.optionsDialog?.remove();
    guide.root.remove();
    guide = null;
  }

  function bindComposer(surface, { allowNewSession = false } = {}) {
    surface.form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = surface.input.value.trim();
      if (!text) return;
      if (allowNewSession && /nueva sesi[oó]n/i.test(text)) return onNewSessionRequest?.();
      surface.input.value = "";
      submit({ text });
    });
    if (surface.mic) {
      let pointerStartedAt = 0;
      let pointerActive = false;
      let startedWhileActive = false;
      let suppressClick = false;
      const beginListening = (mode) => {
        voiceSurface = surface;
        surface.root.dataset.micMode = mode;
        return voice.listen({ autoSubmit: mode === "auto", silenceMs: 1800 });
      };
      surface.mic.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();
        pointerStartedAt = performance.now();
        pointerActive = true;
        startedWhileActive = voice.active;
        if (!startedWhileActive) beginListening("hold");
        try { surface.mic.setPointerCapture(event.pointerId); } catch (_) {}
      });
      surface.mic.addEventListener("pointerup", (event) => {
        if (!pointerActive) return;
        event.preventDefault();
        pointerActive = false;
        const heldLongEnough = performance.now() - pointerStartedAt >= 380;
        if (startedWhileActive || heldLongEnough) {
          voice.stop({ submit: true });
        } else {
          surface.root.dataset.micMode = "auto";
          voice.enableAutoSubmit({ silenceMs: 1800 });
          updateMicControl(surface, "listening");
        }
        suppressClick = true;
        window.setTimeout(() => { suppressClick = false; }, 0);
      });
      surface.mic.addEventListener("pointercancel", () => {
        pointerActive = false;
        voiceSurface = null;
        voice.stop();
      });
      surface.mic.addEventListener("click", () => {
        if (suppressClick) return;
        if (voice.active) voice.stop({ submit: true });
        else beginListening("auto");
      });
    }
    surface.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); surface.form.requestSubmit(); }
    });
    if (surface === guide) surface.input.addEventListener("input", persistGuide);
  }

  function openVoiceGuide() {
    closeGuide();
    const root = document.createElement("div");
    root.className = "marcie-voice-guide-backdrop";
    root.innerHTML = `
      <section class="marcie-voice-guide" role="dialog" aria-modal="true" aria-labelledby="marcie-voice-guide-title">
        <header class="marcie-voice-guide__header">
          <div class="marcie-voice-guide__brand">
            <img class="marcie-voice-guide__avatar" src="/MarcieBlogEditorLogo2.png" alt="" />
            <div><h2 id="marcie-voice-guide-title">Agente Marcie</h2></div>
          </div>
          <button type="button" class="marcie-voice-guide__close" aria-label="Cerrar configuración por voz"><i data-lucide="x"></i></button>
        </header>
        <div class="marcie-voice-guide__content">
          <div class="marcie-voice-guide__presence" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
          <div class="marcie-voice-guide__messages" data-guide-messages aria-label="Conversación de configuración" aria-live="polite" hidden></div>
          <div class="marcie-voice-guide__options" data-agent-options></div>
          <div class="marcie-voice-guide__transcript" aria-live="polite" hidden><span>Mensajes en cola</span><div data-guide-queue></div></div>
        </div>
        <form class="marcie-agent__composer marcie-voice-guide__composer" data-agent-form>
          <textarea rows="3" maxlength="4000" placeholder="Escribe una respuesta para Marcie" aria-label="Respuesta para Marcie" data-agent-input></textarea>
          <div class="marcie-agent__composer-actions">
            <div class="marcie-agent__composer-tools">
              <button type="button" class="marcie-agent__tool marcie-voice-guide__mic" data-agent-mic title="Pulsar para hablar" aria-label="Pulsar para hablar"><i data-lucide="mic"></i></button>
            </div>
            <button type="submit" class="marcie-agent__send" data-agent-send title="Enviar respuesta" aria-label="Enviar respuesta"><i data-lucide="send"></i></button>
          </div>
        </form>
      </section>`;
    (document.fullscreenElement || document.body).appendChild(root);
    guide = {
      root,
      messageList: root.querySelector("[data-guide-messages]"),
      transcriptContainer: root.querySelector(".marcie-voice-guide__transcript"),
      queueList: root.querySelector("[data-guide-queue]"),
      optionsHost: root.querySelector("[data-agent-options]"),
      form: root.querySelector("[data-agent-form]"),
      input: root.querySelector("[data-agent-input]"),
      mic: root.querySelector("[data-agent-mic]"),
      send: root.querySelector("[data-agent-send]"),
    };
    installOptionsDialog(guide);
    root.querySelector(".marcie-voice-guide__close").addEventListener("click", () => closeGuide());
    bindComposer(guide);
    renderGuideMessages();
    window.lucide?.createIcons?.();
    guide.mic.focus();
  }

  function renderTarget(target) {
    if (target === "guide") renderGuideMessages();
    else renderPanelMessages();
  }

  function queueTurn(inputPayload, target, message) {
    if (message) message.queued = true;
    queuedTurns.push({ inputPayload, target, message });
    console.info("[MarcieAgent] turn queued", {
      target,
      queueLength: queuedTurns.length,
      input: summarizeAgentInput(inputPayload)
    });
    renderTarget(target);
  }

  function drainQueue() {
    if (busy || !queuedTurns.length) return;
    const next = queuedTurns.shift();
    console.info("[MarcieAgent] draining queued turn", {
      target: next.target,
      queueLength: queuedTurns.length,
      input: summarizeAgentInput(next.inputPayload)
    });
    void submit(next.inputPayload, { target: next.target, message: next.message, fromQueue: true });
  }

  async function submit(inputPayload, options = {}) {
    const target = options.target || (guide ? "guide" : "panel");
    const surface = target === "guide" ? guide : panel;
    closeOptionsDialog(surface);
    const activeMessages = target === "guide" ? guideMessages : panelMessages;
    const userText = inputPayload.text || inputPayload.value || "";
    const message = options.message || (userText ? { role: "user", text: userText } : null);
    if (message && !options.message) activeMessages.push(message);
    if (busy && !options.fromQueue) return queueTurn(inputPayload, target, message);
    if (message) message.queued = false;
    const activity = activityLabel(inputPayload);
    if (target === "guide") guideActivity = activity;
    else panelActivity = activity;
    voice.cancelSpeech();
    busy = true;
    setStatus("processing");
    if (surface) setSurfaceBusy(surface, true);
    renderTarget(target);
    try {
      const activeSession = target === "guide" ? null : getActiveSession?.();
      if (target !== "guide" && !activeSession?.id) throw new Error("Selecciona una sesión con un artículo para trabajar con Marcie.");
      const contextualInput = activeSession
        ? { ...inputPayload, audience: activeSession.audience || activeSession.article?.audience || activeSession.selectedAudiences?.[0] || "" }
        : inputPayload;
      const mode = target === "guide" ? "configuration" : "assistant";
      const sessionId = activeSession?.id || "";
      console.info("[MarcieAgent] submit start", {
        target,
        mode,
        runId: runId || "",
        sessionId,
        fromQueue: Boolean(options.fromQueue),
        input: summarizeAgentInput(contextualInput)
      });
      const response = await sendAgentTurn(runId, contextualInput, {
        mode,
        sessionId
      });
      console.info("[MarcieAgent] submit success", summarizeAgentResponse(response));
      if (target === "guide") guideActivity = "";
      else panelActivity = "";
      showResponse(response, { target });
      return response;
    } catch (error) {
      const userMessage = normalizeAgentError(error);
      console.warn("[MarcieAgent] submit error", {
        target,
        status: error.status || "",
        code: agentErrorCode(error),
        message: error.message || "",
        requestId: error.requestId || "",
        userMessage,
        rejectedVideos: Array.isArray(error.detail?.rejectedVideos) ? error.detail.rejectedVideos : [],
        detail: error.detail || null
      });
      if (target === "guide") guideActivity = "";
      else panelActivity = "";
      activeMessages.push({ role: "assistant", text: `No pude continuar: ${userMessage}` });
      if (responseNeedsOptions(responseState)) renderOptions(responseState, target);
      renderTarget(target);
      onNotify?.(userMessage, "error");
      return null;
    } finally {
      busy = false;
      if (surface?.root?.isConnected) setSurfaceBusy(surface, false);
      if (target === "guide") guideActivity = "";
      else panelActivity = "";
      renderTarget(target);
      if (queuedTurns.length) drainQueue();
      else setStatus("idle");
    }
  }

  function showResponse(response, { target = guide ? "guide" : "panel" } = {}) {
    responseState = responseNeedsOptions(response) ? response : null;
    runId = response.runId || runId;
    const visibleText = response.message;
    const message = { role: "assistant", text: visibleText };
    (target === "guide" ? guideMessages : panelMessages).push(message);
    if (target === "guide") {
      renderGuideQuestion({ ...response, message: visibleText });
      renderGuideMessages();
    } else {
      renderPanelMessages();
    }
    if (responseState) renderOptions(response, target);
    else {
      const surface = target === "guide" ? guide : panel;
      surface?.optionsHost?.replaceChildren();
      if (surface?.optionsTrigger) surface.optionsTrigger.hidden = true;
      closeOptionsDialog(surface);
    }
    if (target === "guide") persistGuide();
  }

  async function executeRun() {
    if (busy || !runId) return;
    busy = true;
    setStatus("processing");
    if (guide) {
      guide.root.dataset.guidePhase = "creating_articles";
      guide.optionsHost.replaceChildren();
    }
    try {
      const result = await startAgentRun(runId);
      (guide ? guideMessages : panelMessages).push({ role: "assistant", text: "Perfecto. Investigaré las fuentes y prepararé los artículos." });
      const sessionId = targetSessionId
        ? await onReconfigureSession?.(targetSessionId, result.sessionRequest, runId)
        : await onCreateSession?.(result.sessionRequest, runId);
      if (!sessionId) {
        await updateAgentRun(runId, "cancelled", { sessionId: targetSessionId || "" });
        (guide ? guideMessages : panelMessages).push({ role: "assistant", text: "No se aplicaron cambios a la sesión." });
        renderGuideMessages();
        return;
      }
      const createdSession = getActiveSession?.();
      const automationStatus = createdSession?.id === sessionId ? createdSession.automation?.status : "";
      if (["failed", "cancelled"].includes(automationStatus)) {
        const message = createdSession.automation?.message || "La producción se detuvo; los avances guardados se conservaron.";
        await updateAgentRun(runId, automationStatus, { sessionId, error: message });
        (guide ? guideMessages : panelMessages).push({ role: "assistant", text: message });
        renderGuideMessages();
        renderPanelMessages();
        return;
      }
      await updateAgentRun(runId, "completed", { sessionId });
      responseState = { ...(responseState || {}), runStatus: "completed", phase: "completed" };
      (guide ? guideMessages : panelMessages).push({ role: "assistant", text: "Los artículos están listos. Puedo ayudarte a revisarlos, verificarlos o preparar cambios." });
      panel.body.hidden = false;
      document.getElementById("right-panel")?.classList.remove("hidden");
      document.getElementById("right-resizer")?.classList.remove("hidden");
      closeGuide({ cancelSpeech: false });
      clearPersistedGuide();
      renderPanelMessages();
    } catch (error) {
      const userMessage = normalizeAgentError(error);
      console.warn("[MarcieAgent] run execution error", {
        runId,
        status: error.status || "",
        code: agentErrorCode(error),
        message: error.message || "",
        userMessage
      });
      if (agentErrorCode(error) !== "marcie_agent_confirmation_required") {
        await updateAgentRun(runId, "failed", { error: userMessage }).catch(() => {});
      }
      (guide ? guideMessages : panelMessages).push({ role: "assistant", text: `La creación se detuvo: ${userMessage}` });
      renderPanelMessages();
      onNotify?.(userMessage, "error");
    } finally {
      busy = false;
      setStatus("idle");
    }
  }

  async function confirmAndExecuteRun(target = guide ? "guide" : "panel") {
    if (!runId || busy) return;
    console.info("[MarcieAgent] final confirmation requested", { target, runId });
    const response = await submit({ action: "confirm", value: "confirm", text: "Crear artículos" }, { target });
    const isReady = response?.phase === "ready" || response?.runStatus === "ready" || response?.status === "ready";
    console.info("[MarcieAgent] final confirmation response", {
      target,
      runId,
      phase: response?.phase || "",
      runStatus: response?.runStatus || response?.status || "",
      isReady
    });
    if (isReady) await executeRun();
  }

  async function startGuidedSession({ sessionId = "" } = {}) {
    clearPersistedGuide();
    targetSessionId = String(sessionId || "").trim();
    runId = "";
    loadedSessionId = "";
    responseState = null;
    guideMessages.length = 0;
    openVoiceGuide();
    setStatus("processing");
    try {
      showResponse(await startAgentConversation());
    } catch (error) {
      const userMessage = normalizeAgentError(error);
      console.warn("[MarcieAgent] guided session start error", {
        status: error.status || "",
        code: agentErrorCode(error),
        message: error.message || "",
        userMessage
      });
      if (guide) {
        guideMessages.push({ role: "assistant", text: `No pude iniciar la guía por voz: ${userMessage}` });
        renderGuideMessages();
      }
      onNotify?.(userMessage, "error");
    } finally {
      if (guide && guide.root.dataset.agentState !== "speaking") setStatus("idle");
    }
  }

  async function loadSession(session, { force = false } = {}) {
    const sessionId = String(session?.id || "").trim();
    if (!sessionId || guide || busy || (!force && loadedSessionId === sessionId)) return;
    loadedSessionId = sessionId;
    const requestId = ++historyRequestId;
    panelActivity = "Marcie está recuperando la conversación";
    setStatus("processing");
    renderPanelMessages();
    try {
      const history = await getAgentHistory(sessionId);
      if (requestId !== historyRequestId || loadedSessionId !== sessionId) return;
      runId = history.runId || "";
      responseState = null;
      panelMessages.length = 0;
      (history.messages || []).forEach((message) => {
        if ((message.role === "user" || message.role === "assistant") && message.text) panelMessages.push({ role: message.role, text: message.text });
      });
      if (history.pendingChange) {
        responseState = {
          phase: "reviewing",
          changePreview: history.pendingChange,
          uiPrompt: {
            type: "change_preview",
            options: [
              { id: "discard_change", label: "Descartar", action: "discard_change" },
              { id: "apply_change", label: "Aplicar cambios", action: "apply_change" }
            ]
          }
        };
      }
      panel.optionsHost.replaceChildren();
      if (responseState) renderOptions(responseState);
    } catch (error) {
      if (requestId === historyRequestId) {
        loadedSessionId = "";
        onNotify?.(`No pude recuperar el historial: ${error.message}`, "warning");
      }
    } finally {
      if (requestId === historyRequestId) {
        panelActivity = "";
        setStatus("idle");
        renderPanelMessages();
      }
    }
  }

  bindComposer(panel, { allowNewSession: true });
  if (guideStorageKey) {
    try {
      const localSaved = JSON.parse(window.localStorage.getItem(guideStorageKey) || "null");
      const sessionSaved = JSON.parse(window.sessionStorage.getItem(guideStorageKey) || "null");
      const saved = Number(sessionSaved?.updatedAt || 0) > Number(localSaved?.updatedAt || 0) ? sessionSaved : localSaved;
      if (saved === sessionSaved && saved) guideStorageMode = "session";
      if (saved?.runId && Date.now() - Number(saved.updatedAt || 0) < 7 * 24 * 60 * 60 * 1000) {
        runId = saved.runId;
        targetSessionId = String(saved.targetSessionId || "").trim();
        responseState = saved.responseState || null;
        guideMessages.push(...(Array.isArray(saved.messages) ? saved.messages.filter((message) => ["user", "assistant"].includes(message?.role) && typeof message.text === "string") : []));
        openVoiceGuide();
        guide.input.value = String(saved.input || "").slice(0, 4000);
        guide.root.dataset.guidePhase = saved.phase || responseState?.phase || "";
        if (responseState) renderOptions(responseState, "guide");
        persistGuide();
      }
    } catch (error) { console.warn("[MarcieAgent] No se pudo recuperar la configuración local:", error); }
  }
  renderPanelMessages();
  function resolveEvidenceClaim(claim = {}) {
    const id = String(claim.id || "").trim();
    const text = String(claim.text || claim.claim || "").trim();
    if (!id || !text) return null;
    return submit({ action: "resolve_evidence", value: id, text: `Resuelve esta afirmación sin respaldo: ${text}` }, { target: "panel" });
  }
  return { loadSession, startGuidedSession, resolveEvidenceClaim };
}
