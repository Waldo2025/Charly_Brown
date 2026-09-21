import { sendAgentTurn, startAgentConversation, startAgentRun, updateAgentRun } from "../services/marcie-agent-api.js";
import { createMarcieAgentVoice } from "../services/marcie-agent-voice.js";

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

export function initMarcieAgentPanel({ onCreateSession, onNewSessionRequest, onNotify } = {}) {
  const host = document.getElementById("marcie-agent-chat-host");
  if (!host) return { startGuidedSession() {} };

  let runId = "";
  let responseState = null;
  let busy = false;
  let transcript = "";
  const messages = [];

  host.innerHTML = `
    <section class="marcie-agent" aria-label="Agente editorial MCP">
      <button class="marcie-agent__header" type="button" aria-expanded="true">
        <span class="marcie-agent__identity"><span class="marcie-agent__mark"><i data-lucide="messages-square"></i></span><span><strong>Agente MCP</strong><small data-agent-status>Listo para ayudarte</small></span></span>
        <i data-lucide="chevron-down" data-agent-chevron></i>
      </button>
      <div class="marcie-agent__body">
        <div class="marcie-agent__messages" data-agent-messages aria-live="polite"></div>
        <div class="marcie-agent__options" data-agent-options></div>
        <form class="marcie-agent__composer" data-agent-form>
          <textarea rows="2" maxlength="4000" placeholder="Escribe o usa el micrófono" aria-label="Mensaje para el agente" data-agent-input></textarea>
          <div class="marcie-agent__composer-actions">
            <button type="button" class="marcie-agent__mic" data-agent-mic title="Pulsar para hablar" aria-label="Pulsar para hablar"><i data-lucide="mic"></i></button>
            <button type="submit" class="marcie-agent__send" data-agent-send title="Enviar" aria-label="Enviar mensaje"><i data-lucide="send"></i></button>
          </div>
        </form>
      </div>
    </section>`;

  const body = host.querySelector(".marcie-agent__body");
  const header = host.querySelector(".marcie-agent__header");
  const messageList = host.querySelector("[data-agent-messages]");
  const optionsHost = host.querySelector("[data-agent-options]");
  const form = host.querySelector("[data-agent-form]");
  const input = host.querySelector("[data-agent-input]");
  const mic = host.querySelector("[data-agent-mic]");
  const send = host.querySelector("[data-agent-send]");
  const status = host.querySelector("[data-agent-status]");

  function setStatus(value) {
    status.textContent = value === "listening" ? "Escuchando" : value === "speaking" ? "Hablando" : value === "processing" ? "Procesando" : "Listo para ayudarte";
    host.dataset.agentState = value;
  }

  const voice = createMarcieAgentVoice({
    onTranscript(value) { transcript = value; input.value = value; },
    onStateChange: setStatus,
    onError(error) { onNotify?.(error.message, "warning"); setStatus("idle"); }
  });
  if (!voice.available) mic.title = "Micrófono no disponible; puedes escribir";

  function renderMessages() {
    messageList.innerHTML = messages.length
      ? messages.map((message) => `<div class="marcie-agent-message marcie-agent-message--${message.role}">${escapeHtml(message.text)}</div>`).join("")
      : `<div class="marcie-agent__empty"><i data-lucide="wand-sparkles"></i><p>Puedo guiarte para crear, revisar y mejorar tus artículos.</p></div>`;
    messageList.scrollTop = messageList.scrollHeight;
    window.lucide?.createIcons?.();
  }

  async function submit(inputPayload) {
    if (busy) return;
    const userText = inputPayload.text || inputPayload.value || "";
    if (userText) messages.push({ role: "user", text: userText });
    busy = true; setStatus("processing"); input.disabled = true; send.disabled = true; optionsHost.replaceChildren(); renderMessages();
    try {
      const response = await sendAgentTurn(runId, inputPayload);
      showResponse(response);
    } catch (error) {
      messages.push({ role: "assistant", text: `No pude continuar: ${error.message}` });
      renderMessages(); onNotify?.(error.message, "error");
    } finally {
      busy = false; input.disabled = false; send.disabled = false; setStatus("idle"); input.focus();
    }
  }

  function optionButton(option, selected = false) {
    return `<button type="button" class="marcie-agent-option${selected ? " is-selected" : ""}" data-option-id="${escapeHtml(option.id)}" data-option-action="${escapeHtml(option.action || "")}" data-option-value="${escapeHtml(option.value || option.label || "")}">${escapeHtml(option.label || option.value || option.id)}</button>`;
  }

  function renderOptions(response) {
    const prompt = response.uiPrompt || {};
    const options = Array.isArray(prompt.options) ? prompt.options : [];
    optionsHost.innerHTML = response.phase === "summary" ? configurationHtml(response.configuration) : "";
    if (!options.length) return;
    const wrapper = document.createElement("div");
    wrapper.className = "marcie-agent-option-list";
    wrapper.innerHTML = options.map((option) => optionButton(option)).join("");
    optionsHost.appendChild(wrapper);
    if (prompt.type === "multi_choice") {
      const continueButton = document.createElement("button");
      continueButton.type = "button";
      continueButton.className = "marcie-agent-continue";
      continueButton.textContent = "Continuar";
      continueButton.disabled = true;
      continueButton.addEventListener("click", () => submit({ selectedValues: [...wrapper.querySelectorAll(".is-selected")].map((button) => button.dataset.optionId) }));
      optionsHost.appendChild(continueButton);
      wrapper.addEventListener("click", (event) => {
        const button = event.target.closest("[data-option-id]");
        if (!button) return;
        button.classList.toggle("is-selected");
        continueButton.disabled = !wrapper.querySelector(".is-selected");
      });
    } else {
      wrapper.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-option-id]");
        if (!button) return;
        const action = button.dataset.optionAction || undefined;
        if (action === "confirm") return executeRun();
        return submit({ action, value: button.dataset.optionId, text: button.dataset.optionValue });
      });
    }
  }

  function showResponse(response, { speak = true } = {}) {
    responseState = response;
    runId = response.runId || runId;
    messages.push({ role: "assistant", text: response.message });
    renderMessages(); renderOptions(response);
    if (speak) voice.speak(response.speechText || response.message);
  }

  async function executeRun() {
    if (busy || !runId) return;
    busy = true; setStatus("processing");
    try {
      const result = await startAgentRun(runId);
      messages.push({ role: "assistant", text: "Perfecto. Investigaré las fuentes y prepararé los artículos. Puedes seguir el avance en el editor." });
      renderMessages(); optionsHost.replaceChildren();
      const sessionId = await onCreateSession?.(result.sessionRequest, runId);
      await updateAgentRun(runId, "completed", { sessionId });
      responseState = { ...(responseState || {}), runStatus: "completed", phase: "completed" };
      messages.push({ role: "assistant", text: "Los artículos están listos. Puedo ayudarte a revisarlos, verificarlos o preparar cambios." });
      renderMessages();
    } catch (error) {
      await updateAgentRun(runId, "failed", { error: error.message }).catch(() => {});
      messages.push({ role: "assistant", text: `La creación se detuvo: ${error.message}` });
      renderMessages(); onNotify?.(error.message, "error");
    } finally { busy = false; setStatus("idle"); }
  }

  async function startGuidedSession() {
    document.getElementById("right-panel")?.classList.remove("hidden");
    document.getElementById("right-resizer")?.classList.remove("hidden");
    body.hidden = false; header.setAttribute("aria-expanded", "true");
    messages.length = 0; renderMessages(); setStatus("processing");
    try { showResponse(await startAgentConversation()); }
    catch (error) { messages.push({ role: "assistant", text: `No pude iniciar el agente: ${error.message}` }); renderMessages(); onNotify?.(error.message, "error"); }
    finally { setStatus("idle"); }
  }

  header.addEventListener("click", () => {
    body.hidden = !body.hidden;
    header.setAttribute("aria-expanded", String(!body.hidden));
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (/nueva sesi[oó]n/i.test(text)) return onNewSessionRequest?.();
    input.value = ""; transcript = ""; submit({ text });
  });
  mic.addEventListener("click", () => {
    if (voice.listening) voice.stop();
    else voice.listen();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
  });
  renderMessages();
  return { startGuidedSession };
}
