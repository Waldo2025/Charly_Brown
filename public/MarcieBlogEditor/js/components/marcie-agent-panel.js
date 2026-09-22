import { sendAgentTurn, startAgentConversation, startAgentRun, updateAgentRun } from "../services/marcie-agent-api.js?v=20260921r3";
import { createMarcieAgentVoice } from "../services/marcie-agent-voice.js?v=20260921r3";

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

function configurationHtml(configuration = {}) {
  const audienceResources = Object.entries(configuration.resourcesByAudience || {})
    .map(([audience, resources]) => `${audience}: ${(resources || []).join(", ")}`)
    .join(" · ");
  const rows = [
    ["Tema", configuration.topic],
    ["Públicos", configuration.selectedAudiences?.join(", ")],
    ["Tono", configuration.tone],
    ["Extensión", Object.values(configuration.extensionsByAudience || {}).join(" · ")],
    ["Fuentes", configuration.sourceMode === "all" ? "Todas las fuentes fiables" : configuration.specialSources?.join(", ")],
    ["Recursos", audienceResources || configuration.resources?.join(", ")],
    ["Vocabulario", configuration.preferredVocabulary?.join(", ") || "Sin términos nuevos"]
  ];
  return `<dl class="marcie-agent-summary">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "Pendiente")}</dd></div>`).join("")}</dl>`;
}

function optionButton(option) {
  return `<button type="button" class="marcie-agent-option" data-option-id="${escapeHtml(option.id)}" data-option-action="${escapeHtml(option.action || "")}" data-option-value="${escapeHtml(option.value || option.label || "")}">${escapeHtml(option.label || option.value || option.id)}</button>`;
}

export function initMarcieAgentPanel({ onCreateSession, onNewSessionRequest, onNotify } = {}) {
  const host = document.getElementById("marcie-agent-chat-host");
  if (!host) return { startGuidedSession() {} };

  let runId = "";
  let responseState = null;
  let busy = false;
  let guide = null;
  const messages = [];

  host.hidden = true;
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
          <textarea rows="2" maxlength="4000" placeholder="Pide una revisión o un cambio" aria-label="Mensaje para el agente" data-agent-input></textarea>
          <div class="marcie-agent__composer-actions">
            <button type="button" class="marcie-agent__mic" data-agent-mic title="Pulsar para hablar" aria-label="Pulsar para hablar"><i data-lucide="mic"></i></button>
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
    send: host.querySelector("[data-agent-send]"),
    status: host.querySelector("[data-agent-status]")
  };

  function activeSurface() {
    return guide || panel;
  }

  function statusLabel(value) {
    if (value === "listening") return "Escuchando";
    if (value === "speaking") return "Hablando con Gemini Live";
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
    onError(error) { onNotify?.(error.message, "warning"); setStatus("idle"); }
  });

  function renderPanelMessages() {
    panel.messageList.innerHTML = messages.length
      ? messages.map((message) => `<div class="marcie-agent-message marcie-agent-message--${message.role}">${escapeHtml(message.text)}</div>`).join("")
      : `<div class="marcie-agent__empty"><i data-lucide="wand-sparkles"></i><p>Puedo revisar, verificar y mejorar los artículos creados.</p></div>`;
    panel.messageList.scrollTop = panel.messageList.scrollHeight;
    window.lucide?.createIcons?.();
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

  function renderOptions(response) {
    const surface = activeSurface();
    const prompt = response.uiPrompt || {};
    const options = Array.isArray(prompt.options) ? prompt.options : [];
    surface.optionsHost.innerHTML = response.phase === "summary" ? configurationHtml(response.configuration) : "";
    if (!options.length) return;
    const wrapper = document.createElement("div");
    wrapper.className = `marcie-agent-option-list${guide ? " marcie-voice-guide__option-list" : ""}`;
    wrapper.innerHTML = options.map(optionButton).join("");
    surface.optionsHost.appendChild(wrapper);
    bindOptionEvents(surface, prompt, wrapper);
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
    surface.mic.addEventListener("click", () => {
      if (voice.listening) voice.stop();
      else voice.listen();
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
          <p class="marcie-voice-guide__question" data-guide-question aria-live="polite">Conectando con Gemini Live…</p>
          <div class="marcie-voice-guide__status"><span class="marcie-voice-guide__status-dot"></span><span data-agent-status>Procesando</span></div>
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
    window.lucide?.createIcons?.();
    guide.mic.focus();
  }

  async function submit(inputPayload) {
    if (busy) return;
    const surface = activeSurface();
    const userText = inputPayload.text || inputPayload.value || "";
    if (userText) messages.push({ role: "user", text: userText });
    busy = true;
    setStatus("processing");
    setSurfaceBusy(surface, true);
    renderPanelMessages();
    try {
      showResponse(await sendAgentTurn(runId, inputPayload));
    } catch (error) {
      messages.push({ role: "assistant", text: `No pude continuar: ${error.message}` });
      if (guide) guide.question.textContent = `No pude continuar: ${error.message}`;
      if (responseState) renderOptions(responseState);
      renderPanelMessages();
      onNotify?.(error.message, "error");
    } finally {
      busy = false;
      const current = activeSurface();
      setSurfaceBusy(current, false);
      setStatus("idle");
    }
  }

  function showResponse(response, { speak = true } = {}) {
    responseState = response;
    runId = response.runId || runId;
    messages.push({ role: "assistant", text: response.message });
    renderPanelMessages();
    renderGuideQuestion(response);
    renderOptions(response);
    if (speak) voice.speak(response.speechText || response.message);
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
      messages.push({ role: "assistant", text: "Perfecto. Investigaré las fuentes y prepararé los artículos." });
      const sessionId = await onCreateSession?.(result.sessionRequest, runId);
      await updateAgentRun(runId, "completed", { sessionId });
      responseState = { ...(responseState || {}), runStatus: "completed", phase: "completed" };
      messages.push({ role: "assistant", text: "Los artículos están listos. Puedo ayudarte a revisarlos, verificarlos o preparar cambios." });
      host.hidden = false;
      panel.body.hidden = false;
      panel.header.setAttribute("aria-expanded", "true");
      document.getElementById("right-panel")?.classList.remove("hidden");
      document.getElementById("right-resizer")?.classList.remove("hidden");
      closeGuide({ cancelSpeech: false });
      renderPanelMessages();
      voice.speak("Los artículos están listos. Puedo ayudarte a revisarlos, verificarlos o preparar cambios.");
    } catch (error) {
      await updateAgentRun(runId, "failed", { error: error.message }).catch(() => {});
      messages.push({ role: "assistant", text: `La creación se detuvo: ${error.message}` });
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
    host.hidden = true;
    runId = "";
    responseState = null;
    messages.length = 0;
    renderPanelMessages();
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

  panel.header.addEventListener("click", () => {
    panel.body.hidden = !panel.body.hidden;
    panel.header.setAttribute("aria-expanded", String(!panel.body.hidden));
  });
  bindComposer(panel, { allowNewSession: true });
  renderPanelMessages();
  return { startGuidedSession };
}
