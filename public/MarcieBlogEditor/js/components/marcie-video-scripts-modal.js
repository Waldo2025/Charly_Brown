/**
 * Componente UI de Modales para Guiones de Video Educativo en Marcie Blog Editor.
 * Gestiona:
 * 1. Modal para seleccionar públicos y lanzar la redacción de guiones (estilos nativos y botón siempre visible).
 * 2. Modal con la lista de guiones generados para la sesión.
 * 3. Modal visor y editor técnico del guión con tabla completa de 7 columnas, celdas editables por doble clic,
 *    y botón de copiado estructurado para Excel y hojas de cálculo.
 */

import { showModal, showToast } from "./modals.js";
import {
  VIDEO_AUDIENCE_OPTIONS,
  getVideoAudienceMeta,
  formatSceneTime,
  countWords,
  validateVoiceover,
  generateVideoScriptsForAudiences,
  getSessionVideoScripts,
  upsertVideoScriptInSession,
  removeVideoScriptFromSession,
  exportVideoScriptToCsv,
  buildVideoScriptClipboardText,
  copyVideoScriptTableToClipboard,
  SCENE_DURATION_SECONDS
} from "../services/marcie-video-script-service.js?v=20260928r6";
import { saveMarcieSession } from "../services/marcie-session-store.js";

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Abre el modal para crear guiones de video con selección múltiple de públicos.
 */
export function openCreateVideoScriptModal({ session, onGenerated = null }) {
  if (!session) {
    showToast("Primero selecciona o abre una sesión editorial.", "warning");
    return;
  }

  const topic = session.topic || session.title || session.article?.title || "Tema educativo";
  const preferredVocabulary = session.preferredVocabulary || session.sessionConfiguration?.preferredVocabulary || [];
  const defaultAudiences = Array.isArray(session.selectedAudiences) && session.selectedAudiences.length
    ? session.selectedAudiences
    : ["educators"];

  const audienceCheckboxesHtml = VIDEO_AUDIENCE_OPTIONS.map((aud) => {
    const isChecked = defaultAudiences.includes(aud.id) || aud.id === session.audience;
    return `
      <label class="video-audience-card flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70 cursor-pointer transition-all ${isChecked ? 'is-checked ring-1 ring-teal-500 border-teal-500 bg-teal-50/20' : ''}" data-audience-id="${aud.id}">
        <div class="flex items-center gap-2.5 min-w-0">
          <input type="checkbox" name="video-audience-choice" value="${aud.id}" ${isChecked ? "checked" : ""} class="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer" />
          <span class="text-xs font-medium text-slate-900 truncate">${escapeHtml(aud.label)}</span>
        </div>
        <span class="text-[10px] px-1.5 py-0.5 rounded font-medium ${aud.badgeClass} shrink-0">${escapeHtml(aud.shortLabel)}</span>
      </label>
    `;
  }).join("");

  const contentHtml = `
    <div class="space-y-3.5">
      <!-- Tema -->
      <div>
        <span class="text-[11px] font-medium text-slate-500 block mb-1">Tema editorial</span>
        <div class="text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2.5 leading-snug break-words whitespace-normal select-text">
          ${escapeHtml(topic)}
        </div>
      </div>

      <!-- Vocabulario editorial preferente -->
      ${preferredVocabulary.length > 0 ? `
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
              <i data-lucide="book-marked" class="w-3.5 h-3.5 text-purple-600"></i>
              Vocabulario preferente integrado
            </span>
            <span class="text-[10px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full font-semibold border border-purple-200/60">${preferredVocabulary.length} términos</span>
          </div>
          <div class="flex flex-wrap gap-1.5 p-2 bg-purple-50/40 border border-purple-100 rounded-lg">
            ${preferredVocabulary.map((term) => `<span class="px-2 py-0.5 bg-white border border-purple-200/80 rounded-md text-[11px] font-medium text-purple-800 shadow-2xs">${escapeHtml(term)}</span>`).join("")}
          </div>
        </div>
      ` : ""}

      <!-- Públicos -->
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[11px] font-medium text-slate-500">Público objetivo</span>
          <button type="button" id="btn-toggle-all-video-audiences" class="text-[11px] text-teal-700 hover:text-teal-900 font-medium cursor-pointer">Seleccionar todos</button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2" id="video-audiences-container">
          ${audienceCheckboxesHtml}
        </div>
        <p id="video-audience-error" class="text-[11px] text-rose-600 mt-1 font-medium hidden">Selecciona al menos un público objetivo.</p>
      </div>

      <!-- Duración -->
      <div class="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
        <label for="video-scenes-count-select" class="text-xs font-medium text-slate-700">Duración por guión</label>
        <select id="video-scenes-count-select" class="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-teal-500 focus:border-teal-500 cursor-pointer">
          <option value="6">6 escenas (48s)</option>
          <option value="8" selected>8 escenas (64s)</option>
          <option value="10">10 escenas (80s)</option>
          <option value="12">12 escenas (96s)</option>
        </select>
      </div>

      <!-- Estado de progreso -->
      <div id="video-generation-progress-box" class="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-xs hidden flex items-center gap-2.5">
        <span class="w-3.5 h-3.5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin shrink-0"></span>
        <span id="video-generation-progress-text" class="font-medium text-xs">Redactando guiones con IA...</span>
      </div>
    </div>
  `;

  const footerButtonsHtml = `
    <button type="button" id="btn-cancel-create-video-script" class="btn btn-outline h-8 px-3.5 text-xs font-medium text-slate-700 cursor-pointer">Cancelar</button>
    <button type="button" id="btn-submit-create-video-script" class="btn btn-primary h-8 px-4 text-xs font-medium cursor-pointer flex items-center gap-1.5 shadow-2xs">
      <i data-lucide="clapperboard" class="w-3.5 h-3.5"></i>
      <span>Generar Guiones</span>
    </button>
  `;

  const modal = showModal({
    title: "Crear Guión de Video Educativo",
    contentHtml,
    footerButtonsHtml,
    widthClass: "max-w-lg"
  });

  window.lucide?.createIcons?.();

  const container = modal.element.querySelector("#video-audiences-container");
  const errorEl = modal.element.querySelector("#video-audience-error");
  const toggleAllBtn = modal.element.querySelector("#btn-toggle-all-video-audiences");
  const submitBtn = modal.element.querySelector("#btn-submit-create-video-script");
  const cancelBtn = modal.element.querySelector("#btn-cancel-create-video-script");
  const progressBox = modal.element.querySelector("#video-generation-progress-box");
  const progressText = modal.element.querySelector("#video-generation-progress-text");
  const sceneCountSelect = modal.element.querySelector("#video-scenes-count-select");

  const checkboxes = () => Array.from(modal.element.querySelectorAll('input[name="video-audience-choice"]'));

  const updateCardStyles = () => {
    checkboxes().forEach((cb) => {
      const card = cb.closest(".video-audience-card");
      if (card) {
        card.classList.toggle("is-checked", cb.checked);
        card.classList.toggle("ring-1", cb.checked);
        card.classList.toggle("ring-teal-500", cb.checked);
        card.classList.toggle("border-teal-500", cb.checked);
        card.classList.toggle("bg-teal-50/20", cb.checked);
      }
    });
  };

  container?.addEventListener("change", () => {
    updateCardStyles();
    const anyChecked = checkboxes().some((cb) => cb.checked);
    if (errorEl) errorEl.classList.toggle("hidden", anyChecked);
  });

  toggleAllBtn?.addEventListener("click", () => {
    const cbs = checkboxes();
    const allChecked = cbs.every((cb) => cb.checked);
    cbs.forEach((cb) => { cb.checked = !allChecked; });
    toggleAllBtn.textContent = allChecked ? "Seleccionar todos" : "Deseleccionar todos";
    updateCardStyles();
    if (errorEl) errorEl.classList.add("hidden");
  });

  cancelBtn?.addEventListener("click", () => modal.close());

  const handleSubmit = async () => {
    const selectedAudiences = checkboxes().filter((cb) => cb.checked).map((cb) => cb.value);
    if (!selectedAudiences.length) {
      if (errorEl) errorEl.classList.remove("hidden");
      return;
    }

    const sceneCount = Number(sceneCountSelect?.value || 8);
    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    if (progressBox) progressBox.classList.remove("hidden");

    try {
      const { scripts, errors } = await generateVideoScriptsForAudiences({
        session,
        audiences: selectedAudiences,
        sceneCount,
        onProgress: (info) => {
          if (progressText) {
            progressText.textContent = info.message;
          }
        }
      });

      if (!scripts.length) {
        throw new Error("No fue posible redactar ningún guión.");
      }

      // Guardar todos los guiones en la sesión
      scripts.forEach((script) => {
        upsertVideoScriptInSession(session, script);
      });

      await saveMarcieSession(session);
      modal.close();

      const scriptCount = scripts.length;
      showToast(`¡Se ${scriptCount === 1 ? 'redactó 1 guión' : `redactaron ${scriptCount} guiones`} de video exitosamente!`, "success");

      if (typeof onGenerated === "function") {
        onGenerated(scripts);
      } else if (scripts[0]) {
        // Abrir directamente el primer guión generado en el visor
        openVideoScriptViewerModal({ script: scripts[0], session });
      }
    } catch (err) {
      console.error("[MarcieVideoScript] Error al generar guiones:", err);
      showToast(`Error al redactar guiones: ${err.message}`, "error");
      submitBtn.disabled = false;
      cancelBtn.disabled = false;
      if (progressBox) progressBox.classList.add("hidden");
    }
  };

  submitBtn?.addEventListener("click", handleSubmit);
}

/**
 * Abre el modal con la lista de guiones de video existentes en la sesión.
 */
export function openVideoScriptsListModal({ session, onSelectScript = null, onNewScript = null }) {
  if (!session) {
    showToast("Primero selecciona o abre una sesión editorial.", "warning");
    return;
  }

  const scripts = getSessionVideoScripts(session);
  const topic = session.topic || session.title || "Tema editorial";

  let listHtml = "";

  if (scripts.length === 0) {
    listHtml = `
      <div class="py-12 px-4 text-center">
        <div class="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto mb-3 shadow-xs">
          <i data-lucide="clapperboard" class="w-6 h-6"></i>
        </div>
        <h4 class="font-bold text-slate-800 text-sm mb-1">No hay guiones de video redactados</h4>
        <p class="text-xs text-slate-500 max-w-sm mx-auto mb-4">Genera guiones técnicos de 8 segundos por escena adaptados por público objetivo.</p>
        <button type="button" id="btn-create-first-video-script" class="btn btn-primary h-9 px-4 text-xs font-semibold shadow-xs">
          <i data-lucide="plus" class="w-4 h-4"></i>
          <span>Redactar primer guión</span>
        </button>
      </div>
    `;
  } else {
    listHtml = `
      <div class="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pr-1">
        ${scripts.map((script) => {
          const meta = getVideoAudienceMeta(script.audience);
          const sceneCount = script.scenes?.length || script.totalScenes || 0;
          const duration = script.totalDurationSeconds || sceneCount * SCENE_DURATION_SECONDS;

          return `
            <div class="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-xs font-bold px-2 py-0.5 rounded-full ${meta.badgeClass}">${escapeHtml(meta.shortLabel)}</span>
                  <span class="text-xs text-slate-400 font-mono">· ${sceneCount} escenas (${duration}s totales)</span>
                </div>
                <h5 class="font-bold text-slate-900 text-sm truncate">${escapeHtml(script.title || "Guión sin título")}</h5>
                <p class="text-xs text-slate-500 line-clamp-1 mt-0.5">${escapeHtml(script.summary || script.scenes?.[0]?.voiceover || "Sin descripción")}</p>
              </div>

              <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button type="button" class="btn-open-script btn btn-primary h-8 px-3 text-xs font-semibold cursor-pointer flex items-center gap-1.5 shadow-2xs" data-script-id="${escapeHtml(script.id)}" title="Abrir y editar guión">
                  <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                  <span>Abrir Guión</span>
                </button>
                <button type="button" class="btn-delete-script btn btn-outline h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border-slate-200 rounded-lg flex items-center justify-center cursor-pointer transition-colors" data-script-id="${escapeHtml(script.id)}" title="Eliminar guión">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  const contentHtml = `
    <div class="space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Sesión activa</span>
          <h4 class="text-sm font-bold text-slate-800 leading-snug break-words whitespace-normal">${escapeHtml(topic)}</h4>
        </div>
        ${scripts.length > 0 ? `
          <button type="button" id="btn-add-another-video-script" class="btn btn-outline h-8 px-3 text-xs font-semibold text-teal-700 border-teal-200 bg-teal-50 hover:bg-teal-100 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i>
            <span>Crear otro guión</span>
          </button>
        ` : ""}
      </div>

      ${listHtml}
    </div>
  `;

  const footerButtonsHtml = `
    <button type="button" id="btn-close-video-scripts-list" class="btn btn-outline h-9 px-4 text-xs font-semibold text-slate-700 cursor-pointer">Cerrar</button>
  `;

  const modal = showModal({
    title: `<div class="flex items-center gap-2"><i data-lucide="video" class="w-5 h-5 text-teal-700"></i><span>Guiones de Video (${scripts.length})</span></div>`,
    contentHtml,
    footerButtonsHtml,
    widthClass: "max-w-3xl"
  });

  window.lucide?.createIcons?.();

  modal.element.querySelector("#btn-close-video-scripts-list")?.addEventListener("click", () => modal.close());

  modal.element.querySelector("#btn-create-first-video-script")?.addEventListener("click", () => {
    modal.close();
    openCreateVideoScriptModal({
      session,
      onGenerated: () => {
        openVideoScriptsListModal({ session });
      }
    });
  });

  modal.element.querySelector("#btn-add-another-video-script")?.addEventListener("click", () => {
    modal.close();
    openCreateVideoScriptModal({
      session,
      onGenerated: () => {
        openVideoScriptsListModal({ session });
      }
    });
  });

  modal.element.querySelectorAll(".btn-open-script").forEach((btn) => {
    btn.addEventListener("click", () => {
      const scriptId = btn.getAttribute("data-script-id");
      const script = scripts.find((s) => s.id === scriptId);
      if (script) {
        modal.close();
        if (typeof onSelectScript === "function") {
          onSelectScript(script);
        } else {
          openVideoScriptViewerModal({ script, session });
        }
      }
    });
  });

  modal.element.querySelectorAll(".btn-delete-script").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const scriptId = btn.getAttribute("data-script-id");
      if (!confirm("¿Deseas eliminar este guión de video? Esta acción no se puede deshacer.")) return;

      removeVideoScriptFromSession(session, scriptId);
      await saveMarcieSession(session);
      showToast("Guión eliminado.", "info");
      modal.close();
      openVideoScriptsListModal({ session });
    });
  });
}

/**
 * Abre el visor y editor detallado del guión técnico con tabla de 7 columnas,
 * celdas editables al hacer doble clic y botón de copiado para Excel.
 */
export function openVideoScriptViewerModal({ script, session, onSaveScript = null }) {
  if (!script) return;

  const meta = getVideoAudienceMeta(script.audience);
  const scenes = Array.isArray(script.scenes) ? script.scenes : [];
  const durationSec = scenes.length * SCENE_DURATION_SECONDS;

  const renderSceneRow = (scene, index) => {
    const sceneNum = scene.sceneNumber || index + 1;
    const timeFormatted = formatSceneTime(sceneNum, SCENE_DURATION_SECONDS);
    const voiceoverText = scene.voiceover || "";
    const voiceValidation = validateVoiceover(voiceoverText);

    let badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (voiceValidation.isTooLong) badgeClass = "bg-rose-50 text-rose-700 border-rose-200 font-bold";
    else if (voiceValidation.isTooShort) badgeClass = "bg-amber-50 text-amber-700 border-amber-200";

    return `
      <tr class="video-scene-row border-b border-slate-200/80 hover:bg-slate-50/60 transition-colors" data-scene-index="${index}">
        <!-- 1. Escena -->
        <td class="py-3 px-3 align-top font-bold text-slate-800 text-center text-xs bg-slate-50/40 select-none">
          <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200/90 text-slate-700 font-bold text-[11px]">${sceneNum}</span>
        </td>

        <!-- 2. Tiempo (8 segundos fijos por escena) -->
        <td class="py-3 px-3 align-top text-center text-xs whitespace-nowrap select-none">
          <span class="inline-block px-2 py-1 rounded bg-teal-50 text-teal-800 font-mono font-bold text-[11px] border border-teal-200">
            ${timeFormatted}
          </span>
          <span class="block text-[9px] text-slate-400 mt-0.5">8 seg</span>
        </td>

        <!-- 3. Guion (Voz en off: 14 a 17 palabras) - Editable por doble clic -->
        <td class="py-2 px-3 align-top min-w-[270px] max-w-[340px]">
          <div class="video-cell-editable group" data-field="voiceover" data-scene-index="${index}" tabindex="0" title="Doble clic para editar voz en off">
            <div class="video-cell-view p-2 rounded-lg text-xs text-slate-900 leading-relaxed font-sans border border-transparent hover:border-slate-200">
              <span class="video-cell-text">${escapeHtml(voiceoverText) || '<em class="text-slate-400 italic">Sin voz en off...</em>'}</span>
              <span class="video-cell-hint opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-teal-600 block mt-1 font-medium select-none">✎ Doble clic para editar</span>
            </div>
            <textarea
              class="video-cell-editor hidden w-full text-xs text-slate-900 bg-white border border-teal-500 ring-2 ring-teal-100 rounded-lg p-2 focus:outline-none transition-all resize-y leading-relaxed font-sans shadow-xs"
              rows="3"
              placeholder="Voz en off del locutor (14 a 17 palabras)..."
            >${escapeHtml(voiceoverText)}</textarea>
          </div>
          <div class="mt-1 flex items-center justify-between text-[10px]">
            <span class="voiceover-badge px-2 py-0.5 rounded-full border ${badgeClass}">
              ${voiceValidation.message}
            </span>
          </div>
        </td>

        <!-- 4. Descripción de escena - Editable por doble clic -->
        <td class="py-2 px-3 align-top min-w-[200px]">
          <div class="video-cell-editable group" data-field="sceneDescription" data-scene-index="${index}" tabindex="0" title="Doble clic para editar descripción">
            <div class="video-cell-view p-2 rounded-lg text-xs text-slate-700 leading-relaxed border border-transparent hover:border-slate-200">
              <span class="video-cell-text">${escapeHtml(scene.sceneDescription || "") || '<em class="text-slate-400 italic">Sin descripción de escena...</em>'}</span>
              <span class="video-cell-hint opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-teal-600 block mt-1 font-medium select-none">✎ Doble clic para editar</span>
            </div>
            <textarea
              class="video-cell-editor hidden w-full text-xs text-slate-800 bg-white border border-teal-500 ring-2 ring-teal-100 rounded-lg p-2 focus:outline-none transition-all resize-y leading-relaxed shadow-xs"
              rows="3"
              placeholder="Descripción de la escena..."
            >${escapeHtml(scene.sceneDescription || "")}</textarea>
          </div>
        </td>

        <!-- 5. Texto en pantalla - Editable por doble clic -->
        <td class="py-2 px-3 align-top min-w-[150px]">
          <div class="video-cell-editable group" data-field="onScreenText" data-scene-index="${index}" tabindex="0" title="Doble clic para editar texto en pantalla">
            <div class="video-cell-view p-2 rounded-lg text-xs text-slate-700 leading-relaxed border border-transparent hover:border-slate-200">
              <span class="video-cell-text font-semibold text-slate-900">${escapeHtml(scene.onScreenText || "") || '<em class="text-slate-400 font-normal italic">Sin texto...</em>'}</span>
              <span class="video-cell-hint opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-teal-600 block mt-1 font-medium select-none">✎ Doble clic para editar</span>
            </div>
            <textarea
              class="video-cell-editor hidden w-full text-xs text-slate-800 bg-white border border-teal-500 ring-2 ring-teal-100 rounded-lg p-2 focus:outline-none transition-all resize-y leading-relaxed shadow-xs"
              rows="2"
              placeholder="Texto clave en pantalla..."
            >${escapeHtml(scene.onScreenText || "")}</textarea>
          </div>
        </td>

        <!-- 6. Transición - Editable por doble clic -->
        <td class="py-2 px-3 align-top w-[140px]">
          <div class="video-cell-editable group" data-field="transition" data-scene-index="${index}" tabindex="0" title="Doble clic para editar transición">
            <div class="video-cell-view p-2 rounded-lg text-xs text-slate-700 border border-transparent hover:border-slate-200">
              <span class="video-cell-text px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-medium text-[11px]">${escapeHtml(scene.transition || "Corte directo")}</span>
              <span class="video-cell-hint opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-teal-600 block mt-1 font-medium select-none">✎ Doble clic</span>
            </div>
            <textarea
              class="video-cell-editor hidden w-full text-xs text-slate-800 bg-white border border-teal-500 ring-2 ring-teal-100 rounded-lg p-1.5 focus:outline-none transition-all resize-none shadow-xs"
              rows="1"
              placeholder="Transición..."
            >${escapeHtml(scene.transition || "Corte directo")}</textarea>
          </div>
        </td>

        <!-- 7. Elemento visual - Editable por doble clic -->
        <td class="py-2 px-3 align-top min-w-[190px]">
          <div class="video-cell-editable group" data-field="visualElement" data-scene-index="${index}" tabindex="0" title="Doble clic para editar acción visual">
            <div class="video-cell-view p-2 rounded-lg text-xs text-slate-700 leading-relaxed border border-transparent hover:border-slate-200">
              <span class="video-cell-text">${escapeHtml(scene.visualElement || "") || '<em class="text-slate-400 italic">Sin elemento visual...</em>'}</span>
              <span class="video-cell-hint opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-teal-600 block mt-1 font-medium select-none">✎ Doble clic para editar</span>
            </div>
            <textarea
              class="video-cell-editor hidden w-full text-xs text-slate-800 bg-white border border-teal-500 ring-2 ring-teal-100 rounded-lg p-2 focus:outline-none transition-all resize-y leading-relaxed shadow-xs"
              rows="3"
              placeholder="Acción visual a realizar..."
            >${escapeHtml(scene.visualElement || "")}</textarea>
          </div>
        </td>
      </tr>
    `;
  };

  const rowsHtml = scenes.map(renderSceneRow).join("");

  const contentHtml = `
    <div class="space-y-4">
      <!-- Toolbar del Guión -->
      <div class="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="px-2.5 py-1 rounded-full font-bold text-xs ${meta.badgeClass}">${escapeHtml(meta.shortLabel)}</span>
          <span class="font-mono text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-md font-semibold">${scenes.length} escenas · ${durationSec}s totales (8s/escena)</span>
          <span class="text-slate-500 text-[11px] hidden sm:inline flex items-center gap-1">
            <i data-lucide="mouse-pointer-click" class="w-3.5 h-3.5 text-teal-600 inline"></i>
            Doble clic sobre cualquier celda para editarla
          </span>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button type="button" id="btn-script-back-to-list" class="btn btn-outline h-8 px-3 text-xs font-semibold text-slate-700 rounded-lg flex items-center gap-1.5 cursor-pointer" title="Ver todos los guiones">
            <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>
            <span>Todos los guiones</span>
          </button>

          <!-- Botón destacado para copiar la tabla completa a Excel -->
          <button type="button" id="btn-copy-table-excel" class="btn btn-primary h-8 px-3.5 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer" title="Copiar tabla completa con formato para pegar en Excel, Google Sheets o Word (Ctrl+V)">
            <i data-lucide="sheet" class="w-4 h-4"></i>
            <span>Copiar Tabla para Excel</span>
          </button>

          <button type="button" id="btn-export-script-csv" class="btn btn-outline h-8 px-3 text-xs font-semibold text-slate-700 rounded-lg flex items-center gap-1.5 cursor-pointer" title="Descargar como archivo CSV para Excel">
            <i data-lucide="file-down" class="w-3.5 h-3.5"></i>
            <span>Descargar CSV</span>
          </button>
        </div>
      </div>

      <!-- Título editable del Guión -->
      <div class="flex items-center gap-2">
        <label for="video-script-title-input" class="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0">Título del video:</label>
        <input type="text" id="video-script-title-input" class="flex-1 font-bold text-slate-900 text-sm px-3 py-1.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white" value="${escapeHtml(script.title)}" />
      </div>

      <!-- Tabla técnica de 7 columnas -->
      <div class="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
        <div class="overflow-x-auto max-h-[58vh] overflow-y-auto">
          <table class="w-full border-collapse text-left text-xs min-w-[1100px]">
            <thead class="bg-slate-100 text-slate-800 font-bold sticky top-0 z-10 backdrop-blur-sm border-b border-slate-200">
              <tr>
                <th class="py-2.5 px-3 text-center w-14">Escena</th>
                <th class="py-2.5 px-3 text-center w-24">Tiempo</th>
                <th class="py-2.5 px-3 min-w-[270px] max-w-[340px]">Guion (Voz en off · 14–17 palabras)</th>
                <th class="py-2.5 px-3 min-w-[200px]">Descripción de escena</th>
                <th class="py-2.5 px-3 min-w-[150px]">Texto en pantalla</th>
                <th class="py-2.5 px-3 w-[140px]">Transición</th>
                <th class="py-2.5 px-3 min-w-[190px]">Elemento visual</th>
              </tr>
            </thead>
            <tbody id="video-script-scenes-tbody" class="divide-y divide-slate-100">
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const footerButtonsHtml = `
    <button type="button" id="btn-close-script-viewer" class="btn btn-outline h-9 px-4 text-xs font-semibold text-slate-700 cursor-pointer">Cerrar</button>
    <button type="button" id="btn-save-script-changes" class="btn btn-primary h-9 px-5 text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer">
      <i data-lucide="save" class="w-4 h-4"></i>
      <span>Guardar Cambios</span>
    </button>
  `;

  const modal = showModal({
    title: `<div class="flex items-center gap-2"><i data-lucide="clapperboard" class="w-5 h-5 text-teal-700"></i><span>Guión de Video · ${escapeHtml(meta.shortLabel)}</span></div>`,
    contentHtml,
    footerButtonsHtml,
    widthClass: "w-[96vw] max-w-7xl"
  });

  window.lucide?.createIcons?.();

  // Activa la edición en una celda
  const activateCellEditing = (cellEditable) => {
    const viewEl = cellEditable.querySelector(".video-cell-view");
    const editorEl = cellEditable.querySelector(".video-cell-editor");
    if (!viewEl || !editorEl) return;

    viewEl.classList.add("hidden");
    editorEl.classList.remove("hidden");
    editorEl.focus();
    const len = editorEl.value.length;
    editorEl.setSelectionRange(len, len);
  };

  // Cierra la edición en una celda y sincroniza
  const deactivateCellEditing = (cellEditable) => {
    const viewEl = cellEditable.querySelector(".video-cell-view");
    const editorEl = cellEditable.querySelector(".video-cell-editor");
    const textEl = cellEditable.querySelector(".video-cell-text");
    if (!viewEl || !editorEl || !textEl) return;

    const newValue = editorEl.value.trim();
    textEl.textContent = newValue || "";
    editorEl.classList.add("hidden");
    viewEl.classList.remove("hidden");

    const field = cellEditable.getAttribute("data-field");
    if (field === "voiceover") {
      const row = cellEditable.closest(".video-scene-row");
      const badge = row?.querySelector(".voiceover-badge");
      if (badge) {
        const validation = validateVoiceover(newValue);
        badge.textContent = validation.message;
        badge.className = `voiceover-badge px-2 py-0.5 rounded-full border text-[10px] ${
          validation.isTooLong
            ? "bg-rose-50 text-rose-700 border-rose-200 font-bold"
            : validation.isTooShort
            ? "bg-amber-50 text-amber-700 border-amber-200"
            : "bg-emerald-50 text-emerald-700 border-emerald-200"
        }`;
      }
    }

    syncCurrentScriptFromUi(script, modal.element);
    if (session) {
      upsertVideoScriptInSession(session, script);
      saveMarcieSession(session).catch((err) => console.warn("[MarcieVideoScript] Auto-guardado falló:", err));
    }
  };

  // Listeners para celdas editables por doble clic y teclado
  modal.element.querySelectorAll(".video-cell-editable").forEach((cell) => {
    const editorEl = cell.querySelector(".video-cell-editor");

    // Doble clic sobre la celda activa la edición
    cell.addEventListener("dblclick", () => {
      activateCellEditing(cell);
    });

    // Enter activa la edición cuando el foco está en la celda
    cell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && editorEl?.classList.contains("hidden")) {
        e.preventDefault();
        activateCellEditing(cell);
      }
    });

    if (editorEl) {
      // Al perder el foco se guarda y vuelve a vista
      editorEl.addEventListener("blur", () => {
        deactivateCellEditing(cell);
      });

      // Escape o Ctrl+Enter finaliza la edición
      editorEl.addEventListener("keydown", (e) => {
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          editorEl.blur();
        }
      });

      // Actualizar contador en vivo si es voz en off
      if (cell.getAttribute("data-field") === "voiceover") {
        editorEl.addEventListener("input", () => {
          const row = cell.closest(".video-scene-row");
          const badge = row?.querySelector(".voiceover-badge");
          if (badge) {
            const validation = validateVoiceover(editorEl.value);
            badge.textContent = validation.message;
            badge.className = `voiceover-badge px-2 py-0.5 rounded-full border text-[10px] ${
              validation.isTooLong
                ? "bg-rose-50 text-rose-700 border-rose-200 font-bold"
                : validation.isTooShort
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`;
          }
        });
      }
    }
  });

  // Botón para copiar la tabla completa para Excel / Google Sheets
  modal.element.querySelector("#btn-copy-table-excel")?.addEventListener("click", async () => {
    syncCurrentScriptFromUi(script, modal.element);
    try {
      await copyVideoScriptTableToClipboard(script);
      showToast("¡Tabla copiada! Puedes pegarla directamente en Excel, Google Sheets o Word (Ctrl+V).", "success");
    } catch (err) {
      console.warn("[MarcieVideoScript] Error al copiar tabla:", err);
      showToast("No se pudo copiar automáticamente la tabla.", "error");
    }
  });

  // Descargar CSV
  modal.element.querySelector("#btn-export-script-csv")?.addEventListener("click", () => {
    syncCurrentScriptFromUi(script, modal.element);
    exportVideoScriptToCsv(script);
    showToast("Archivo CSV descargado.", "success");
  });

  // Volver a la lista
  modal.element.querySelector("#btn-script-back-to-list")?.addEventListener("click", () => {
    modal.close();
    openVideoScriptsListModal({ session });
  });

  // Cerrar modal
  modal.element.querySelector("#btn-close-script-viewer")?.addEventListener("click", () => modal.close());

  // Guardar cambios manualmente
  modal.element.querySelector("#btn-save-script-changes")?.addEventListener("click", async () => {
    syncCurrentScriptFromUi(script, modal.element);
    upsertVideoScriptInSession(session, script);

    try {
      await saveMarcieSession(session);
      showToast("Cambios guardados exitosamente.", "success");
      if (typeof onSaveScript === "function") {
        onSaveScript(script);
      }
    } catch (err) {
      console.error("[MarcieVideoScript] Error al guardar guión:", err);
      showToast(`Error al guardar: ${err.message}`, "error");
    }
  });
}

/**
 * Lee los valores actuales de la UI y los sincroniza en el objeto de datos del guión.
 */
function syncCurrentScriptFromUi(script, container) {
  if (!script || !container) return;

  const titleInput = container.querySelector("#video-script-title-input");
  if (titleInput && titleInput.value.trim()) {
    script.title = titleInput.value.trim();
  }

  const rows = container.querySelectorAll(".video-scene-row");
  const updatedScenes = [];

  rows.forEach((row, index) => {
    const sceneNumber = index + 1;
    const time = formatSceneTime(sceneNumber, SCENE_DURATION_SECONDS);

    const getFieldValue = (field) => {
      const cell = row.querySelector(`[data-field="${field}"]`);
      if (!cell) return "";
      const editor = cell.querySelector(".video-cell-editor");
      if (editor && editor.value !== undefined) return editor.value.trim();
      const textEl = cell.querySelector(".video-cell-text");
      return textEl ? textEl.textContent.trim() : "";
    };

    const voiceover = getFieldValue("voiceover");
    const sceneDescription = getFieldValue("sceneDescription");
    const onScreenText = getFieldValue("onScreenText");
    const transition = getFieldValue("transition") || "Corte directo";
    const visualElement = getFieldValue("visualElement");

    updatedScenes.push({
      sceneNumber,
      time,
      voiceover,
      sceneDescription,
      onScreenText,
      transition,
      visualElement
    });
  });

  script.scenes = updatedScenes;
  script.totalScenes = updatedScenes.length;
  script.totalDurationSeconds = updatedScenes.length * SCENE_DURATION_SECONDS;
  script.durationFormatted = `${updatedScenes.length * SCENE_DURATION_SECONDS}s (${updatedScenes.length} escenas de ${SCENE_DURATION_SECONDS}s)`;
  script.updatedAt = new Date().toISOString();
}

/**
 * Actualiza la visibilidad y badges de los botones de video según existan o no guiones.
 */
export function updateVideoScriptButtonsState(session = {}) {
  const scripts = getSessionVideoScripts(session);
  const count = scripts.length;
  const hasScripts = count > 0;

  // Botón del toolbar superior
  const headerBtn = document.getElementById("btn-view-video-scripts-header");
  const headerBadge = document.getElementById("video-scripts-badge");
  if (headerBtn) {
    headerBtn.classList.toggle("hidden", !hasScripts);
  }
  if (headerBadge) {
    headerBadge.textContent = String(count);
  }

  // Botón en editorial-actions-grid
  const gridBtn = document.getElementById("btn-view-video-scripts-grid");
  const gridDesc = document.getElementById("video-scripts-count-desc");
  if (gridBtn) {
    gridBtn.classList.toggle("hidden", !hasScripts);
  }
  if (gridDesc) {
    gridDesc.textContent = count === 1 ? "1 disponible" : `${count} disponibles`;
  }

  // Opción del menú desplegable
  const menuOpt = document.getElementById("opt-view-video-scripts");
  if (menuOpt) {
    menuOpt.classList.toggle("hidden", !hasScripts);
  }
}
