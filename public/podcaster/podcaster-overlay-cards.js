const CARD_PRESETS = {
  "lower-third": {
    label: "Nombre",
    textLines: ["Nombre de la persona", "Cargo o contexto"],
    position: { xPct: 0.06, yPct: 0.66, widthPct: 0.56, heightPct: 0.2 },
    enterAnimation: "slide-left",
    fields: [
      { key: "line1", label: "Nombre", value: "Nombre de la persona", placeholder: "Nombre o título" },
      { key: "line2", label: "Cargo", value: "Cargo o contexto", placeholder: "Cargo, rol o contexto" }
    ]
  },
  "info-panel": {
    label: "Info",
    textLines: ["Dato importante", "Detalle breve para pantalla"],
    position: { xPct: 0.46, yPct: 0.14, widthPct: 0.46, heightPct: 0.3 },
    enterAnimation: "slide-right",
    fields: [
      { key: "line1", label: "Título", value: "Dato importante", placeholder: "Título de la tarjeta" },
      { key: "line2", label: "Detalle", value: "Detalle breve para pantalla", placeholder: "Detalle principal" },
      { key: "line3", label: "Nota", value: "", placeholder: "Nota opcional" }
    ]
  },
  "phone-cta": {
    label: "Teléfono",
    textLines: ["Llámanos", "+52 000 000 0000"],
    position: { xPct: 0.44, yPct: 0.7, widthPct: 0.48, heightPct: 0.18 },
    enterAnimation: "slide-up",
    fields: [
      { key: "line1", label: "Llamado", value: "Llámanos", placeholder: "Texto de llamado" },
      { key: "line2", label: "Teléfono", value: "+52 000 000 0000", placeholder: "Teléfono o URL" }
    ]
  }
};

const CARD_EXIT_WINDOW_MS = 520;

function escapeHtml(value = "") {
  if (typeof window.escapeHtml === "function") return window.escapeHtml(value);
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeCssIdent(value = "") {
  const clean = String(value || "");
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(clean);
  return clean.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function ensureOverlayCardBaseStyles() {
  if (document.getElementById("podcastOverlayCardBaseStyles")) return;
  const style = document.createElement("style");
  style.id = "podcastOverlayCardBaseStyles";
  style.textContent = `
    .podcast-overlay-card-layer{position:absolute;inset:0;z-index:38;pointer-events:none}
    .podcast-overlay-card{position:absolute;left:calc(var(--pod-card-x,.06)*100%);top:calc(var(--pod-card-y,.68)*100%);width:calc(var(--pod-card-w,.56)*100%);min-height:calc(var(--pod-card-h,.2)*100%);color:var(--pod-card-text,#f8fafc);background:color-mix(in srgb,var(--pod-card-bg,#0f172a) 86%,transparent);border:1px solid rgba(255,255,255,.16);border-left:7px solid var(--pod-card-accent,#38bdf8);border-radius:8px;padding:clamp(14px,2.2vw,28px);box-shadow:0 22px 52px rgba(2,6,23,.42);backdrop-filter:blur(14px);overflow:hidden;pointer-events:auto;animation:pod-overlay-card-enter 420ms cubic-bezier(.2,.85,.2,1) both}
    .podcast-overlay-card.is-exiting{animation:pod-overlay-card-exit 520ms cubic-bezier(.55,.05,.55,.95) both}
    .podcast-overlay-card[data-enter-animation=slide-right]{--pod-card-enter-x:42%;--pod-card-enter-y:0%}.podcast-overlay-card[data-enter-animation=slide-left]{--pod-card-enter-x:-42%;--pod-card-enter-y:0%}.podcast-overlay-card[data-enter-animation=slide-up]{--pod-card-enter-x:0%;--pod-card-enter-y:-42%}.podcast-overlay-card[data-enter-animation=slide-down]{--pod-card-enter-x:0%;--pod-card-enter-y:42%}.podcast-overlay-card[data-enter-animation=fade]{--pod-card-enter-x:0%;--pod-card-enter-y:0%}
    .podcast-overlay-card[data-exit-animation=slide-right]{--pod-card-exit-x:42%;--pod-card-exit-y:0%}.podcast-overlay-card[data-exit-animation=slide-left]{--pod-card-exit-x:-42%;--pod-card-exit-y:0%}.podcast-overlay-card[data-exit-animation=slide-up]{--pod-card-exit-x:0%;--pod-card-exit-y:-42%}.podcast-overlay-card[data-exit-animation=slide-down]{--pod-card-exit-x:0%;--pod-card-exit-y:42%}.podcast-overlay-card[data-exit-animation=fade]{--pod-card-exit-x:0%;--pod-card-exit-y:0%}
    .podcast-overlay-card-line{display:block;overflow-wrap:anywhere}.podcast-overlay-card-line.is-primary{font-size:clamp(24px,3vw,48px);font-weight:900;line-height:1.05}.podcast-overlay-card-line:not(.is-primary){margin-top:6px;font-size:clamp(16px,1.75vw,28px);font-weight:760;line-height:1.25;opacity:.9}
    .podcast-overlay-card-delete{position:absolute;top:8px;right:8px;z-index:2;width:24px;height:24px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.24);border-radius:999px;background:rgba(2,6,23,.44);color:#f8fafc;font-size:16px;line-height:1;cursor:pointer;opacity:0;transition:opacity .16s ease,background .16s ease}.podcast-overlay-card:hover .podcast-overlay-card-delete,.podcast-overlay-card-delete:focus-visible{opacity:1}.podcast-overlay-card-delete:hover{background:rgba(239,68,68,.86)}
    @keyframes pod-overlay-card-enter{from{opacity:0;transform:translate(var(--pod-card-enter-x,-42%),var(--pod-card-enter-y,0%))}to{opacity:1;transform:translate(0,0)}}@keyframes pod-overlay-card-exit{from{opacity:1;transform:translate(0,0)}to{opacity:0;transform:translate(var(--pod-card-exit-x,0%),var(--pod-card-exit-y,0%))}}
  `;
  document.head.appendChild(style);
}

function getConfig(session = null, explicitConfig = null) {
  if (explicitConfig && typeof explicitConfig === "object") return explicitConfig;
  return window.getPodcastVideoConfig?.(session || window.getActiveSession?.()) || {};
}

function normalizeCards(raw = {}) {
  if (typeof window.normalizeOverlayCardsById === "function") return window.normalizeOverlayCardsById(raw);
  return raw && typeof raw === "object" ? raw : {};
}

function getCards(session = null, explicitConfig = null) {
  return normalizeCards(getConfig(session, explicitConfig).timelineOverlayCardsById || {});
}

function getActiveSceneTiming() {
  const session = window.getActiveSession?.();
  const rowId = String(window.podcastVideoState?.activeRowId || "").trim();
  const clip = rowId ? window.ensureTimelineClipsByRowId?.(session, { persist: false })?.[rowId] || null : null;
  return {
    session,
    rowId,
    startMs: Math.max(0, Number(clip?.startMs || 0) || 0),
    durationMs: Math.max(500, Number(clip?.trimOutMs || 0) - Number(clip?.trimInMs || 0) || Number(clip?.durationMs || 4000) || 4000)
  };
}

function saveCards(nextCards = {}) {
  window.upsertPodcastVideoConfig?.((cfg) => ({
    ...cfg,
    timelineOverlayCardsById: normalizeCards(nextCards)
  }), { autosaveReason: "overlay-cards" });
  const session = window.getActiveSession?.();
  window.persistReorderedTimelinePatchToCloud?.(session, {
    podcastVideoConfig: getConfig(session),
    timelineOverlayCardsById: normalizeCards(nextCards)
  });
  window.renderPodcastVideoTimeline?.(session, { force: true, reason: "overlay-cards" });
  window.scheduleMontageExportPreviewRefresh?.(90);
}

function deleteCard(cardId = "") {
  const cleanId = String(cardId || "").trim();
  if (!cleanId) return;
  const cards = { ...getCards(window.getActiveSession?.()) };
  if (!cards[cleanId]) return;
  delete cards[cleanId];
  saveCards(cards);
  document.querySelectorAll(`.podcast-overlay-card[data-card-id="${escapeCssIdent(cleanId)}"]`).forEach((node) => node.remove());
  renderCardList();
}

function buildCardFromEditor() {
  const panel = document.querySelector(".podcast-overlay-card-editor");
  const presetKey = panel?.querySelector('[data-field="preset"]')?.value || "lower-third";
  const preset = CARD_PRESETS[presetKey] || CARD_PRESETS["lower-third"];
  const { rowId, startMs, durationMs } = getActiveSceneTiming();
  const lines = (preset.fields || []).map((field) => panel?.querySelector(`[data-field="${field.key}"]`)?.value)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const id = `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    rowId,
    startMs,
    durationMs: Math.max(500, Number(panel?.querySelector('[data-field="durationMs"]')?.value || durationMs) || durationMs),
    preset: presetKey,
    textLines: lines.length ? lines : preset.textLines,
    position: preset.position,
    enterAnimation: panel?.querySelector('[data-field="enterAnimation"]')?.value || preset.enterAnimation,
    exitAnimation: panel?.querySelector('[data-field="exitAnimation"]')?.value || "fade",
    style: {
      accentColor: panel?.querySelector('[data-field="accentColor"]')?.value || "#38bdf8",
      backgroundColor: "#0f172a",
      textColor: "#f8fafc"
    },
    zIndex: 20
  };
}

function renderEditor() {
  if (document.querySelector(".podcast-overlay-card-editor")) return;
  const host = document.createElement("div");
  host.className = "podcast-overlay-card-editor";
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-modal", "true");
  host.setAttribute("aria-label", "Editor de card animada");
  host.hidden = true;
  host.innerHTML = `
    <div class="podcast-overlay-card-modal-backdrop" data-action="overlay-card-close"></div>
    <section class="podcast-overlay-card-modal" role="document">
      <header class="podcast-overlay-card-modal-head">
        <strong>Card animada</strong>
        <button type="button" data-action="overlay-card-close" aria-label="Cerrar">&times;</button>
      </header>
      <div class="podcast-overlay-card-form">
        <label>
          <span>Plantilla</span>
          <select data-field="preset" aria-label="Plantilla de card">
            ${Object.entries(CARD_PRESETS).map(([value, item]) => `<option value="${value}">${escapeHtml(item.label)}</option>`).join("")}
          </select>
        </label>
        <label data-field-row="line1">
          <span data-label-for="line1">Texto principal</span>
          <input data-field="line1" type="text" value="Nombre de la persona" aria-label="Texto principal">
        </label>
        <label data-field-row="line2">
          <span data-label-for="line2">Texto secundario</span>
          <input data-field="line2" type="text" value="Cargo o contexto" aria-label="Texto secundario">
        </label>
        <label data-field-row="line3">
          <span data-label-for="line3">Texto adicional</span>
          <input data-field="line3" type="text" placeholder="Detalle opcional" aria-label="Texto adicional">
        </label>
        <label>
          <span>Duración</span>
          <input data-field="durationMs" type="number" min="500" step="100" value="4000" aria-label="Duración en milisegundos">
        </label>
        <label>
          <span>Entrada</span>
          <select data-field="enterAnimation" aria-label="Animación de entrada">
            <option value="slide-left">Desde izquierda</option>
            <option value="slide-right">Desde derecha</option>
            <option value="slide-up">Desde arriba</option>
            <option value="slide-down">Desde abajo</option>
            <option value="fade">Fade</option>
          </select>
        </label>
        <label>
          <span>Salida</span>
          <select data-field="exitAnimation" aria-label="Animación de salida">
            <option value="fade">Salida fade</option>
            <option value="slide-left">Sale izquierda</option>
            <option value="slide-right">Sale derecha</option>
            <option value="slide-up">Sale arriba</option>
            <option value="slide-down">Sale abajo</option>
          </select>
        </label>
        <label>
          <span>Acento</span>
          <input data-field="accentColor" type="color" value="#38bdf8" aria-label="Color de acento">
        </label>
      </div>
      <div class="podcast-overlay-card-list" aria-label="Cards creadas"></div>
      <footer class="podcast-overlay-card-modal-actions">
        <button type="button" data-action="overlay-card-close">Cancelar</button>
        <button type="button" data-action="overlay-card-save">Añadir</button>
      </footer>
    </section>
  `;
  document.body.appendChild(host);
  applyEditorPresetFields(host);
}

function applyEditorPresetFields(panel = document.querySelector(".podcast-overlay-card-editor")) {
  if (!panel) return;
  const presetKey = panel.querySelector('[data-field="preset"]')?.value || "lower-third";
  const preset = CARD_PRESETS[presetKey] || CARD_PRESETS["lower-third"];
  const fieldMap = new Map((preset.fields || []).map((field) => [field.key, field]));
  ["line1", "line2", "line3"].forEach((key) => {
    const row = panel.querySelector(`[data-field-row="${key}"]`);
    const input = panel.querySelector(`[data-field="${key}"]`);
    const label = panel.querySelector(`[data-label-for="${key}"]`);
    const field = fieldMap.get(key);
    if (row) row.hidden = !field;
    if (!input || !field) return;
    input.value = field.value || "";
    input.placeholder = field.placeholder || "";
    input.setAttribute("aria-label", field.label || "Texto");
    if (label) label.textContent = field.label || "Texto";
  });
  const enterSelect = panel.querySelector('[data-field="enterAnimation"]');
  if (enterSelect) enterSelect.value = preset.enterAnimation || "slide-left";
}

function renderCardList() {
  const list = document.querySelector(".podcast-overlay-card-list");
  if (!list) return;
  const cards = Object.values(getCards(window.getActiveSession?.()))
    .sort((a, b) => Number(a.startMs || 0) - Number(b.startMs || 0));
  list.innerHTML = cards.length
    ? cards.map((card) => `
      <div class="podcast-overlay-card-list-item">
        <span>${escapeHtml((card.textLines || [])[0] || "Card")}</span>
        <button type="button" data-action="overlay-card-delete" data-card-id="${escapeHtml(card.id)}" aria-label="Eliminar card">Eliminar</button>
      </div>
    `).join("")
    : `<span class="podcast-overlay-card-empty">Sin cards</span>`;
}

function ensureLayer(container) {
  if (!container) return null;
  ensureOverlayCardBaseStyles();
  let layer = container.querySelector(".podcast-overlay-card-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "podcast-overlay-card-layer";
    layer.setAttribute("aria-hidden", "true");
    container.appendChild(layer);
  }
  return layer;
}

function renderCard(card, options = {}) {
  const pos = card.position || {};
  const style = card.style || {};
  const interactive = options.interactive !== false;
  const phase = options.phase === "exit" ? "exit" : "enter";
  const exitAnimation = String(card.exitAnimation || "fade").trim() || "fade";
  const widthPct = Math.max(0.48, Math.min(0.9, Number(pos.widthPct || 0.56) || 0.56));
  const heightPct = Math.max(0.18, Math.min(0.55, Number(pos.heightPct || 0.2) || 0.2));
  const xPct = Math.max(0, Math.min(1 - widthPct, Number(pos.xPct || 0) || 0));
  const yPct = Math.max(0, Math.min(1 - heightPct, Number(pos.yPct || 0) || 0));
  return `
    <div class="podcast-overlay-card is-${escapeHtml(card.preset || "lower-third")}${phase === "exit" ? " is-exiting" : ""}" data-card-id="${escapeHtml(card.id)}" data-enter-animation="${escapeHtml(card.enterAnimation || "slide-left")}" data-exit-animation="${escapeHtml(exitAnimation)}" data-phase="${phase}" style="--pod-card-x:${xPct};--pod-card-y:${yPct};--pod-card-w:${widthPct};--pod-card-h:${heightPct};--pod-card-accent:${escapeHtml(style.accentColor || "#38bdf8")};--pod-card-bg:${escapeHtml(style.backgroundColor || "#0f172a")};--pod-card-text:${escapeHtml(style.textColor || "#f8fafc")};z-index:${Math.max(1, Number(card.zIndex || 20) || 20)}">
      ${interactive ? `<button type="button" class="podcast-overlay-card-delete" data-action="overlay-card-delete" data-card-id="${escapeHtml(card.id)}" aria-label="Eliminar card">&times;</button>` : ""}
      ${(card.textLines || []).map((line, index) => `<span class="podcast-overlay-card-line${index === 0 ? " is-primary" : ""}">${escapeHtml(line)}</span>`).join("")}
    </div>
  `;
}

export function renderPodcasterOverlayCardsForPreview(options = {}) {
  const container = options.containerEl || document.querySelector("#podcastVideoStage .podcast-video-preview");
  const layer = ensureLayer(container);
  if (!layer) return;
  const session = options.session || window.getActiveSession?.();
  const config = options.config || null;
  const currentMs = Math.max(0, Number(options.currentMs ?? window.podcastVideoState?.montageCursorMs ?? 0) || 0);
  const cards = Object.values(getCards(session, config))
    .map((card) => {
      const startMs = Number(card.startMs || 0);
      const endMs = startMs + Number(card.durationMs || 0);
      const active = currentMs >= startMs && currentMs <= endMs;
      const phase = active && currentMs >= Math.max(startMs, endMs - CARD_EXIT_WINDOW_MS) ? "exit" : "enter";
      return { card, active, phase };
    })
    .filter((item) => item.active)
    .sort((a, b) => Number(a.card.zIndex || 0) - Number(b.card.zIndex || 0));
  const signature = cards.map((item) => `${item.card.id}:${item.phase}`).join("|");
  if (layer.dataset.cardsSignature === signature) return;
  layer.dataset.cardsSignature = signature;
  layer.classList.toggle("is-interactive", options.interactive !== false);
  layer.innerHTML = cards.map((item) => renderCard(item.card, {
    phase: item.phase,
    interactive: options.interactive !== false
  })).join("");
}

export function buildMontageOverlayCardSegments(session = null) {
  return {
    enabled: true,
    segments: Object.values(getCards(session))
  };
}

export function initPodcasterOverlayCardsEditor() {
  const preview = document.querySelector("#podcastVideoStage .podcast-video-preview");
  if (!preview) return;
  renderEditor();
  ensureLayer(preview);
  renderCardList();
  const collapsedHandle = document.getElementById("podcastVideoLibraryCollapsedHandle");
  if (collapsedHandle && !document.querySelector(".podcast-overlay-card-add-btn")) {
    collapsedHandle.insertAdjacentHTML("afterend", `<button class="podcast-overlay-card-add-btn" type="button" data-action="overlay-card-open" aria-label="Añadir card">Card</button>`);
  }
  document.addEventListener("click", (event) => {
    const action = event.target?.closest?.("[data-action]")?.dataset?.action || "";
    if (action === "overlay-card-open") {
      const panel = document.querySelector(".podcast-overlay-card-editor");
      if (panel) {
        const timing = getActiveSceneTiming();
        const durationField = panel.querySelector('[data-field="durationMs"]');
        if (durationField) durationField.value = String(Math.max(500, Math.round(timing.durationMs || 4000)));
        applyEditorPresetFields(panel);
        renderCardList();
        panel.hidden = false;
      }
    } else if (action === "overlay-card-close") {
      const panel = document.querySelector(".podcast-overlay-card-editor");
      if (panel) panel.hidden = true;
    } else if (action === "overlay-card-save") {
      const session = window.getActiveSession?.();
      const cards = getCards(session);
      const card = buildCardFromEditor();
      saveCards({ ...cards, [card.id]: card });
      renderPodcasterOverlayCardsForPreview({ session, currentMs: card.startMs });
      renderCardList();
      const panel = document.querySelector(".podcast-overlay-card-editor");
      if (panel) panel.hidden = true;
    } else if (action === "overlay-card-delete") {
      event.preventDefault();
      deleteCard(event.target?.closest?.("[data-card-id]")?.dataset?.cardId || "");
    }
  });
  document.addEventListener("change", (event) => {
    const target = event.target?.closest?.('[data-field="preset"]');
    if (!target || !target.closest(".podcast-overlay-card-editor")) return;
    applyEditorPresetFields(target.closest(".podcast-overlay-card-editor"));
  });
  window.setInterval(() => renderPodcasterOverlayCardsForPreview(), 500);
  renderPodcasterOverlayCardsForPreview();
}

window.initPodcasterOverlayCardsEditor = initPodcasterOverlayCardsEditor;
window.renderPodcasterOverlayCardsForPreview = renderPodcasterOverlayCardsForPreview;
window.buildMontageOverlayCardSegments = buildMontageOverlayCardSegments;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPodcasterOverlayCardsEditor, { once: true });
} else {
  initPodcasterOverlayCardsEditor();
}
