import { escapeHtml } from "./ui-components.js";

export function createChatController({ root, store, onAction, onUserMessage } = {}) {
  const messagesEl = root.querySelector("#cbMessages");
  const form = root.querySelector("#cbComposer");
  const input = root.querySelector("#cbComposerInput");
  let transientStatusEl = null;

  const render = (state) => {
    const messages = state.session.messages || [];
    messagesEl.innerHTML = messages.length ? messages.map(renderMessage).join("") : renderWelcome();
    messagesEl.scrollTop = messagesEl.scrollHeight;
    root.querySelector("#cbActiveSessionTitle").textContent = state.session.title || "Nueva unidad";
  };

  store.subscribe(render);

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = String(input?.value || "").trim();
    if (!text) return;
    input.value = "";
    onUserMessage?.(text);
  });

  root.querySelectorAll("[data-chat-action]").forEach((button) => {
    button.addEventListener("click", () => onAction?.(button.dataset.chatAction));
  });

  const showTransientStatus = (label = "Working") => {
    if (!messagesEl) return;
    clearTransientStatus();
    transientStatusEl = document.createElement("article");
    transientStatusEl.className = "cb-message cb-message--assistant cb-message--transient";
    transientStatusEl.setAttribute("data-transient-status", "true");
    transientStatusEl.innerHTML = `<div class="cb-message-bubble">${renderWorkingStatus(label)}</div>`;
    messagesEl.appendChild(transientStatusEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };

  const clearTransientStatus = () => {
    transientStatusEl?.remove();
    transientStatusEl = null;
  };

  return { render, showTransientStatus, clearTransientStatus };
}

export function renderProposalMessage({ id = "", title = "", html = "", validation = null } = {}) {
  const valid = validation?.ok !== false;
  const isProject = /proyecto/i.test(String(title || ""));
  return `
    <div class="cb-proposal" data-proposal-id="${escapeHtml(id)}">
      <h3>${escapeHtml(title || "Propuesta")}</h3>
      ${valid ? "" : `<p class="cb-warning">La estructura necesita corrección: ${escapeHtml((validation?.errors || []).join(", "))}</p>`}
      <div class="cb-proposal-html">${html || ""}</div>
      <div class="cb-proposal-actions">
        <button type="button" data-proposal-action="accept">${isProject ? "Aceptar proyecto" : "Aceptar para usar"}</button>
        <button type="button" data-proposal-action="reject">No usar</button>
        <button type="button" data-proposal-action="easier">${isProject ? "Simplificar proyecto" : "Hacer más fácil"}</button>
        <button type="button" data-proposal-action="harder">${isProject ? "Hacer proyecto más retador" : "Hacer más difícil"}</button>
      </div>
    </div>
  `;
}

function renderMessage(message = {}) {
  return `
    <article class="cb-message cb-message--${escapeHtml(message.role || "assistant")}">
      <div class="cb-message-bubble">${message.html || escapeHtml(message.text || "")}</div>
    </article>
  `;
}

function renderWelcome() {
  return `
    <article class="cb-message cb-message--assistant">
      <div class="cb-message-bubble">
        <strong>Empecemos por lo básico.</strong>
        <p>Elige grado, trimestre y unidad. Luego pega una lectura o pídeme generarla. Cuando aceptes activities o un proyecto, aparecerán a la derecha y desde ahí podrás crear notas del maestro.</p>
      </div>
    </article>
  `;
}

function renderWorkingStatus(label = "Working") {
  return `
    <div class="cb-working-status" aria-live="polite" aria-label="${label}">
      <span class="cb-working-label">${label}</span>
      <span class="cb-working-dots" aria-hidden="true">
        <span></span><span></span><span></span>
      </span>
    </div>
  `;
}
