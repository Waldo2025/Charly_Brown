/**
 * CHARLY BROWN - UNIT INSPECTOR DRAWER CONTROLLER
 * Panel lateral integrado que se desliza a la izquierda del panel derecho.
 * Permite inspeccionar actividades, lecturas y recursos con vistas separadas:
 * Alumno, Docente (con respuestas en magenta), SyA Curricular y Recursos.
 */

import { escapeHtml } from "./ui-components.js";
import { formatSubtopicLabel, cleanResourceSubtopicTitle } from "./activity-label.js";
import { buildSubtopicSyaFields, buildFallbackSya } from "./sya-service.js";
import { isProjectSelection, normalizeIcTokensAndPlacement } from "./unit-contracts.js";
export { normalizeIcTokensAndPlacement };
import { getActivityIconInfo } from "./accepted-panel.js";
import {
  resolveActivityCognitiveSkill,
  renderCognitiveBadgeHtml,
  openCognitiveSkillModal
} from "./cognitive-skills.js";

let drawerEl = null;
let currentItem = null;
let currentTab = "teacher"; // "teacher" | "student" | "sya" | "resources"
let currentCallbacks = {};

export function initUnitDrawer(root = document) {
  drawerEl = root.querySelector("#cbUnitDrawer");

  if (!drawerEl) {
    console.warn("Inspector panel #cbUnitDrawer not found in DOM");
    return;
  }

  /* Eliminar backdrop residual si existiera de una versión anterior */
  const oldBackdrop = root.querySelector("#cbUnitDrawerBackdrop");
  if (oldBackdrop) oldBackdrop.remove();

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isUnitDrawerOpen()) {
      closeUnitDrawer();
    }
  });
}

export function isUnitDrawerOpen() {
  return drawerEl?.classList.contains("is-open") || false;
}

export function closeUnitDrawer() {
  if (!drawerEl) return;
  if (document.activeElement && drawerEl.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  drawerEl.classList.remove("is-open");
  drawerEl.setAttribute("aria-hidden", "true");
  drawerEl.inert = true;
  currentItem = null;

  document.documentElement.style.setProperty("--cb-inspector-width", "0px");
  document.getElementById("cbInspectorPanelRoot")?.classList.add("is-closed");

  // Deselect active cards in master navigator
  document.querySelectorAll(".cb-up-item-card.is-active-item").forEach((card) => {
    card.classList.remove("is-active-item");
  });
}
window.closeUnitDrawer = closeUnitDrawer;

/**
 * Abre el inspector drawer para una actividad
 */
export function openActivityDrawer({
  activity,
  unit,
  session,
  onEdit,
  onRegenerate,
  onRegenerateStep,
  onRemove,
  onNotes,
  onAddResource,
  onAdjustDifficulty,
  onImproveSya,
  onSaveSya,
  onRegenerateInfo,
  onRemoveResource,
  mathActivities = [],
  initialMathActivityIndex = 0,
  initialTab = "teacher"
} = {}) {
  if (!drawerEl || !activity) return;
  const orderedMathActivities = Array.isArray(mathActivities) ? [...mathActivities].sort((a, b) => Number(a.pageOrder ?? a.mathIndex ?? 0) - Number(b.pageOrder ?? b.mathIndex ?? 0)) : [];
  const mathActivityIndex = orderedMathActivities.length ? Math.max(0, Math.min(orderedMathActivities.length - 1, Number(initialMathActivityIndex) || 0)) : 0;
  currentItem = { type: "activity", data: orderedMathActivities[mathActivityIndex] || activity, mathActivities: orderedMathActivities, mathActivityIndex, unit, session };
  currentTab = initialTab;
  currentCallbacks = { onEdit, onRegenerate, onRegenerateStep, onRemove, onRemoveResource: onRemoveResource || ((id, uId) => window.handleRemoveResource?.(id, uId)), onNotes, onAddResource, onAdjustDifficulty, onImproveSya, onSaveSya, onRegenerateInfo };

  renderDrawerContent();

  drawerEl.inert = false;
  drawerEl.classList.add("is-open");
  drawerEl.setAttribute("aria-hidden", "false");
  document.getElementById("cbInspectorPanelRoot")?.classList.remove("is-closed");
  const savedWidth = Math.min(800, Math.max(320, Number(localStorage.getItem("cbInspectorPanelWidth")) || 420));
  document.documentElement.style.setProperty("--cb-inspector-width", savedWidth + "px");

}

/**
 * Abre el inspector drawer para una lectura
 */
export function openReadingDrawer({
  reading,
  unit,
  session,
  onEdit,
  onRemove,
  initialTab = "reading"
} = {}) {
  if (!drawerEl || !reading) return;
  currentItem = { type: "reading", data: reading, unit, session, readingPartIndex: 0 };
  currentTab = initialTab;
  currentCallbacks = { onEdit, onRemove };

  renderDrawerContent();

  drawerEl.inert = false;
  drawerEl.classList.add("is-open");
  drawerEl.setAttribute("aria-hidden", "false");
  document.getElementById("cbInspectorPanelRoot")?.classList.remove("is-closed");
  const savedWidth = Math.min(800, Math.max(320, Number(localStorage.getItem("cbInspectorPanelWidth")) || 420));
  document.documentElement.style.setProperty("--cb-inspector-width", savedWidth + "px");

}

/**
 * Abre el inspector drawer para un recurso especializado
 */
export function openResourceDrawer({
  resource,
  resourcePages = [],
  initialResourcePageIndex = 0,
  activity,
  unit,
  session,
  onEdit,
  onRegenerate,
  onAdjustDifficulty,
  onRemove,
  onRemoveResource,
  onNotes,
  initialTab = "resource"
} = {}) {
  if (!drawerEl || !resource) return;
  currentItem = { type: "resource", data: resourcePages[initialResourcePageIndex] || resource, resourcePages, resourcePageIndex: initialResourcePageIndex, activity, unit, session };
  currentTab = initialTab;
  const effectiveRemove = onRemoveResource || onRemove || ((id, uId) => window.handleRemoveResource?.(id, uId));
  currentCallbacks = {
    onEdit,
    onRegenerate,
    onAdjustDifficulty,
    onRemove: effectiveRemove,
    onRemoveResource: effectiveRemove,
    onNotes: onNotes || ((id, uId) => window.handleGenerateTeacherNotes?.(id, uId))
  };

  renderDrawerContent();

  drawerEl.inert = false;
  drawerEl.classList.add("is-open");
  drawerEl.setAttribute("aria-hidden", "false");
  document.getElementById("cbInspectorPanelRoot")?.classList.remove("is-closed");
  const savedWidth = Math.min(800, Math.max(320, Number(localStorage.getItem("cbInspectorPanelWidth")) || 420));
  document.documentElement.style.setProperty("--cb-inspector-width", savedWidth + "px");
}

export function openTeacherNotesDrawer({
  note,
  activity,
  resource,
  unit,
  session,
  title = "NDM",
  noteHtml = "",
  onSave,
  onEdit,
  onDelete,
  onRemove,
  onRemoveResource,
  onNotes,
  onRegenerate,
  mathNotes = [],
  initialMathNoteIndex = 0,
  fichaNotes = [],
  initialFichaNoteIndex = 0,
  initialTab = "notes"
} = {}) {
  if (!drawerEl) return;
  currentItem = {
    type: "teacher-notes",
    data: note || { title, html: noteHtml },
    activity,
    mathNotes: Array.isArray(mathNotes) ? mathNotes : [],
    mathNoteIndex: Array.isArray(mathNotes) && mathNotes.length ? Math.max(0, Math.min(mathNotes.length - 1, Number(initialMathNoteIndex) || 0)) : 0,
    fichaNotes: Array.isArray(fichaNotes) ? fichaNotes : [],
    fichaNoteIndex: Array.isArray(fichaNotes) && fichaNotes.length ? Math.max(0, Math.min(fichaNotes.length - 1, Number(initialFichaNoteIndex) || 0)) : 0,
    resource,
    unit,
    session
  };
  currentTab = initialTab;
  currentCallbacks = {
    onSave: onSave || onEdit,
    onEdit: onEdit || onSave,
    onDelete: onDelete || onRemove,
    onRemove: onRemove || onDelete,
    onRemoveResource: onRemoveResource || ((id, uId) => window.handleRemoveResource?.(id, uId)),
    onNotes: onNotes || onRegenerate || ((id, uId) => window.handleGenerateTeacherNotes?.(id, uId)),
    onRegenerate
  };

  renderDrawerContent();

  drawerEl.inert = false;
  drawerEl.classList.add("is-open");
  drawerEl.setAttribute("aria-hidden", "false");
  document.getElementById("cbInspectorPanelRoot")?.classList.remove("is-closed");
  const savedWidth = Math.min(800, Math.max(320, Number(localStorage.getItem("cbInspectorPanelWidth")) || 420));
  document.documentElement.style.setProperty("--cb-inspector-width", savedWidth + "px");
}

function renderDrawerContent() {
  if (!drawerEl || !currentItem) return;

  const { type, data, unit, session } = currentItem;

  if (type === "activity") {
    renderActivityDrawerLayout(data, unit, session);
  } else if (type === "reading") {
    renderReadingDrawerLayout(data, unit, session);
  } else if (type === "resource") {
    renderResourceDrawerLayout(data, currentItem.activity, unit, session);
  } else if (type === "teacher-notes") {
    renderTeacherNotesDrawerLayout(data, unit, session, currentItem.activity, currentItem.resource, currentItem.mathNotes, currentItem.mathNoteIndex, currentItem.fichaNotes, currentItem.fichaNoteIndex);
  }

  enhanceImageDownloads(drawerEl);
  bindDrawerEvents();
  if (type === "activity") bindActivityDifficultyControls();
}

function imageDownloadName(image, index = 0) {
  const raw = String(image?.alt || image?.closest?.("figure")?.querySelector?.("figcaption")?.textContent || `imagen-${index + 1}`)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  const source = String(image?.currentSrc || image?.src || "");
  const ext = (source.match(/\.((?:png|jpe?g|webp))(?:[?#]|$)/i)?.[1] || "png").toLowerCase().replace("jpeg", "jpg");
  return `${raw || `imagen-${index + 1}`}.${ext}`;
}

async function downloadOriginalImage(image, button, index = 0) {
  const source = String(image?.currentSrc || image?.src || "").trim();
  if (!source) return;
  const originalLabel = button.getAttribute("aria-label") || "Descargar imagen original";
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    // Fetch y descarga el blob original. No se usa canvas ni se vuelve a codificar,
    // así que Firebase entrega exactamente los bytes guardados por Gemini.
    const response = await fetch(source, { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.size) throw new Error("Imagen vacía");
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = imageDownloadName(image, index);
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch (_) {
    // Si el navegador bloquea CORS, conserva la descarga directa del mismo asset;
    // tampoco hay conversión ni compresión en este camino.
    const link = document.createElement("a");
    link.href = source;
    link.download = imageDownloadName(image, index);
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.setAttribute("aria-label", originalLabel);
  }
}

function enhanceImageDownloads(container) {
  if (!container) return;
  Array.from(container.querySelectorAll("img")).forEach((image, index) => {
    if (!image.src || image.dataset.noImageDownload === "true" || image.closest(".cb-image-download-wrap")) return;
    const wrapper = document.createElement("span");
    wrapper.className = "cb-image-download-wrap";
    image.parentNode?.insertBefore(wrapper, image);
    wrapper.appendChild(image);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cb-image-download-button";
    button.title = "Descargar imagen original";
    button.setAttribute("aria-label", "Descargar imagen original");
    button.innerHTML = '<i class="fas fa-download" aria-hidden="true"></i>';
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      downloadOriginalImage(image, button, index);
    });
    wrapper.appendChild(button);
  });
}

function bindActivityDifficultyControls() {
  const body = drawerEl?.querySelector(".cb-drawer-teacher-view");
  if (!body || !currentItem?.data?.html) return;
  // When a subtopic contains numbered steps, each list item is the selectable
  // unit. Fall back to separate .activity blocks only for legacy layouts.
  let blocks = Array.from(body.querySelectorAll("ol.steps-numbered > li, ol.steps.steps-numbered > li, ol.steps > li"));
  if (!blocks.length) blocks = Array.from(body.querySelectorAll(".activity"));
  blocks.forEach((block, index) => {
    block.classList.add("cb-drawer-adjustable-activity");
    block.dataset.activityStepIndex = String(index);
    block.setAttribute("tabindex", "0");
    block.setAttribute("aria-label", `Actividad ${index + 1}. Selecciona para ajustar su dificultad`);
    block.insertAdjacentHTML("beforeend", `<span class="cb-drawer-step-actions" aria-label="Acciones del ejercicio"><button type="button" data-step-regenerate title="Regenerar este ejercicio" aria-label="Regenerar este ejercicio"><i class="fas fa-rotate-right" aria-hidden="true"></i></button><button type="button" data-step-difficulty="easier" title="Hacer más fácil" aria-label="Hacer más fácil"><i class="fas fa-feather" aria-hidden="true"></i></button><button type="button" data-step-difficulty="harder" title="Hacer más difícil" aria-label="Hacer más difícil"><i class="fas fa-mountain" aria-hidden="true"></i></button></span>`);
    block.addEventListener("click", (event) => {
      if (event.target.closest("[data-step-difficulty]")) return;
      body.querySelectorAll(".is-step-selected").forEach((item) => item.classList.remove("is-step-selected"));
      block.classList.add("is-step-selected");
    });
    block.addEventListener("keydown", (event) => {
      if (event.target !== block || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      body.querySelectorAll(".is-step-selected").forEach((item) => item.classList.remove("is-step-selected"));
      block.classList.add("is-step-selected");
    });
    block.querySelectorAll("[data-step-difficulty]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      currentCallbacks.onAdjustDifficulty?.(currentItem.data.id, button.dataset.stepDifficulty, index);
    }));
    block.querySelector("[data-step-regenerate]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      currentCallbacks.onRegenerateStep?.(currentItem.data.id, index);
    });
  });
}

function renderActivityDrawerLayout(activity, unit, session) {
  const sectionLabel = formatSubtopicLabel(activity.subtopic || activity.section || "Actividad");
  const allMatchingNotes = [
    ...(Array.isArray(activity.notes) ? activity.notes : []),
    ...(Array.isArray(unit.accepted?.teacherNotes) ? unit.accepted.teacherNotes.filter((n) => (n.activityId && (n.activityId === activity.id || n.activityId === activity.sectionId)) || (n.subtopic && activity.subtopic && String(n.subtopic).toLowerCase().includes(String(activity.subtopic).toLowerCase()))) : []),
    ...(Array.isArray(unit.teacherNotes) ? unit.teacherNotes.filter((n) => n.activityId === activity.id) : [])
  ];
  const notesCount = allMatchingNotes.length;
  const linkedResources = (unit.accepted?.resources || []).filter(
    (r) => String(r.activityId) === String(activity.id) || String(r.targetActivityId) === String(activity.id)
  );
  const isEmpty = !activity.html;
  const iconInfo = getActivityIconInfo(activity, false, unit.meta?.category);
  const subtopicColor = iconInfo.color || "#0ea5e9";

  drawerEl.innerHTML = `
    <header class="cb-drawer-header">
      <div class="cb-drawer-header-left">
        <h3 class="cb-drawer-title" style="color: ${subtopicColor}; font-weight: 600;">${escapeHtml(activity.title || sectionLabel)}</h3>
      </div>
      <button type="button" class="cb-drawer-close-btn" data-drawer-action="close" aria-label="Cerrar inspector">
        <i class="fas fa-times"></i>
      </button>
    </header>

    <nav class="cb-drawer-tabs" role="tablist">
      <button type="button" class="cb-drawer-tab ${currentTab === "teacher" ? "is-active" : ""}" data-drawer-tab="teacher" role="tab">
        <i class="fas fa-chalkboard-user"></i>
        <span>Actividades</span>
      </button>
      <button type="button" class="cb-drawer-tab ${currentTab === "sya" ? "is-active" : ""}" data-drawer-tab="sya" role="tab">
        <i class="fas fa-list-check"></i>
        <span>Ejes SyA</span>
      </button>
      <button type="button" class="cb-drawer-tab ${currentTab === "resources" ? "is-active" : ""}" data-drawer-tab="resources" role="tab">
        <i class="fas fa-paperclip"></i>
        <span>Recursos (${linkedResources.length})</span>
      </button>
      <button type="button" class="cb-drawer-tab ${currentTab === "notes" ? "is-active" : ""}" data-drawer-tab="notes" role="tab">
        <i class="fas fa-note-sticky"></i>
        <span>Notas del Maestro${notesCount > 0 ? ` (${notesCount})` : ""}</span>
      </button>
    </nav>

    <div class="cb-drawer-body">
      ${renderMathActivitySelector(currentItem.mathActivities, currentItem.mathActivityIndex, "data-math-activity-tab")}
      ${isEmpty && currentTab === "teacher" ? `
        <div class="cb-drawer-empty-card">
          <div class="cb-drawer-empty-icon-box">
            <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
          </div>
          <span class="cb-drawer-empty-badge">
            <i class="fas fa-sparkles" aria-hidden="true"></i> Subtema Vacío
          </span>
          <h3 class="cb-drawer-empty-title">Este subtema aún no tiene contenido</h3>
          <p class="cb-drawer-empty-desc">
            Genera una propuesta didáctica interactiva con el agente MCP o crea una actividad personalizada para esta unidad.
          </p>
          <button type="button" class="cb-drawer-empty-action-btn" data-drawer-action="create-activity">
            <i class="fas fa-plus" aria-hidden="true"></i>
            <span>Crear actividad</span>
          </button>
        </div>
      ` : renderActivityTabBody(activity, unit, session, linkedResources)}
    <div class="cb-drawer-footer cb-drawer-page-toolbar" role="toolbar" aria-label="Acciones de esta página de actividad" data-page-id="${escapeHtml(activity.id || "")}">
      <div class="cb-drawer-footer-actions">
        ${!isEmpty ? `
        <button type="button" class="cb-drawer-btn color-copy" data-drawer-action="copy" title="Copiar">
          <i class="fas fa-copy"></i>
        </button>
        <div class="cb-drawer-divider"></div>
        <button type="button" class="cb-drawer-btn color-edit" data-drawer-action="edit" title="Editar">
          <i class="fas fa-pen-to-square"></i>
        </button>
        <div class="cb-drawer-divider"></div>
        <button type="button" class="cb-drawer-btn color-regenerate" data-drawer-action="regenerate" title="Regenerar MCP">
          <i class="fas fa-rotate"></i>
        </button>
        <div class="cb-drawer-divider"></div>
        <button type="button" class="cb-drawer-btn cb-drawer-difficulty-btn" data-drawer-difficulty="easier" title="Hacer más fácil esta página">
          <i class="fas fa-feather" aria-hidden="true"></i><span>Más fácil</span>
        </button>
        <button type="button" class="cb-drawer-btn cb-drawer-difficulty-btn" data-drawer-difficulty="harder" title="Hacer más difícil esta página">
          <i class="fas fa-mountain" aria-hidden="true"></i><span>Más difícil</span>
        </button>
        <div class="cb-drawer-divider"></div>
        ` : ''}
      </div>
      <button type="button" class="cb-drawer-btn color-danger" data-drawer-action="remove" title="Eliminar actividad">
        <i class="fas fa-trash"></i>
      </button>
    </div>
    <button type="button" class="cb-drawer-add-page" data-drawer-action="create-activity"><i class="fas fa-plus" aria-hidden="true"></i> Añadir página de actividad</button>
    </div>
  `;
}

function renderMathActivitySelector(items = [], selectedIndex = 0, attribute = "data-math-activity-tab") {
  if (!Array.isArray(items) || items.length < 2) return "";
  const navLabel = attribute === "data-ficha-note-tab" ? "Páginas de Fichas de trabajo" : attribute === "data-resource-page-tab" ? "Páginas del recurso" : "Páginas del subtema";
  return `<nav class="cb-drawer-math-tabs" role="tablist" aria-label="${escapeHtml(navLabel)}">${items.map((item, index) => `
    <button type="button" class="cb-drawer-math-tab${index === selectedIndex ? " is-active" : ""}" ${attribute}="${index}" role="tab" aria-selected="${index === selectedIndex ? "true" : "false"}" title="${escapeHtml(item.title || `Página ${index + 1}`)}">${index + 1}</button>
  `).join("")}</nav>`;
}

export function replaceEmojisWithIcTags(rawHtml = "") {
  if (!rawHtml) return "";
  let res = String(rawHtml);
  // Reemplazar combinaciones de emojis primero
  res = res.replace(/👥\s*👥/g, "[IC. T.EQ]");
  res = res.replace(/👥/g, "[IC. T. PAR]");
  res = res.replace(/👤/g, "[IC. T. IND]");
  res = res.replace(/🎙️|🎙/g, "[IC. EXPRESION ORAL]");
  res = res.replace(/✂️|✂/g, "[IC. RECORTA]");
  res = res.replace(/✏️|✏/g, "[IC. ESCRIBE]");
  res = res.replace(/🔗|🎬|📽️|📽/g, "[IC. OBSERVA VIDEO]");
  res = res.replace(/📖|📚/g, "[IC. LEE]");
  res = res.replace(/🎨/g, "[IC. DIBUJA]");
  res = res.replace(/💬/g, "[IC. COMENTA]");
  // Eliminar cualquier otro emoji residual
  res = res.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");
  // Limpiar espacios repetidos
  return res.replace(/[ \t]{2,}/g, " ");
}

export function formatIcTags(rawHtml = "") {
  if (!rawHtml) return "";
  rawHtml = normalizeIcTokensAndPlacement(rawHtml);
  if (typeof DOMParser !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(`<div>${rawHtml}</div>`, "text/html");
      const root = doc.body.firstElementChild;
      const actionMap = {
        lee: { icon: "fa-book-open", pattern: /\blee\b/i },
        escribe: { icon: "fa-pencil", pattern: /\bescribe\b/i },
        dibuja: { icon: "fa-palette", pattern: /\bdibuja\b/i },
        recorta: { icon: "fa-scissors", pattern: /\brecorta\b/i },
        comenta: { icon: "fa-comments", pattern: /\bcomenta\b/i }
      };
      root.querySelectorAll("p, li").forEach((line) => {
        const tagMatch = line.textContent.match(/\[IC\.\s*(LEE|ESCRIBE|DIBUJA|RECORTA|COMENTA)\]/i);
        if (!tagMatch) return;
        const action = actionMap[tagMatch[1].toLowerCase()];
        const walker = doc.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);
        let verbNode = null;
        let match = null;
        for (const textNode of textNodes) {
          match = textNode.nodeValue.match(action.pattern);
          if (match) { verbNode = textNode; break; }
        }
        // Si el código IC nombra la acción pero la consigna empieza con un
        // verbo genérico (por ejemplo, "Utiliza"), reemplazar ese verbo allí.
        if (!match) {
          const genericImperative = /\b(?:utiliza|usa|realiza|haz|completa|resuelve|observa|mira|trabaja|contesta|responde|elabora|prepara|pega|colorea|traza|ordena|selecciona|escribe|lee|dibuja|comenta|recorta)\b/i;
          for (const textNode of textNodes) {
            const candidate = textNode.nodeValue.match(genericImperative);
            if (candidate && candidate.index < 100) { verbNode = textNode; match = candidate; break; }
          }
        }
        const replacementText = match && action.pattern.test(match[0])
          ? match[0]
          : `${tagMatch[1].slice(0, 1).toUpperCase()}${tagMatch[1].slice(1).toLowerCase()}`;
        if (verbNode && match) {
          const before = verbNode.splitText(match.index);
          const after = before.splitText(match[0].length);
          const literalVerb = doc.createElement("span");
          literalVerb.className = "cb-ic-badge cb-ic-badge--verb";
          before.parentNode.replaceChild(literalVerb, before);
          literalVerb.textContent = replacementText;
          if (!after.nodeValue) after.parentNode?.removeChild(after);
        } else {
          const literalVerb = doc.createElement("span");
          literalVerb.className = "cb-ic-badge cb-ic-badge--verb";
          literalVerb.textContent = replacementText;
          line.insertBefore(literalVerb, line.firstChild);
          line.insertBefore(doc.createTextNode(" "), literalVerb.nextSibling);
        }
        const tokenWalker = doc.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        const tokenNodes = [];
        while (tokenWalker.nextNode()) tokenNodes.push(tokenWalker.currentNode);
        tokenNodes.forEach((node) => {
          node.nodeValue = node.nodeValue.replace(/\s*\[IC\.\s*(?:LEE|ESCRIBE|DIBUJA|RECORTA|COMENTA)\]\s*/gi, " ");
          if (!node.nodeValue) node.parentNode?.removeChild(node);
        });
      });
      rawHtml = root.innerHTML;
    } catch (_) {}
  }
  const IC_ICONS = {
    "t. ind": "fa-user",
    "t. ind.": "fa-user",
    "t. par": "fa-user-group",
    "t. par.": "fa-user-group",
    "t.eq": "fa-people-group",
    "t. equi": "fa-people-group",
    "t. equi.": "fa-people-group",
    "expresion oral": "fa-microphone",
    "expresión oral": "fa-microphone",
    "observa video": "fa-film",
    "lee": "fa-book-open",
    "escribe": "fa-pencil",
    "dibuja": "fa-palette",
    "recorta": "fa-scissors",
    "comenta": "fa-comments"
  };

  // 1. Desenrollar cualquier badge previo para evitar anidamiento recursivo
  let source = rawHtml.replace(/<span\b[^>]*class=["'][^"']*\bcb-ic-badge\b[^"']*["'][^>]*>\s*(\[IC\.[^\]]+\])\s*<\/span>/gi, "$1");
  // Repetir en caso de múltiples capas de envoltura previas
  source = source.replace(/<span\b[^>]*class=["'][^"']*\bcb-ic-badge\b[^"']*["'][^>]*>\s*(\[IC\.[^\]]+\])\s*<\/span>/gi, "$1");

  // 2. Formatear cada token [IC...] en su badge exacto
  let formatted = source.replace(/\[(IC\.[^\]]+)\]/gi, (match, inner) => {
    const cleanKey = inner.replace(/^IC\.\s*/i, "").trim().toLowerCase();
    const isVerb = ["lee", "escribe", "dibuja", "recorta", "comenta"].includes(cleanKey);
    const badgeClass = isVerb ? "cb-ic-badge cb-ic-badge--verb" : "cb-ic-badge cb-ic-badge--modality";
    return `<span class="${badgeClass}">[${inner}]</span>`;
  });

  // 3. Garantizar que nunca quede un badge anidado dentro de otro badge
  formatted = formatted.replace(/<span\b([^>]*)class=["']([^"']*\bcb-ic-badge\b[^"']*)["']([^>]*)>\s*<span\b[^>]*class=["'][^"']*\bcb-ic-badge\b[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*<\/span>/gi,
    `<span$1class="$2"$3>$4</span>`
  );

  // 4. Si después del badge de modalidad hay texto en la misma fila, hacer punto y aparte pasándolo a la siguiente fila
  formatted = formatted.replace(/(<span\b[^>]*class=["'][^"']*\bcb-ic-badge--modality\b[^"']*["'][^>]*>[\s\S]*?<\/span>)(\s*)([^\s<][^<]*)/gi,
    "$1<br class=\"cb-ic-break\">\n$3"
  );

  return formatted;
}

export function normalizeActivityInstructionBold(rawHtml = "") {
  if (!rawHtml) return "";
  if (typeof DOMParser === "undefined") return rawHtml;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${rawHtml}</div>`, "text/html");
    const root = doc.body.firstElementChild || doc.body;

    Array.from(root.querySelectorAll("h3, h4, h5")).filter((heading) =>
      /^(poder de la voz|estrategia)$/i.test(heading.textContent.replace(/\s+/g, " ").trim())
    ).forEach((heading) => {
      heading.classList.add("cb-card-strategy-header");
      const card = heading.closest(".cb-card-strategy");
      if (card && /poder de la voz/i.test(heading.textContent)) card.classList.add("cb-card-voice");
    });

    const items = root.querySelectorAll("ol.steps > li, .activity > p:not(.answer)");
    items.forEach((item) => {
      let html = item.innerHTML.trim();
      if (!html) return;

      const strongMatch = html.match(/^(\s*<(?:strong|b)[^>]*>)([\s\S]*?)(<\/(?:strong|b)>)([\s\S]*)$/i);
      if (strongMatch) {
        const [, openTag, boldContent, closeTag, remaining] = strongMatch;
        const cleanBold = boldContent.trim();
        if (/[:.]$/.test(cleanBold)) {
          return;
        }
        let dotIdx = remaining.indexOf(".");
        let colonIdx = remaining.indexOf(":");
        let cutIdx = -1;
        if (dotIdx !== -1 && colonIdx !== -1) cutIdx = Math.min(dotIdx, colonIdx);
        else if (dotIdx !== -1) cutIdx = dotIdx;
        else if (colonIdx !== -1) cutIdx = colonIdx;

        if (cutIdx !== -1) {
          const addedBold = remaining.slice(0, cutIdx + 1);
          const rest = remaining.slice(cutIdx + 1);
          item.innerHTML = `${openTag}${cleanBold} ${addedBold.trim()}${closeTag}${rest}`;
        }
      } else if (!/^\s*<(?:strong|b)/i.test(html)) {
        let dotIdx = html.indexOf(".");
        let colonIdx = html.indexOf(":");
        let cutIdx = -1;
        if (dotIdx !== -1 && colonIdx !== -1) cutIdx = Math.min(dotIdx, colonIdx);
        else if (dotIdx !== -1) cutIdx = dotIdx;
        else if (colonIdx !== -1) cutIdx = colonIdx;

        if (cutIdx !== -1) {
          const boldPart = html.slice(0, cutIdx + 1);
          const rest = html.slice(cutIdx + 1);
          item.innerHTML = `<strong>${boldPart.trim()}</strong>${rest}`;
        }
      }
    });

    return root.innerHTML;
  } catch (err) {
    return rawHtml;
  }
}

export function formatActivityHtmlWithResponseLines(rawHtml = "", subtopicColor = "", activity = null, category = "") {
  if (!rawHtml) return "";
  if (typeof DOMParser === "undefined") return rawHtml;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${rawHtml}</div>`, "text/html");
    const root = doc.body.firstElementChild || doc.body;

    // 1. Eliminar cintillos de eje, preguntas detonantes y header-tag
    root.querySelectorAll(".header-tag, .cb-cintillo-axis, .cb-detonador-block, [class*='cintillo'], [class*='detonad']").forEach((node) => node.remove());

    // 2. Aplicar color dinámico del subtema y etiqueta de habilidad cognitiva a la derecha del título h2
    const titles = Array.from(root.querySelectorAll("h2.cb-activity-title, h2, .cb-subtopic-title"));
    const skill = resolveActivityCognitiveSkill(activity || { html: rawHtml }, category);
    const badgeHtml = renderCognitiveBadgeHtml(skill);

    if (titles.length) {
      titles.forEach((title, idx) => {
        if (subtopicColor) {
          title.style.color = subtopicColor;
        }
        title.style.fontWeight = "600";
        title.classList.add("cb-activity-title");
        if (idx === 0) {
          title.querySelectorAll(".cb-cognitive-badge").forEach((b) => b.remove());
          const existingTextSpan = title.querySelector(".cb-activity-title-text");
          const text = existingTextSpan ? existingTextSpan.innerHTML.trim() : title.innerHTML.trim();
          title.innerHTML = `<span class="cb-activity-title-text">${text}</span> ${badgeHtml}`;
        }
      });
    } else if (activity?.title || activity?.subtopic) {
      const titleText = escapeHtml(activity.title || activity.subtopic || "");
      const h2 = doc.createElement("h2");
      h2.className = "cb-activity-title";
      if (subtopicColor) h2.style.color = subtopicColor;
      h2.style.fontWeight = "600";
      h2.innerHTML = `<span class="cb-activity-title-text">${titleText}</span> ${badgeHtml}`;
      root.insertBefore(h2, root.firstChild);
    }

    // 3. Desduplicar numeración de listas ordenadas (ej. "1. 1. ...")
    const stripLeadingOrdinal = (element) => {
      const removeFromFirstTextNode = (node) => {
        for (const child of Array.from(node.childNodes || [])) {
          if (child.nodeType === 3 && child.nodeValue.trim()) {
            child.nodeValue = child.nodeValue.replace(/^\s*\d+[.)\-]\s*/, "");
            return true;
          }
          if (child.nodeType === 1 && removeFromFirstTextNode(child)) return true;
        }
        return false;
      };
      removeFromFirstTextNode(element);
    };
    root.querySelectorAll("ol.steps > li, ol > li").forEach((li) => {
      const firstChild = li.firstChild;
      if (firstChild && firstChild.nodeType === 3) {
        firstChild.nodeValue = firstChild.nodeValue.replace(/^\s*\d+[\.\)\-]\s*/, "");
      }
      const firstEl = li.firstElementChild;
      if (firstEl && (firstEl.tagName === "STRONG" || firstEl.tagName === "B" || firstEl.tagName === "SPAN")) {
        firstEl.innerHTML = firstEl.innerHTML.replace(/^\s*\d+[\.\)\-]\s*/, "");
        if (!firstEl.textContent.trim()) {
          firstEl.remove();
        }
      }
    });
    // El <ol> ya aporta el número de cada ejercicio; elimina el ordinal
    // que algunos modelos repiten dentro de la consigna de .activity.
    root.querySelectorAll(".activity > p:first-of-type").forEach(stripLeadingOrdinal);

    // 4. Desduplicar bullets en listas no ordenadas (ej. "• o ...", "• • ...")
    root.querySelectorAll("ul > li").forEach((li) => {
      const firstChild = li.firstChild;
      if (firstChild && firstChild.nodeType === 3) {
        firstChild.nodeValue = firstChild.nodeValue.replace(/^\s*[•\*\-\–\—o]\s+/, "");
      }
      const firstEl = li.firstElementChild;
      if (firstEl && (firstEl.tagName === "STRONG" || firstEl.tagName === "B" || firstEl.tagName === "SPAN")) {
        firstEl.innerHTML = firstEl.innerHTML.replace(/^\s*[•\*\-\–\—o]\s+/, "");
        if (!firstEl.textContent.trim()) {
          firstEl.remove();
        }
      }
    });

    // 5. Unificar badges [IC. ...] en la misma línea de instrucción (sin saltos <br> ni párrafos aislados)
    root.querySelectorAll("p, li, div").forEach((el) => {
      el.innerHTML = el.innerHTML.replace(/<br\s*\/?>\s*(\[IC\.[^\]]+\])/gi, " $1");
      el.innerHTML = el.innerHTML.replace(/<br\s*\/?>\s*(<span class="cb-ic-badge)/gi, " $1");
    });

    root.querySelectorAll("p, div:not(.answer):not(.cb-response-line)").forEach((el) => {
      const text = el.textContent.trim();
      if (/^\[IC\.[^\]]+\]$/i.test(text)) {
        const prev = el.previousElementSibling;
        if (prev && (prev.tagName === "P" || prev.tagName === "LI" || prev.tagName === "DIV")) {
          prev.appendChild(document.createTextNode(" "));
          while (el.firstChild) {
            prev.appendChild(el.firstChild);
          }
          el.remove();
        } else {
          const next = el.nextElementSibling;
          if (next && (next.tagName === "P" || next.tagName === "LI" || next.tagName === "DIV")) {
            next.insertBefore(document.createTextNode(" "), next.firstChild);
            while (el.lastChild) {
              next.insertBefore(el.lastChild, next.firstChild);
            }
            el.remove();
          }
        }
      }
    });

    // 6. Respuestas esperadas en paréntesis o corchetes: SIEMPRE en color magenta
    const listItems = Array.from(root.querySelectorAll("ol.steps > li, .activity > p, p")).filter((item) => {
      // Un li puede contener varias subpreguntas con sus propias respuestas.
      // Procesarlo como una sola unidad toma la primera .answer y la coloca
      // en el primer espacio que encuentre. En esos casos se procesan los p
      // internos, cada uno junto a su respuesta inmediata.
      return !(item.matches("ol.steps > li") && item.querySelector("p, .answer"));
    });
    listItems.forEach((item) => {
      const answerEl = item.querySelector(".answer") || (item.nextElementSibling?.classList?.contains("answer") ? item.nextElementSibling : null);
      if (answerEl) {
        const rawAnswer = (answerEl.textContent || "").replace(/\s+/g, " ").trim();
        const expectedAnswer = rawAnswer
          .replace(/^(?:Resp(?:uesta)?s?(?:\s*esperada)?s?|Soluci[oó]n|Clave)\s*:?\s*/i, "")
          .trim();

        // Cuando la consigna trae un espacio para completar, la respuesta
        // pertenece al mismo renglón. No la dejes como una pleca posterior.
        const blankPattern = /_{2,}|[…·]{2,}|□+/u;
        if (expectedAnswer && blankPattern.test(item.textContent || "")) {
          const inlineAnswer = `<span class="cb-inline-response" role="img" aria-label="Respuesta esperada: ${escapeHtml(expectedAnswer)}"><span class="cb-teacher-resp" style="color:#e6007e !important;">${escapeHtml(expectedAnswer)}</span></span>`;
          answerEl.remove();
          item.innerHTML = item.innerHTML.replace(blankPattern, inlineAnswer);
          return;
        }

        const cleanAnswerMatch = rawAnswer.match(/^(?:Resp(?:\.|uesta)?(?:\s*esperada)?\s*:?\s*)?([a-zA-Z0-9✓✗✔✕XVF\s\-\.]{1,12})$/i);
        const answerKey = cleanAnswerMatch ? cleanAnswerMatch[1].trim() : "";

        const hasEmptyParens = /\(\s*\)/.test(item.innerHTML);
        const hasEmptyBrackets = /\[\s*\]/.test(item.innerHTML);

        if ((hasEmptyParens || hasEmptyBrackets) && answerKey) {
          if (hasEmptyParens) {
            item.innerHTML = item.innerHTML.replace(/\(\s*\)/, `(<span class="cb-teacher-resp--inline" style="color:#e6007e !important; font-weight:700;"> ${escapeHtml(answerKey)} </span>)`);
          } else if (hasEmptyBrackets) {
            item.innerHTML = item.innerHTML.replace(/\[\s*\]/, `[<span class="cb-teacher-resp--inline" style="color:#e6007e !important; font-weight:700;"> ${escapeHtml(answerKey)} </span>]`);
          }
          answerEl.remove();
        }
      }

      // Si ya contiene letras o marcas dentro de paréntesis o corchetes, estilizarlas en magenta
      item.innerHTML = item.innerHTML.replace(
        /\(\s*([a-zA-Z0-9✓✗✔✕XVF])\s*\)(?![^<]*<\/span>)/g,
        (m, letter) => `(<span class="cb-teacher-resp--inline" style="color:#e6007e !important; font-weight:700;"> ${escapeHtml(letter)} </span>)`
      );
      item.innerHTML = item.innerHTML.replace(
        /\[\s*([a-zA-Z0-9✓✗✔✕XVF])\s*\](?![^<]*<\/span>)/g,
        (m, letter) => {
          if (/^IC\./i.test(letter)) return m;
          return `[<span class="cb-teacher-resp--inline" style="color:#e6007e !important; font-weight:700;"> ${escapeHtml(letter)} </span>]`;
        }
      );
    });

    // 7. Respuestas abiertas: una pleca/línea de respuesta por cada fila de texto esperada
    const answerEls = root.querySelectorAll(".answer");
    answerEls.forEach((el) => {
      el.classList.add("cb-response-block");

      const existingLines = el.querySelectorAll(".cb-response-line");
      if (existingLines.length > 0) {
        // Gemini a veces devuelve una frase larga dentro de un solo renglón.
        // En 1° y 2° cada renglón visual es una caja completa; dividir aquí
        // evita que la respuesta se desborde por encima de las guías azules.
        const splitLineText = (value, maxLength = 58) => {
          const clean = String(value || "")
            .replace(/^(?:Resp(?:uesta)?s?(?:\s*esperada)?s?|Soluci[oó]n|Clave)\s*:?\s*/i, "")
            .replace(/\s+/g, " ")
            .trim();
          if (!clean) return [];
          if (clean.length <= maxLength) return [clean];
          const chunks = [];
          let rest = clean;
          while (rest.length > maxLength) {
            let cut = rest.lastIndexOf(" ", maxLength);
            if (cut < Math.floor(maxLength * 0.55)) cut = maxLength;
            chunks.push(rest.slice(0, cut).trim());
            rest = rest.slice(cut).trim();
          }
          if (rest) chunks.push(rest);
          return chunks;
        };

        const normalizedLines = [];
        Array.from(existingLines).forEach((line) => {
          const text = (line.textContent || "").replace(/\s+/g, " ").trim();
          const chunks = splitLineText(text);
          if (!chunks.length) {
            normalizedLines.push(line.cloneNode(true));
            return;
          }
          chunks.forEach((chunk) => {
            const nextLine = line.cloneNode(false);
            nextLine.innerHTML = `<span class="cb-teacher-resp" style="color:#e6007e !important;">${escapeHtml(chunk)}</span>`;
            normalizedLines.push(nextLine);
          });
        });
        el.innerHTML = "";
        normalizedLines.forEach((line) => el.appendChild(line));
        const compactText = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (normalizedLines.length === 1 && compactText.length <= 28) el.classList.add("cb-response-block--short");
        return;
      }

      let rawText = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!rawText) return;
      rawText = rawText.replace(/^(?:Resp(?:\.|uesta)?(?:\s*esperada)?\s*:?\s*)/i, "").trim();
      if (rawText.length <= 28) el.classList.add("cb-response-block--short");

      if (el.closest(".cb-response-line")) {
        const parentLine = el.closest(".cb-response-line");
        parentLine.innerHTML = `<span class="cb-teacher-resp" style="color:#e6007e !important;">${escapeHtml(rawText)}</span>`;
        return;
      }

      // Dividir el texto en líneas respetando numeración o frases
      let segments = [];
      if (/(?:^|\s+)\d+[\.\)]\s+/.test(rawText)) {
        segments = rawText.split(/(?=(?:^|\s+)\d+[\.\)]\s+)/).map(s => s.trim()).filter(Boolean);
      } else if (rawText.length > 70 && /\.\s+[A-ZÁÉÍÓÚÑ]/.test(rawText)) {
        segments = rawText.split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/).map(s => s.trim()).filter(Boolean);
      } else {
        segments = [rawText];
      }

      const finalLines = [];
      segments.forEach((seg) => {
        if (seg.length <= 58) {
          finalLines.push(seg);
        } else {
          const words = seg.split(" ");
          let current = "";
          words.forEach((w) => {
            if ((current + " " + w).trim().length <= 58) {
              current = (current + " " + w).trim();
            } else {
              if (current) finalLines.push(current);
              current = w;
            }
          });
          if (current) finalLines.push(current);
        }
      });

      const linesHtml = finalLines.map((line) => `
        <div class="cb-response-line">
          <span class="cb-teacher-resp" style="color:#e6007e !important;">${escapeHtml(line)}</span>
        </div>
      `).join("");

      el.innerHTML = linesHtml;
    });

    // Agrupar la cápsula “Para saber más” con sus párrafos aunque esté dentro
    // de un bloque .activity, y presentar aparte otros elementos informativos.
    const learnMoreTitles = Array.from(root.querySelectorAll("h3, h4, h5")).filter((node) =>
      /^(para saber m[aá]s|dato curioso|sab[ií]as que)$/i.test(node.textContent.replace(/\s+/g, " ").trim())
      && !node.closest(".cb-drawer-info-card, .cb-card-learn-more")
    );
    learnMoreTitles.forEach((node) => {
      const card = doc.createElement("aside");
      card.className = "cb-drawer-info-card cb-drawer-info-card--learn-more";
      node.parentNode.insertBefore(card, node);
      card.appendChild(node);
      let next = card.nextElementSibling;
      while (next && /^(P|TABLE|FIGURE|BLOCKQUOTE)$/.test(next.tagName)) {
        const current = next;
        next = current.nextElementSibling;
        card.appendChild(current);
      }
    });

    const infoChildren = Array.from(root.querySelectorAll(":scope > p, :scope > table, :scope > figure, :scope > blockquote"));
    infoChildren.forEach((node) => {
      if (node.closest(".activity, .cb-card-context, .cb-card-strategy, .cb-card-learn-more, .cb-card-glossary, .cb-drawer-info-card")) return;
      const card = doc.createElement("aside");
      card.className = "cb-drawer-info-card";
      node.parentNode.insertBefore(card, node);
      card.appendChild(node);
    });

    root.querySelectorAll(".cb-card-strategy, .cb-card-learn-more, .cb-drawer-info-card--learn-more").forEach((card) => {
      if (card.querySelector(":scope > .cb-info-regenerate")) return;
      const kind = card.classList.contains("cb-card-strategy") ? "strategy" : "learn-more";
      const action = doc.createElement("button");
      action.type = "button";
      action.className = "cb-info-regenerate";
      action.dataset.infoRegenerate = kind;
      action.title = kind === "strategy" ? "Proponer otra estrategia" : "Proponer otro dato para saber más";
      action.setAttribute("aria-label", action.title);
      action.innerHTML = '<i class="fas fa-rotate" aria-hidden="true"></i>';
      card.appendChild(action);
    });

    root.querySelectorAll(".cb-word-search-grid").forEach((grid) => {
      const spans = grid.querySelectorAll("span");
      const count = spans.length;
      if (!count) return;
      const styleAttr = grid.getAttribute("style") || "";
      const match = styleAttr.match(/repeat\(\s*(\d+)/i);
      let cols = match ? parseInt(match[1], 10) : 0;
      if (!cols || cols < 3) {
        if (count % 10 === 0) cols = 10;
        else if (count % 12 === 0) cols = 12;
        else if (count % 8 === 0) cols = 8;
        else if (count % 14 === 0) cols = 14;
        else cols = Math.round(Math.sqrt(count)) || 10;
      }
      grid.style.setProperty("--cb-grid-cols", String(cols));
      grid.style.setProperty("grid-template-columns", `repeat(${cols}, 28px)`);
    });

    return root.innerHTML;
  } catch (err) {
    return rawHtml;
  }
}

function hydrateCutoutExpectedCompositions(rawHtml = "", linkedResources = [], allUnitResources = []) {
  if (!rawHtml || typeof DOMParser === "undefined") return rawHtml;
  try {
    const doc = new DOMParser().parseFromString(`<div>${rawHtml}</div>`, "text/html");
    const root = doc.body.firstElementChild || doc.body;
    const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

    const candidateResources = [...(linkedResources || []), ...(allUnitResources || [])].filter((item, idx, arr) => {
      if (!item) return false;
      const type = String(item.type || item.contentType || "").toLowerCase();
      return (type === "cutout" || type === "recortable") && arr.findIndex(x => x.id === item.id) === idx;
    });

    root.querySelectorAll(".cb-cutout-completed-example, [data-cutout-example]").forEach((example) => {
      // If it already contains an img, ensure classes and label are present
      const existingImg = example.querySelector("img");
      if (existingImg && existingImg.getAttribute("src")) {
        example.classList.add("has-generated-example");
        existingImg.classList.add("cb-cutout-example-img");
        if (!example.querySelector(".cb-cutout-example-label")) {
          const lbl = document.createElement("span");
          lbl.className = "cb-cutout-example-label";
          lbl.textContent = "Composición esperada";
          example.prepend(lbl);
        }
        return;
      }

      const code = example.getAttribute("data-cutout-example") || "";
      const normCode = norm(code);

      let resource = null;
      if (normCode) {
        resource = candidateResources.find(item => {
          const itemCode = norm(item.code);
          const itemTitle = norm(item.title);
          return itemCode === normCode || itemTitle === normCode ||
            (itemCode && normCode.includes(itemCode)) ||
            (itemCode && itemCode.includes(normCode)) ||
            (itemTitle && itemTitle.includes(normCode)) ||
            (itemTitle && normCode.includes(itemTitle));
        });
      }
      if (!resource && candidateResources.length === 1) {
        resource = candidateResources[0];
      } else if (!resource && candidateResources.length > 0) {
        // Fallback to first cutout with a completedExampleAsset
        resource = candidateResources.find(item => item?.artifact?.completedExampleAsset?.url || item?.completedExampleAsset?.url) || candidateResources[0];
      }

      const asset = resource?.artifact?.completedExampleAsset || resource?.completedExampleAsset || (Array.isArray(resource?.assets) ? resource.assets.find(a => a.type === "completed-example" || a.label === "completed-example") : null);
      if (!asset?.url) return;

      example.innerHTML = `<span class="cb-cutout-example-label">Composición esperada</span><img class="cb-cutout-example-img" src="${escapeHtml(asset.url)}" alt="Ejemplo de cómo debe quedar la actividad después de pegar el recortable" loading="lazy" />`;
      example.classList.add("has-generated-example");
    });
    return root.innerHTML;
  } catch (_) {
    return rawHtml;
  }
}

function removeRedundantMathSubtitle(rawHtml = "") {
  if (!rawHtml || typeof DOMParser === "undefined") return rawHtml;
  try {
    const doc = new DOMParser().parseFromString(`<div>${rawHtml}</div>`, "text/html");
    const root = doc.body.firstElementChild || doc.body;
    if (root.querySelector(":scope > h2.cb-activity-title, :scope > h2")) {
      root.querySelector(".activity > h3:first-child, .activity > h4:first-child")?.remove();
    }
    return root.innerHTML;
  } catch (_) {
    return rawHtml;
  }
}

function renderActivityTabBody(activity, unit, session, linkedResources) {
  let html = String(activity.html || "");
  const grade = unit.meta?.grade || session?.academicMeta?.grade || "";
  const iconInfo = getActivityIconInfo(activity, false, unit.meta?.category);
  const subtopicColor = iconInfo.color || "#0ea5e9";
  
  // 1° y 2° de Primaria: Pleca en caja; A partir de 3°: Línea azul claro
  const isBoxGrade = /primero|segundo|^[12]\b/i.test(grade);
  const styleClass = isBoxGrade ? "cb-response-style-box" : "cb-response-style-line";

  // 1° a 3° de Primaria: Tipografía manuscrita; 4° a 6°: Tipografía normal
  const isPrimariaBaja = /primero|segundo|tercero|^[123]\b/i.test(grade);
  const gradeClass = isPrimariaBaja ? "is-primaria-baja" : "is-primaria-alta";

  if (currentTab === "teacher") {
    html = hydrateCutoutExpectedCompositions(html, linkedResources, unit?.accepted?.resources || []);
    if ((currentItem?.mathActivities || []).length) html = removeRedundantMathSubtitle(html);
    // Sustituir emojis por tokens textuales [IC. ...] y eliminar emojis residuales
    html = replaceEmojisWithIcTags(html);
    // Normalizar negritas en instrucción (hasta . o :)
    html = normalizeActivityInstructionBold(html);
    // Formatear plecas con respuestas bien alineadas, color del subtema, habilidad cognitiva y desduplicación
    html = formatActivityHtmlWithResponseLines(html, subtopicColor, activity, unit?.meta?.category || "");
    // Envolver tokens pedagógicos [IC. ...] para presentación cuidada
    const displayHtml = formatIcTags(html);
    return `
      <div class="cb-drawer-teacher-view ${styleClass} ${gradeClass}" style="--cb-subtopic-color: ${subtopicColor};">
        ${displayHtml}
      </div>
    `;
  }


  if (currentTab === "sya") {
    // SyA View con edición y restablecimiento por campo
    const syaSource = unit.accepted?.sya || unit.sya || {};
    const subtopic = activity.subtopic || activity.section || "";
    const fields = buildSubtopicSyaFields(syaSource, subtopic);
    
    // Normalize missing fields for display
    fields.T = fields.T || "No especificado";
    fields.AE = fields.AE || "No especificado";
    fields.C = fields.C || "No especificado";
    fields.P = fields.P || "No especificado";

    const syaKeys = [
      { key: "T", label: "Tema" },
      { key: "AE", label: "PDA (clave AE)" },
      { key: "C", label: "Contenido" },
      { key: "P", label: "Proceso / Práctica" }
    ];

    return `
      <div class="cb-drawer-sya-container">
        <h4 style="margin-bottom:0.4rem;">Alineación Curricular (Secuencia y Alcance)</h4>
        <p style="font-size:0.8rem; color:var(--cb-up-muted); margin-bottom:0.75rem;">
          Ejes pedagógicos oficiales para <strong>${escapeHtml(subtopic)}</strong>:
        </p>
        <div class="cb-drawer-sya-grid">
          ${syaKeys.map(({ key, label }) => `
            <div class="cb-drawer-sya-card" data-sya-card-key="${key}">
              <div class="cb-drawer-sya-card-header">
                <strong>${label} (${key})</strong>
                <div class="cb-drawer-sya-actions">
                  <button type="button" class="cb-drawer-sya-btn cb-drawer-sya-btn--edit" data-sya-action="edit" data-sya-field="${key}" data-sya-label="${label}" title="Editar ${label}">
                    <i class="fas fa-pencil"></i>
                  </button>
                  <button type="button" class="cb-drawer-sya-btn cb-drawer-sya-btn--reset" data-sya-action="reset" data-sya-field="${key}" data-sya-label="${label}" title="Restablecer original">
                    <i class="fas fa-rotate-left"></i>
                  </button>
                </div>
              </div>
              <div class="cb-drawer-sya-value" data-sya-value-box="${key}">
                <span>${escapeHtml(fields[key])}</span>
              </div>
            </div>
          `).join("")}
        </div>
        <div class="cb-drawer-sya-improve">
          <button type="button" class="cb-drawer-sya-improve-btn" data-sya-improve-all>
            <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
            <span>Mejorar los 4 campos con la NEM</span>
          </button>
          <div class="cb-drawer-sya-improve-result" data-sya-improve-result hidden></div>
        </div>
      </div>
    `;
  }

  if (currentTab === "resources") {
    if (!linkedResources.length) {
      return `
        <div class="cb-drawer-resource-empty" role="status">
          <span class="cb-drawer-resource-empty__icon"><i class="fas fa-paperclip" aria-hidden="true"></i></span>
          <div class="cb-drawer-resource-empty__copy">
            <h4>No hay recursos vinculados</h4>
            <p>Esta actividad puede funcionar por sí sola o puedes crear un recurso específico para complementarla.</p>
          </div>
          <button type="button" class="cb-drawer-resource-empty__action" data-drawer-action="add-resource">
            <i class="fas fa-plus"></i>
            <span>Generar recurso con Charly MCP</span>
          </button>
        </div>
      `;
    }

    return `
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <h4 style="margin: 0;">Recursos Didácticos Vinculados (${linkedResources.length})</h4>
          <button type="button" class="cb-btn cb-btn--sm cb-btn--primary" data-drawer-action="add-resource" style="display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; padding: 5px 12px; border-radius: 9999px; background: #2563eb; color: #ffffff; border: none; cursor: pointer; font-weight: 600;">
            <i class="fas fa-plus"></i>
            <span>Añadir recurso</span>
          </button>
        </div>
        ${linkedResources.map((res) => `
          <div class="cb-up-item-card" data-resource-open-id="${escapeHtml(res.id)}" style="cursor:pointer; display:flex; align-items:center; justify-content:space-between;">
            <div class="cb-up-item-left">
              <span class="cb-up-item-icon cb-up-item-icon--${res.type || "worksheet"}">
                <i class="fas ${getResourceIcon(res.type)}"></i>
              </span>
              <div class="cb-up-item-info">
                <p class="cb-up-item-title">${escapeHtml(res.title || res.code || "Recurso")}</p>
                <div class="cb-up-item-meta">
                  <span class="cb-up-badge">${escapeHtml(res.type?.toUpperCase() || "RECURSO")}</span>
                  <span>${escapeHtml(res.code || "")}</span>
                </div>
              </div>
            </div>
            <div class="cb-up-item-actions" style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:0.75rem; color:var(--cb-up-accent); font-weight:600;">Ver recurso →</span>
              <button type="button" class="cb-drawer-btn color-danger" data-drawer-delete-resource="${escapeHtml(res.id)}" title="Eliminar recurso" aria-label="Eliminar recurso" style="padding:4px 8px; font-size:12px; border-radius:6px; border:1px solid rgba(239, 68, 68, 0.3); background:rgba(239, 68, 68, 0.08); color:#ef4444; cursor:pointer;">
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        `).join("")}
        <button type="button" class="cb-btn" data-drawer-action="add-resource" style="margin-top: 4px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-size: 12.5px; padding: 9px 16px; border-radius: 8px; border: 1.5px dashed var(--cb-unit-border, #cbd5e1); background: rgba(37, 99, 235, 0.04); color: var(--cb-up-accent, #2563eb); cursor: pointer; font-weight: 600;">
          <i class="fas fa-plus-circle"></i>
          <span>Añadir otro recurso a esta actividad</span>
        </button>
      </div>
    `;
  }

  if (currentTab === "notes") {
    if (!activity.html) {
      return `
        <div style="text-align: center; padding: 2.5rem 1rem; color: var(--cb-up-muted);">
          <i class="fas fa-note-sticky" style="font-size: 2.3rem; margin-bottom: 0.85rem; opacity: 0.45; color: #2563eb;"></i>
          <p style="font-weight: 700; font-size: 1rem; margin-bottom: 0.35rem; color: var(--cb-up-text, #1e293b);">Primero crea la actividad del subtema.</p>
          <p style="font-size: 0.85rem; line-height: 1.5; margin-bottom: 1.35rem; max-width: 440px; margin-left: auto; margin-right: auto;">
            Las notas del maestro orientan la aplicación pedagógica de la actividad y sus recursos. Crea primero la actividad para poder redactar sus notas.
          </p>
          <button type="button" class="cb-btn cb-btn--primary" data-drawer-action="create-activity" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 22px; font-size: 13.5px; font-weight: 600; border-radius: 9999px; background: #2563eb; color: #ffffff !important; border: none; cursor: pointer;">
            <i class="fas fa-plus" aria-hidden="true"></i>
            <span>Crear actividad primero</span>
          </button>
        </div>
      `;
    }
    const allNotes = [
      ...(Array.isArray(activity.notes) ? activity.notes : []),
      ...(Array.isArray(unit.accepted?.teacherNotes) ? unit.accepted.teacherNotes : []),
      ...(Array.isArray(unit.accepted?.notes) ? unit.accepted.notes : []),
      ...(Array.isArray(unit.teacherNotes) ? unit.teacherNotes : []),
      ...(Array.isArray(unit.notes) ? unit.notes : [])
    ];

    const matchingNotes = allNotes.filter((n) => {
      if (!n) return false;
      if (n.activityId && (String(n.activityId) === String(activity.id) || String(n.activityId) === String(activity.sectionId))) return true;
      const subtopicA = String(activity.subtopic || activity.section || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const subtopicN = String(n.subtopic || n.section || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (subtopicA && subtopicN && (subtopicA.includes(subtopicN) || subtopicN.includes(subtopicA))) return true;
      const titleA = String(activity.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const titleN = String(n.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (titleA && titleN && (titleA.includes(titleN) || titleN.includes(titleA))) return true;
      return false;
    });

    if (!matchingNotes.length && allNotes.length > 0) {
      const match = allNotes.find((n) => {
        const text = String((n.title || "") + " " + (n.html || "")).toLowerCase();
        return (activity.subtopic && text.includes(String(activity.subtopic).toLowerCase())) ||
               (activity.title && text.includes(String(activity.title).toLowerCase()));
      });
      if (match) matchingNotes.push(match);
    }

    if (matchingNotes.length) {
      return `
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          ${matchingNotes.map((note) => `
            <div class="cb-teacher-note-sheet">
              ${note.html || note.content || note.text || "<p>Sin contenido.</p>"}
            </div>
          `).join("")}
        </div>
      `;
    }

    const linkedResources = (unit.accepted?.resources || []).filter(
      (r) => String(r.activityId) === String(activity.id) || (activity.subtopic && isSameSubtopicKey(r.subtopic, activity.subtopic))
    );
    const hasResources = linkedResources.length > 0;
    const resourcesDesc = hasResources
      ? ` e incorporar las orientaciones para ${linkedResources.length} recurso(s) vinculado(s)`
      : "";

    return `
      <div style="text-align: center; padding: 2.5rem 1rem; color: var(--cb-up-muted);">
        <i class="fas fa-chalkboard-user" style="font-size: 2.3rem; margin-bottom: 0.85rem; opacity: 0.45; color: #2563eb;"></i>
        <p style="font-weight: 700; font-size: 1rem; margin-bottom: 0.35rem; color: var(--cb-up-text, #1e293b);">Aún no se ha redactado esta nota pedagógica.</p>
        <p style="font-size: 0.85rem; line-height: 1.5; margin-bottom: 1.35rem; max-width: 440px; margin-left: auto; margin-right: auto;">
          Puedes solicitar a Charly MCP que desarrolle las orientaciones metodológicas para esta actividad${resourcesDesc}.
        </p>
        <button type="button" class="cb-btn cb-btn--primary cb-create-teacher-notes-btn" data-drawer-action="create-teacher-notes" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 22px; font-size: 13.5px; font-weight: 600; border-radius: 9999px; background: #2563eb; color: #ffffff !important; border: none; cursor: pointer; box-shadow: 0 2px 6px rgba(37, 99, 235, 0.28); transition: transform 0.15s ease, filter 0.15s ease;">
          <i class="fas fa-pen-nib" aria-hidden="true"></i>
          <span>Crear notas del maestro</span>
        </button>
      </div>
    `;
  }

  return `<p>Pestaña no reconocida.</p>`;
}

function extractReadingImageUrl(reading = {}, narrativeHtml = "") {
  if (reading.illustrationAsset?.url) return reading.illustrationAsset.url;
  if (reading.illustrationUrl) return reading.illustrationUrl;
  if (reading.imageUrl) return reading.imageUrl;
  const match = String(narrativeHtml || "").match(/<figure[^>]*class\s*=\s*["'][^"']*cb-reading-illustration[^"']*["'][^>]*>[\s\S]*?<img[^>]*src\s*=\s*["']([^"']+)["']/i)
    || String(narrativeHtml || "").match(/<img[^>]*src\s*=\s*["']([^"']+)["']/i);
  return match ? match[1] : "";
}

function splitReadingNarrative(narrativeHtml = "", reading = {}) {
  const imageUrl = extractReadingImageUrl(reading, narrativeHtml);
  let cleanHtml = String(narrativeHtml || "").replace(/<figure\b[^>]*class\s*=\s*["'][^"']*cb-reading-illustration[^"']*["'][^>]*>[\s\S]*?<\/figure>/gi, "").trim();

  if (typeof DOMParser !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(`<div>${cleanHtml}</div>`, "text/html");
      const root = doc.body.firstElementChild;
      const elements = Array.from(root.children);

      if (elements.length >= 2) {
        const mid = Math.ceil(elements.length / 2);
        const part1 = elements.slice(0, mid).map((el) => el.outerHTML).join("\n");
        const part2 = elements.slice(mid).map((el) => el.outerHTML).join("\n");
        return { part1, part2, imageUrl };
      }
    } catch (_) {}
  }

  const pChunks = cleanHtml.split(/<\/p>/i).filter((p) => p.trim());
  if (pChunks.length >= 2) {
    const mid = Math.ceil(pChunks.length / 2);
    const part1 = pChunks.slice(0, mid).map((p) => p.trim().startsWith("<") ? `${p}</p>` : `<p>${p}</p>`).join("\n");
    const part2 = pChunks.slice(mid).map((p) => p.trim().startsWith("<") ? `${p}</p>` : `<p>${p}</p>`).join("\n");
    return { part1, part2, imageUrl };
  }

  const sentences = cleanHtml.split(/(?<=[.!?])\s+/);
  if (sentences.length >= 2) {
    const mid = Math.ceil(sentences.length / 2);
    const part1 = `<p>${sentences.slice(0, mid).join(" ")}</p>`;
    const part2 = `<p>${sentences.slice(mid).join(" ")}</p>`;
    return { part1, part2, imageUrl };
  }

  return { part1: cleanHtml, part2: cleanHtml, imageUrl };
}

function renderReadingDrawerLayout(reading, unit, session) {
  const narrative = reading.sections?.narrativeHtml || reading.narrativeHtml || reading.html || reading.text || "";
  const synonyms = reading.sections?.synonyms || [];
  const questions = reading.sections?.questions || reading.questions || [];
  
  const { part1, part2, imageUrl } = splitReadingNarrative(narrative, reading);
  currentItem.readingParts = { part1, part2, imageUrl };
  const partIndex = currentItem.readingPartIndex === 1 ? 1 : 0;
  const currentPartHtml = partIndex === 0 ? part1 : part2;

  drawerEl.innerHTML = `
    <header class="cb-drawer-header">
      <div class="cb-drawer-header-left">
        <h3 class="cb-drawer-title">${escapeHtml(reading.title || "Lectura")}</h3>
      </div>
      <button type="button" class="cb-drawer-close-btn" data-drawer-action="close" aria-label="Cerrar inspector">
        <i class="fas fa-times"></i>
      </button>
    </header>

    <nav class="cb-drawer-tabs" role="tablist">
      <button type="button" class="cb-drawer-tab ${currentTab === "reading" ? "is-active" : ""}" data-drawer-tab="reading" role="tab">
        <i class="fas fa-book-open"></i>
        <span>Narrativa</span>
      </button>
      <button type="button" class="cb-drawer-tab ${currentTab === "synonyms" ? "is-active" : ""}" data-drawer-tab="synonyms" role="tab">
        <i class="fas fa-language"></i>
        <span>Sinónimos (${synonyms.length})</span>
      </button>
      <button type="button" class="cb-drawer-tab ${currentTab === "questions" ? "is-active" : ""}" data-drawer-tab="questions" role="tab">
        <i class="fas fa-circle-question"></i>
        <span>Comprensión (${questions.length})</span>
      </button>
    </nav>

    <div class="cb-drawer-body">
      ${currentTab === "reading" ? `
        <nav class="cb-drawer-math-tabs cb-drawer-reading-parts" role="tablist" aria-label="Partes de la Lectura">
          <button type="button" class="cb-drawer-math-tab${partIndex === 0 ? " is-active" : ""}" data-reading-part="0" role="tab" aria-selected="${partIndex === 0}" title="Lectura - Parte 1">1</button>
          <button type="button" class="cb-drawer-math-tab${partIndex === 1 ? " is-active" : ""}" data-reading-part="1" role="tab" aria-selected="${partIndex === 1}" title="Lectura - Parte 2">2</button>
        </nav>
        <div class="cb-reading-stage ${partIndex === 0 ? "cb-reading-stage--part-1" : "cb-reading-stage--part-2"}" ${imageUrl ? `style="--cb-reading-bg-image: url('${imageUrl}');"` : ""}>
          <div class="cb-reading-content cb-reading-textbox ${partIndex === 0 ? "is-part-1-orange" : "is-part-2-orange is-part-2-compact"}">
            ${currentPartHtml}
          </div>
        </div>
      ` : ""}
      ${currentTab === "synonyms" ? renderSynonymsTab(synonyms, reading) : ""}
      ${currentTab === "questions" ? renderQuestionsTab(questions) : ""}
    </div>

    <footer class="cb-drawer-footer">
      <div class="cb-drawer-footer-actions">
        <button type="button" class="cb-drawer-btn color-copy" data-drawer-action="copy" title="Copiar texto">
          <i class="fas fa-copy"></i>
        </button>
        <div class="cb-drawer-divider"></div>
        <button type="button" class="cb-drawer-btn color-edit" data-drawer-action="edit" title="Editar lectura">
          <i class="fas fa-pen-to-square"></i>
        </button>
      </div>
      <button type="button" class="cb-drawer-btn color-danger" data-drawer-action="remove" title="Quitar lectura">
        <i class="fas fa-trash"></i>
      </button>
    </footer>
  `;
}

function renderSynonymsTab(synonyms, reading) {
  if (reading.sections?.synonymsHtml) {
    return `<div class="cb-synonyms-table-wrap">${reading.sections.synonymsHtml}</div>`;
  }
  if (!synonyms.length) return `<p style="color:var(--cb-up-muted);">No hay tabla de sinónimos configurada.</p>`;

  return `
    <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
      <thead>
        <tr style="border-bottom:2px solid var(--cb-up-border); text-align:left;">
          <th style="padding:0.5rem;">Palabra</th>
          <th style="padding:0.5rem;">Sinónimo</th>
        </tr>
      </thead>
      <tbody>
        ${synonyms.map((s) => `
          <tr style="border-bottom:1px solid var(--cb-up-border);">
            <td style="padding:0.5rem; font-weight:600;">${escapeHtml(s.palabra || s.word || "")}</td>
            <td style="padding:0.5rem; color:var(--cb-up-accent);">${escapeHtml(s.sinonimo || s.synonym || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderQuestionsTab(questions) {
  if (!questions.length) return `<p style="color:var(--cb-up-muted);">No hay preguntas de comprensión registradas.</p>`;

  return `
    <ol style="padding-left:1.25rem; display:flex; flex-direction:column; gap:0.75rem;">
      ${questions.map((q) => {
        const text = typeof q === "string" ? q : q.texto || q.pregunta || q.prompt || "";
        const ans = q.respuesta || q.answer || "";
        return `
          <li>
            <strong>${escapeHtml(text)}</strong>
            ${ans ? `<div class="answer" style="margin-top:0.3rem;"><span style="color:magenta;">Respuesta: ${escapeHtml(ans)}</span></div>` : ""}
          </li>
        `;
      }).join("")}
    </ol>
  `;
}

function normalizeResourceType(value = "") {
  if (typeof value === "object" && value !== null) {
    value = [value.code, value.title, value.context, value.type].filter(Boolean).join(" ");
  }
  const text = String(value || "").toLowerCase().trim();
  if (text.includes("ficha") || text.includes("worksheet")) return "ficha";
  if (text.includes("anexo") || text.includes("annex")) return "anexo";
  if (text.includes("recortable") || text.includes("cutout")) return "recortable";
  if (text.includes("video") || text.includes("guion") || text.includes("guión") || text.includes("video-script")) return "video";
  return "";
}

export function formatResourceCode(resource = {}, unit = {}, index = 0) {
  const type = normalizeResourceType(resource);
  const unitNum = String(unit?.meta?.unit || "1").replace(/\D+/g, "") || "1";

  if (type === "video") {
    return "Guion de Video";
  }

  const label = type === "ficha" ? "Ficha"
    : type === "anexo" ? "Anexo"
    : type === "recortable" ? "Recortable"
    : "Recurso";

  // Identificar posición secuencial entre los recursos del mismo tipo en la unidad
  const sameTypeResources = (unit?.accepted?.resources || []).filter(r => normalizeResourceType(r) === type);
  let typeIndex = resource.id ? sameTypeResources.findIndex(r => r.id === resource.id) : -1;
  if (typeIndex < 0) typeIndex = sameTypeResources.indexOf(resource);
  if (typeIndex < 0 && resource.code) typeIndex = sameTypeResources.findIndex(r => r.code === resource.code);
  if (typeIndex === -1) {
    typeIndex = index >= 0 ? index : 0;
  }
  const sequentialLetter = String.fromCharCode(97 + (typeIndex % 26));

  return `${label} ${unitNum}${sequentialLetter}`;
}

export function formatFichaDisplayTitle(resource = {}, unit = {}, index = 0) {
  const code = formatResourceCode(resource, unit, index);
  const rawTitle = resource.title || resource.subtopic || resource.context || "Trabajo autónomo";
  const cleanTitle = String(rawTitle)
    .replace(/^(?:Ficha(?:\s+de\s+(?:refuerzo|trabajo))?(?:\s+[0-9]+[a-z]?)?)\s*[:\-–—]\s*/i, "")
    .replace(/^Actividad(?:es)?(?:\s*\d+)?\s*[:\-–—]\s*/i, "")
    .trim();
  return cleanTitle ? `${code}: ${cleanTitle}` : code;
}

export function cleanResourceDisplayHtml(rawHtml = "") {
  if (!rawHtml || !rawHtml.includes("<table")) return rawHtml;
  if (typeof DOMParser === "undefined") return rawHtml;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${rawHtml}</div>`, "text/html");
    const root = doc.body.firstElementChild || doc.body;

    root.querySelectorAll("table").forEach((table) => {
      table.classList.add("cb-video-script-table");
      const ths = Array.from(table.querySelectorAll("th"));
      const escenaIdx = ths.findIndex((th) => /escena/i.test(th.textContent.trim()));
      if (escenaIdx !== -1) {
        ths[escenaIdx].remove();
        table.querySelectorAll("tbody tr, tr").forEach((tr) => {
          const cells = Array.from(tr.querySelectorAll("td"));
          if (cells[escenaIdx]) cells[escenaIdx].remove();
        });
      }
    });

    return root.innerHTML;
  } catch (_) {
    return rawHtml;
  }
}

function renderResourceDrawerLayout(resource, activity, unit, session) {
  if (!activity && (resource?.activityId || resource?.subtopic || resource?.title || resource?.code)) {
    activity = (unit?.accepted?.activities || []).find((a) => {
      if (resource.activityId && (a.id === resource.activityId || a.sectionId === resource.activityId)) return true;
      if (resource.targetActivityId && (a.id === resource.targetActivityId)) return true;
      if (resource.subtopic && a.subtopic && String(a.subtopic).toLowerCase().includes(String(resource.subtopic).toLowerCase())) return true;
      if (resource.title && a.title && String(resource.title).toLowerCase().includes(String(a.title).toLowerCase())) return true;
      const idxMatch = String(resource.id || resource.code || "").match(/(?:ficha|anexo|recortable|video|res)[-_](\d+)[-_](\d+)/i);
      if (idxMatch) {
        const actIdx = parseInt(idxMatch[2], 10) - 1;
        const allActs = unit?.accepted?.activities || [];
        if (allActs[actIdx]) return true;
      }
      return false;
    });
  }

  const normType = normalizeResourceType(resource);
  const sameTypeResources = (unit?.accepted?.resources || []).filter(r => normalizeResourceType(r) === normType);
  let typeIndex = resource.id ? sameTypeResources.findIndex(r => r.id === resource.id) : -1;
  if (typeIndex < 0) typeIndex = sameTypeResources.indexOf(resource);
  if (typeIndex < 0 && resource.code) typeIndex = sameTypeResources.findIndex(r => r.code === resource.code);

  const cleanCode = formatResourceCode(resource, unit, typeIndex);
  const subtopicLabel = activity 
    ? (activity.subtopic || activity.section || activity.title || "")
    : (resource.subtopic || resource.context || resource.title || "");
  const cleanSubtopic = cleanResourceSubtopicTitle(subtopicLabel || resource.title || "");
  const formattedSubtopic = cleanSubtopic || (subtopicLabel 
    ? formatSubtopicLabel(subtopicLabel).replace(/^Actividad(?:es)?(?:\s*\d+)?\s*[:\-–—]\s*/i, "").trim() 
    : "");
  const resourceTitle = normType === "ficha"
    ? formatFichaDisplayTitle(resource, unit, typeIndex)
    : (formattedSubtopic ? `${cleanCode}: ${formattedSubtopic}` : cleanCode);

  let displayHtml = cleanResourceDisplayHtml(resource.html || "<p>Sin contenido visual.</p>");
  const resourceGrade = unit.meta?.grade || session?.academicMeta?.grade || "";
  const resourceIsBoxGrade = /primero|segundo|^[12]\b/i.test(resourceGrade);
  const resourceStyleClass = resourceIsBoxGrade ? "cb-response-style-box" : "cb-response-style-line";
  const resourceGradeClass = /primero|segundo|tercero|^[123]\b/i.test(resourceGrade) ? "is-primaria-baja" : "is-primaria-alta";
  if (normType === "ficha") {
    displayHtml = replaceEmojisWithIcTags(displayHtml);
    displayHtml = normalizeActivityInstructionBold(displayHtml);
    displayHtml = formatActivityHtmlWithResponseLines(displayHtml, getActivityIconInfo(activity || {}, false, unit.meta?.category).color || "#0ea5e9");
    displayHtml = formatIcTags(displayHtml);
  }

  drawerEl.innerHTML = `
    <header class="cb-drawer-header">
      <div class="cb-drawer-header-left">
        <h3 class="cb-drawer-title">${escapeHtml(resourceTitle)}</h3>
      </div>
      <button type="button" class="cb-drawer-close-btn" data-drawer-action="close" aria-label="Cerrar inspector">
        <i class="fas fa-times"></i>
      </button>
    </header>

    <nav class="cb-drawer-tabs" role="tablist">
      <button type="button" class="cb-drawer-tab is-active" role="tab">
        <i class="fas ${getResourceIcon(resource.type)}"></i>
        <span>Recurso</span>
      </button>
      ${activity ? `
      <button type="button" class="cb-drawer-tab" data-nav-to-activity="teacher" role="tab" title="Ver actividades del subtema">
        <i class="fas fa-chalkboard-user"></i>
        <span>Actividades</span>
      </button>
      <button type="button" class="cb-drawer-tab" data-nav-to-activity="sya" role="tab" title="Ver ejes SyA">
        <i class="fas fa-list-check"></i>
        <span>Ejes SyA</span>
      </button>
      <button type="button" class="cb-drawer-tab" data-nav-to-activity="notes" role="tab" title="Ver notas del maestro">
        <i class="fas fa-note-sticky"></i>
        <span>Notas del Maestro</span>
      </button>
      ` : ""}
    </nav>

    <div class="cb-drawer-body">
      ${renderMathActivitySelector(currentItem.resourcePages, currentItem.resourcePageIndex, "data-resource-page-tab")}
      <div class="cb-drawer-resource-content ${normType === "ficha" ? `${resourceStyleClass} ${resourceGradeClass}` : ""}">${displayHtml}</div>
    <div class="cb-drawer-footer cb-drawer-page-toolbar" role="toolbar" aria-label="Acciones de esta página de recurso" data-page-id="${escapeHtml(resource.id || "")}">
      <div class="cb-drawer-footer-actions">
        <button type="button" class="cb-drawer-btn color-copy" data-drawer-action="copy" title="Copiar">
          <i class="fas fa-copy"></i>
        </button>
        <div class="cb-drawer-divider"></div>
        <button type="button" class="cb-drawer-btn color-edit" data-drawer-action="edit" title="Editar">
          <i class="fas fa-pen-to-square"></i>
        </button>
        <div class="cb-drawer-divider"></div>
        <button type="button" class="cb-drawer-btn color-regenerate" data-drawer-action="regenerate" title="Regenerar">
          <i class="fas fa-rotate"></i>
        </button>
        <button type="button" class="cb-drawer-btn cb-drawer-difficulty-btn" data-drawer-difficulty="easier" title="Hacer más fácil este recurso"><i class="fas fa-feather" aria-hidden="true"></i></button>
        <button type="button" class="cb-drawer-btn cb-drawer-difficulty-btn" data-drawer-difficulty="harder" title="Hacer más difícil este recurso"><i class="fas fa-mountain" aria-hidden="true"></i></button>
      </div>
      <button type="button" class="cb-drawer-btn color-danger" data-drawer-action="remove" title="Eliminar recurso">
        <i class="fas fa-trash"></i>
      </button>
    </div>
    <button type="button" class="cb-drawer-add-page" data-drawer-action="add-resource"><i class="fas fa-plus" aria-hidden="true"></i> Añadir página de recurso</button>
    </div>
  `;
}

export function findResourceActivity(resource = {}, unit = {}) {
  const activities = unit?.accepted?.activities || [];
  if (!activities.length) return null;

  if (resource.activityId) {
    const act = activities.find((a) => String(a.id) === String(resource.activityId) || String(a.sectionId) === String(resource.activityId));
    if (act) return act;
  }
  if (resource.targetActivityId) {
    const act = activities.find((a) => String(a.id) === String(resource.targetActivityId));
    if (act) return act;
  }
  if (resource.subtopic) {
    const norm = String(resource.subtopic).toLowerCase().replace(/[^a-z0-9]/g, "");
    const act = activities.find((a) => a.subtopic && String(a.subtopic).toLowerCase().replace(/[^a-z0-9]/g, "") === norm);
    if (act) return act;
  }
  const idxMatch = String(resource.id || resource.code || "").match(/(?:ficha|anexo|recortable|video|res)[-_](\d+)[-_](\d+)/i);
  if (idxMatch) {
    const actIdx = parseInt(idxMatch[2], 10) - 1;
    if (activities[actIdx]) return activities[actIdx];
  }
  return null;
}

export function findFichaTeacherNote(ficha = {}, unit = {}, index = 0) {
  if (!ficha) return null;
  if (Array.isArray(ficha.notes) && ficha.notes.length > 0 && (ficha.notes[0]?.html || ficha.notes[0]?.content)) {
    return ficha.notes[0];
  }
  const artifactNotesHtml = ficha.artifact?.teacherNotesHtml || ficha.teacherNotesHtml || "";
  if (artifactNotesHtml) {
    return {
      id: `ficha-note-${ficha.id || index}`,
      resourceId: ficha.id,
      html: artifactNotesHtml,
      title: `NDM: ${formatFichaDisplayTitle(ficha, unit, index)}`
    };
  }
  const allNotes = [
    ...(unit?.accepted?.teacherNotes || []),
    ...(unit?.teacherNotes || []),
    ...(unit?.accepted?.notes || []),
    ...(unit?.notes || [])
  ];

  const fichaCodeNorm = String(ficha.code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const fichaCleanTitle = cleanResourceSubtopicTitle(ficha.title || "");
  const fichaTitleNorm = fichaCleanTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
  const fichaIndexCode = `ficha${index + 1}`;

  // Coincidencia por resourceId o id directo de la ficha
  const byId = allNotes.find((n) => n && (
    (n.resourceId && String(n.resourceId) === String(ficha.id)) ||
    (n.id && (String(n.id) === String(ficha.id) || String(n.id) === `ficha-${ficha.id}`))
  ));
  if (byId) return byId;

  // Coincidencia por título de la ficha
  const byTitle = allNotes.find((n) => {
    if (!n?.title) return false;
    const noteTitleNorm = String(n.title).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (fichaCodeNorm && noteTitleNorm.includes(fichaCodeNorm)) return true;
    if (noteTitleNorm.includes(fichaIndexCode)) return true;
    if (fichaTitleNorm && fichaTitleNorm.length > 3 && (noteTitleNorm.includes(fichaTitleNorm) || fichaTitleNorm.includes(noteTitleNorm))) return true;
    return false;
  });
  if (byTitle) return byTitle;

  // Coincidencia a través de la actividad vinculada
  const linkedActivity = findResourceActivity(ficha, unit);
  if (linkedActivity) {
    if (Array.isArray(linkedActivity.notes) && linkedActivity.notes.length > 0 && (linkedActivity.notes[0]?.html || linkedActivity.notes[0]?.content)) {
      return linkedActivity.notes[0];
    }
    const byActId = allNotes.find((n) => n && (
      (n.activityId && (String(n.activityId) === String(linkedActivity.id) || String(n.activityId) === String(linkedActivity.sectionId)))
    ));
    if (byActId) return byActId;

    if (linkedActivity.subtopic) {
      const actSubNorm = String(linkedActivity.subtopic).toLowerCase().replace(/[^a-z0-9]/g, "");
      if (actSubNorm.length > 3) {
        const byActSub = allNotes.find((n) => {
          const nSubNorm = String(n?.subtopic || n?.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          return nSubNorm && (nSubNorm.includes(actSubNorm) || actSubNorm.includes(nSubNorm));
        });
        if (byActSub) return byActSub;
      }
    }
  }

  // Coincidencia por subtopic o context de la ficha
  if (ficha.subtopic || ficha.context) {
    const subNorm = String(ficha.subtopic || ficha.context).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (subNorm.length > 3) {
      const bySub = allNotes.find((n) => {
        const nSubNorm = String(n?.subtopic || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const nTitleNorm = String(n?.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        return (nSubNorm && (nSubNorm.includes(subNorm) || subNorm.includes(nSubNorm))) ||
               (nTitleNorm && (nTitleNorm.includes(subNorm) || subNorm.includes(nTitleNorm)));
      });
      if (bySub) return bySub;
    }
  }

  // Coincidencia por sección <h3> dentro de notas globales
  for (const n of allNotes) {
    const html = String(n?.html || n?.content || "");
    if (!html.includes("<h3")) continue;
    if (typeof DOMParser !== "undefined") {
      try {
        const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
        const headings = Array.from(doc.querySelectorAll("h3, h4"));
        for (const h of headings) {
          const hNorm = h.textContent.toLowerCase().replace(/[^a-z0-9]/g, "");
          if ((fichaCodeNorm && hNorm.includes(fichaCodeNorm)) || (fichaTitleNorm && fichaTitleNorm.length > 3 && hNorm.includes(fichaTitleNorm))) {
            let sectionHtml = h.outerHTML;
            let next = h.nextElementSibling;
            while (next && !["H3", "H4"].includes(next.tagName)) {
              sectionHtml += next.outerHTML;
              next = next.nextElementSibling;
            }
            return {
              id: `extracted-${ficha.id || index}`,
              resourceId: ficha.id,
              html: sectionHtml,
              title: `NDM: ${formatFichaDisplayTitle(ficha, unit, index)}`
            };
          }
        }
      } catch (_) {}
    }
  }

  return null;
}

function renderTeacherNotesDrawerLayout(note, unit, session, activity, resource, mathNotes = [], mathNoteIndex = 0, fichaNotes = [], fichaNoteIndex = 0) {
  if (!activity && (resource || note?.activityId || note?.subtopic || note?.title)) {
    if (resource) {
      activity = findResourceActivity(resource, unit);
    }
    if (!activity) {
      activity = (unit?.accepted?.activities || []).find((a) => {
        if (note?.activityId && (a.id === note.activityId || a.sectionId === note.activityId)) return true;
        if (note?.subtopic && a.subtopic && String(a.subtopic).toLowerCase().includes(String(note.subtopic).toLowerCase())) return true;
        if (note?.title && a.title && String(note.title).toLowerCase().includes(String(a.title).toLowerCase())) return true;
        return false;
      });
    }
  }

  const linkedResources = activity
    ? (unit?.accepted?.resources || []).filter((r) => String(r.activityId) === String(activity.id) || String(r.targetActivityId) === String(activity.id))
    : [];

  const isFichaMode = Boolean(fichaNotes.length > 0 || (resource && getResourceBadgeMeta(resource).type === "ficha"));
  const cleanFullResourceTitle = isFichaMode
    ? formatFichaDisplayTitle(resource, unit, fichaNoteIndex)
    : (resource ? (cleanResourceSubtopicTitle(resource.title || resource.subtopic || "") ? `${resource.code || "Recurso"}: ${cleanResourceSubtopicTitle(resource.title || resource.subtopic || "")}` : (resource.code || "Recurso")) : "");

  let cleanTitle = "";
  if (fichaNotes.length > 1) {
    cleanTitle = "Fichas de trabajo";
  } else if (activity) {
    cleanTitle = formatSubtopicLabel(activity.subtopic || note?.subtopic || activity.section || activity.title || "Subtema");
  } else if (resource) {
    cleanTitle = cleanFullResourceTitle;
  } else if (note?.title) {
    cleanTitle = String(note.title)
      .replace(/^NDM:\s*/i, "")
      .replace(/^Nota(?:s)?\s+(?:del\s+maestro|para\s+el\s+docente):\s*/i, "")
      .replace(/^(?:Orientaciones\s+(?:metodol[oó]gicas|docentes|pedag[oó]gicas)|Notas\s+del\s+maestro)(?:\s+por\s+actividad)?\s*[:\-–—]?\s*/i, "")
      .replace(/^Actividad(?:es)?(?:\s*\d+)?\s*[:\-–—]\s*/i, "")
      .trim();
  }
  if (!cleanTitle || /^(?:Orientaciones|Notas del Maestro)$/i.test(cleanTitle)) {
    cleanTitle = activity ? "Actividad" : (resource ? "Ficha" : "Orientación");
  }
  const noteTitle = cleanTitle.startsWith("NDM:") ? cleanTitle : `NDM: ${cleanTitle}`;
  const activityTitle = activity
    ? formatSubtopicLabel(activity.title || activity.subtopic || activity.section || "Actividad")
    : cleanFullResourceTitle;
  const activityColor = activity
    ? getActivityIconInfo(activity, isProjectSelection(unit?.meta || {}), unit?.meta?.category).color
    : (resource ? "#2563eb" : "var(--cb-up-text)");

  let rawHtml = note?.html || note?.content || note?.text || (resource?.notes && resource.notes[0]?.html) || (activity?.notes && activity.notes[0]?.html) || "";

  if (!rawHtml && resource) {
    const foundNote = findFichaTeacherNote(resource, unit, fichaNoteIndex);
    if (foundNote?.html || foundNote?.content || foundNote?.text) {
      rawHtml = foundNote.html || foundNote.content || foundNote.text;
    }
  }

  if (!rawHtml && activity) {
    rawHtml = (activity.notes && activity.notes[0]?.html) || "";
  }

  if (!rawHtml) {
    const allNotes = [
      ...(activity?.notes || []),
      ...(resource?.notes || []),
      ...(unit?.accepted?.teacherNotes || []),
      ...(unit?.accepted?.notes || []),
      ...(unit?.teacherNotes || []),
      ...(unit?.notes || [])
    ];
    const match = allNotes.find((n) => {
      if (!n) return false;
      if (activity && n.activityId && (String(n.activityId) === String(activity.id) || String(n.activityId) === String(activity.sectionId))) return true;
      if (resource && n.resourceId && String(n.resourceId) === String(resource.id)) return true;
      if (activity?.subtopic && n.subtopic && String(n.subtopic).toLowerCase().includes(String(activity.subtopic).toLowerCase())) return true;
      if (activity?.title && n.title && String(n.title).toLowerCase().includes(String(activity.title).toLowerCase())) return true;
      if (resource?.code && n.title && n.title.includes(resource.code)) return true;
      return false;
    });
    if (match) {
      rawHtml = match.html || match.content || match.text || "";
    }
  }

  let formattedFichaHtml = "";
  let resourceStyleClass = "cb-response-style-line";
  let resourceGradeClass = "is-primaria-alta";
  if (resource) {
    formattedFichaHtml = cleanResourceDisplayHtml(resource.html || "<p>Sin contenido visual.</p>");
    const grade = unit?.meta?.grade || session?.academicMeta?.grade || "";
    const isBoxGrade = /primero|segundo|^[12]\b/i.test(grade);
    resourceStyleClass = isBoxGrade ? "cb-response-style-box" : "cb-response-style-line";
    resourceGradeClass = /primero|segundo|tercero|^[123]\b/i.test(grade) ? "is-primaria-baja" : "is-primaria-alta";
    formattedFichaHtml = replaceEmojisWithIcTags(formattedFichaHtml);
    formattedFichaHtml = normalizeActivityInstructionBold(formattedFichaHtml);
    formattedFichaHtml = formatActivityHtmlWithResponseLines(formattedFichaHtml, "#2563eb", null, unit?.meta?.category || "");
    formattedFichaHtml = formatIcTags(formattedFichaHtml);
  }

  drawerEl.innerHTML = `
    <header class="cb-drawer-header">
      <div class="cb-drawer-header-left">
        <h3 class="cb-drawer-title" style="color: ${escapeHtml(activityColor)};">${escapeHtml(isFichaMode ? (currentTab === "ficha" ? cleanFullResourceTitle : noteTitle) : noteTitle)}</h3>
      </div>
      <button type="button" class="cb-drawer-close-btn" data-drawer-action="close" aria-label="Cerrar inspector">
        <i class="fas fa-times"></i>
      </button>
    </header>

    <nav class="cb-drawer-tabs" role="tablist">
      ${isFichaMode ? `
      <button type="button" class="cb-drawer-tab ${currentTab === "notes" ? "is-active" : ""}" data-drawer-tab="notes" role="tab">
        <i class="fas fa-note-sticky"></i>
        <span>Notas del Maestro</span>
      </button>
      <button type="button" class="cb-drawer-tab ${currentTab === "ficha" ? "is-active" : ""}" data-drawer-tab="ficha" role="tab">
        <i class="fas fa-file-lines"></i>
        <span>Ficha de trabajo</span>
      </button>
      ` : `
      <button type="button" class="cb-drawer-tab is-active" role="tab">
        <i class="fas fa-note-sticky"></i>
        <span>Notas del Maestro</span>
      </button>
      `}
      ${activity ? `
      <button type="button" class="cb-drawer-tab" data-nav-to-activity="teacher" role="tab" title="Ver actividad vinculada (${escapeHtml(activity.title || activity.subtopic || 'Actividad')})">
        <i class="fas fa-chalkboard-user"></i>
        <span>Actividad vinculada</span>
      </button>
      <button type="button" class="cb-drawer-tab" data-nav-to-activity="sya" role="tab" title="Ver ejes SyA">
        <i class="fas fa-list-check"></i>
        <span>Ejes SyA</span>
      </button>
      ` : ""}
    </nav>

    <div class="cb-drawer-body">
      ${mathNotes.length > 1 ? renderMathActivitySelector(mathNotes.map((entry) => ({ title: entry.activity?.title })), mathNoteIndex, "data-math-note-tab") : ""}
      ${fichaNotes.length > 1 ? renderMathActivitySelector(fichaNotes.map((entry, index) => ({
        title: formatFichaDisplayTitle(entry.resource, unit, index)
      })), fichaNoteIndex, "data-ficha-note-tab") : ""}
      ${isFichaMode && currentTab === "ficha" ? `
        <div class="cb-drawer-resource-content ${resourceStyleClass} ${resourceGradeClass}">
          <h2 class="cb-activity-title" style="color: #2563eb;"><span class="cb-activity-title-text">${escapeHtml(cleanFullResourceTitle)}</span></h2>
          ${formattedFichaHtml}
        </div>
      ` : `
        <div class="cb-drawer-teacher-notes-view">
          ${rawHtml ? `
            <div class="cb-teacher-note-sheet">
              ${rawHtml}
            </div>
          ` : `
            <div style="text-align: center; padding: 1.5rem 1rem; color: var(--cb-up-muted); background: var(--cb-up-surface, #f8fafc); border-radius: 12px; margin-bottom: 1.25rem; border: 1px dashed #cbd5e1;">
              <i class="fas fa-chalkboard-user" style="font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.4;"></i>
              <p style="font-weight:600; margin-bottom: 0.25rem;">${isFichaMode ? "Aún no se ha redactado la nota pedagógica de esta ficha." : "Aún no se ha redactado la nota del maestro para esta actividad."}</p>
              <p style="font-size:0.8rem; margin-bottom: 0.75rem;">Puedes redactarla con Charly MCP:</p>
              <button type="button" class="cb-btn cb-btn--primary" data-drawer-action="create-teacher-notes" style="margin: 0 auto; display: inline-flex; align-items: center; gap: 8px; padding: 9px 20px; font-size: 13px; font-weight: 600; border-radius: 9999px; background: #2563eb; color: #ffffff !important; border: none; cursor: pointer; box-shadow: 0 2px 6px rgba(37, 99, 235, 0.28);">
                <i class="fas fa-pen-nib" aria-hidden="true"></i>
                <span>${isFichaMode ? "Redactar nota para esta ficha" : "Crear notas del maestro"}</span>
              </button>
            </div>
            ${resource ? `
            <div class="cb-ficha-inline-preview" style="border-top: 1px solid #e2e8f0; padding-top: 1rem;">
              <p style="font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 0.75rem;">
                <i class="fas fa-eye" style="margin-right: 4px;"></i> Contenido de la Ficha del Alumno:
              </p>
              <div class="cb-drawer-resource-content ${resourceStyleClass} ${resourceGradeClass}">
                ${formattedFichaHtml}
              </div>
            </div>
            ` : ""}
          `}
        </div>
      `}
    <div class="cb-drawer-footer cb-drawer-page-toolbar" role="toolbar" aria-label="Acciones de esta página de ${currentTab === "ficha" ? "ficha" : "nota"}" data-page-id="${escapeHtml(currentTab === "ficha" ? resource?.id || "" : note?.id || "")}">
      <div class="cb-drawer-footer-actions">
        <button type="button" class="cb-drawer-btn color-copy" data-drawer-action="copy" title="${currentTab === 'ficha' ? 'Copiar ficha' : 'Copiar notas'}">
          <i class="fas fa-copy"></i>
        </button>
        <div class="cb-drawer-divider"></div>
        <button type="button" class="cb-drawer-btn color-edit" data-drawer-action="edit" title="${currentTab === 'ficha' ? 'Editar ficha' : 'Editar notas'}">
          <i class="fas fa-pen-to-square"></i>
        </button>
        <div class="cb-drawer-divider"></div>
        <button type="button" class="cb-drawer-btn color-regenerate" data-drawer-action="regenerate" title="${currentTab === 'ficha' ? 'Regenerar ficha' : 'Regenerar notas'}">
          <i class="fas fa-rotate"></i>
        </button>
      </div>
      <button type="button" class="cb-drawer-btn color-danger" data-drawer-action="remove" title="Eliminar">
        <i class="fas fa-trash"></i>
      </button>
    </div>
    <button type="button" class="cb-drawer-add-page" data-drawer-action="create-teacher-notes"><i class="fas fa-plus" aria-hidden="true"></i> Añadir página de nota</button>
    </div>
  `;
}

function bindDrawerEvents() {
  if (!drawerEl) return;
  drawerEl.querySelectorAll(".cb-drawer-page-toolbar button[title]").forEach((button) => {
    if (!button.hasAttribute("aria-label")) button.setAttribute("aria-label", button.title);
  });

  drawerEl.querySelectorAll("[data-resource-page-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.resourcePageTab);
      const resource = currentItem?.resourcePages?.[index];
      if (!resource) return;
      currentItem.data = resource;
      currentItem.resourcePageIndex = index;
      currentItem.activity = findResourceActivity(resource, currentItem.unit);
      renderDrawerContent();
    });
  });

  drawerEl.querySelectorAll("[data-math-activity-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.mathActivityTab);
      const activity = currentItem?.mathActivities?.[index];
      if (!activity) return;
      currentItem.data = activity;
      currentItem.mathActivityIndex = index;
      renderDrawerContent();
    });
  });
  drawerEl.querySelectorAll("[data-math-note-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.mathNoteTab);
      const selection = currentItem?.mathNotes?.[index];
      if (!selection) return;
      currentItem.data = selection.note || { title: `NDM: ${selection.activity?.title || "Matemáticas"}`, html: "" };
      currentItem.activity = selection.activity;
      currentItem.mathNoteIndex = index;
      renderDrawerContent();
    });
  });

  drawerEl.querySelectorAll("[data-ficha-note-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.fichaNoteTab);
      const selection = currentItem?.fichaNotes?.[index];
      if (!selection) return;
      const fullTitle = formatFichaDisplayTitle(selection.resource, currentItem?.unit, index);
      currentItem.data = selection.note || {
        id: selection.note?.id || `ficha-note-${selection.resource?.id || index}`,
        resourceId: selection.resource?.id || "",
        title: `NDM: ${fullTitle}`,
        html: ""
      };
      currentItem.resource = selection.resource;
      currentItem.fichaNoteIndex = index;
      renderDrawerContent();
    });
  });

  drawerEl.querySelectorAll("[data-reading-part]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.readingPart) || 0;
      currentItem.readingPartIndex = index;
      renderDrawerContent();
    });
  });

  drawerEl.querySelectorAll("[data-info-regenerate]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (currentItem?.type !== "activity") return;
      const card = button.closest(".cb-card-strategy, .cb-card-learn-more, .cb-drawer-info-card");
      currentCallbacks.onRegenerateInfo?.({
        activityId: currentItem.data.id,
        unitId: currentItem.unit?.id,
        kind: button.dataset.infoRegenerate,
        content: card?.innerText?.replace(button.innerText, "").trim() || ""
      });
    });
  });

  // Tabs switching
  drawerEl.querySelectorAll("[data-drawer-tab]").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      currentTab = tabBtn.dataset.drawerTab;
      renderDrawerContent();
    });
  });

  // Navigation from teacher notes drawer to activity/sya/resources
  drawerEl.querySelectorAll("[data-nav-to-activity]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.navToActivity;
      let targetAct = currentItem?.activity;
      if (!targetAct && currentItem?.resource) {
        targetAct = findResourceActivity(currentItem.resource, currentItem?.unit);
      }
      if (!targetAct && currentItem?.data) {
        const d = currentItem.data;
        targetAct = (currentItem?.unit?.accepted?.activities || []).find((a) =>
          (d.activityId && (a.id === d.activityId || a.sectionId === d.activityId)) ||
          (d.subtopic && a.subtopic && String(a.subtopic).toLowerCase().includes(String(d.subtopic).toLowerCase())) ||
          (d.title && a.title && String(d.title).toLowerCase().includes(String(a.title).toLowerCase()))
        );
      }
      if (!targetAct && currentItem?.unit?.accepted?.activities?.length) {
        targetAct = currentItem.unit.accepted.activities[0];
      }
      if (targetAct) {
        openActivityDrawer({
          activity: targetAct,
          unit: currentItem?.unit,
          session: currentItem?.session,
          ...currentCallbacks,
          mathActivities: targetAct.mathGroup ? (currentItem?.unit?.accepted?.activities || []).filter((item) => item.mathGroup === targetAct.mathGroup).sort((a, b) => Number(a.mathIndex) - Number(b.mathIndex)) : [],
          initialMathActivityIndex: targetAct.mathGroup ? (currentItem?.unit?.accepted?.activities || []).filter((item) => item.mathGroup === targetAct.mathGroup).sort((a, b) => Number(a.mathIndex) - Number(b.mathIndex)).findIndex((item) => item.id === targetAct.id) : 0,
          initialTab: tab
        });
      }
    });
  });

  // Close button
  drawerEl.querySelector("[data-drawer-action='close']")?.addEventListener("click", closeUnitDrawer);

  drawerEl.querySelectorAll("[data-drawer-difficulty]").forEach((button) => button.addEventListener("click", () => {
    if (currentItem?.type === "activity") currentCallbacks.onAdjustDifficulty?.(currentItem.data.id, button.dataset.drawerDifficulty, null);
    else if (currentItem?.type === "resource") currentCallbacks.onAdjustDifficulty?.(currentItem.data.id, button.dataset.drawerDifficulty);
  }));

  drawerEl.querySelector("[data-sya-improve-all]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const resultPanel = drawerEl.querySelector("[data-sya-improve-result]");
    const unit = currentItem?.unit;
    const activity = currentItem?.data;
    const subtopic = String(activity?.subtopic || activity?.section || "").trim();
    if (!unit?.id || !subtopic || !currentCallbacks.onImproveSya || !resultPanel) return;
    const fields = Object.fromEntries(["T", "AE", "C", "P"].map((key) => [key, drawerEl.querySelector(`[data-sya-value-box='${key}'] span`)?.textContent?.trim() || ""]));
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    const label = button.querySelector("span");
    if (label) label.textContent = "Consultando el programa sintético…";
    try {
      const suggestion = await currentCallbacks.onImproveSya(subtopic, activity.category || activity.section || "", fields, unit.id);
      const sourceLinks = (suggestion.sources || []).map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title || "Documento SEP")}</a>`).join(" · ");
      resultPanel.innerHTML = `
        <p>${escapeHtml(suggestion.alignment || `Propuesta alineada con la Fase ${suggestion.phase} de Primaria.`)}</p>
        <dl>${["T", "AE", "C", "P"].map((key) => `<div><dt>${({ T: "Tema", AE: "PDA / aprendizaje", C: "Contenido", P: "Proceso o práctica" })[key]}</dt><dd>${escapeHtml(suggestion.fields[key])}</dd></div>`).join("")}</dl>
        ${sourceLinks ? `<p class="cb-drawer-sya-sources">Fuentes oficiales: ${sourceLinks}</p>` : ""}
        <div class="cb-drawer-sya-improve-actions"><button type="button" data-sya-improve-cancel>Descartar</button><button type="button" class="is-primary" data-sya-improve-apply>Aplicar los 4 campos</button></div>`;
      resultPanel.hidden = false;
      resultPanel.querySelector("[data-sya-improve-cancel]")?.addEventListener("click", () => { resultPanel.hidden = true; resultPanel.innerHTML = ""; });
      resultPanel.querySelector("[data-sya-improve-apply]")?.addEventListener("click", async (applyEvent) => {
        const applyButton = applyEvent.currentTarget;
        applyButton.disabled = true;
        try {
          await currentCallbacks.onSaveSya?.(subtopic, suggestion.fields, unit.id);
          Object.entries(suggestion.fields).forEach(([key, value]) => {
            const valueBox = drawerEl.querySelector(`[data-sya-value-box='${key}']`);
            if (valueBox) valueBox.innerHTML = `<span>${escapeHtml(value)}</span>`;
          });
          resultPanel.innerHTML = `<p>Los cuatro campos quedaron actualizados para <strong>${escapeHtml(subtopic)}</strong>.</p>`;
        } catch (error) {
          applyButton.disabled = false;
          resultPanel.insertAdjacentHTML("afterbegin", `<p role="alert">${escapeHtml(error.message || "No se guardaron los cambios.")}</p>`);
        }
      });
    } catch (error) {
      resultPanel.innerHTML = `<p role="alert">${escapeHtml(error.message || "No se pudo mejorar la secuencia.")}</p>`;
      resultPanel.hidden = false;
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      if (label) label.textContent = "Mejorar los 4 campos con la NEM";
    }
  });

  drawerEl.querySelector("[data-reading-image-reveal]")?.addEventListener("click", (event) => {
    const button = event.currentTarget;
    const illustration = drawerEl.querySelector(".cb-reading-illustration");
    if (!illustration) return;
    illustration.classList.add("is-visible");
    illustration.setAttribute("aria-hidden", "false");
    button.setAttribute("aria-expanded", "true");
    button.classList.remove("is-spotlight");
    illustration.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // Copy action
  drawerEl.querySelector("[data-drawer-action='copy']")?.addEventListener("click", async () => {
    if (!currentItem?.data) return;
    let textToCopy = "";
    if (currentItem.type === "teacher-notes" && currentTab === "ficha" && currentItem.resource) {
      textToCopy = currentItem.resource.html || currentItem.resource.text || "";
    } else {
      textToCopy = currentItem.data.html || currentItem.data.text || "";
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      const copyBtn = drawerEl.querySelector("[data-drawer-action='copy']");
      if (copyBtn) {
        const orig = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check" style="color:#10b981;"></i><span>¡Copiado!</span>';
        setTimeout(() => { copyBtn.innerHTML = orig; }, 1800);
      }
    } catch (_) {}
  });

  // Edit action
  drawerEl.querySelector("[data-drawer-action='edit']")?.addEventListener("click", (e) => {
    if (!currentItem) return;
    const btn = e.currentTarget;
    const isSaving = btn.classList.contains("is-saving");
    const body = drawerEl.querySelector(".cb-drawer-body");
    
    let targetContainer = null;
    if (currentItem.type === "activity") targetContainer = body.querySelector(".cb-drawer-teacher-view");
    else if (currentItem.type === "reading") targetContainer = body.querySelector(".cb-reading-content") || body;
    else if (currentItem.type === "resource") targetContainer = body.querySelector(".cb-drawer-resource-content") || body;
    else if (currentItem.type === "teacher-notes") {
      targetContainer = currentTab === "ficha"
        ? (body.querySelector(".cb-drawer-resource-content") || body)
        : (body.querySelector(".cb-teacher-note-sheet") || body);
    }
    
    if (!targetContainer) return;

    if (isSaving) {
      targetContainer.removeAttribute("contenteditable");
      btn.classList.remove("is-saving", "color-regenerate");
      btn.classList.add("color-edit");
      btn.innerHTML = '<i class="fas fa-pen-to-square"></i>';
      btn.title = "Editar";
      
      const nextHtml = targetContainer.innerHTML;
      const { type, data, unit, resource } = currentItem;
      if (type === "activity") currentCallbacks.onEdit?.(data.id, unit.id, nextHtml);
      else if (type === "reading") {
        let fullNarrative = nextHtml;
        if (currentItem.readingParts) {
          const partIndex = currentItem.readingPartIndex === 1 ? 1 : 0;
          if (partIndex === 0) currentItem.readingParts.part1 = nextHtml;
          else currentItem.readingParts.part2 = nextHtml;
          const figureHtml = currentItem.readingParts.imageUrl ? `<figure class="cb-reading-illustration" aria-hidden="true"><img src="${currentItem.readingParts.imageUrl}" alt="" loading="lazy"></figure>` : "";
          fullNarrative = `${figureHtml}${currentItem.readingParts.part1}\n${currentItem.readingParts.part2}`;
        }
        currentCallbacks.onEdit?.("narrative", unit.id, fullNarrative);
      }
      else if (type === "resource") currentCallbacks.onEdit?.(data.id, unit.id, nextHtml);
      else if (type === "teacher-notes") {
        if (currentTab === "ficha" && resource) {
          resource.html = nextHtml;
          currentCallbacks.onEdit?.(resource.id, unit?.id, nextHtml);
        } else {
          if (currentItem.fichaNotes && currentItem.fichaNotes[currentItem.fichaNoteIndex]) {
            currentItem.fichaNotes[currentItem.fichaNoteIndex].note = {
              ...(currentItem.fichaNotes[currentItem.fichaNoteIndex].note || {}),
              id: data.id || `ficha-note-${resource?.id || currentItem.fichaNoteIndex}`,
              resourceId: resource?.id || "",
              html: nextHtml
            };
          }
          data.html = nextHtml;
          const targetId = data.id || (resource ? resource.id : data.activityId);
          if (currentCallbacks.onSave) currentCallbacks.onSave(targetId, nextHtml, unit?.id);
          else if (currentCallbacks.onEdit) currentCallbacks.onEdit(targetId, unit?.id, nextHtml);
        }
      }
    } else {
      targetContainer.setAttribute("contenteditable", "true");
      targetContainer.focus();
      btn.classList.add("is-saving", "color-regenerate");
      btn.classList.remove("color-edit");
      btn.innerHTML = '<i class="fas fa-check"></i>';
      btn.title = "Guardar";
    }
  });

  // Regenerate action
  drawerEl.querySelector("[data-drawer-action='regenerate']")?.addEventListener("click", () => {
    if (!currentItem) return;
    const { type, data, unit, activity, resource } = currentItem;
    if (type === "activity") currentCallbacks.onRegenerate?.(data.id, unit.id);
    else if (type === "resource") currentCallbacks.onRegenerate?.(data.id, unit.id);
    else if (type === "teacher-notes") {
      if (currentTab === "ficha" && resource) {
        currentCallbacks.onRegenerate?.(resource.id, unit?.id);
      } else {
        const targetId = resource ? resource.id : (data.id || data.activityId || activity?.id);
        if (currentCallbacks.onRegenerate) {
          currentCallbacks.onRegenerate(targetId, unit?.id);
        } else if (activity?.id) {
          currentCallbacks.onNotes?.(activity.id, unit?.id);
        }
      }
    }
  });

  // Create Activity action
  drawerEl.querySelectorAll("[data-drawer-action='create-activity']").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!currentItem || currentItem.type !== "activity") return;
      const { data, unit } = currentItem;
      const isPlaceholder = !data.html;
      closeUnitDrawer();
      document.dispatchEvent(new CustomEvent("charly:request-create-activity", { 
        detail: { subtopic: data.subtopic || data.section, isPlaceholder, unitId: unit.id }
      }));
    });
  });

  // Create Teacher Notes action from empty state in drawer
  drawerEl.querySelectorAll("[data-drawer-action='create-teacher-notes']").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!currentItem) return;
      const { data, unit, activity, resource } = currentItem;
      const targetActivity = currentItem.type === "activity" ? data : activity;
      closeUnitDrawer();
      if (resource?.id && typeof window.handleGenerateResourceNotes === "function") {
        window.handleGenerateResourceNotes(resource.id, unit?.id);
      } else if (targetActivity?.id) {
        if (typeof currentCallbacks.onNotes === "function") {
          currentCallbacks.onNotes(targetActivity.id, unit?.id);
        } else if (typeof currentCallbacks.onRegenerate === "function") {
          currentCallbacks.onRegenerate(targetActivity.id, unit?.id);
        } else if (typeof window.handleGenerateTeacherNotes === "function") {
          window.handleGenerateTeacherNotes(targetActivity.id, unit?.id);
        }
      } else if (typeof window.handleGenerateTeacherNotes === "function") {
        window.handleGenerateTeacherNotes("", unit?.id);
      }
    });
  });

  // Create Resource from empty state in drawer
  drawerEl.querySelectorAll("[data-drawer-action='add-resource']").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!currentItem) return;
      const { data, unit, activity } = currentItem;
      const targetActivity = currentItem.type === "activity" ? data : activity;
      const actId = targetActivity?.id || targetActivity?.sectionId;
      if (!actId) return;
      closeUnitDrawer();
      if (typeof currentCallbacks.onAddResource === "function") {
        currentCallbacks.onAddResource(actId, unit?.id);
      } else if (typeof window.handleGenerateResourcesForActivity === "function") {
        window.handleGenerateResourcesForActivity(actId);
      }
    });
  });

  // Remove action
  drawerEl.querySelector("[data-drawer-action='remove']")?.addEventListener("click", () => {
    if (!currentItem) return;
    const { type, data, unit, resource } = currentItem;
    if (confirm(`¿Eliminar este elemento permanentemente?`)) {
      if (type === "activity") {
        currentCallbacks.onRemove?.(data.id, unit?.id);
      } else if (type === "reading") {
        currentCallbacks.onRemove?.(unit?.id);
      } else if (type === "resource") {
        const resId = data.id || resource?.id;
        if (typeof currentCallbacks.onRemoveResource === "function") {
          currentCallbacks.onRemoveResource(resId, unit?.id);
        } else if (typeof currentCallbacks.onRemove === "function") {
          currentCallbacks.onRemove(resId, unit?.id);
        } else if (typeof window.handleRemoveResource === "function") {
          window.handleRemoveResource(resId, unit?.id);
        }
      } else if (type === "teacher-notes") {
        if (currentTab === "ficha" && (resource || data.resourceId)) {
          const resId = resource?.id || data.resourceId;
          if (typeof currentCallbacks.onRemoveResource === "function") {
            currentCallbacks.onRemoveResource(resId, unit?.id);
          } else if (typeof window.handleRemoveResource === "function") {
            window.handleRemoveResource(resId, unit?.id);
          } else if (currentCallbacks.onDelete) {
            currentCallbacks.onDelete(resId, unit?.id);
          }
        } else {
          const targetId = resource ? (data.id || resource.id) : (data.id || data.activityId);
          if (currentCallbacks.onDelete) currentCallbacks.onDelete(targetId, unit?.id);
          else if (currentCallbacks.onRemove) currentCallbacks.onRemove(targetId, unit?.id);
        }
      }
      closeUnitDrawer();
    }
  });

  // Delete linked resource from drawer card
  drawerEl.querySelectorAll("[data-drawer-delete-resource]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const resId = btn.dataset.drawerDeleteResource;
      if (!resId) return;
      if (confirm("¿Eliminar este recurso permanentemente?")) {
        if (typeof currentCallbacks.onRemoveResource === "function") {
          currentCallbacks.onRemoveResource(resId, currentItem.unit?.id);
        } else if (typeof currentCallbacks.onRemove === "function") {
          currentCallbacks.onRemove(resId, currentItem.unit?.id);
        } else if (typeof window.handleRemoveResource === "function") {
          window.handleRemoveResource(resId, currentItem.unit?.id);
        }
        closeUnitDrawer();
      }
    });
  });

  // Open linked resource from drawer
  drawerEl.querySelectorAll("[data-resource-open-id]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (e.target.closest("[data-drawer-delete-resource]")) return;
      const resId = btn.dataset.resourceOpenId;
      const resource = currentItem.unit?.accepted?.resources?.find((r) => r.id === resId);
      if (resource) {
        openResourceDrawer({
          resource,
          activity: currentItem.data,
          unit: currentItem.unit,
          session: currentItem.session,
          onEdit: currentCallbacks.onEdit,
          onRegenerate: currentCallbacks.onRegenerate,
          onRemove: currentCallbacks.onRemoveResource || currentCallbacks.onRemove,
          onRemoveResource: currentCallbacks.onRemoveResource || currentCallbacks.onRemove
        });
      }
    });
  });

  // SyA Edit Action (inline edit)
  drawerEl.querySelectorAll("[data-sya-action='edit']").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const fieldKey = btn.dataset.syaField;
      const card = btn.closest(".cb-drawer-sya-card");
      const valueBox = card?.querySelector(`[data-sya-value-box='${fieldKey}']`);
      if (!valueBox || valueBox.querySelector("textarea")) return;

      const currentText = (valueBox.querySelector("span")?.textContent || "").trim();
      valueBox.innerHTML = `
        <div class="cb-drawer-sya-inline-edit">
          <textarea rows="3" class="cb-drawer-sya-textarea">${escapeHtml(currentText)}</textarea>
          <div class="cb-drawer-sya-inline-actions">
            <button type="button" class="cb-drawer-sya-btn" data-sya-inline-cancel title="Cancelar">
              <i class="fas fa-times"></i>
            </button>
            <button type="button" class="cb-drawer-sya-btn" style="color:var(--cb-up-accent, #3b82f6); border-color:var(--cb-up-accent, #3b82f6);" data-sya-inline-save title="Guardar cambios">
              <i class="fas fa-check"></i>
            </button>
          </div>
        </div>
      `;

      const textarea = valueBox.querySelector("textarea");
      textarea?.focus();

      valueBox.querySelector("[data-sya-inline-cancel]")?.addEventListener("click", (evt) => {
        evt.stopPropagation();
        valueBox.innerHTML = `<span>${escapeHtml(currentText)}</span>`;
      });

      valueBox.querySelector("[data-sya-inline-save]")?.addEventListener("click", (evt) => {
        evt.stopPropagation();
        const newText = textarea?.value.trim() || currentText;
        valueBox.innerHTML = `<span>${escapeHtml(newText)}</span>`;
        saveSyaField(fieldKey, newText);
      });
    });
  });

  // SyA Reset Action (restablecer a original)
  drawerEl.querySelectorAll("[data-sya-action='reset']").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const fieldKey = btn.dataset.syaField;
      const label = btn.dataset.syaLabel || fieldKey;
      const card = btn.closest(".cb-drawer-sya-card");
      const valueBox = card?.querySelector(`[data-sya-value-box='${fieldKey}']`);
      if (!valueBox) return;

      if (!confirm(`¿Restablecer el eje "${label} (${fieldKey})" a su valor curricular original?`)) return;

      const originalValue = getCanonicalSyaValue(fieldKey);
      valueBox.innerHTML = `<span>${escapeHtml(originalValue)}</span>`;
      saveSyaField(fieldKey, originalValue);
    });
  });

  // Habilidad Cognitiva Badge Click (Inspeccionar o cambiar habilidad)
  drawerEl.querySelectorAll("[data-cognitive-badge]").forEach((badge) => {
    badge.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const activityData = currentItem?.data;
      if (!activityData) return;
      openCognitiveSkillModal(activityData, (updatedSkill) => {
        const badgeCode = badge.querySelector(".cb-cognitive-badge-code");
        const badgeName = badge.querySelector(".cb-cognitive-badge-name");
        if (badgeCode) badgeCode.textContent = updatedSkill.code;
        if (badgeName) badgeName.textContent = updatedSkill.fullName;
        badge.title = `Habilidad Cognitiva (ASC / Guilford): ${updatedSkill.fullName} (${updatedSkill.code})\n• Proceso: ${updatedSkill.process}\n• Producto: ${updatedSkill.product}\n• Contenido: ${updatedSkill.content}\n• Logro T.E.P.: Tiempo, Esfuerzo y Precisión`;
        activityData.cognitiveSkill = updatedSkill;
        if (currentCallbacks.onEdit && currentItem?.unit?.id) {
          const body = drawerEl.querySelector(".cb-drawer-teacher-view");
          if (body) {
            currentCallbacks.onEdit(activityData.id, currentItem.unit.id, body.innerHTML);
          }
        }
      });
    });
  });
}

function getCanonicalSyaValue(fieldKey) {
  if (!currentItem || !currentItem.unit) return "No especificado";
  const { unit, data, session } = currentItem;
  const subtopic = data.subtopic || data.section || "";
  const key = `${subtopic}_${fieldKey}`;

  if (session?.originalSya?.[key]) return session.originalSya[key];
  if (unit.sya?.[key] && unit.sya[key] !== unit.accepted?.sya?.[key]) return unit.sya[key];
  const fallback = buildFallbackSya(unit.meta || session?.academicMeta || {});
  return fallback[key] || `Eje curricular oficial para ${subtopic}`;
}

function saveSyaField(fieldKey, newValue) {
  if (!currentItem || !currentItem.unit) return;
  const { unit, data } = currentItem;
  const subtopic = data.subtopic || data.section || "";
  if (!subtopic) return;

  const key = `${subtopic}_${fieldKey}`;
  unit.accepted = unit.accepted || {};
  unit.accepted.sya = unit.accepted.sya || {};
  unit.accepted.sya[key] = newValue;
  if (unit.sya) unit.sya[key] = newValue;

  document.dispatchEvent(new CustomEvent("charly:unit-sya-updated", {
    detail: { unitId: unit.id, subtopic, fieldKey, value: newValue }
  }));
}

function getResourceIcon(type = "") {
  if (type === "worksheet" || type === "ficha") return "fa-file-lines";
  if (type === "annex" || type === "anexo") return "fa-image";
  if (type === "cutout" || type === "recortable") return "fa-scissors";
  if (type === "video-script" || type === "video") return "fa-film";
  return "fa-paperclip";
}

function resolveSyaKey(subtopic = "") {
  const norm = String(subtopic || "").trim();
  if (norm === "Comprensión lectora" || norm === "Lectura") return "Lectura";
  if (norm === "Ortografía") return "Ortografia";
  if (norm === "Expresión escrita") return "ExpresionEscrita";
  if (norm === "Expresión oral") return "ExpresionOral";
  if (norm === "Conocimiento del medio") return "ConocimientoDelMedio";
  return norm.replace(/\s+/g, "");
}

// --- Floating Toolbar Logic (2026 HUD Floating Dock) ---
const floatingToolbarHtml = `
  <div id="cbInlineToolbar" class="cb-inline-toolbar" style="display: none; position: absolute; z-index: 100000;">
    <button type="button" class="cb-toolbar-btn" data-command="bold" title="Negrita"><i class="fas fa-bold"></i></button>
    <button type="button" class="cb-toolbar-btn" data-command="italic" title="Cursiva"><i class="fas fa-italic"></i></button>
    <button type="button" class="cb-toolbar-btn" data-command="underline" title="Subrayado"><i class="fas fa-underline"></i></button>
    <button type="button" class="cb-toolbar-btn cb-toolbar-btn--answer" data-command="expectedAnswer" title="Respuesta esperada (magenta)" aria-label="Aplicar estilo de respuesta esperada"><i class="fas fa-comment-dots"></i></button>
    <div class="cb-toolbar-separator"></div>
    <button type="button" class="cb-toolbar-btn" data-command="formatBlock" data-value="H3" title="Título"><i class="fas fa-heading"></i></button>
    <button type="button" class="cb-toolbar-btn" data-command="formatBlock" data-value="H4" title="Subtítulo"><i class="fas fa-heading" style="font-size: 0.8em;"></i></button>
    <button type="button" class="cb-toolbar-btn" data-command="formatBlock" data-value="P" title="Párrafo normal"><i class="fas fa-paragraph"></i></button>
    <div class="cb-toolbar-separator"></div>
    <button type="button" class="cb-toolbar-btn" data-command="justifyLeft" title="Alinear a la izquierda"><i class="fas fa-align-left"></i></button>
    <button type="button" class="cb-toolbar-btn" data-command="justifyCenter" title="Centrar"><i class="fas fa-align-center"></i></button>
    <button type="button" class="cb-toolbar-btn" data-command="justifyFull" title="Justificar"><i class="fas fa-align-justify"></i></button>
  </div>
`;

if (!document.getElementById("cbInlineToolbar")) {
  document.body.insertAdjacentHTML("beforeend", floatingToolbarHtml);
  
  const toolbar = document.getElementById("cbInlineToolbar");
  toolbar.style.display = "none";
  toolbar.style.zIndex = "100000";
  
  toolbar.addEventListener("mousedown", (e) => {
    e.preventDefault(); // Prevent losing selection
    const btn = e.target.closest(".cb-toolbar-btn");
    if (!btn) return;
    const command = btn.dataset.command;
    const value = btn.dataset.value || null;
    if (command === "expectedAnswer") {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      const answer = document.createElement("span");
      answer.className = "cb-teacher-resp--inline";
      answer.appendChild(range.extractContents());
      range.insertNode(answer);
      selection.removeAllRanges();
      const nextRange = document.createRange();
      nextRange.selectNodeContents(answer);
      selection.addRange(nextRange);
      return;
    }
    document.execCommand(command, false, value);
  });

  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      toolbar.style.display = "none";
      return;
    }
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const element = container.nodeType === 3 ? container.parentElement : container;
    
    // Check if inside our drawer body and editable
    const isEditable = element.closest("[contenteditable='true']");
    if (!isEditable) {
      toolbar.style.display = "none";
      return;
    }
    
    const rect = range.getBoundingClientRect();
    toolbar.style.display = "flex";
    toolbar.style.zIndex = "100000";
    toolbar.style.top = (rect.top + window.scrollY - toolbar.offsetHeight - 10) + "px";
    toolbar.style.left = (rect.left + window.scrollX + (rect.width / 2) - (toolbar.offsetWidth / 2)) + "px";
  });
}
