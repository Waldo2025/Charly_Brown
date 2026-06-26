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

  messagesEl?.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-message-action='delete']");
    if (!button) return;
    const id = button.closest("[data-message-id]")?.dataset.messageId || "";
    if (!id) return;
    store.removeMessage?.(id);
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
  const parts = splitProposalHtml(html);
  return `
    <div class="cb-proposal" data-proposal-id="${escapeHtml(id)}">
      <h3>${escapeHtml(title || "Propuesta")}</h3>
      ${valid ? "" : `<p class="cb-warning">La estructura necesita corrección: ${escapeHtml((validation?.errors || []).join(", "))}</p>`}
      <details class="cb-proposal-part cb-proposal-part--activities" open>
        <summary class="cb-proposal-summary">
          <p class="cb-panel-kicker">Activities</p>
        </summary>
        <div class="cb-proposal-html">${parts.activitiesHtml || html || ""}</div>
        <div class="cb-proposal-actions">
          <button type="button" data-proposal-action="accept">${isProject ? "Aceptar proyecto" : "Aceptar activities"}</button>
          <button type="button" data-proposal-action="reject">No usar</button>
          <button type="button" data-proposal-action="easier">${isProject ? "Simplificar proyecto" : "Hacer más fácil"}</button>
          <button type="button" data-proposal-action="harder">${isProject ? "Hacer proyecto más retador" : "Hacer más difícil"}</button>
        </div>
      </details>
      ${parts.resources.length ? `
        <div class="cb-proposal-part cb-proposal-part--resources">
          <p class="cb-panel-kicker">Materiales</p>
          <div class="cb-proposal-resources">
            ${parts.resources.map((resource, index) => `
              <details class="cb-approved-card cb-resource-card" data-resource-proposal-index="${index}">
                <summary class="cb-proposal-summary">
                  <div class="cb-approved-card-head">
                    <strong>${escapeHtml(resource.title || resource.code || "Recurso")}</strong>
                    <div class="cb-resource-chip">${escapeHtml(resource.code || resource.type || "Recurso")}</div>
                  </div>
                </summary>
                <div class="cb-approved-html">${resource.html || ""}</div>
                <div class="cb-proposal-actions cb-proposal-actions--resource">
                  <button type="button" data-resource-proposal-action="accept">Usar este recurso</button>
                  <button type="button" data-resource-proposal-action="reject">No usar</button>
                </div>
              </details>
            `).join("")}
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function splitProposalHtml(html = "") {
  if (typeof DOMParser === "undefined") {
    return { activitiesHtml: html || "", resources: [] };
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${String(html || "")}</div>`, "text/html");
  const resources = Array.from(doc.querySelectorAll("[data-resource-type], [data-resource-section='true'], .resource-ficha, .resource-anexo, .resource-recortable, .resource-video, .guion-video")).map((node) => {
    const type = String(node.getAttribute("data-resource-type") || "").trim();
    const title = String(node.querySelector("h1,h2,h3,h4,strong")?.textContent || node.textContent || "").trim();
    return {
      type,
      title,
      code: title || type || "Recurso",
      html: node.outerHTML
    };
  });
  resources.forEach((node) => node.remove?.());
  return {
    activitiesHtml: doc.body.innerHTML.replace(/^<div>|<\/div>$/g, ""),
    resources
  };
}

function renderMessage(message = {}) {
  const deletable = message.role !== "assistant" || Boolean(message.text || message.html);
  const html = String(message.html || "");
  if (message.role === "assistant" && html.includes('data-proposal-id="')) {
    return `
      <article class="cb-message cb-message--${escapeHtml(message.role || "assistant")}" data-message-id="${escapeHtml(message.id || "")}">
        <div class="cb-message-bubble">
          <div class="cb-message-body">${html}</div>
          ${deletable ? `<div class="cb-message-actions"><button type="button" data-message-action="delete">Eliminar</button></div>` : ""}
        </div>
      </article>
    `;
  }
  return `
    <article class="cb-message cb-message--${escapeHtml(message.role || "assistant")}" data-message-id="${escapeHtml(message.id || "")}">
      <details class="cb-message-bubble" ${message.role === "user" ? "open" : ""}>
        <summary class="cb-message-summary">
          <span>${escapeHtml(message.role === "user" ? "Tú" : "Charly Brown")}</span>
          <span class="cb-message-summary-meta">${message.text ? escapeHtml(stripPreview(message.text)) : message.html ? "Respuesta" : ""}</span>
        </summary>
        <div class="cb-message-body">${message.html || escapeHtml(message.text || "")}</div>
        ${deletable ? `<div class="cb-message-actions"><button type="button" data-message-action="delete">Eliminar</button></div>` : ""}
      </details>
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

function stripPreview(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}
