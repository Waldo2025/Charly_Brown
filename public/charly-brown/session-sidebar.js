import { escapeHtml } from "./ui-components.js";

export function renderSessionSidebar({ root, sessions = [], totalCount = sessions.length, filtersActive = false, activeId = "", onSelect, onNew, onRename, onDuplicate, onDelete } = {}) {
  const list = root?.querySelector("#cbSessionList");
  const status = root?.querySelector("#cbSessionStatus");
  const newBtn = root?.querySelector("#cbNewSessionBtn");
  if (!list) return;
  if (status) status.textContent = filtersActive ? `${sessions.length} de ${totalCount} libros` : `${totalCount} libros`;
  list.innerHTML = sessions.length ? sessions.map((session) => `
    <article class="cb-session-item ${session.id === activeId ? "is-active" : ""}" data-session-id="${escapeHtml(session.id)}">
      <button type="button" class="cb-session-main" data-session-action="select">
        <i class="fas fa-file-alt cb-session-document-icon" aria-hidden="true"></i>
        <span class="cb-session-main-line">${escapeHtml(formatSessionMeta(session.meta))}</span>
      </button>
      <details class="cb-session-menu">
        <summary class="cb-session-menu-toggle" aria-label="Abrir menú de sesión" title="Más opciones">
          <i class="fas fa-ellipsis-v" aria-hidden="true"></i>
        </summary>
        <div class="cb-session-menu-panel">
          <button type="button" data-session-action="rename"><i class="fas fa-pen"></i><span>Renombrar</span></button>
          <button type="button" data-session-action="duplicate"><i class="fas fa-copy"></i><span>Duplicar</span></button>
          <button type="button" data-session-action="delete"><i class="fas fa-trash"></i><span>Eliminar</span></button>
        </div>
      </details>
    </article>
  `).join("") : `<div class="cb-empty">${filtersActive ? "No hay libros con estos filtros." : "Crea tu primer libro."}</div>`;

  if (newBtn) newBtn.onclick = () => onNew?.();
  list.querySelectorAll(".cb-session-menu").forEach((menu) => {
    menu.addEventListener("toggle", () => {
      const summary = menu.querySelector(".cb-session-menu-toggle");
      summary?.setAttribute("aria-label", menu.open ? "Cerrar menú de sesión" : "Abrir menú de sesión");
      if (!menu.open) return;
      list.querySelectorAll(".cb-session-menu[open]").forEach((otherMenu) => {
        if (otherMenu !== menu) otherMenu.removeAttribute("open");
      });
    });
  });
  list.querySelectorAll("[data-session-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.closest(".cb-session-menu")) button.closest("details")?.removeAttribute("open");
      const id = button.closest("[data-session-id]")?.dataset.sessionId || "";
      const action = button.dataset.sessionAction;
      const session = sessions.find((item) => item.id === id);
      if (action === "select") onSelect?.(session);
      if (action === "rename") onRename?.(session);
      if (action === "duplicate") onDuplicate?.(session);
      if (action === "delete") onDelete?.(session);
    });
  });
}

export function filterSessionsByAcademicMeta(sessions = [], filters = {}) {
  const active = Object.entries(filters || {}).filter(([, value]) => normalizeMetaValue(value));
  if (!active.length) return sessions;
  return sessions.filter((session) => active.every(([key, value]) => {
    return normalizeMetaValue(session?.meta?.[key]) === normalizeMetaValue(value);
  }));
}

export function getAcademicFilterOptions(sessions = []) {
  return ["level", "grade", "trimester", "category"].reduce((options, key) => {
    options[key] = [...new Set(sessions.map((session) => String(session?.meta?.[key] || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    return options;
  }, {});
}

function normalizeMetaValue(value = "") {
  return String(value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function formatSessionMeta(meta = {}) {
  const level = String(meta.level || "Sin nivel").trim();
  const grade = String(meta.grade || "Sin grado").trim();
  const trimester = String(meta.trimester || "").trim();
  return [level, grade, trimester ? `Trimestre ${trimester}` : "Sin trimestre"].join(" · ");
}
