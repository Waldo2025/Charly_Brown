import { getAgentHistory, sendAgentTurn, startAgentConversation, startAgentRun, updateAgentRun } from "../services/marcie-agent-api.js?v=20260922r3";
import { createMarcieAgentVoice } from "../services/marcie-agent-voice.js?v=20260922r5";

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

function configurationHtml(configuration = {}) {
  const audienceResources = Object.entries(configuration.resourcesByAudience || {})
    .map(([audience, resources]) => `${audience}: ${(resources || []).join(", ")}`)
    .join(" · ");
  const rows = [
    ["Videos", configuration.sourceInputs?.youtube?.map((item) => item.videoId).join(", ")],
    ["Tema", configuration.topic],
    ["Públicos", configuration.selectedAudiences?.join(", ")],
    ["Tono", configuration.tone],
    ["Extensión", Object.values(configuration.extensionsByAudience || {}).join(" · ")],
    ["Fuentes", configuration.sourceMode === "all" ? "Todas las fuentes fiables" : configuration.specialSources?.join(", ")],
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
  return `<button type="button" class="marcie-agent-option" data-option-id="${escapeHtml(option.id)}" data-option-action="${escapeHtml(option.action || "")}" data-option-value="${escapeHtml(option.value || option.label || "")}">${escapeHtml(option.label || option.value || option.id)}</button>`;
}

function activityLabel(input = {}) {
  const action = String(input.action || "");
  if (action === "apply_change") return "Marcie está aplicando los cambios";
  if (action === "discard_change") return "Marcie está descartando la vista previa";
  const text = String(input.text || input.value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/corrige|corregir|reescribe|reescribir|modifica|editar|cambia el tono|acorta|amplia/.test(text)) return "Marcie está preparando una corrección";
  if (/analiza|analizar|evalua|evaluar|revisa el articulo|revision del articulo/.test(text)) return "Marcie está analizando el artículo";
  if (/verifica|verificar|comprueba|comprobar|afirmacion|referencia/.test(text)) return "Marcie está verificando las afirmaciones";
  if (/busca|buscar|investiga|investigar|mas fuentes|bibliografia/.test(text)) return "Marcie está buscando fuentes";
  if (/wordpress|borrador/.test(text)) return "Marcie está revisando el borrador";
  return "Marcie está pensando en tu solicitud";
}

export function initMarcieAgentPanel({ getActiveSession, onCreateSession, onNewSessionRequest, onNotify } = {}) {
  const host = document.getElementById("marcie-agent-chat-host");
  if (!host) return { startGuidedSession() {} };

  let runId = "";
  let responseState = null;
  let busy = false;
  let guide = null;
  let panelAudioEnabled = false;
  let panelActivity = "";
  let loadedSessionId = "";
  let historyRequestId = 0;
  const panelMessages = [];
  const guideMessages = [];

  host.innerHTML = `
    <section class="marcie-agent" aria-label="Agente editorial MCP">
      <button class="marcie-agent__header" type="button" aria-expanded="true">
        <span class="marcie-agent__identity"><span class="marcie-agent__mark"><i data-lucide="messages-square"></i></span><span><strong>Agente MCP</strong><small data-agent-status>Listo para ayudarte</small></span></span>
        <i data-lucide="chevron-down"></i>
      </button>
      <div class="marcie-agent__body">
        <div class="marcie-agent__messages" data-agent-messages aria-live="polite"></div>
        <div class="marcie-agent__options" data-agent-options></div>
        <form class="marcie-agent__composer" data-agent-form>
          <textarea rows="3" maxlength="4000" placeholder="Escribe una instrucción para Marcie" aria-label="Mensaje para el agente" data-agent-input></textarea>
          <div class="marcie-agent__composer-actions">
            <div class="marcie-agent__composer-tools">
              <button type="button" class="marcie-agent__tool" data-agent-mic title="Dictar mensaje" aria-label="Dictar mensaje"><i data-lucide="mic"></i></button>
              <button type="button" class="marcie-agent__tool" data-agent-audio title="Activar respuestas por voz" aria-label="Activar respuestas por voz" aria-pressed="false"><i data-lucide="volume-x" data-audio-off></i><i data-lucide="volume-2" data-audio-on hidden></i></button>
            </div>
            <button type="submit" class="marcie-agent__send" data-agent-send title="Enviar" aria-label="Enviar mensaje"><i data-lucide="send"></i></button>
          </div>
        </form>
      </div>
    </section>`;

  const panel = {
    root: host,
    body: host.querySelector(".marcie-agent__body"),
    header: host.querySelector(".marcie-agent__header"),
    messageList: host.querySelector("[data-agent-messages]"),
    optionsHost: host.querySelector("[data-agent-options]"),
    form: host.querySelector("[data-agent-form]"),
    input: host.querySelector("[data-agent-input]"),
    mic: host.querySelector("[data-agent-mic]"),
    audio: host.querySelector("[data-agent-audio]"),
    send: host.querySelector("[data-agent-send]"),
    status: host.querySelector("[data-agent-status]")
  };

  function updatePanelAudioControl() {
    panel.audio.setAttribute("aria-pressed", String(panelAudioEnabled));
    panel.audio.setAttribute("aria-label", panelAudioEnabled ? "Desactivar respuestas por voz" : "Activar respuestas por voz");
    panel.audio.title = panelAudioEnabled ? "Desactivar respuestas por voz" : "Activar respuestas por voz";
    panel.audio.querySelector("[data-audio-off]").hidden = panelAudioEnabled;
    panel.audio.querySelector("[data-audio-on]").hidden = !panelAudioEnabled;
    window.lucide?.createIcons?.();
  }

  function activeSurface() {
    return guide || panel;
  }

  function statusLabel(value) {
    if (value === "listening") return "Escuchando";
    if (value === "speaking") return "Hablando con Marcie";
    if (value === "processing") return "Procesando";
    return "Listo para ayudarte";
  }

  function setStatus(value) {
    panel.status.textContent = statusLabel(value);
    panel.root.dataset.agentState = value;
    if (guide) {
      guide.status.textContent = statusLabel(value);
      guide.root.dataset.agentState = value;
    }
  }

  const voice = createMarcieAgentVoice({
    onTranscript(value) {
      const surface = activeSurface();
      surface.input.value = value;
      if (guide) guide.transcript.textContent = value || "Tu respuesta aparecerá aquí antes de enviarse.";
    },
    onStateChange: setStatus,
    onError(error) {
      if (!guide && panelAudioEnabled) {
        panelAudioEnabled = false;
        updatePanelAudioControl();
      }
      onNotify?.(error.message, "warning");
      setStatus("idle");
    }
  });

  function renderPanelMessages() {
    const conversation = panelMessages.length
      ? panelMessages.map((message) => `<div class="marcie-agent-message marcie-agent-message--${message.role}">${escapeHtml(message.text)}</div>`).join("")
      : `<div class="marcie-agent__empty"><i data-lucide="wand-sparkles"></i><p>Puedo revisar, verificar y mejorar los artículos creados.</p></div>`;
    const activity = panelActivity
      ? `<div class="marcie-agent-activity" role="status" aria-live="polite"><span class="marcie-agent-activity__dots" aria-hidden="true"><span></span><span></span><span></span></span><span>${escapeHtml(panelActivity)}</span></div>`
      : "";
    panel.messageList.innerHTML = conversation + activity;
    panel.messageList.scrollTop = panel.messageList.scrollHeight;
    window.lucide?.createIcons?.();
  }

  function renderGuideMessages() {
    if (!guide?.messageList) return;
    const visibleMessages = guideMessages.at(-1)?.role === "assistant" ? guideMessages.slice(0, -1) : guideMessages;
    guide.messageList.innerHTML = visibleMessages.map((message) => `<div class="marcie-agent-message marcie-agent-message--${message.role}">${escapeHtml(message.text)}</div>`).join("");
    guide.messageList.hidden = visibleMessages.length === 0;
    guide.messageList.scrollTop = guide.messageList.scrollHeight;
  }

  function renderActiveMessages() {
    if (guide) renderGuideMessages();
    else renderPanelMessages();
  }

  function renderGuideQuestion(response) {
    if (!guide) return;
    guide.phase.textContent = response.phase === "summary" ? "Revisión final" : "Configurando tus artículos";
    guide.question.textContent = response.message;
  }

  function bindOptionEvents(surface, prompt, wrapper) {
    if (prompt.type === "multi_choice") {
      const continueButton = document.createElement("button");
      continueButton.type = "button";
      continueButton.className = "marcie-agent-continue";
      continueButton.textContent = "Continuar";
      continueButton.disabled = true;
      continueButton.addEventListener("click", () => submit({ selectedValues: [...wrapper.querySelectorAll(".is-selected")].map((button) => button.dataset.optionId) }));
      surface.optionsHost.appendChild(continueButton);
      wrapper.addEventListener("click", (event) => {
        const button = event.target.closest("[data-option-id]");
        if (!button) return;
        button.classList.toggle("is-selected");
        continueButton.disabled = !wrapper.querySelector(".is-selected");
      });
      return;
    }
    wrapper.addEventListener("click", (event) => {
      const button = event.target.closest("[data-option-id]");
      if (!button) return;
      const action = button.dataset.optionAction || undefined;
      if (action === "confirm") return executeRun();
      return submit({ action, value: button.dataset.optionId, text: button.dataset.optionValue });
    });
  }

  function renderOptions(response, target = guide ? "guide" : "panel") {
    const surface = target === "guide" ? guide : panel;
    if (!surface) return;
    const prompt = response.uiPrompt || {};
    const options = Array.isArray(prompt.options) ? prompt.options : [];
    surface.optionsHost.innerHTML = `${response.phase === "summary" ? configurationHtml(response.configuration) : ""}${response.phase === "video_topic" ? videoResearchHtml(response.videoResearch || response.configuration?.videoResearch) : ""}${prompt.type === "change_preview" ? changePreviewHtml(response.changePreview) : ""}`;
    if (prompt.type === "url_list") {
      renderYoutubeUrlList(surface, response.configuration?.sourceInputs?.youtube || []);
      window.lucide?.createIcons?.();
      return;
    }
    if (!options.length) return;
    const wrapper = document.createElement("div");
    wrapper.className = `marcie-agent-option-list${target === "guide" ? " marcie-voice-guide__option-list" : ""}`;
    wrapper.innerHTML = options.map(optionButton).join("");
    surface.optionsHost.appendChild(wrapper);
    bindOptionEvents(surface, prompt, wrapper);
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
    (existing.length ? existing : [{ url: "" }]).slice(0, 5).forEach((item) => addRow(item.url || item));
    editor.querySelector("[data-add-youtube]").addEventListener("click", () => { addRow(); window.lucide?.createIcons?.(); });
    editor.querySelector("[data-analyze-youtube]").addEventListener("click", () => {
      const urls = [...rows.querySelectorAll("input")].map((input) => input.value.trim()).filter(Boolean);
      if (!urls.length) return onNotify?.("Agrega al menos una URL de YouTube.", "warning");
      rows.querySelectorAll("[data-video-progress]").forEach((status) => { status.textContent = "Analizando"; });
      if (guide) {
        guide.phase.textContent = "Analizando videos";
      }
      submit({ urls });
    });
    surface.optionsHost.appendChild(editor);
  }

  function setSurfaceBusy(surface, value) {
    surface.input.disabled = value;
    surface.send.disabled = value;
    surface.optionsHost.querySelectorAll("button").forEach((button) => { button.disabled = value; });
  }

  function closeGuide({ cancelSpeech = true } = {}) {
    if (!guide) return;
    if (cancelSpeech) voice.cancelSpeech();
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
      if (surface.transcript) surface.transcript.textContent = "Tu respuesta aparecerá aquí antes de enviarse.";
      submit({ text });
    });
    surface.mic?.addEventListener("click", () => {
      if (voice.listening) voice.stop();
      else voice.listen();
    });
    surface.audio?.addEventListener("click", () => {
      panelAudioEnabled = !panelAudioEnabled;
      if (!panelAudioEnabled) voice.cancelSpeech();
      updatePanelAudioControl();
    });
    surface.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); surface.form.requestSubmit(); }
    });
  }

  function openVoiceGuide() {
    closeGuide();
    const root = document.createElement("div");
    root.className = "marcie-voice-guide-backdrop";
    root.innerHTML = `
      <section class="marcie-voice-guide" role="dialog" aria-modal="true" aria-labelledby="marcie-voice-guide-title">
        <header class="marcie-voice-guide__header">
          <div class="marcie-voice-guide__brand">
            <span class="marcie-voice-guide__avatar"><i data-lucide="audio-lines"></i></span>
            <div><span>Agente editorial MCP</span><h2 id="marcie-voice-guide-title">Marcie te guía por voz</h2></div>
          </div>
          <button type="button" class="marcie-voice-guide__close" aria-label="Cerrar configuración por voz"><i data-lucide="x"></i></button>
        </header>
        <div class="marcie-voice-guide__content">
          <div class="marcie-voice-guide__presence" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
          <p class="marcie-voice-guide__phase" data-guide-phase>Preparando la conversación</p>
          <p class="marcie-voice-guide__question" data-guide-question aria-live="polite">Conectando con Marcie…</p>
          <div class="marcie-voice-guide__status"><span class="marcie-voice-guide__status-dot"></span><span data-agent-status>Procesando</span></div>
          <div class="marcie-voice-guide__messages" data-guide-messages aria-label="Conversación de configuración" aria-live="polite" hidden></div>
          <div class="marcie-voice-guide__options" data-agent-options></div>
          <div class="marcie-voice-guide__transcript" aria-live="polite"><span>Lo que entendí</span><p data-guide-transcript>Tu respuesta aparecerá aquí antes de enviarse.</p></div>
        </div>
        <form class="marcie-voice-guide__composer" data-agent-form>
          <button type="button" class="marcie-voice-guide__mic" data-agent-mic><i data-lucide="mic"></i><span>Pulsar para hablar</span></button>
          <div class="marcie-voice-guide__write">
            <textarea rows="2" maxlength="4000" placeholder="También puedes escribir tu respuesta" aria-label="Respuesta para Marcie" data-agent-input></textarea>
            <button type="submit" data-agent-send aria-label="Enviar respuesta"><i data-lucide="arrow-up"></i></button>
          </div>
        </form>
      </section>`;
    (document.fullscreenElement || document.body).appendChild(root);
    guide = {
      root,
      question: root.querySelector("[data-guide-question]"),
      phase: root.querySelector("[data-guide-phase]"),
      messageList: root.querySelector("[data-guide-messages]"),
      transcript: root.querySelector("[data-guide-transcript]"),
      optionsHost: root.querySelector("[data-agent-options]"),
      form: root.querySelector("[data-agent-form]"),
      input: root.querySelector("[data-agent-input]"),
      mic: root.querySelector("[data-agent-mic]"),
      send: root.querySelector("[data-agent-send]"),
      status: root.querySelector("[data-agent-status]")
    };
    root.querySelector(".marcie-voice-guide__close").addEventListener("click", () => closeGuide());
    bindComposer(guide);
    renderGuideMessages();
    window.lucide?.createIcons?.();
    guide.mic.focus();
  }

  async function submit(inputPayload) {
    if (busy) return;
    const surface = activeSurface();
    const target = guide ? "guide" : "panel";
    const activeMessages = target === "guide" ? guideMessages : panelMessages;
    const userText = inputPayload.text || inputPayload.value || "";
    if (userText) activeMessages.push({ role: "user", text: userText });
    if (!guide) panelActivity = activityLabel(inputPayload);
    busy = true;
    setStatus("processing");
    setSurfaceBusy(surface, true);
    renderActiveMessages();
    try {
      const activeSession = guide ? null : getActiveSession?.();
      if (!guide && !activeSession?.id) throw new Error("Selecciona una sesión con un artículo para trabajar con Marcie.");
      const contextualInput = activeSession
        ? { ...inputPayload, audience: activeSession.audience || activeSession.article?.audience || activeSession.selectedAudiences?.[0] || "" }
        : inputPayload;
      const response = await sendAgentTurn(runId, contextualInput, {
        mode: guide ? "configuration" : "assistant",
        sessionId: activeSession?.id || ""
      });
      panelActivity = "";
      showResponse(response, { target });
    } catch (error) {
      panelActivity = "";
      activeMessages.push({ role: "assistant", text: `No pude continuar: ${error.message}` });
      if (guide) guide.question.textContent = `No pude continuar: ${error.message}`;
      if (responseState) renderOptions(responseState, target);
      if (target === "guide") renderGuideMessages();
      else renderPanelMessages();
      onNotify?.(error.message, "error");
    } finally {
      busy = false;
      const current = activeSurface();
      setSurfaceBusy(current, false);
      setStatus("idle");
      if (panelActivity) {
        panelActivity = "";
        renderActiveMessages();
      }
    }
  }

  function showResponse(response, { speak = true, target = guide ? "guide" : "panel" } = {}) {
    responseState = response;
    runId = response.runId || runId;
    (target === "guide" ? guideMessages : panelMessages).push({ role: "assistant", text: response.message });
    if (target === "guide") {
      renderGuideQuestion(response);
      renderGuideMessages();
    } else {
      renderPanelMessages();
    }
    renderOptions(response, target);
    if (speak && ((target === "guide" && guide) || (target === "panel" && panelAudioEnabled))) voice.speak(response.speechText || response.message);
  }

  async function executeRun() {
    if (busy || !runId) return;
    busy = true;
    setStatus("processing");
    if (guide) {
      guide.question.textContent = "Perfecto. Investigaré las fuentes y prepararé los artículos. Puedes seguir el avance aquí.";
      guide.phase.textContent = "Creando tus artículos";
      guide.optionsHost.replaceChildren();
    }
    try {
      const result = await startAgentRun(runId);
      (guide ? guideMessages : panelMessages).push({ role: "assistant", text: "Perfecto. Investigaré las fuentes y prepararé los artículos." });
      const sessionId = await onCreateSession?.(result.sessionRequest, runId);
      await updateAgentRun(runId, "completed", { sessionId });
      responseState = { ...(responseState || {}), runStatus: "completed", phase: "completed" };
      (guide ? guideMessages : panelMessages).push({ role: "assistant", text: "Los artículos están listos. Puedo ayudarte a revisarlos, verificarlos o preparar cambios." });
      panel.body.hidden = false;
      panel.header.setAttribute("aria-expanded", "true");
      document.getElementById("right-panel")?.classList.remove("hidden");
      document.getElementById("right-resizer")?.classList.remove("hidden");
      closeGuide({ cancelSpeech: false });
      renderPanelMessages();
    } catch (error) {
      await updateAgentRun(runId, "failed", { error: error.message }).catch(() => {});
      (guide ? guideMessages : panelMessages).push({ role: "assistant", text: `La creación se detuvo: ${error.message}` });
      if (guide) guide.question.textContent = `La creación se detuvo: ${error.message}`;
      renderPanelMessages();
      onNotify?.(error.message, "error");
    } finally {
      busy = false;
      setStatus("idle");
    }
  }

  async function startGuidedSession() {
    voice.prime();
    runId = "";
    loadedSessionId = "";
    responseState = null;
    guideMessages.length = 0;
    openVoiceGuide();
    setStatus("processing");
    try {
      showResponse(await startAgentConversation());
    } catch (error) {
      if (guide) guide.question.textContent = `No pude iniciar la guía por voz: ${error.message}`;
      onNotify?.(error.message, "error");
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

  panel.header.addEventListener("click", () => {
    panel.body.hidden = !panel.body.hidden;
    panel.header.setAttribute("aria-expanded", String(!panel.body.hidden));
    panel.header.closest(".marcie-agent")?.classList.toggle("is-collapsed", panel.body.hidden);
  });
  bindComposer(panel, { allowNewSession: true });
  updatePanelAudioControl();
  renderPanelMessages();
  return { loadSession, startGuidedSession };
}
