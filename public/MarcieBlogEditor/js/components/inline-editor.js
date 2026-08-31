/**
 * Editor inline con auto-guardado en Firestore para el contenido del artículo
 */

import { saveMarcieSession } from "../services/marcie-session-store.js";
import { showToast } from "./modals.js";

let debounceTimer = null;

export function makeArticleEditable({ getSession, onSaved, onMaterialChange }) {
  const titleEl = document.getElementById("article-title");
  const subtitleEl = document.getElementById("article-subtitle");
  const bodyContainer = document.getElementById("article-body-container");

  if (!titleEl || !bodyContainer) return;

  // Hacer título editable
  titleEl.contentEditable = "true";
  titleEl.classList.add("hover:bg-slate-50", "focus:bg-slate-50", "rounded", "px-1", "transition-colors", "outline-none", "focus:ring-2", "focus:ring-teal-500/20");
  titleEl.setAttribute("title", "Haz clic para editar el título");

  titleEl.oninput = () => {
    scheduleAutoSave({ getSession, onSaved, onMaterialChange });
  };

  // Hacer subtítulo editable
  if (subtitleEl) {
    subtitleEl.contentEditable = "true";
    subtitleEl.classList.add("hover:bg-slate-50", "focus:bg-slate-50", "rounded", "px-1", "transition-colors", "outline-none", "focus:ring-2", "focus:ring-teal-500/20");
    subtitleEl.setAttribute("title", "Haz clic para editar el subtítulo");

    subtitleEl.oninput = () => {
      scheduleAutoSave({ getSession, onSaved, onMaterialChange });
    };
  }

  // Hacer párrafos y bloques editables
  bodyContainer.querySelectorAll("p, blockquote p, h3").forEach((el, index) => {
    el.contentEditable = "true";
    el.classList.add("hover:bg-slate-50/80", "focus:bg-slate-50", "rounded", "px-1", "transition-colors", "outline-none", "focus:ring-1", "focus:ring-teal-500/30");
    el.setAttribute("title", "Haz clic para editar");

    el.oninput = () => {
      scheduleAutoSave({ getSession, onSaved, onMaterialChange });
    };
  });
}

function scheduleAutoSave({ getSession, onSaved, onMaterialChange }) {
  const session = getSession();
  if (!session) return;

  const statusIndicator = document.getElementById("firebase-status-indicator");
  if (statusIndicator) {
    statusIndicator.textContent = "Guardando cambios...";
    statusIndicator.className = "text-xs font-medium text-amber-600 flex items-center gap-1";
  }

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    // Sincronizar contenido editado hacia el modelo de datos
    const titleEl = document.getElementById("article-title");
    const subtitleEl = document.getElementById("article-subtitle");
    const bodyContainer = document.getElementById("article-body-container");

    if (titleEl) {
      session.title = titleEl.innerText.trim();
      if (session.article) session.article.title = titleEl.innerText.trim();
    }

    if (subtitleEl && session.article) {
      session.article.subtitle = subtitleEl.innerText.trim();
    }

    // Sincronizar bloques
    if (bodyContainer && session.article && Array.isArray(session.article.blocks)) {
      const pElements = bodyContainer.querySelectorAll("p:not(blockquote p)");
      let pIdx = 0;
      session.article.blocks.forEach((b) => {
        if (b.type === "paragraph" && pElements[pIdx]) {
          b.text = pElements[pIdx].innerText.trim();
          pIdx++;
        }
      });
      // Invalidar caché de auditoría ya que el texto cambió manualmente
      delete session.audit;
    }
    if (typeof onMaterialChange === "function") onMaterialChange(session);
    else {
      const editedAudience = session.audience || session.article?.audience || "educators";
      session.approvedAudiences = (Array.isArray(session.approvedAudiences) ? session.approvedAudiences : []).filter((audience) => audience !== editedAudience);
      if (session.status === "approved") session.status = "review_required";
    }

    try {
      await saveMarcieSession(session);
      if (statusIndicator) {
        statusIndicator.textContent = "🟢 Firebase sincronizado";
        statusIndicator.className = "text-xs font-medium text-teal-600 flex items-center gap-1";
      }
      if (typeof onSaved === "function") onSaved();
    } catch (err) {
      console.warn("[MarcieInlineEditor] Error al auto-guardar:", err);
      if (statusIndicator) {
        statusIndicator.textContent = "⚠️ Error al guardar";
        statusIndicator.className = "text-xs font-medium text-red-600 flex items-center gap-1";
      }
    }
  }, 800);
}
