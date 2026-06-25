import { escapeHtml } from "./ui-components.js";

export function renderSessionSidebar({ root, sessions = [], activeId = "", onSelect, onNew, onRename, onDuplicate, onDelete } = {}) {
  const list = root?.querySelector("#cbSessionList");
  const status = root?.querySelector("#cbSessionStatus");
  const newBtn = root?.querySelector("#cbNewSessionBtn");
  if (!list) return;
  if (status) status.textContent = sessions.length ? `${sessions.length} sesiones` : "Sin sesiones guardadas";
  list.innerHTML = sessions.length ? sessions.map((session) => `
    <article class="cb-session-item ${session.id === activeId ? "is-active" : ""}" data-session-id="${escapeHtml(session.id)}">
      <button type="button" class="cb-session-main" data-session-action="select">
        <strong>${escapeHtml(session.title || "Unidad sin título")}</strong>
        <span>${escapeHtml(session.meta?.grade || "Primaria")} · U${escapeHtml(session.meta?.unit || "")}</span>
      </button>
      <div class="cb-session-row-actions">
        <button type="button" title="Renombrar" data-session-action="rename"><i class="fas fa-pen"></i></button>
        <button type="button" title="Duplicar" data-session-action="duplicate"><i class="fas fa-copy"></i></button>
        <button type="button" title="Eliminar" data-session-action="delete"><i class="fas fa-trash"></i></button>
      </div>
    </article>
  `).join("") : `<div class="cb-empty">Crea tu primera unidad.</div>`;

  if (newBtn) newBtn.onclick = () => onNew?.();
  list.querySelectorAll("[data-session-action]").forEach((button) => {
    button.addEventListener("click", () => {
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
