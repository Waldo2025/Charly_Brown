/**
 * Command Palette (⌘ K) y Atajos Globales para Marcie Blog Editor
 */

import { showModal, showNewSessionModal, closeActiveModal, showToast } from "./modals.js";
import { createMarcieSession } from "../services/marcie-session-store.js";

function escapeHtml(value = "") {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

export function initCommandPalette({ getSessions, onSelectSession, onRefresh }) {
  // Atajo de teclado global ⌘K o Ctrl+K
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openCommandPalette({ getSessions, onSelectSession, onRefresh });
    }
  });

  // Clic en la barra de búsqueda del topbar
  const globalSearch = document.getElementById("global-search");
  if (globalSearch) {
    globalSearch.addEventListener("focus", (e) => {
      e.target.blur();
      openCommandPalette({ getSessions, onSelectSession, onRefresh });
    });
  }

  // Botón "IA" del topbar
  const btnIaTopbar = document.querySelector(".btn.border.border-purple-200");
  if (btnIaTopbar) {
    btnIaTopbar.addEventListener("click", () => {
      showToast("✨ Asistente Editorial IA activo en el panel derecho", "info");
      const rightPanel = document.getElementById("right-panel");
      if (rightPanel) {
        rightPanel.classList.add("ring-2", "ring-purple-400");
        setTimeout(() => rightPanel.classList.remove("ring-2", "ring-purple-400"), 1500);
      }
    });
  }
}

export function openCommandPalette({ getSessions, onSelectSession, onRefresh }) {
  const sessions = getSessions() || [];

  showModal({
    title: "Comandos y Búsqueda Rápida",
    contentHtml: `
      <div class="flex flex-col gap-3">
        <div class="relative">
          <input type="text" id="cmd-input" placeholder="Escribe para buscar sesiones o comandos..." class="input-field pl-3 h-10 text-sm bg-slate-50 font-medium" autofocus />
        </div>

        <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">Acciones Rápidas</div>
        <div class="flex flex-col gap-1 text-xs">
          <button id="cmd-new-session" class="text-left px-3 py-2 rounded-lg hover:bg-slate-100 flex items-center justify-between text-slate-700 font-medium transition-colors">
            <span class="flex items-center gap-2">
              <span class="w-5 h-5 rounded bg-teal-100 text-teal-700 flex items-center justify-center font-bold">+</span>
              Crear nueva sesión editorial
            </span>
            <span class="text-[10px] text-slate-400 bg-white border rounded px-1.5 py-0.5">Enter</span>
          </button>
        </div>

        <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-2">Sesiones Recientes</div>
        <div id="cmd-results-list" class="flex flex-col gap-1 max-h-48 overflow-y-auto">
          ${renderCommandResults(sessions)}
        </div>
      </div>
    `,
    footerButtonsHtml: `
      <span class="text-[11px] text-slate-400 mr-auto flex items-center gap-1">Tip: Usa <kbd class="px-1 bg-white border rounded">Esc</kbd> para salir</span>
      <button class="btn btn-outline h-8 px-3 text-xs" onclick="document.getElementById('marcie-modal-backdrop')?.remove()">Cerrar</button>
    `
  });

  const cmdInput = document.getElementById("cmd-input");
  const resultsContainer = document.getElementById("cmd-results-list");
  const btnNew = document.getElementById("cmd-new-session");

  setTimeout(() => cmdInput?.focus(), 50);

  cmdInput?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    const filtered = sessions.filter((s) => s.title.toLowerCase().includes(q) || (s.topic && s.topic.toLowerCase().includes(q)));
    if (resultsContainer) {
      resultsContainer.innerHTML = renderCommandResults(filtered);
      bindResultClicks();
    }
  });

  btnNew?.addEventListener("click", async () => {
    closeActiveModal();
    const title = await showNewSessionModal({ allowBlankSession: true });
    if (title) {
      await createMarcieSession({ title, topic: title, status: "new", audience: "educators" });
      showToast("Artículo creado exitosamente", "success");
      if (onRefresh) onRefresh();
    }
  });

  function bindResultClicks() {
    resultsContainer?.querySelectorAll("[data-cmd-session-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-cmd-session-id");
        closeActiveModal();
        if (onSelectSession) onSelectSession(id);
      });
    });
  }

  bindResultClicks();
}

function renderCommandResults(sessions = []) {
  if (sessions.length === 0) {
    return `<div class="text-slate-400 text-xs py-3 text-center">No se encontraron sesiones coincidentes.</div>`;
  }

  return sessions.map((s) => {
    const safeId = escapeHtml(s.id || "");
    const safeTitle = escapeHtml(s.title || "");
    const safeStatus = escapeHtml(s.status || "borrador");

    return `
    <button data-cmd-session-id="${safeId}" class="text-left px-3 py-2 rounded-lg hover:bg-teal-50 flex items-center justify-between text-slate-700 transition-colors">
      <div class="truncate font-medium text-xs text-slate-800 pr-2">${safeTitle}</div>
      <span class="text-[10px] text-slate-400 shrink-0 uppercase">${safeStatus}</span>
    </button>
  `;}).join("");
}
