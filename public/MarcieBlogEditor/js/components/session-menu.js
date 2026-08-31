/**
 * Menú contextual y acciones de sesiones para Marcie Blog Editor
 */
import { saveMarcieSession, deleteMarcieSession, createMarcieSession } from "../services/marcie-session-store.js";
import { showModal, closeActiveModal, showToast } from "./modals.js";
import { articleVerificationBlockers } from "../contracts/editorial-contracts.js";

export function openSessionContextMenu(session, event, onRefresh) {
  event.stopPropagation();
  closeExistingMenu();

  const buttonRect = event.currentTarget.getBoundingClientRect();

  const menu = document.createElement("div");
  menu.id = "marcie-session-context-menu";
  menu.className = "fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl py-1 min-w-[190px] text-xs font-medium text-slate-700 animate-in fade-in zoom-in-95";

  // Posicionamiento inteligente
  let top = buttonRect.bottom + 4;
  let left = buttonRect.right - 190;
  if (top + 220 > window.innerHeight) {
    top = buttonRect.top - 220;
  }
  if (left < 10) left = 10;

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;

  menu.innerHTML = `
    <button data-action="rename" class="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700">
      <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
      Renombrar sesión
    </button>
    <button data-action="duplicate" class="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700">
      <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
      Duplicar sesión
    </button>
    <div class="h-px bg-slate-100 my-1"></div>
    <div class="px-3 py-1 text-[10px] uppercase font-semibold text-slate-400">Cambiar estado</div>
    <button data-action="status-draft" class="w-full text-left px-3 py-1.5 hover:bg-orange-50 text-orange-700 flex items-center gap-2">
      <span class="w-2 h-2 rounded-full bg-orange-500"></span> Marcar como Borrador
    </button>
    <button data-action="status-review" class="w-full text-left px-3 py-1.5 hover:bg-blue-50 text-blue-700 flex items-center gap-2">
      <span class="w-2 h-2 rounded-full bg-blue-500"></span> Enviar a Revisión
    </button>
    <button data-action="status-publish" class="w-full text-left px-3 py-1.5 hover:bg-green-50 text-green-700 flex items-center gap-2">
      <span class="w-2 h-2 rounded-full bg-green-500"></span> Aprobar artículo verificado
    </button>
    <div class="h-px bg-slate-100 my-1"></div>
    <button data-action="archive" class="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700">
      ${session.isArchived
        ? '<svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 21v-8a2 2 0 012-2h14a2 2 0 012 2v8M3 21h18M3 21l-2-2m22 2l2-2M8 11V7a4 4 0 018 0v4m-5 4h2"></path></svg>'
        : '<svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>'
      }
      ${session.isArchived ? 'Desarchivar sesión' : 'Archivar sesión'}
    </button>
    <button data-action="delete" class="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2">
      <svg class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
      Eliminar sesión
    </button>
  `;

  document.body.appendChild(menu);

  // Manejar clics de acciones
  menu.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const action = btn.getAttribute("data-action");
      closeExistingMenu();

      if (action === "rename") {
        const newTitle = prompt("Nuevo título de la sesión:", session.title);
        if (newTitle && newTitle.trim()) {
          session.title = newTitle.trim();
          if (session.article) session.article.title = newTitle.trim();
          await saveMarcieSession(session);
          showToast("Sesión renombrada exitosamente", "success");
          if (onRefresh) onRefresh();
        }
      } else if (action === "duplicate") {
        await createMarcieSession({
          title: `${session.title} (Copia)`,
          topic: session.topic,
          status: "new",
          audience: session.audience,
          article: JSON.parse(JSON.stringify(session.article || {})),
          editorialMode: session.editorialMode,
          editorialProfileId: session.editorialProfileId,
          editorialProfileVersion: session.editorialProfileVersion,
          editorialProfileSnapshot: JSON.parse(JSON.stringify(session.editorialProfileSnapshot || null)),
          selectedAudiences: [...(session.selectedAudiences || [])]
        });
        showToast("Sesión duplicada con éxito", "success");
        if (onRefresh) onRefresh();
      } else if (action.startsWith("status-")) {
        if (action === "status-publish") {
          const blockers = articleVerificationBlockers(session.article || {}, { editorialMode: session.editorialMode });
          const auditIssues = Array.isArray(session.audit?.issues) ? session.audit.issues : [];
          if (auditIssues.length) blockers.unshift(`Quedan ${auditIssues.length} hallazgos editoriales.`);
          if (blockers.length) {
            showToast(`No se puede aprobar: ${blockers.join(" · ")}`, "error");
            return;
          }
          const audience = session.audience || session.article?.audience || "educators";
          session.approvedAudiences = [...new Set([...(session.approvedAudiences || []), audience])];
          session.article.approval = { approvedAt: new Date().toISOString(), articleVersion: session.updatedAt || "", contentHash: session.article.verification?.contentHash || "" };
          session.status = "approved";
          await saveMarcieSession(session);
          showToast("Artículo aprobado. Ya puede programarse.", "success");
          if (onRefresh) onRefresh();
          return;
        }
        const statusMap = {
          "status-draft": "drafting",
          "status-review": "review_required"
        };
        session.status = statusMap[action] || "drafting";
        await saveMarcieSession(session);
        showToast(`Estado actualizado a: ${session.status}`, "success");
        if (onRefresh) onRefresh();
      } else if (action === "archive") {
        session.isArchived = !session.isArchived;
        await saveMarcieSession(session);
        showToast(session.isArchived ? "Sesión archivada" : "Sesión desarchivada", "success");
        if (onRefresh) onRefresh();
      } else if (action === "delete") {
        if (confirm(`¿Estás seguro de eliminar la sesión "${session.title}"?`)) {
          await deleteMarcieSession(session.id);
          showToast("Sesión eliminada", "info");
          if (onRefresh) onRefresh();
        }
      }
    });
  });

  // Cerrar al hacer clic fuera
  const closeListener = (e) => {
    if (!menu.contains(e.target)) {
      closeExistingMenu();
      window.removeEventListener("click", closeListener);
    }
  };
  setTimeout(() => window.addEventListener("click", closeListener), 10);
}

export function closeExistingMenu() {
  const existing = document.getElementById("marcie-session-context-menu");
  if (existing) existing.remove();
}
