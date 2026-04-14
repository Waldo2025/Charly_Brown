import {
  getUnidadStyleCatalog,
  getUnidadDefaultStylesForCategory,
  getUnidadSuggestedStylesForCategory,
  getUnidadDominantStyleId,
  normalizeUnidadActivityStyleIds,
  buildUnidadCombinedStylePromptBlock,
  buildUnidadStyleFormatContract,
  buildUnidadStyleExecutionContract
} from "./unidadActivityStyles.js";

const STYLE_SELECTIONS = {};
const STYLE_STORAGE_KEY = "cb_unidad_activity_style_selections_v1";
let ACTIVE_STYLE_MENU_ROOT = null;
let ACTIVE_STYLE_MENU_FRAME = 0;

function _normalizeEducationalStyleSelection(styleIds = [], { allowEmpty = false } = {}) {
  const safe = _sanitizePersistedStyleIds(styleIds || []);
  if (safe.length) return safe;
  return allowEmpty ? [] : ["asc"];
}

function _getCatalogIds() {
  return new Set(getUnidadStyleCatalog().map((item) => String(item?.id || "").trim()).filter(Boolean));
}

function _sanitizePersistedStyleIds(styleIds = [], { allowEmpty = true } = {}) {
  const catalogIds = _getCatalogIds();
  const list = Array.isArray(styleIds) ? styleIds : [styleIds];
  const seen = new Set();
  const out = [];
  list.forEach((item) => {
    const safe = String(item || "").trim().toLowerCase();
    if (!safe || !catalogIds.has(safe) || seen.has(safe)) return;
    seen.add(safe);
    out.push(safe);
  });
  if (!out.length && !allowEmpty) {
    return getUnidadDefaultStylesForCategory("");
  }
  return out;
}

function _safeParseJson(raw = "") {
  try {
    return JSON.parse(String(raw || ""));
  } catch (_) {
    return null;
  }
}

function _readPersistedSelections() {
  if (typeof window === "undefined" || !window.localStorage) return {};
  const parsed = _safeParseJson(window.localStorage.getItem(STYLE_STORAGE_KEY));
  return parsed && typeof parsed === "object" ? parsed : {};
}

function _writePersistedSelections(payload = {}) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STYLE_STORAGE_KEY, JSON.stringify(payload || {}));
  } catch (_) { }
}

function _categoriaKey(categoria = "") {
  return String(categoria || "").trim();
}

function _ensureLoadedSelections() {
  const persisted = _readPersistedSelections();
  Object.keys(persisted || {}).forEach((categoria) => {
    STYLE_SELECTIONS[categoria] = _normalizeEducationalStyleSelection(persisted[categoria] || [], { allowEmpty: true });
  });
}

function getSelectedUnidadActivityStyles(categoria = "") {
  _ensureLoadedSelections();
  const key = _categoriaKey(categoria);
  if (!key) return [];
  if (!Object.prototype.hasOwnProperty.call(STYLE_SELECTIONS, key)) {
    STYLE_SELECTIONS[key] = getUnidadDefaultStylesForCategory(key);
  }
  return _normalizeEducationalStyleSelection(STYLE_SELECTIONS[key] || []);
}

function setSelectedUnidadActivityStyles(categoria = "", styleIds = []) {
  _ensureLoadedSelections();
  const key = _categoriaKey(categoria);
  if (!key) return [];
  STYLE_SELECTIONS[key] = _normalizeEducationalStyleSelection(styleIds || [], { allowEmpty: true });
  _writePersistedSelections(STYLE_SELECTIONS);
  return [...STYLE_SELECTIONS[key]];
}

function getDominantUnidadActivityStyle(categoria = "") {
  return getUnidadDominantStyleId(getSelectedUnidadActivityStyles(categoria));
}

function buildUnidadActivityStylePromptContext(categoria = "", options = {}) {
  const active = getSelectedUnidadActivityStyles(categoria);
  if (!active.length) return "";
  if (active.length === 1 && active[0] === "asc") return "";
  return [
    buildUnidadCombinedStylePromptBlock(active),
    buildUnidadStyleFormatContract(active),
    buildUnidadStyleExecutionContract(active, options)
  ].filter(Boolean).join("\n\n");
}

function _renderStyleBadges(styleIds = []) {
  const catalog = getUnidadStyleCatalog();
  const catalogMap = new Map(catalog.map((item) => [item.id, item]));
  const safeIds = _sanitizePersistedStyleIds(styleIds || []);
  if (!safeIds.length) {
    return `<span class="cb-unidad-style-chip cb-unidad-style-chip-empty">Sin estilo</span>`;
  }
  return safeIds.map((id) => {
    const style = catalogMap.get(id);
    if (!style) return "";
    return `<span class="cb-unidad-style-chip">${style.shortLabel || style.label}</span>`;
  }).join("");
}

function _buildSelectorMenuHtml(categoria = "") {
  const current = getSelectedUnidadActivityStyles(categoria);
  const suggested = new Set(getUnidadSuggestedStylesForCategory(categoria));
  return getUnidadStyleCatalog().map((style) => {
    const checked = current.includes(style.id);
    const isSuggested = suggested.has(style.id);
    return `
      <label class="cb-unidad-style-option">
        <input type="checkbox" value="${style.id}" ${checked ? "checked" : ""}>
        <div class="cb-unidad-style-option-body">
          <div class="cb-unidad-style-option-top">
            <strong>${style.label}</strong>
            ${isSuggested ? `<span class="cb-unidad-style-recommended">Sugerido</span>` : ""}
          </div>
          <div class="cb-unidad-style-option-summary">${style.summary}</div>
        </div>
      </label>
    `;
  }).join("");
}

function _closeAllStyleMenus(exceptCategoria = "") {
  document.querySelectorAll(".cb-unidad-style-selector").forEach((node) => {
    const isTarget = String(node.getAttribute("data-categoria") || "").trim() === String(exceptCategoria || "").trim();
    if (!isTarget) {
      _closeStyleMenu(node);
      return;
    }
    if (!node.classList.contains("is-open")) {
      _closeStyleMenu(node);
    }
  });
}

function _clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function _positionFloatingStyleMenu(root) {
  const trigger = root?.querySelector?.("[data-action='toggle-style-menu']");
  const menu = root?._cbStyleMenu || root?.querySelector?.(".cb-unidad-style-menu");
  if (!trigger || !menu || !root.classList.contains("is-open")) return;

  const triggerRect = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const preferredWidth = Math.min(420, Math.max(320, viewportWidth - 24));

  menu.style.position = "fixed";
  menu.style.top = "0";
  menu.style.left = "0";
  menu.style.right = "auto";
  menu.style.width = `${preferredWidth}px`;
  menu.style.maxWidth = `calc(100vw - 24px)`;

  const menuRect = menu.getBoundingClientRect();
  const gap = 10;
  const left = _clamp(triggerRect.left, 12, Math.max(12, viewportWidth - menuRect.width - 12));
  const spaceBelow = viewportHeight - triggerRect.bottom - 12;
  const placeAbove = spaceBelow < Math.min(220, menuRect.height) && triggerRect.top > menuRect.height + gap + 12;
  const top = placeAbove
    ? Math.max(12, triggerRect.top - menuRect.height - gap)
    : Math.min(viewportHeight - menuRect.height - 12, triggerRect.bottom + gap);

  menu.style.left = `${left}px`;
  menu.style.top = `${Math.max(12, top)}px`;
}

function _openStyleMenu(root) {
  const menu = root?._cbStyleMenu || root?.querySelector?.(".cb-unidad-style-menu");
  if (!menu) return;
  root._cbStyleMenu = menu;
  root.classList.add("is-open");
  ACTIVE_STYLE_MENU_ROOT = root;
  menu.hidden = false;
  menu.classList.add("is-open");
  document.body.appendChild(menu);
  if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function" && ACTIVE_STYLE_MENU_FRAME) {
    window.cancelAnimationFrame(ACTIVE_STYLE_MENU_FRAME);
  }
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    ACTIVE_STYLE_MENU_FRAME = window.requestAnimationFrame(() => {
      ACTIVE_STYLE_MENU_FRAME = 0;
      _positionFloatingStyleMenu(root);
    });
    return;
  }
  _positionFloatingStyleMenu(root);
}

function _closeStyleMenu(root) {
  const menu = root?._cbStyleMenu || root?.querySelector?.(".cb-unidad-style-menu");
  if (!menu) return;
  root.classList.remove("is-open");
  menu.hidden = true;
  menu.classList.remove("is-open");
  menu.removeAttribute("style");
  root.appendChild(menu);
  if (ACTIVE_STYLE_MENU_ROOT === root) {
    ACTIVE_STYLE_MENU_ROOT = null;
  }
  if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function" && ACTIVE_STYLE_MENU_FRAME) {
    window.cancelAnimationFrame(ACTIVE_STYLE_MENU_FRAME);
    ACTIVE_STYLE_MENU_FRAME = 0;
  }
}

function _attachSelectorEvents(root) {
  const categoria = String(root?.getAttribute("data-categoria") || "").trim();
  if (!categoria) return;
  const trigger = root.querySelector("[data-action='toggle-style-menu']");
  const menu = root.querySelector(".cb-unidad-style-menu");
  const resetBtn = root.querySelector("[data-action='reset-style-defaults']");
  const summary = root.querySelector(".cb-unidad-style-summary");
  const hidden = root.querySelector("input[data-role='style-hidden']");
  if (!trigger || !menu || !summary || !hidden) return;

  const syncUi = (styleIds) => {
    const safe = _sanitizePersistedStyleIds(styleIds || []);
    summary.innerHTML = _renderStyleBadges(safe);
    hidden.value = safe.join(",");
    menu.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.checked = safe.includes(String(input.value || "").trim());
    });
  };

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const willOpen = !root.classList.contains("is-open");
    _closeAllStyleMenus();
    if (willOpen) {
      _openStyleMenu(root);
      return;
    }
    _closeStyleMenu(root);
  });

  menu.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return;
    const next = Array.from(menu.querySelectorAll("input[type='checkbox']:checked")).map((node) => String(node.value || "").trim());
    const applied = setSelectedUnidadActivityStyles(categoria, next);
    syncUi(applied);
  });

  resetBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const defaults = getUnidadDefaultStylesForCategory(categoria);
    const applied = setSelectedUnidadActivityStyles(categoria, defaults);
    syncUi(applied);
  });

  syncUi(getSelectedUnidadActivityStyles(categoria));
}

function _ensureSelectorStyles() {
  if (document.getElementById("cbUnidadActivityStyleSelectorCss")) return;
  const style = document.createElement("style");
  style.id = "cbUnidadActivityStyleSelectorCss";
  style.textContent = `
    .cb-unidad-style-selector {
      position: relative;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cb-unidad-style-selector-trigger {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      padding: 6px 10px;
      border-radius: 10px;
      border: 1px solid #dbe4f0;
      background: #ffffff;
      color: #0f172a;
      cursor: pointer;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
    }
    .cb-unidad-style-selector-trigger:hover {
      border-color: #bfdbfe;
      box-shadow: 0 8px 18px rgba(15, 23, 42, 0.10);
    }
    .cb-unidad-style-selector-label {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #1e3a8a;
    }
    .cb-unidad-style-summary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .cb-unidad-style-chip {
      display: inline-flex;
      align-items: center;
      height: 22px;
      padding: 0 8px;
      border-radius: 999px;
      background: #e0ecff;
      color: #1d4ed8;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .cb-unidad-style-chip-empty {
      background: #f1f5f9;
      color: #64748b;
    }
    .cb-unidad-style-menu {
      position: fixed;
      top: 12px;
      right: auto;
      left: 12px;
      width: min(420px, 88vw);
      display: none;
      z-index: 2147483000;
      padding: 12px;
      border-radius: 16px;
      border: 1px solid #dbe4f0;
      background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
      box-shadow: 0 24px 48px rgba(15, 23, 42, 0.18);
    }
    .cb-unidad-style-selector.is-open .cb-unidad-style-menu,
    .cb-unidad-style-menu.is-open {
      display: grid;
      gap: 10px;
    }
    .cb-unidad-style-menu-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .cb-unidad-style-menu-title {
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #0f172a;
    }
    .cb-unidad-style-menu-note {
      font-size: 12px;
      color: #64748b;
      line-height: 1.45;
    }
    .cb-unidad-style-option-list {
      display: grid;
      gap: 8px;
      max-height: 320px;
      overflow: auto;
      padding-right: 4px;
    }
    .cb-unidad-style-option {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr);
      gap: 10px;
      align-items: start;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      background: #ffffff;
      cursor: pointer;
    }
    .cb-unidad-style-option:hover {
      border-color: #bfdbfe;
      background: #f8fbff;
    }
    .cb-unidad-style-option-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      font-size: 13px;
      color: #0f172a;
    }
    .cb-unidad-style-option-summary {
      margin-top: 4px;
      font-size: 12px;
      color: #64748b;
      line-height: 1.45;
    }
    .cb-unidad-style-recommended {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      background: #dcfce7;
      color: #166534;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .cb-unidad-style-reset {
      border: 1px solid #dbe4f0;
      background: #ffffff;
      color: #0f172a;
      padding: 8px 10px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}

function buildUnidadActivityStyleSelectorHtml(categoria = "") {
  const safeCategory = String(categoria || "").trim();
  const selected = getSelectedUnidadActivityStyles(safeCategory);
  return `
    <div class="cb-unidad-style-selector" data-categoria="${safeCategory}">
      <input type="hidden" data-role="style-hidden" value="${selected.join(",")}">
      <button type="button" class="cb-unidad-style-selector-trigger" data-action="toggle-style-menu" aria-label="Elegir estilos educativos">
        <span class="cb-unidad-style-selector-label">Estilos</span>
        <span class="cb-unidad-style-summary">${_renderStyleBadges(selected)}</span>
        <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
      </button>
      <div class="cb-unidad-style-menu">
        <div class="cb-unidad-style-menu-header">
          <div class="cb-unidad-style-menu-title">Estilos Educativos</div>
          <button type="button" class="cb-unidad-style-reset" data-action="reset-style-defaults">Restaurar sugeridos</button>
        </div>
        <div class="cb-unidad-style-menu-note">Elige uno o varios estilos para esta categoría antes de generar. La selección solo cambia la intención pedagógica; no sustituye secuencia ni lectura.</div>
        <div class="cb-unidad-style-option-list">
          ${_buildSelectorMenuHtml(safeCategory)}
        </div>
      </div>
    </div>
  `;
}

function attachUnidadActivityStyleSelectors(root = document) {
  _ensureSelectorStyles();
  const scope = root && typeof root.querySelectorAll === "function" ? root : document;
  scope.querySelectorAll(".cb-unidad-style-selector[data-categoria]").forEach((node) => {
    if (node.dataset.boundStyleSelector === "1") return;
    node.dataset.boundStyleSelector = "1";
    _attachSelectorEvents(node);
  });
}

document.addEventListener("click", (event) => {
  if (!ACTIVE_STYLE_MENU_ROOT) return;

  // Si el clic es dentro del trigger o del menú activo, no hacemos nada
  const isTrigger = event.target?.closest?.("[data-action='toggle-style-menu']");
  const isMenu = event.target?.closest?.(".cb-unidad-style-menu");

  if (!isTrigger && !isMenu) {
    _closeAllStyleMenus();
  }
}, true);

window.addEventListener("resize", () => {
  if (ACTIVE_STYLE_MENU_ROOT) _positionFloatingStyleMenu(ACTIVE_STYLE_MENU_ROOT);
});

window.addEventListener("scroll", () => {
  if (ACTIVE_STYLE_MENU_ROOT) _positionFloatingStyleMenu(ACTIVE_STYLE_MENU_ROOT);
}, true);

export {
  getSelectedUnidadActivityStyles,
  setSelectedUnidadActivityStyles,
  getDominantUnidadActivityStyle,
  buildUnidadActivityStylePromptContext,
  buildUnidadActivityStyleSelectorHtml,
  attachUnidadActivityStyleSelectors
};

if (typeof window !== "undefined") {
  window.getSelectedUnidadActivityStyles = getSelectedUnidadActivityStyles;
  window.setSelectedUnidadActivityStyles = setSelectedUnidadActivityStyles;
  window.getDominantUnidadActivityStyle = getDominantUnidadActivityStyle;
  window.buildUnidadActivityStylePromptContext = buildUnidadActivityStylePromptContext;
  window.buildUnidadActivityStyleSelectorHtml = buildUnidadActivityStyleSelectorHtml;
  window.attachUnidadActivityStyleSelectors = attachUnidadActivityStyleSelectors;
}
