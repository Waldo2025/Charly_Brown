/**
 * Gestor de diálogos, modales y popovers estilo Shadcn UI para Marcie Blog Editor
 */

import { downloadStyledDocx } from "/js/word-export.js";
import {
  hasTitleProposals,
  normalizeAudienceTitleProposals,
  normalizeTitleProposalsByAudience,
  serializeTitleProposals,
  titleProposalsForAudience
} from "../services/marcie-title-proposals.js";
import {
  DEFAULT_EDITORIAL_VOCABULARY,
  normalizeEditorialVocabulary,
  readEditorialVocabulary,
  saveEditorialVocabulary
} from "../services/marcie-vocabulary.js";
import { analyzeYoutubeVideos } from "../services/marcie-agent-api.js?v=20260922r1";

const MARCIE_OVERLAY_Z_INDEX = "2147483000";
const MARCIE_AUTOMATED_BRIEF_STORAGE_KEY = "marcie_automated_brief_v1";
const RESEARCH_REGIONS = [
  ["GLOBAL", "Global / Todas las regiones"],
  ["LATAM", "América Latina y el Caribe"],
  ["NORTH_AMERICA", "América del Norte"], ["EUROPE", "Europa"],
  ["ASIA", "Asia"], ["AFRICA", "África"], ["OCEANIA", "Oceanía"],
  ["MX", "México"], ["ES", "España"], ["AR", "Argentina"],
  ["BO", "Bolivia"], ["BR", "Brasil"], ["CL", "Chile"],
  ["CO", "Colombia"], ["CR", "Costa Rica"], ["CU", "Cuba"],
  ["EC", "Ecuador"], ["SV", "El Salvador"], ["GT", "Guatemala"],
  ["HN", "Honduras"], ["NI", "Nicaragua"], ["PA", "Panamá"],
  ["PY", "Paraguay"], ["PE", "Perú"], ["PR", "Puerto Rico"],
  ["DO", "República Dominicana"], ["UY", "Uruguay"], ["VE", "Venezuela"],
  ["US", "Estados Unidos"], ["CA", "Canadá"], ["GB", "Reino Unido"],
  ["PT", "Portugal"]
];

function normalizeEditorialSpecifications(items = []) {
  return [...new Set(items.filter(item => typeof item === "string" && item.trim()).map(item => {
    if (item === "#fuentes Casos reales documentados") return "#concepto Desarrollar un caso de estudio documentado";
    if (item === "#fuentes Bibliografía final en formato APA") return null;
    return item;
  }).filter(Boolean))];
}

function escapeModalHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

function getMarcieOverlayHost() {
  return document.fullscreenElement || document.webkitFullscreenElement || document.body;
}

function mountMarcieOverlay(element) {
  if (!element) return;
  element.style.zIndex = MARCIE_OVERLAY_Z_INDEX;
  getMarcieOverlayHost().appendChild(element);
}

function syncMarcieOverlaysWithFullscreen() {
  const host = getMarcieOverlayHost();
  ["marcie-modal-backdrop", "marcie-toast"].forEach((id) => {
    const overlay = document.getElementById(id);
    if (overlay && overlay.parentElement !== host) host.appendChild(overlay);
  });
}

document.addEventListener("fullscreenchange", syncMarcieOverlaysWithFullscreen);
document.addEventListener("webkitfullscreenchange", syncMarcieOverlaysWithFullscreen);

export function showModal({ title, contentHtml, footerButtonsHtml = "", onClose = null, widthClass = "max-w-lg" }) {
  // Remover modal previo si existe
  closeActiveModal();

  const backdrop = document.createElement("div");
  backdrop.id = "marcie-modal-backdrop";
  backdrop.className = "fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity animate-in fade-in";

  backdrop.innerHTML = `
    <div class="marcie-modal-panel bg-white rounded-xl shadow-2xl border border-slate-200 w-full ${widthClass} overflow-hidden transform transition-all animate-in zoom-in-95 flex flex-col max-h-[85vh]">
      <div class="marcie-modal-header px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
        <h3 class="font-semibold text-slate-800 text-base">${title}</h3>
        <button id="modal-close-btn" class="text-slate-400 hover:text-slate-600 rounded-md p-1 hover:bg-slate-100 transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
      <div class="marcie-modal-body p-6 overflow-y-auto flex-1 min-h-0 text-sm text-slate-600">
        ${contentHtml}
      </div>
      ${footerButtonsHtml ? `
        <div class="marcie-modal-footer px-6 py-3 bg-slate-50 border-t border-slate-100 flex shrink-0 justify-end gap-2">
          ${footerButtonsHtml}
        </div>
      ` : ""}
    </div>
  `;

  mountMarcieOverlay(backdrop);

  const close = () => {
    window.removeEventListener("keydown", onKeyDown);
    backdrop.remove();
    if (typeof onClose === "function") onClose();
  };

  backdrop.querySelector("#modal-close-btn").addEventListener("click", close);
  let backdropPressStarted = false;
  backdrop.addEventListener("pointerdown", (e) => {
    backdropPressStarted = e.target === backdrop;
  });
  backdrop.addEventListener("pointercancel", () => {
    backdropPressStarted = false;
  });
  backdrop.addEventListener("click", (e) => {
    const shouldClose = e.target === backdrop && backdropPressStarted;
    backdropPressStarted = false;
    if (shouldClose) close();
  });

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      close();
      window.removeEventListener("keydown", onKeyDown);
    }
  };
  window.addEventListener("keydown", onKeyDown);
  backdrop.marcieClose = close;

  return { close, element: backdrop };
}

export function closeActiveModal() {
  const existing = document.getElementById("marcie-modal-backdrop");
  if (existing) existing.marcieClose ? existing.marcieClose() : existing.remove();
}

export function showSessionCreationChoiceModal() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const modal = showModal({
      title: "Crear una nueva sesión",
      widthClass: "max-w-2xl",
      contentHtml: `
        <p class="mb-5 text-sm text-slate-600">Elige cómo quieres preparar los artículos.</p>
        <div class="marcie-session-choice-grid">
          <button type="button" class="marcie-session-choice" data-session-choice="manual">
            <span class="marcie-session-choice__icon"><i data-lucide="sliders-horizontal"></i></span>
            <strong>Creación manual</strong>
            <span>Configura cada opción con los controles del editor.</span>
          </button>
          <button type="button" class="marcie-session-choice marcie-session-choice--agent" data-session-choice="agent">
            <span class="marcie-session-choice__icon"><i data-lucide="messages-square"></i></span>
            <strong>Usar Agente MCP</strong>
            <span>Conversa por texto o voz y deja que Marcie te guíe.</span>
          </button>
        </div>`,
      onClose: () => finish(null)
    });
    modal.element.querySelectorAll("[data-session-choice]").forEach((button) => button.addEventListener("click", () => {
      const choice = button.dataset.sessionChoice;
      finish(choice);
      modal.close();
    }));
    window.lucide?.createIcons?.();
  });
}

export async function exportSessionSpecsToWord({
  topic = "",
  topicMode = "shared",
  editorialMode = "marcie",
  humanizationEnabled = true,
  researchRegion = "MX",
  researchPeriod = "6m",
  selectedAudiences = [],
  articles = []
} = {}) {
  const dateStr = new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

  const safeTitle = topic || "Especificaciones Editoriales";
  const safeName = safeTitle.replace(/[^a-z0-9_-]/gi, "_").toLowerCase().slice(0, 40);
  const filename = `Especificaciones_${safeName}_${Date.now()}.docx`;

  const htmlContent = `
    <h1 data-word-style="CBTitle">Especificaciones Editoriales de Artículos</h1>
    <p data-word-style="CBSubtitle">Marcie Blog Editor &bull; ${dateStr} a las ${timeStr}</p>
    <hr/>
    <h2 data-word-style="CBHeading1">1. Configuración General de la Sesión</h2>
    <table>
      <tr>
        <th data-word-style="CBHeading3" style="width: 30%;">Parámetro</th>
        <th data-word-style="CBHeading3">Valor Configurado</th>
      </tr>
      <tr>
        <td><strong>Tema Central Principal:</strong></td>
        <td><strong>${escapeModalHtml(safeTitle)}</strong></td>
      </tr>
      <tr>
        <td><strong>Modo de Asignación:</strong></td>
        <td>${topicMode === "per_audience" ? "Tema específico por cada público" : "Mismo tema para todos los públicos"}</td>
      </tr>
      <tr>
        <td><strong>Modo Editorial:</strong></td>
        <td>${escapeModalHtml(editorialMode.toUpperCase())}</td>
      </tr>
      <tr>
        <td><strong>Humanización Anti-IA:</strong></td>
        <td>${humanizationEnabled ? "Activada" : "Desactivada"}</td>
      </tr>
      <tr>
        <td><strong>Región y Ventana:</strong></td>
        <td>Región: ${escapeModalHtml(researchRegion)} | Ventana: ${escapeModalHtml(researchPeriod)}</td>
      </tr>
      <tr>
        <td><strong>Total de Artículos:</strong></td>
        <td><strong>${articles.length} artículos por público objetivo</strong></td>
      </tr>
    </table>

    <hr/>
    <h2 data-word-style="CBHeading1">2. Desglose de Artículos por Público Objetivo</h2>
    ${articles.map((art, idx) => `
      <h3 data-word-style="CBHeading2">Artículo ${idx + 1}: ${escapeModalHtml(art.audienceLabel)}</h3>
      <table>
        <tr>
          <th data-word-style="CBHeading3" style="width: 30%;">Campo</th>
          <th data-word-style="CBHeading3">Especificación</th>
        </tr>
        <tr>
          <td><strong>Tema / Título:</strong></td>
          <td><strong>${escapeModalHtml(art.topic || art.title || safeTitle)}</strong></td>
        </tr>
        ${art.customTitle ? `<tr><td><strong>Título Propuesto Específico:</strong></td><td><strong>${escapeModalHtml(art.customTitle)}</strong></td></tr>` : ""}
        <tr>
          <td><strong>Tono de Redacción:</strong></td>
          <td>${art.tones && art.tones.length ? escapeModalHtml(art.tones.join(", ")) : "Estándar"}</td>
        </tr>
        <tr>
          <td><strong>Extensión Objetivo:</strong></td>
          <td>${art.extension ? escapeModalHtml(art.extension) : "Estándar (1200–1600 palabras)"}</td>
        </tr>
        <tr>
          <td><strong>Fuentes y Evidencia:</strong></td>
          <td>${art.sources && art.sources.length ? escapeModalHtml(art.sources.join(", ")) : "Fuentes fiables verificables"}</td>
        </tr>
        <tr>
          <td><strong>Recursos Editoriales:</strong></td>
          <td>${art.resources && art.resources.length ? escapeModalHtml(art.resources.join(", ")) : "APA 7, sin clichés"}</td>
        </tr>
      </table>
    `).join("")}

    <hr/>
    <p data-word-style="CBSubtitle" style="text-align: right;">Marcie Blog Editor &bull; Documento técnico de especificaciones .docx</p>
  `;

  await downloadStyledDocx({
    html: htmlContent,
    title: safeTitle,
    subtitle: `${editorialMode.toUpperCase()} · ${articles.length} artículos · ${dateStr}`,
    appTitle: "Marcie Blog Editor",
    filename
  });
}

export const AUDIENCE_META = {
  all: {
    label: "Todos los públicos (General)",
    shortLabel: "Todos",
    iconSvg: `<svg class="h-3.5 w-3.5 text-slate-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    badgeColor: "bg-slate-100 text-slate-700 border-slate-200"
  },
  educators: {
    label: "Docentes y directivos",
    shortLabel: "Docentes",
    iconSvg: `<svg class="h-3.5 w-3.5 text-purple-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200"
  },
  parents: {
    label: "Padres y familias",
    shortLabel: "Padres",
    iconSvg: `<svg class="h-3.5 w-3.5 text-amber-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200"
  },
  students: {
    label: "Estudiantes",
    shortLabel: "Estudiantes",
    iconSvg: `<svg class="h-3.5 w-3.5 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200"
  },
  coordinators: {
    label: "Coordinadores académicos",
    shortLabel: "Coordinadores",
    iconSvg: `<svg class="h-3.5 w-3.5 text-teal-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`,
    badgeColor: "bg-teal-50 text-teal-700 border-teal-200"
  }
};

export function parseSpecItem(item, index = 0) {
  const str = String(item || "").trim();
  const match = str.match(/^#([a-z0-9_-]+)(?:\[([a-z0-9_-]+)\])?\s+(.*)$/i);
  if (match) {
    return {
      originalIndex: index,
      category: match[1].toLowerCase(),
      audience: (match[2] || "all").toLowerCase(),
      value: match[3],
      raw: str
    };
  }
  const [tag, ...rest] = str.split(" ");
  return {
    originalIndex: index,
    category: (tag || "").replace(/^#/, "").toLowerCase() || "personalizada",
    audience: "all",
    value: rest.join(" "),
    raw: str
  };
}

export function showNewSessionModal({ initialConfiguration = null, defaultValue = "", allowBlankSession = false, freeModeDefault = false, promptProfiles = [], editorialProfiles = [], activePromptProfileId = "default", onRefineTopic = null } = {}) {
  const initialRegion = String(initialConfiguration?.researchRegion || "MX").trim() || "MX";
  const regionOptions = RESEARCH_REGIONS.some(([value]) => value === initialRegion)
    ? RESEARCH_REGIONS : [...RESEARCH_REGIONS, [initialRegion, initialRegion + " (guardada)"]];
  const blankTitle = "Sin título";
  const initialVocabulary = normalizeEditorialVocabulary(
    initialConfiguration?.preferredVocabulary?.length
      ? initialConfiguration.preferredVocabulary
      : readEditorialVocabulary()
  );
  const availablePromptProfiles = Array.isArray(promptProfiles) && promptProfiles.length
    ? promptProfiles.filter((profile) => profile?.id && profile?.name)
    : [{ id: "default", name: "Configuración predeterminada" }, { id: "free", name: "Modo libre" }];
  const initialPromptProfileId = availablePromptProfiles.some((profile) => profile.id === activePromptProfileId)
    ? activePromptProfileId
    : (freeModeDefault ? "free" : "default");
  const promptProfileOptionsHtml = availablePromptProfiles.map((profile) => `<option value="${escapeModalHtml(profile.id)}" ${profile.id === initialPromptProfileId ? "selected" : ""}>${escapeModalHtml(profile.name)}</option>`).join("");
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const modal = showModal({
      title: initialConfiguration ? "Configurar y volver a crear" : "Crear una sesión editorial",
      widthClass: "max-w-4xl",
      onClose: () => finish(null),
      contentHtml: `
        <div class="new-session-modal flex flex-col gap-3">
          <!-- Barra Unificada de Control Superior: Presets, Región y Selección de Público -->
          <div id="modal-top-control-card" class="rounded-xl border border-slate-200/90 bg-slate-50/70 p-2.5 space-y-2 shadow-2xs">
            <!-- Fila 1: Presets y Parámetros Globales -->
            <div id="modal-preset-toolbar" class="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[11px] font-bold text-slate-700">Preset:</span>
                <select id="new-session-preset-select" class="input-field h-7 text-xs w-36 sm:w-40 border-slate-200 bg-white shadow-2xs" aria-label="Cargar preset guardado">
                  <option value="">-- Cargar preset --</option>
                </select>
                <button id="btn-save-session-preset" type="button" title="Guardar preset" aria-label="Guardar preset" class="btn h-7 w-7 p-0 flex items-center justify-center bg-purple-700 text-white hover:bg-purple-800 rounded-md shadow-2xs transition-colors cursor-pointer">
                  <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
                </button>
                <button id="btn-delete-session-preset" type="button" title="Eliminar preset" aria-label="Eliminar preset" class="btn h-7 w-7 p-0 flex items-center justify-center bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-md shadow-2xs transition-colors cursor-pointer">
                  <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16"/></svg>
                </button>
              </div>
              <div class="flex items-center gap-2">
                <label class="flex items-center gap-1 font-medium text-slate-600">
                  <span class="text-[11px]">Región:</span>
                  <select id="new-session-region" class="input-field h-7 py-0 text-xs w-28 bg-white shadow-2xs">${regionOptions.map(([value, label]) => `<option value="${escapeModalHtml(value)}" ${value === initialRegion ? "selected" : ""}>${escapeModalHtml(label)}</option>`).join("")}</select>
                </label>
                <label class="flex items-center gap-1 font-medium text-slate-600">
                  <span class="text-[11px]">Ventana:</span>
                  <select id="new-session-period" class="input-field h-7 py-0 text-xs w-28 bg-white shadow-2xs">${[["24h","24 horas"],["7d","7 días"],["1m","1 mes"],["3m","3 meses"],["6m","6 meses"],["12m","12 meses"]].map(([value,label]) => `<option value="${value}" ${value === (initialConfiguration?.researchPeriod || "6m") ? "selected" : ""}>${label}</option>`).join("")}</select>
                </label>
              </div>
            </div>

            <div class="border-t border-slate-200/80"></div>

            <!-- Fila 2: Selección de Público & Resumen -->
            <div id="modal-audience-scope-bar" class="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[11px] font-bold text-slate-700">Públicos:</span>
                <div class="flex items-center gap-1 text-[10px]" id="spec-audience-tab-group" title="1 clic: Ver/Editar · Doble clic: Activar/Desactivar">
                  <button type="button" data-spec-target-audience="all" class="spec-audience-tab px-2.5 py-1 rounded-md font-bold cursor-pointer transition-all border shadow-2xs">Todos</button>
                  <button type="button" data-spec-target-audience="students" class="spec-audience-tab px-2.5 py-1 rounded-md font-medium cursor-pointer transition-all border shadow-2xs">Estudiantes</button>
                  <button type="button" data-spec-target-audience="parents" class="spec-audience-tab px-2.5 py-1 rounded-md font-medium cursor-pointer transition-all border shadow-2xs">Padres</button>
                  <button type="button" data-spec-target-audience="educators" class="spec-audience-tab px-2.5 py-1 rounded-md font-medium cursor-pointer transition-all border shadow-2xs">Docentes</button>
                  <button type="button" data-spec-target-audience="coordinators" class="spec-audience-tab px-2.5 py-1 rounded-md font-medium cursor-pointer transition-all border shadow-2xs">Coordinadores</button>
                </div>
                <span class="text-[9px] text-slate-400 font-medium hidden sm:inline-block ml-1">1 clic: Ver/Editar · Doble clic: Activar/Desactivar</span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span id="new-session-spec-summary" class="text-[9px] font-semibold text-cyan-800 bg-cyan-100/80 border border-cyan-300 px-2 py-0.5 rounded-full">0 opciones</span>
                <button id="new-session-reset-brief" type="button" class="text-[10px] font-semibold text-cyan-700 hover:text-cyan-950 cursor-pointer">Reiniciar</button>
              </div>
            </div>
          </div>

          <!-- Tarjeta de Tema Central con Selector de Modo (Mismo tema vs Tema por público) -->
          <div class="new-session-topic-card rounded-lg border border-slate-200 bg-slate-50/70 p-3 shadow-2xs">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <div class="flex items-center gap-2">
                <label for="new-session-title-input" class="block text-xs font-bold text-slate-800" id="topic-field-label">Tema central del artículo</label>
                <span id="topic-audience-badge" class="text-[9px] font-bold text-cyan-800 bg-cyan-100 border border-cyan-300 px-1.5 py-0.2 rounded-full hidden">Público activo</span>
              </div>
              <!-- Switch moderno y sencillo para Tema por público -->
              <label class="inline-flex h-5 items-center gap-2 cursor-pointer select-none text-[11px] font-medium leading-none text-slate-600" title="Activar para configurar un tema individual para cada público">
                <span class="leading-none">Tema por público</span>
                <span class="relative inline-flex h-[18px] w-8 shrink-0 items-center">
                  <input type="checkbox" id="toggle-topic-mode-switch" class="sr-only peer">
                  <span class="relative block h-[18px] w-8 rounded-full bg-slate-200 transition-colors peer-focus:outline-none peer-checked:bg-purple-600 after:absolute after:left-[2px] after:top-[2px] after:h-3.5 after:w-3.5 after:rounded-full after:border after:border-slate-300 after:bg-white after:content-[''] after:transition-all peer-checked:after:translate-x-3.5"></span>
                </span>
              </label>
              <span id="new-session-title-count" class="text-[10px] tabular-nums font-semibold text-slate-400">0/180</span>
            </div>
            <div class="flex flex-col gap-2 sm:flex-row">
              <input id="new-session-title-input" type="text" class="input-field h-9 flex-1 text-xs bg-white" maxlength="180" autocomplete="off" placeholder="Ej. Estrategias de aprendizaje activo con tecnología">
              <button id="new-session-refine-topic" type="button" class="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-cyan-300 bg-cyan-50/80 px-3 text-[11px] font-bold text-cyan-800 shadow-2xs transition-all hover:bg-cyan-100 hover:border-cyan-400 cursor-pointer">
                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z"/></svg>
                Generar propuestas por público
              </button>
            </div>
            <div class="mt-1 flex items-center justify-between gap-3">
              <p id="new-session-title-error" class="m-0 hidden text-[11px] font-medium text-red-600">Escribe un tema para continuar.</p>
              <p id="new-session-refine-status" class="m-0 text-[10px] text-slate-400" aria-live="polite"></p>
            </div>
          </div>

          <!-- Propuestas de Título (Hooks/Antihooks) -->
          <div id="new-session-title-proposals" class="hidden rounded-lg border border-purple-200/90 bg-gradient-to-b from-purple-50/40 to-slate-50/50 p-2.5 shadow-2xs">
            <div class="mb-2 flex items-center justify-between border-b border-purple-100/80 pb-1.5">
              <div class="flex items-center gap-1.5">
                <span class="grid h-4 w-4 place-items-center rounded bg-purple-600 text-white text-[9px] font-black">✓</span>
                <span class="text-xs font-bold text-slate-800">Propuestas de título</span>
                <span id="title-proposals-audience-badge" class="text-[9px] font-bold text-cyan-800 bg-cyan-100/90 border border-cyan-300/80 px-2 py-0.2 rounded-full">Todos los públicos</span>
              </div>
              <span class="text-[9px] font-bold text-purple-700 bg-purple-100/90 px-2 py-0.5 rounded-full uppercase tracking-wider">3 Hook + 3 Antihook por público</span>
            </div>
            <div id="title-proposals-grid" class="grid grid-cols-1 gap-2 sm:grid-cols-2"></div>
          </div>

          <!-- Selector de Tipo de Sesión (Manual vs Automatizada) -->
          <div class="space-y-1.5">
            <span class="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Tipo de Sesión</span>
            <div class="new-session-mode-tabs" role="tablist" aria-label="Tipo de sesión">
              <button type="button" role="tab" data-new-session-mode="manual" aria-selected="true" aria-pressed="true" class="new-session-mode is-active">
                <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <span>Manual</span>
              </button>
              <button type="button" role="tab" data-new-session-mode="automated" aria-selected="false" aria-pressed="false" class="new-session-mode">
                <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3 1.9 4.8 4.8 1.9-4.8 1.9L12 17l-1.9-4.8-4.8-1.9 4.8-1.9L12 3z"/><path d="M19 14l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5z"/></svg>
                <span>Automatizada</span>
              </button>
            </div>
          </div>

          <!-- Contenedor Modo Manual -->
          <div id="new-session-manual-container" class="space-y-3">
            <div class="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600 shadow-2xs">
              <div class="flex items-start gap-2.5">
                <span class="grid h-5 w-5 shrink-0 place-items-center rounded bg-slate-200 text-slate-700 font-bold text-[10px]">i</span>
                <div>
                  <strong class="font-semibold text-slate-800">Modo Manual:</strong>
                  <p class="mt-0.5 text-[11px] text-slate-500 leading-snug">Crea una sesión limpia para redactar y perfeccionar el contenido paso a paso con las herramientas y el asistente editorial de Marcie.</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Contenedor Modo Automatizado (Incluye pestañas de configuración) -->
          <div id="new-session-automated-container" class="space-y-3 hidden">
            <!-- Navegación por pestañas compacta (Enfoque Editorial / Especificaciones) -->
            <div id="modal-tab-nav-container" class="marcie-modal-tab-nav shrink-0" role="tablist" aria-label="Secciones de configuración automatizada">
              <button type="button" role="tab" data-modal-tab-target="editorial" class="marcie-modal-tab-btn is-active" aria-selected="true">
                <svg class="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
                <span>Enfoque Editorial</span>
              </button>
              <button type="button" role="tab" data-modal-tab-target="specs" class="marcie-modal-tab-btn" aria-selected="false">
                <svg class="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 02 2h2a2 2 0 0 02-2M9 5a2 2 0 0 12-2h2a2 2 0 0 1 2 2m-6 9l2 2 4-4"/></svg>
                <span>Especificaciones del artículo</span>
                <span id="tab-specs-count-badge" class="ml-1 rounded-full bg-cyan-100 text-cyan-800 text-[9px] font-bold px-1.5 py-0.2 hidden">0</span>
              </button>
            </div>

            <!-- PESTAÑA 1: ENFOQUE EDITORIAL (Propuesta de 3 Tarjetas Elegantes + Switches) -->
            <div data-modal-tab-panel="editorial" class="space-y-3">
              <!-- Marco Editorial: Propuesta 3 Tarjetas Informativas -->
              <div class="rounded-xl border border-slate-200 bg-white p-3 space-y-3 shadow-2xs">
                <div class="space-y-1.5">
                  <div class="flex items-center justify-between">
                    <span class="block text-[11px] font-bold uppercase tracking-wider text-slate-600">Estructura y Tono Editorial</span>
                    <span class="text-[10px] text-slate-400">Elige el perfil de redacción</span>
                  </div>

                  <!-- 3 Tarjetas Seleccionables -->
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <!-- Tarjeta Marcie -->
                    <label class="editorial-profile-card group relative flex flex-col justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50/40 hover:border-cyan-400 cursor-pointer transition-all shadow-2xs has-[:checked]:border-cyan-600 has-[:checked]:bg-cyan-50/60 has-[:checked]:ring-1 has-[:checked]:ring-cyan-500">
                      <div>
                        <div class="flex items-center justify-between gap-1 mb-1">
                          <div class="flex items-center gap-1.5">
                            <span class="grid h-5 w-5 place-items-center rounded bg-cyan-100 text-cyan-800 text-[10px] font-black">M</span>
                            <span class="text-xs font-bold text-slate-800 group-has-[:checked]:text-cyan-950">Marcie</span>
                          </div>
                          <span class="text-[8px] font-bold text-cyan-700 bg-cyan-100 px-1.5 py-0.2 rounded-full uppercase tracking-wider">Riguroso</span>
                        </div>
                        <p class="text-[10px] text-slate-500 leading-tight m-0">Investigación académica profunda, citas APA 7 y tono accesible pero analítico.</p>
                      </div>
                      <input type="radio" name="editorial-mode" value="marcie" class="sr-only" checked>
                    </label>

                    <!-- Tarjeta AIDA -->
                    <label class="editorial-profile-card group relative flex flex-col justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50/40 hover:border-emerald-400 cursor-pointer transition-all shadow-2xs has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50/60 has-[:checked]:ring-1 has-[:checked]:ring-emerald-500">
                      <div>
                        <div class="flex items-center justify-between gap-1 mb-1">
                          <div class="flex items-center gap-1.5">
                            <span class="grid h-5 w-5 place-items-center rounded bg-emerald-100 text-emerald-800 text-[10px] font-black">A</span>
                            <span class="text-xs font-bold text-slate-800 group-has-[:checked]:text-emerald-950">Aida</span>
                          </div>
                          <span class="text-[8px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-full uppercase tracking-wider">Persuasivo</span>
                        </div>
                        <p class="text-[10px] text-slate-500 leading-tight m-0">Estructura directa (Atención, Interés, Deseo, Acción), ritmo ágil y ganchos.</p>
                      </div>
                      <input type="radio" name="editorial-mode" value="aida" class="sr-only">
                    </label>

                    <!-- Tarjeta Personalizado -->
                    <label class="editorial-profile-card group relative flex flex-col justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50/40 hover:border-purple-400 cursor-pointer transition-all shadow-2xs has-[:checked]:border-purple-600 has-[:checked]:bg-purple-50/60 has-[:checked]:ring-1 has-[:checked]:ring-purple-500">
                      <div>
                        <div class="flex items-center justify-between gap-1 mb-1">
                          <div class="flex items-center gap-1.5">
                            <span class="grid h-5 w-5 place-items-center rounded bg-purple-100 text-purple-800 text-[10px] font-black">⚙</span>
                            <span class="text-xs font-bold text-slate-800 group-has-[:checked]:text-purple-950">Personalizado</span>
                          </div>
                          <span class="text-[8px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded-full uppercase tracking-wider">Avanzado</span>
                        </div>
                        <p class="text-[10px] text-slate-500 leading-tight m-0">Control milimétrico de apertura, historia, densidad, tono y reglas.</p>
                      </div>
                      <input type="radio" name="editorial-mode" value="custom" class="sr-only">
                    </label>
                  </div>
                </div>

                <!-- Switches Compactos: Humanización Anti-IA & Modo Libre -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                  <label class="new-session-toggle-card" data-toggle-tone="purple">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="grid h-6 w-6 shrink-0 place-items-center rounded bg-purple-100 text-purple-700">
                        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                      </span>
                      <div class="flex flex-col min-w-0">
                        <span class="text-xs font-semibold text-slate-800">Humanización Anti-IA</span>
                        <span class="text-[10px] text-slate-500 truncate">Estilo fluido sin patrones sintéticos</span>
                      </div>
                    </div>
                    <input id="new-session-humanize-toggle" type="checkbox" checked>
                    <span class="toggle-switch-track" aria-hidden="true"></span>
                  </label>

                  <label class="new-session-toggle-card" data-toggle-tone="teal">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="grid h-6 w-6 shrink-0 place-items-center rounded bg-cyan-100 text-cyan-700">
                        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h10a3 3 0 1 0-3-3M4 12h15a3 3 0 1 1-3 3M4 16h6"/></svg>
                      </span>
                      <div class="flex flex-col min-w-0">
                        <span class="text-xs font-semibold text-slate-800">Modo libre</span>
                        <span class="text-[10px] text-slate-500 truncate">El tema manda, sin directrices fijas</span>
                      </div>
                    </div>
                    <input id="new-session-free-mode" type="checkbox" ${freeModeDefault ? "checked" : ""}>
                    <span class="toggle-switch-track" aria-hidden="true"></span>
                  </label>
                </div>

                <!-- Drawer de Perfil Personalizado (solo cuando se selecciona 'Personalizado') -->
                <div id="new-session-custom-profile" class="mt-2 hidden grid grid-cols-2 gap-2 rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs">
                  <label class="col-span-2 font-medium">Perfil reutilizable<select id="custom-profile-select" class="input-field mt-1 h-8 text-xs bg-white"><option value="">Crear perfil nuevo</option>${editorialProfiles.map((profile) => `<option value="${escapeModalHtml(profile.id)}">${escapeModalHtml(profile.name || profile.id)} · v${Number(profile.version || 1)}</option>`).join("")}</select></label>
                  <label class="font-medium">Estructura<select id="custom-structure" class="input-field mt-1 h-8 text-xs bg-white"><option value="hybrid">Híbrida</option><option value="marcie">Marcie</option><option value="aida">Aida</option></select></label>
                  <label class="font-medium">Apertura<select id="custom-opening" class="input-field mt-1 h-8 text-xs bg-white"><option value="scene">Escena</option><option value="question">Pregunta</option><option value="data">Dato</option><option value="custom">Personalizada</option></select></label>
                  <label class="font-medium">Fuentes objetivo<input id="custom-minimum-sources" type="number" class="input-field mt-1 h-8 text-xs bg-white" min="4" max="20" value="8"></label>
                  <label class="font-medium">Historia<select id="custom-history" class="input-field mt-1 h-8 text-xs bg-white"><option value="when_supported">Cuando exista evidencia</option><option value="required_when_supported">Requerida si hay evidencia</option><option value="off">Desactivada</option></select></label>
                  <label class="font-medium">CTA<select id="custom-cta" class="input-field mt-1 h-8 text-xs bg-white"><option value="optional">Opcional</option><option value="required">Obligatorio</option><option value="none">Ausente</option></select></label>
                  <label class="font-medium">Frase de marca<input id="custom-brand-line" class="input-field mt-1 h-8 text-xs bg-white" maxlength="140"></label>
                  <label class="col-span-2 font-medium">Tono<input id="custom-tone" class="input-field mt-1 h-8 text-xs bg-white" value="Cálido, riguroso y accesible"></label>
                  <label class="font-medium">Densidad<select id="custom-density" class="input-field mt-1 h-8 text-xs bg-white"><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option></select></label>
                  <label class="font-medium">Extensión<input id="custom-length" class="input-field mt-1 h-8 text-xs bg-white" value="1000–1600 palabras"></label>
                  <label class="col-span-2 font-medium">Tipos de fuente<input id="custom-source-types" class="input-field mt-1 h-8 text-xs bg-white" value="academic, official, science_magazine, education_blog"></label>
                  <div class="col-span-2 grid grid-cols-2 gap-2 sm:grid-cols-5 pt-1"><label><input id="custom-quote" type="checkbox"> Citas</label><label><input id="custom-lists" type="checkbox" checked> Listas</label><label><input id="custom-case" type="checkbox" checked> Casos</label><label><input id="custom-analogy" type="checkbox" checked> Analogías</label><label><input id="custom-seo" type="checkbox" checked> SEO</label></div>
                </div>
              </div>
            </div>

            <!-- PESTAÑA 2: ESPECIFICACIONES DEL ARTÍCULO -->
            <div data-modal-tab-panel="specs" class="space-y-3 hidden">
            <!-- Matriz Compacta de Especificaciones con Badges Locales -->
            <div class="spec-matrix-grid">
              <!-- Card 1: Tono de redacción -->
              <div class="spec-matrix-card" data-spec-tone="purple">
                <div class="spec-matrix-header">
                  <span class="spec-matrix-title text-purple-900">
                    <span class="grid h-4 w-4 place-items-center rounded bg-purple-100 text-purple-700 shrink-0">
                      <svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>
                    </span>
                    Tono de redacción
                  </span>
                  <span class="spec-matrix-badge text-purple-600">Múltiple</span>
                </div>
                <select data-session-spec-select="tono" class="input-field h-7 text-[11px] bg-white border-purple-200 text-slate-700 cursor-pointer" aria-label="Elegir tono del catálogo">
                  <option value="">+ Elegir tono del catálogo...</option>
                  <option value="Cálido y cercano">Cálido y cercano</option>
                  <option value="Profesional y experto">Profesional y experto</option>
                  <option value="Conversacional y natural">Conversacional y natural</option>
                  <option value="Didáctico y claro">Didáctico y claro</option>
                  <option value="Inspirador sin clichés">Inspirador sin clichés</option>
                  <option value="Analítico y riguroso">Analítico y riguroso</option>
                  <option value="Narrativo con storytelling">Narrativo con storytelling</option>
                  <option value="Empático y comprensivo">Empático y comprensivo</option>
                  <option value="Divulgativo y accesible">Divulgativo y accesible</option>
                  <option value="Periodístico y objetivo">Periodístico y objetivo</option>
                  <option value="Reflexivo y pausado">Reflexivo y pausado</option>
                  <option value="Persuasivo ético y fundamentado">Persuasivo ético</option>
                  <option value="Académico pero accesible">Académico pero accesible</option>
                  <option value="Juvenil, ágil y respetuoso">Juvenil y ágil</option>
                  <option value="Humor sutil y pertinente">Humor sutil y pertinente</option>
                </select>
                <div data-spec-badge-container="tono" class="spec-card-badges mt-1 flex flex-wrap gap-1 min-h-[1.25rem]"></div>
              </div>

              <!-- Card 2: Extensión del artículo -->
              <div class="spec-matrix-card" data-spec-tone="blue">
                <div class="spec-matrix-header">
                  <span class="spec-matrix-title text-blue-900">
                    <span class="grid h-4 w-4 place-items-center rounded bg-blue-100 text-blue-700 shrink-0">
                      <svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    </span>
                    Extensión
                  </span>
                  <span class="spec-matrix-badge text-blue-600">Una opción</span>
                </div>
                <select data-session-spec-select="extension" data-session-spec-exclusive="true" class="input-field h-7 text-[11px] bg-white border-blue-200 text-slate-700 cursor-pointer" aria-label="Elegir extensión">
                  <option value="">+ Elegir extensión o cuartillas...</option>
                  <option value="Estándar, entre 1200 y 1600 palabras">Estándar (1200–1600 palabras)</option>
                  <option value="Media, entre 1000 y 1400 palabras">Media (1000–1400 palabras)</option>
                  <option value="Breve, entre 600 y 900 palabras">Breve (600–900 palabras)</option>
                  <option value="Profunda, entre 1600 y 2200 palabras">Profunda (1600–2200 palabras)</option>
                  <option value="Guía extensa, más de 2500 palabras">Guía extensa (>2500 palabras)</option>
                  <option value="Microartículo, entre 300 y 500 palabras">Microartículo (300–500 palabras)</option>
                  <option value="Compacta, entre 900 y 1100 palabras">Compacta (900–1100 palabras)</option>
                  <option value="Newsletter, entre 500 y 800 palabras">Newsletter (500–800 palabras)</option>
                  <option value="Tutorial, entre 1500 y 2000 palabras">Tutorial (1500–2000 palabras)</option>
                  <option value="Ensayo, entre 1800 y 2400 palabras">Ensayo (1800–2400 palabras)</option>
                  <option value="Contenido pilar, entre 2500 y 3500 palabras">Contenido pilar SEO</option>
                  <option value="Una cuartilla: 1012 palabras de cuerpo del artículo, sin contar bibliografía">1 cuartilla (1012 pal.)</option>
                  <option value="Dos cuartillas: 2024 palabras de cuerpo del artículo, sin contar bibliografía">2 cuartillas (2024 pal.)</option>
                  <option value="Tres cuartillas: 3036 palabras de cuerpo del artículo, sin contar bibliografía">3 cuartillas (3036 pal.)</option>
                  <option value="Cuatro cuartillas: 4048 palabras de cuerpo del artículo, sin contar bibliografía">4 cuartillas (4048 pal.)</option>
                  <option value="Cinco cuartillas: 5060 palabras de cuerpo del artículo, sin contar bibliografía">5 cuartillas (5060 pal.)</option>
                  <option value="Seis cuartillas: 6072 palabras de cuerpo del artículo, sin contar bibliografía">6 cuartillas (6072 pal.)</option>
                </select>
                <div data-spec-badge-container="extension" class="spec-card-badges mt-1 flex flex-wrap gap-1 min-h-[1.25rem]"></div>
              </div>

              <!-- Card 3: Fuentes y Plataformas -->
              <div class="spec-matrix-card" data-spec-tone="amber">
                <div class="spec-matrix-header">
                  <span class="spec-matrix-title text-amber-900">
                    <span class="grid h-4 w-4 place-items-center rounded bg-amber-100 text-amber-700 shrink-0">
                      <svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                    </span>
                    Fuentes y Plataformas
                  </span>
                  <span class="spec-matrix-badge text-amber-600">Rigor</span>
                </div>
                <!-- Plataformas de investigación -->
                <div class="space-y-1">
                  <select data-session-platform-select class="input-field h-7 text-[11px] bg-white border-amber-200 text-slate-700 cursor-pointer" aria-label="Elegir plataforma de investigación">
                    <option value="">+ Añadir plataforma de investigación...</option>
                    ${(globalThis.MarcieResearchPolicy?.platforms || []).concat([{ id: "supplemental", name: "Otros sitios fiables" }]).map(platform => `<option value="${escapeModalHtml(platform.id)}">${escapeModalHtml(platform.name)}</option>`).join("")}
                  </select>
                  <div data-platform-badge-container class="spec-card-badges flex flex-wrap gap-1 min-h-[1.25rem]"></div>
                </div>
                <!-- Criterios de fuentes -->
                <div class="space-y-1 pt-1 border-t border-amber-100/60">
                  <select data-session-spec-select="fuentes" class="input-field h-7 text-[11px] bg-white border-amber-200 text-slate-700 cursor-pointer" aria-label="Elegir criterio de fuentes">
                    <option value="">+ Añadir criterio de fuentes...</option>
                    <option value="Artículos académicos revisados por pares">Académicas revisadas por pares</option>
                    <option value="Organismos oficiales e institucionales">Organismos oficiales e institucionales</option>
                    <option value="Estudios recientes y verificables">Estudios recientes verificables</option>
                    <option value="Metaanálisis y revisiones sistemáticas">Metaanálisis y revisiones</option>
                    <option value="Libros de autores reconocidos">Libros de autores reconocidos</option>
                    <option value="Informes técnicos y libros blancos">Informes técnicos</option>
                    <option value="Estadísticas públicas verificables">Estadísticas públicas</option>
                    <option value="Publicaciones de universidades reconocidas">Universidades reconocidas</option>
                    <option value="Normas y estándares profesionales vigentes">Normas y estándares</option>
                    <option value="Legislación y normativa oficial aplicable">Normativa oficial</option>
                    <option value="Conjuntos de datos abiertos y verificables">Datasets abiertos</option>
                    <option value="Medios especializados de reconocido prestigio">Medios especializados</option>
                  </select>
                  <div data-spec-badge-container="fuentes" class="spec-card-badges flex flex-wrap gap-1 min-h-[1.25rem]"></div>
                </div>
                <div class="marcie-youtube-source pt-2 border-t border-amber-100/60">
                  <label class="marcie-youtube-source__toggle"><input id="new-session-youtube-toggle" type="checkbox"><span>Usar videos de YouTube como fuente base</span></label>
                  <div id="new-session-youtube-editor" class="marcie-youtube-source__editor hidden">
                    <div id="new-session-youtube-rows" class="marcie-youtube-source__rows"></div>
                    <div class="marcie-youtube-source__actions">
                      <button id="new-session-youtube-add" type="button"><i data-lucide="plus"></i><span>Agregar video</span></button>
                      <button id="new-session-youtube-analyze" type="button"><i data-lucide="scan-search"></i><span>Analizar videos</span></button>
                    </div>
                    <p id="new-session-youtube-status" aria-live="polite">Solo videos públicos. Máximo cinco.</p>
                  </div>
                </div>
              </div>

              <!-- Card 4: Recursos Editoriales -->
              <div class="spec-matrix-card" data-spec-tone="teal">
                <div class="spec-matrix-header">
                  <span class="spec-matrix-title text-cyan-900">
                    <span class="grid h-4 w-4 place-items-center rounded bg-cyan-100 text-cyan-700 shrink-0">
                      <svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                    </span>
                    Recursos Editoriales
                  </span>
                  <span class="spec-matrix-badge text-cyan-600">APA 7</span>
                </div>
                <select data-session-spec-select="concepto" class="input-field h-7 text-[11px] bg-white border-cyan-200 text-slate-700 cursor-pointer" aria-label="Elegir recurso editorial">
                  <option value="">+ Elegir recurso del catálogo...</option>
                  <option value="Incluir ejemplos prácticos y verosímiles">Ejemplos prácticos y verosímiles</option>
                  <option value="Incluir datos verificables con contexto">Datos verificables con contexto</option>
                  <option value="Incluir pasos accionables para el lector">Pasos accionables para el lector</option>
                  <option value="Incluir una checklist práctica">Checklist práctica</option>
                  <option value="Diferenciar mitos y realidades con evidencia">Mitos y hechos con evidencia</option>
                  <option value="Incluir preguntas para la reflexión">Preguntas de reflexión</option>
                  <option value="Aplicar SEO natural sin sobreoptimización">SEO natural</option>
                  <option value="Evitar clichés, lugares comunes y frases genéricas">Sin clichés ni frases genéricas</option>
                  <option value="Incluir una comparación clara de alternativas">Comparativa de alternativas</option>
                  <option value="Desarrollar un caso de estudio documentado">Caso de estudio documentado</option>
                  <option value="Cerrar con aprendizajes clave memorables">Aprendizajes clave finales</option>
                  <option value="Añadir preguntas frecuentes útiles">Preguntas frecuentes (FAQ)</option>
                  <option value="Incluir un glosario breve de términos">Glosario breve de términos</option>
                  <option value="Considerar objeciones y responderlas con rigor">Objeciones respondidas</option>
                  <option value="Usar analogías claras sin simplificar en exceso">Analogías claras</option>
                </select>
                <div data-spec-badge-container="concepto" class="spec-card-badges mt-1 flex flex-wrap gap-1 min-h-[1.25rem]"></div>
              </div>
            </div>
            <div class="rounded-lg border border-teal-200 bg-teal-50/40 p-3 shadow-2xs" id="editorial-vocabulary-section">
              <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="grid h-5 w-5 place-items-center rounded bg-teal-100 text-teal-700 font-bold text-[10px]">Aa</span>
                  <label for="editorial-vocabulary-input" class="text-xs font-bold text-slate-800">Vocabulario editorial preferente</label>
                  <span id="editorial-vocabulary-count" class="rounded-full border border-teal-200 bg-white px-2 py-0.5 text-[9px] font-bold text-teal-800">${initialVocabulary.length} términos</span>
                </div>
                <button id="reset-editorial-vocabulary" type="button" class="text-[10px] font-semibold text-teal-700 hover:text-teal-950 cursor-pointer">Restablecer lista base</button>
              </div>
              <textarea id="editorial-vocabulary-input" rows="14" class="input-field h-64 min-h-48 max-h-[45vh] w-full resize-y overflow-y-auto bg-white text-[11px] leading-5" spellcheck="true" aria-label="Vocabulario editorial preferente, un término por línea">${escapeModalHtml(initialVocabulary.join("\n"))}</textarea>
            </div>
          </div>
        </div>

          <!-- PANEL DE REVISIÓN Y DESCARGA DE ESPECIFICACIONES (PREVIEW) -->
          <div id="modal-spec-preview-panel" class="hidden flex flex-col gap-3">
            <div class="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <div>
                <h3 class="text-sm font-bold text-slate-900 m-0">Especificaciones de los Artículos a Crear</h3>
                <p class="text-[11px] text-slate-500 m-0">Verifica las especificaciones de cada público antes de iniciar la automatización o descarga el documento Word.</p>
              </div>
              <span id="spec-preview-total-badge" class="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold">4 artículos</span>
            </div>

            <!-- Contenedor scrollable de tarjetas de cada artículo por público -->
            <div id="spec-preview-cards-container" class="space-y-2.5 max-h-[360px] overflow-y-auto pr-1"></div>

            <!-- Barra de acciones de la vista previa -->
            <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
              <button id="btn-download-specs-word" type="button" class="btn btn-outline h-9 px-3 text-xs flex items-center gap-1.5 border-cyan-300 text-cyan-800 hover:bg-cyan-50 cursor-pointer shadow-2xs">
                <svg class="h-4 w-4 text-cyan-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                <span>Descargar especificaciones (Word)</span>
              </button>
              <div class="flex items-center gap-2">
                <button id="btn-spec-preview-back" type="button" class="btn btn-outline h-9 px-4 text-xs cursor-pointer">Volver a editar</button>
                <button id="btn-spec-preview-confirm" type="button" class="btn btn-primary h-9 px-5 text-xs font-bold cursor-pointer">Crear artículos</button>
              </div>
            </div>
          </div>
        </div>
      `,
      footerButtonsHtml: `
        <button id="new-session-cancel" type="button" class="btn btn-outline h-9 px-4 text-xs">Cancelar</button>
        ${allowBlankSession ? '<button id="new-session-create-blank" type="button" class="btn btn-ghost h-9 px-4 text-xs">Sesión en blanco</button>' : ""}
        <button id="new-session-create" type="button" class="btn btn-primary h-9 px-4 text-xs" disabled>Crear sesión</button>
      `
    });

    const input = modal.element.querySelector("#new-session-title-input");
    const createButton = modal.element.querySelector("#new-session-create");
    const cancelButton = modal.element.querySelector("#new-session-cancel");
    const createBlankButton = modal.element.querySelector("#new-session-create-blank");
    const error = modal.element.querySelector("#new-session-title-error");
    const count = modal.element.querySelector("#new-session-title-count");
    const modeButtons = Array.from(modal.element.querySelectorAll("[data-new-session-mode]"));
    const refineButton = modal.element.querySelector("#new-session-refine-topic");
    const refineStatus = modal.element.querySelector("#new-session-refine-status");
    const titleProposalsCard = modal.element.querySelector("#new-session-title-proposals");
    const titleProposalsGrid = modal.element.querySelector("#title-proposals-grid");
    const titleProposalsAudienceBadge = modal.element.querySelector("#title-proposals-audience-badge");
    const presetSelect = modal.element.querySelector("#new-session-preset-select");
    const savePresetButton = modal.element.querySelector("#btn-save-session-preset");
    const deletePresetButton = modal.element.querySelector("#btn-delete-session-preset");
    const humanizeToggle = modal.element.querySelector("#new-session-humanize-toggle");
    const specificationSummary = modal.element.querySelector("#new-session-spec-summary");
    const resetBriefButton = modal.element.querySelector("#new-session-reset-brief");
    const freeModeInput = modal.element.querySelector("#new-session-free-mode");
    const promptProfileSelect = modal.element.querySelector("#new-session-prompt-profile");
    const editorialModeInputs = Array.from(modal.element.querySelectorAll('input[name="editorial-mode"]'));
    const customProfilePanel = modal.element.querySelector("#new-session-custom-profile");
    const specSelects = Array.from(modal.element.querySelectorAll("[data-session-spec-select]"));
    const topControlCard = modal.element.querySelector("#modal-top-control-card");
    const audienceScopeBar = modal.element.querySelector("#modal-audience-scope-bar");
    const presetToolbar = modal.element.querySelector("#modal-preset-toolbar");
    const tabNavContainer = modal.element.querySelector("#modal-tab-nav-container");
    const tabButtons = Array.from(modal.element.querySelectorAll("[data-modal-tab-target]"));
    const tabPanels = Array.from(modal.element.querySelectorAll("[data-modal-tab-panel]"));
    const previewPanel = modal.element.querySelector("#modal-spec-preview-panel");
    const previewCardsContainer = modal.element.querySelector("#spec-preview-cards-container");
    const previewTotalBadge = modal.element.querySelector("#spec-preview-total-badge");
    const btnDownloadSpecsWord = modal.element.querySelector("#btn-download-specs-word");
    const btnSpecPreviewBack = modal.element.querySelector("#btn-spec-preview-back");
    const btnSpecPreviewConfirm = modal.element.querySelector("#btn-spec-preview-confirm");
    const topicFieldLabel = modal.element.querySelector("#topic-field-label");
    const topicAudienceBadge = modal.element.querySelector("#topic-audience-badge");
    const topicModeSwitch = modal.element.querySelector("#toggle-topic-mode-switch");
    const modeInfoTitle = modal.element.querySelector("#mode-info-title");
    const modeInfoDesc = modal.element.querySelector("#mode-info-desc");
    const vocabularyInput = modal.element.querySelector("#editorial-vocabulary-input");
    const vocabularyCount = modal.element.querySelector("#editorial-vocabulary-count");
    const resetVocabularyButton = modal.element.querySelector("#reset-editorial-vocabulary");

    const readPreferredVocabulary = () => normalizeEditorialVocabulary(vocabularyInput?.value || []);
    const updateVocabularyCount = () => {
      const terms = readPreferredVocabulary();
      if (vocabularyCount) vocabularyCount.textContent = `${terms.length} ${terms.length === 1 ? "término" : "términos"}`;
      return terms;
    };
    vocabularyInput?.addEventListener("input", () => saveEditorialVocabulary(updateVocabularyCount()));
    vocabularyInput?.addEventListener("blur", () => {
      const terms = saveEditorialVocabulary(updateVocabularyCount());
      vocabularyInput.value = terms.join("\n");
    });
    resetVocabularyButton?.addEventListener("click", () => {
      const terms = saveEditorialVocabulary(DEFAULT_EDITORIAL_VOCABULARY);
      if (vocabularyInput) vocabularyInput.value = terms.join("\n");
      updateVocabularyCount();
    });

    const ALL_AUDIENCE_KEYS = ["students", "parents", "educators", "coordinators"];
    const selectedAudiences = new Set(
      Array.isArray(initialConfiguration?.selectedAudiences) && initialConfiguration.selectedAudiences.length
        ? initialConfiguration.selectedAudiences
        : ALL_AUDIENCE_KEYS
    );

    const availablePlatforms = (globalThis.MarcieResearchPolicy?.platforms || []).concat([{ id: "supplemental", name: "Otros sitios fiables" }]);
    const selectedPlatforms = new Set(
      Array.isArray(initialConfiguration?.searchPlatforms) && initialConfiguration.searchPlatforms.length > 0
        ? initialConfiguration.searchPlatforms
        : availablePlatforms.map(p => p.id)
    );

    const platformSelect = modal.element.querySelector("[data-session-platform-select]");
    const platformBadgeContainer = modal.element.querySelector("[data-platform-badge-container]");
    const youtubeToggle = modal.element.querySelector("#new-session-youtube-toggle");
    const youtubeEditor = modal.element.querySelector("#new-session-youtube-editor");
    const youtubeRows = modal.element.querySelector("#new-session-youtube-rows");
    const youtubeAdd = modal.element.querySelector("#new-session-youtube-add");
    const youtubeAnalyze = modal.element.querySelector("#new-session-youtube-analyze");
    const youtubeStatus = modal.element.querySelector("#new-session-youtube-status");
    let manualVideoResearch = initialConfiguration?.videoResearch || initialConfiguration?.sessionConfiguration?.videoResearch || null;

    const youtubeUrls = () => [...(youtubeRows?.querySelectorAll("input") || [])].map((field) => field.value.trim()).filter(Boolean);
    const setYoutubeStatus = (message, state = "idle") => {
      if (!youtubeStatus) return;
      youtubeStatus.textContent = message;
      youtubeStatus.dataset.state = state;
    };
    const addYoutubeRow = (value = "") => {
      if (!youtubeRows || youtubeRows.children.length >= 5) return;
      const row = document.createElement("label");
      row.innerHTML = `<span data-video-progress>URL ${youtubeRows.children.length + 1}</span><input type="url" inputmode="url" placeholder="https://www.youtube.com/watch?v=..." value="${escapeModalHtml(value)}"><button type="button" title="Quitar video" aria-label="Quitar video"><i data-lucide="trash-2"></i></button>`;
      row.querySelector("input")?.addEventListener("input", () => { manualVideoResearch = null; setYoutubeStatus("Los enlaces cambiaron. Analízalos antes de crear la sesión.", "pending"); });
      row.querySelector("button")?.addEventListener("click", () => {
        row.remove();
        manualVideoResearch = null;
        if (!youtubeRows.children.length) addYoutubeRow();
        setYoutubeStatus("Los enlaces cambiaron. Analízalos antes de crear la sesión.", "pending");
      });
      youtubeRows.appendChild(row);
      window.lucide?.createIcons?.();
    };
    const renderYoutubeInputs = (items = []) => {
      youtubeRows?.replaceChildren();
      (items.length ? items : [{ url: "" }]).slice(0, 5).forEach((item) => addYoutubeRow(item?.url || item));
    };
    const initialYoutubeInputs = initialConfiguration?.sourceInputs?.youtube || initialConfiguration?.sessionConfiguration?.sourceInputs?.youtube || [];
    if (initialYoutubeInputs.length || manualVideoResearch?.videos?.length) {
      youtubeToggle.checked = true;
      youtubeEditor?.classList.remove("hidden");
    }
    renderYoutubeInputs(initialYoutubeInputs);
    if (manualVideoResearch?.videos?.length) setYoutubeStatus(`${manualVideoResearch.videos.length} video(s) analizados y listos.`, "ready");
    youtubeToggle?.addEventListener("change", () => {
      youtubeEditor?.classList.toggle("hidden", !youtubeToggle.checked);
      if (!youtubeToggle.checked) manualVideoResearch = null;
    });
    youtubeAdd?.addEventListener("click", () => addYoutubeRow());
    youtubeAnalyze?.addEventListener("click", async () => {
      const urls = youtubeUrls();
      if (!urls.length) return setYoutubeStatus("Agrega al menos una URL pública de YouTube.", "error");
      youtubeAnalyze.disabled = true;
      youtubeRows?.querySelectorAll("[data-video-progress]").forEach((status) => { status.textContent = "Analizando"; });
      setYoutubeStatus(`Analizando ${urls.length} ${urls.length === 1 ? "video" : "videos"} con Gemini…`, "processing");
      try {
        manualVideoResearch = await analyzeYoutubeVideos(urls, String(input?.value || centralTopic || "").trim());
        youtubeRows?.querySelectorAll("[data-video-progress]").forEach((status) => { status.textContent = "Revisado"; });
        setYoutubeStatus(`${manualVideoResearch.videos?.length || 0} video(s) analizados. ${manualVideoResearch.warnings?.length ? `${manualVideoResearch.warnings.length} advertencia(s).` : "Listos para usar."}`, "ready");
      } catch (error) {
        manualVideoResearch = null;
        youtubeRows?.querySelectorAll("[data-video-progress]").forEach((status) => { status.textContent = "Error"; });
        setYoutubeStatus(error.message || "No fue posible analizar los videos.", "error");
      } finally {
        youtubeAnalyze.disabled = false;
      }
    });

    const initialProposals = initialConfiguration?.titleProposals
      || initialConfiguration?.sessionConfiguration?.titleProposals
      || (() => {
        try {
          const draft = JSON.parse(localStorage.getItem("marcie_draft_title_proposals") || "null");
          if (draft && (draft.byAudience || draft.hooks?.length || draft.contrahooks?.length)) return draft;
        } catch (_) {}
        return { byAudience: {} };
      })();
    let titleProposalsByAudience = normalizeTitleProposalsByAudience(initialProposals);
    let selectedMode = "manual";
    let centralTopic = String(defaultValue || "").trim();
    let topicAssignmentMode = "shared";
    const audienceTopics = {
      all: centralTopic,
      educators: "",
      parents: "",
      students: "",
      coordinators: ""
    };

    try {
      const savedAudienceTopics = JSON.parse(localStorage.getItem("marcie_saved_audience_topics") || "null");
      if (savedAudienceTopics && typeof savedAudienceTopics === "object") {
        Object.entries(savedAudienceTopics).forEach(([k, v]) => {
          if (v && audienceTopics[k] !== undefined && !audienceTopics[k]) {
            audienceTopics[k] = v;
          }
        });
        if (savedAudienceTopics.all && !centralTopic) centralTopic = savedAudienceTopics.all;
      }
      const savedTopicMode = localStorage.getItem("marcie_topic_assignment_mode");
      if (savedTopicMode === "per_audience" || savedTopicMode === "shared") {
        topicAssignmentMode = savedTopicMode;
      }
    } catch (_) {}

    const generatedForTopicByAudience = Object.fromEntries(
      Object.entries(titleProposalsByAudience).map(([audience, proposals]) => [audience, String(proposals.topic || centralTopic || "").trim()])
    );

    const persistTitleProposals = () => {
      try {
        const serialized = serializeTitleProposals(titleProposalsByAudience);
        if (serialized) localStorage.setItem("marcie_draft_title_proposals", JSON.stringify(serialized));
        else localStorage.removeItem("marcie_draft_title_proposals");
      } catch (_) {}
    };

    const specifications = (() => {
      if (initialConfiguration) return normalizeEditorialSpecifications(initialConfiguration.specifications || []);
      try {
        const saved = JSON.parse(localStorage.getItem(MARCIE_AUTOMATED_BRIEF_STORAGE_KEY) || "[]");
        return Array.isArray(saved) ? normalizeEditorialSpecifications(saved).slice(0, 100) : [];
      } catch (_) {
        return [];
      }
    })();

    // Cargar temas específicos por audiencia si existen en specifications
    specifications.forEach((spec, idx) => {
      const p = parseSpecItem(spec, idx);
      if ((p.category === "tema" || p.category === "titulo" || p.category === "title") && p.audience && p.audience !== "all") {
        if (audienceTopics[p.audience] !== undefined) {
          audienceTopics[p.audience] = p.value;
          topicAssignmentMode = "per_audience";
        }
      } else if ((p.category === "tema" || p.category === "titulo" || p.category === "title") && (!p.audience || p.audience === "all")) {
        audienceTopics.all = p.value;
        if (!centralTopic) centralTopic = p.value;
      }
    });

    const persistBriefAndAudienceTopics = () => {
      try {
        localStorage.setItem(MARCIE_AUTOMATED_BRIEF_STORAGE_KEY, JSON.stringify(specifications));
        localStorage.setItem("marcie_saved_audience_topics", JSON.stringify(audienceTopics));
        localStorage.setItem("marcie_topic_assignment_mode", topicAssignmentMode);
      } catch (_) {}
    };

    const renderAudienceScopeButtons = () => {
      const allSelected = ALL_AUDIENCE_KEYS.every(k => selectedAudiences.has(k));
      specAudienceTabs.forEach((tab) => {
        const audId = tab.getAttribute("data-spec-target-audience") || "all";
        const isFocused = audId === activeAudienceScope;

        if (audId === "all") {
          const isChecked = allSelected;
          tab.className = `spec-audience-tab px-2.5 py-1 rounded-md cursor-pointer transition-all border shadow-2xs text-[10px] select-none ${
            isFocused ? "ring-2 ring-offset-1 ring-slate-900 font-bold scale-[1.03]" : ""
          }`;
          if (isChecked) {
            tab.innerHTML = `<span class="mr-1 font-bold text-[9px]">✓</span>Todos`;
            tab.classList.add("bg-cyan-700", "text-white", "border-cyan-800", "font-bold");
          } else {
            tab.innerHTML = `<span class="mr-1 text-slate-400 font-normal">○</span>Todos`;
            tab.classList.add("bg-white", "text-slate-500", "border-slate-200", "hover:bg-slate-50", "font-normal");
          }
          return;
        }

        const isChecked = selectedAudiences.has(audId);
        const meta = AUDIENCE_META[audId] || { label: audId, shortLabel: audId };
        const labelText = meta.shortLabel || meta.label || audId;

        tab.className = `spec-audience-tab px-2.5 py-1 rounded-md cursor-pointer transition-all border shadow-2xs text-[10px] select-none ${
          isFocused ? "ring-2 ring-offset-1 ring-slate-900 font-bold scale-[1.03]" : ""
        }`;

        if (isChecked) {
          tab.innerHTML = `<span class="mr-1 font-bold text-[9px]">✓</span>${escapeModalHtml(labelText)}`;
          tab.classList.add("font-bold", "text-white");
          switch (audId) {
            case "educators":
              tab.classList.add("bg-indigo-600", "border-indigo-700");
              break;
            case "parents":
              tab.classList.add("bg-emerald-600", "border-emerald-700");
              break;
            case "students":
              tab.classList.add("bg-amber-500", "border-amber-600");
              break;
            case "coordinators":
              tab.classList.add("bg-purple-600", "border-purple-700");
              break;
          }
        } else {
          tab.innerHTML = `<span class="mr-1 text-slate-400 font-normal">○</span>${escapeModalHtml(labelText)}`;
          tab.classList.add("bg-slate-50", "text-slate-400", "border-slate-200", "hover:border-slate-300", "hover:text-slate-600", "font-normal", "opacity-75");
        }
      });
    };

    const syncEditorialModeAndAudienceUI = () => {
      editorialModeInputs.forEach((radio) => {
        const card = radio.closest(".editorial-profile-card") || radio.parentElement;
        if (card) {
          card.classList.toggle("is-selected", radio.checked);
        }
      });
      const selectedRadio = editorialModeInputs.find(r => r.checked);
      customProfilePanel?.classList.toggle("hidden", selectedRadio?.value !== "custom");
      renderAudienceScopeButtons();
    };

    editorialModeInputs.forEach((radio) => {
      radio.addEventListener("change", () => {
        syncEditorialModeAndAudienceUI();
      });
    });

    const applyPreset = (p) => {
      if (!p) return;
      if (p.region) {
        const regEl = modal.element.querySelector("#new-session-region");
        if (regEl) regEl.value = p.region;
      }
      if (p.period) {
        const perEl = modal.element.querySelector("#new-session-period");
        if (perEl) perEl.value = p.period;
      }
      if (p.mode) {
        setMode(p.mode);
      }
      if (p.humanize != null && humanizeToggle) {
        humanizeToggle.checked = Boolean(p.humanize);
      }
      if (p.freeMode != null && freeModeInput) {
        freeModeInput.checked = Boolean(p.freeMode);
        if (promptProfileSelect) {
          promptProfileSelect.value = p.freeMode ? "free" : (p.promptProfileId || "default");
        }
      } else if (p.promptProfileId && promptProfileSelect) {
        promptProfileSelect.value = p.promptProfileId;
        if (freeModeInput) freeModeInput.checked = (p.promptProfileId === "free");
      }
      if (p.editorialMode) {
        const radio = editorialModeInputs.find(i => i.value === p.editorialMode);
        if (radio) {
          radio.checked = true;
          syncEditorialModeAndAudienceUI();
        }
      }
      if (p.customProfileSnapshot) {
        const snap = p.customProfileSnapshot;
        const fields = {
          "#custom-profile-select": snap.id,
          "#custom-structure": snap.structure,
          "#custom-opening": snap.opening,
          "#custom-minimum-sources": snap.minimumSources,
          "#custom-history": snap.historicalComparison,
          "#custom-cta": snap.ctaPolicy,
          "#custom-brand-line": snap.brandLine,
          "#custom-tone": snap.tone,
          "#custom-density": snap.evidenceDensity,
          "#custom-length": snap.length,
          "#custom-source-types": snap.sourceTypes
        };
        Object.entries(fields).forEach(([sel, val]) => {
          const el = modal.element.querySelector(sel);
          if (el && val != null) el.value = val;
        });
        const checks = {
          "#custom-quote": snap.includeQuote,
          "#custom-lists": snap.includeLists,
          "#custom-case": snap.includeCaseStudy,
          "#custom-analogy": snap.includeAnalogy,
          "#custom-seo": snap.seo
        };
        Object.entries(checks).forEach(([sel, chk]) => {
          const el = modal.element.querySelector(sel);
          if (el && chk != null) el.checked = Boolean(chk);
        });
      }
      if (p.topicAssignmentMode) {
        topicAssignmentMode = p.topicAssignmentMode;
        if (topicModeSwitch) topicModeSwitch.checked = (topicAssignmentMode === "per_audience");
      }
      if (Array.isArray(p.audiences) && p.audiences.length) {
        selectedAudiences.clear();
        p.audiences.forEach(a => selectedAudiences.add(a));
        renderAudienceScopeButtons();
      }
      if (Array.isArray(p.searchPlatforms) && p.searchPlatforms.length) {
        selectedPlatforms.clear();
        p.searchPlatforms.forEach(sp => selectedPlatforms.add(sp));
        renderPlatformBadges();
      }
      const presetYoutube = Array.isArray(p.sourceInputs?.youtube) ? p.sourceInputs.youtube : [];
      if (youtubeToggle) youtubeToggle.checked = presetYoutube.length > 0;
      youtubeEditor?.classList.toggle("hidden", presetYoutube.length === 0);
      renderYoutubeInputs(presetYoutube);
      manualVideoResearch = null;
      setYoutubeStatus(presetYoutube.length
        ? "Analiza nuevamente estos videos antes de crear la sesión."
        : "Solo videos públicos. Máximo cinco.", presetYoutube.length ? "pending" : "idle");
      if (Array.isArray(p.specifications)) {
        const titleSpecs = specifications.filter(s => {
          const parsed = parseSpecItem(s);
          return parsed.category === "titulo" || parsed.category === "title" || parsed.category === "tema";
        });
        const presetSpecsWithoutTitles = p.specifications.filter(s => {
          const parsed = parseSpecItem(s);
          return parsed.category !== "titulo" && parsed.category !== "title" && parsed.category !== "tema";
        });
        specifications.splice(0, specifications.length, ...titleSpecs, ...presetSpecsWithoutTitles);
        renderSpecifications();
      }
    };

    const loadPresetsFromStorage = (autoApplyLastUsed = false) => {
      if (!presetSelect) return;
      try {
        const presets = JSON.parse(localStorage.getItem("marcie_saved_presets_v1") || "[]");
        presetSelect.innerHTML = '<option value="">-- Cargar preset --</option>' +
          presets.map((p, i) => `<option value="${i}">${escapeModalHtml(p.name)}</option>`).join("");

        if (autoApplyLastUsed && presets.length > 0 && !initialConfiguration) {
          const lastUsedName = localStorage.getItem("marcie_last_used_preset_name");
          const lastUsedIdxStr = localStorage.getItem("marcie_last_used_preset_idx");
          let matchIdx = -1;
          if (lastUsedName) {
            matchIdx = presets.findIndex(p => p.name === lastUsedName);
          }
          if (matchIdx < 0 && lastUsedIdxStr !== null && !isNaN(Number(lastUsedIdxStr))) {
            const idx = Number(lastUsedIdxStr);
            if (presets[idx]) matchIdx = idx;
          }
          if (matchIdx < 0) {
            matchIdx = 0;
          }
          if (matchIdx >= 0 && presets[matchIdx]) {
            presetSelect.value = String(matchIdx);
            applyPreset(presets[matchIdx]);
          }
        }
      } catch (_) {}
    };

    savePresetButton?.addEventListener("click", () => {
      const currentIdxStr = presetSelect?.value;
      let presets = [];
      try {
        presets = JSON.parse(localStorage.getItem("marcie_saved_presets_v1") || "[]");
      } catch (_) {}

      const hasSelectedPreset = currentIdxStr !== "" && currentIdxStr != null && !isNaN(Number(currentIdxStr)) && Boolean(presets[Number(currentIdxStr)]);
      let name = "";

      if (hasSelectedPreset) {
        const existingPreset = presets[Number(currentIdxStr)];
        name = prompt(`Sobrescribir preset "${existingPreset.name}" (o ingresa un nuevo nombre):`, existingPreset.name);
      } else {
        name = prompt("Nombre para este Preset de Configuración:", "Mi Preset Editorial");
      }

      if (!name || !name.trim()) return;

      try {
        const presetData = {
          name: name.trim(),
          region: modal.element.querySelector("#new-session-region")?.value || "MX",
          period: modal.element.querySelector("#new-session-period")?.value || "6m",
          mode: selectedMode,
          editorialMode: editorialModeInputs.find(i => i.checked)?.value || "marcie",
          humanize: humanizeToggle?.checked === true,
          freeMode: freeModeInput?.checked === true,
          promptProfileId: promptProfileSelect?.value || (freeModeInput?.checked ? "free" : "default"),
          topicAssignmentMode,
          audiences: Array.from(selectedAudiences),
          searchPlatforms: Array.from(selectedPlatforms),
          sourceInputs: {
            youtube: youtubeToggle?.checked
              ? youtubeUrls().slice(0, 5).map((url) => ({ url }))
              : []
          },
          specifications: specifications.filter(s => {
            const p = parseSpecItem(s);
            return p.category !== "titulo" && p.category !== "title" && p.category !== "tema";
          }),
          customProfileSnapshot: {
            id: modal.element.querySelector("#custom-profile-select")?.value || "",
            structure: modal.element.querySelector("#custom-structure")?.value || "hybrid",
            opening: modal.element.querySelector("#custom-opening")?.value || "scene",
            minimumSources: Number(modal.element.querySelector("#custom-minimum-sources")?.value || 8),
            historicalComparison: modal.element.querySelector("#custom-history")?.value || "when_supported",
            ctaPolicy: modal.element.querySelector("#custom-cta")?.value || "optional",
            brandLine: modal.element.querySelector("#custom-brand-line")?.value?.trim() || "",
            tone: modal.element.querySelector("#custom-tone")?.value?.trim() || "Cálido, riguroso y accesible",
            evidenceDensity: modal.element.querySelector("#custom-density")?.value || "high",
            length: modal.element.querySelector("#custom-length")?.value?.trim() || "1000–1600 palabras",
            sourceTypes: modal.element.querySelector("#custom-source-types")?.value?.trim() || "academic, official, science_magazine, education_blog",
            includeQuote: modal.element.querySelector("#custom-quote")?.checked === true,
            includeLists: modal.element.querySelector("#custom-lists")?.checked === true,
            includeCaseStudy: modal.element.querySelector("#custom-case")?.checked === true,
            includeAnalogy: modal.element.querySelector("#custom-analogy")?.checked === true,
            seo: modal.element.querySelector("#custom-seo")?.checked === true
          }
        };

        let targetIdx = -1;
        if (hasSelectedPreset) {
          targetIdx = Number(currentIdxStr);
          presets[targetIdx] = presetData;
        } else {
          presets.push(presetData);
          targetIdx = presets.length - 1;
        }

        localStorage.setItem("marcie_saved_presets_v1", JSON.stringify(presets));
        localStorage.setItem("marcie_last_used_preset_name", presetData.name);
        localStorage.setItem("marcie_last_used_preset_idx", String(targetIdx));
        loadPresetsFromStorage(false);
        if (presetSelect) presetSelect.value = String(targetIdx);
        alert(hasSelectedPreset ? `Preset "${presetData.name}" actualizado con éxito.` : `Preset "${presetData.name}" guardado con éxito.`);
      } catch (err) {
        alert("No se pudo guardar el preset.");
      }
    });

    deletePresetButton?.addEventListener("click", () => {
      const idx = presetSelect?.value;
      if (idx === "" || idx == null) {
        alert("Selecciona primero el preset que deseas eliminar.");
        return;
      }
      try {
        const presets = JSON.parse(localStorage.getItem("marcie_saved_presets_v1") || "[]");
        const p = presets[Number(idx)];
        if (!p) return;
        if (!confirm(`¿Eliminar el preset "${p.name}"?`)) return;
        if (localStorage.getItem("marcie_last_used_preset_name") === p.name) {
          localStorage.removeItem("marcie_last_used_preset_name");
          localStorage.removeItem("marcie_last_used_preset_idx");
        }
        presets.splice(Number(idx), 1);
        localStorage.setItem("marcie_saved_presets_v1", JSON.stringify(presets));
        loadPresetsFromStorage(false);
        if (presetSelect) presetSelect.value = "";
      } catch (err) {
        alert("No se pudo eliminar el preset.");
      }
    });

    presetSelect?.addEventListener("change", (e) => {
      const idx = e.target.value;
      if (idx === "") return;
      try {
        const presets = JSON.parse(localStorage.getItem("marcie_saved_presets_v1") || "[]");
        const p = presets[Number(idx)];
        if (p) {
          localStorage.setItem("marcie_last_used_preset_name", p.name);
          localStorage.setItem("marcie_last_used_preset_idx", String(idx));
          applyPreset(p);
        }
      } catch (_) {}
    });

    let activeAudienceScope = "all";
    const specAudienceTabs = Array.from(modal.element.querySelectorAll("[data-spec-target-audience]"));

    const getSelectedTitleForAudience = (aud) => {
      const targetAud = aud || activeAudienceScope;
      // 1. Buscar primero en specifications si hay un #titulo o #tema con audiencia explícita
      const found = specifications.find((item, idx) => {
        const p = parseSpecItem(item, idx);
        return (p.category === "titulo" || p.category === "title" || p.category === "tema") && p.audience === targetAud;
      });
      if (found) {
        const p = parseSpecItem(found);
        return p.value;
      }
      // 2. Si targetAud es "all", retornar el tema general
      if (targetAud === "all") {
        return String(audienceTopics.all || centralTopic || input?.value || "").trim();
      }
      // 3. Si targetAud es una audiencia específica
      if (audienceTopics[targetAud]) {
        return audienceTopics[targetAud];
      }
      return topicAssignmentMode === "shared" ? (audienceTopics.all || centralTopic || "") : "";
    };

    const updateTopicUIForCurrentScope = () => {
      if (!input) return;
      const isShared = topicAssignmentMode === "shared";
      if (topicModeSwitch) topicModeSwitch.checked = !isShared;

      if (isShared && activeAudienceScope === "all") {
        input.value = audienceTopics.all || centralTopic || "";
        if (topicFieldLabel) topicFieldLabel.textContent = "Tema central del artículo (todos los públicos)";
        if (topicAudienceBadge) topicAudienceBadge.classList.add("hidden");
        input.placeholder = "Ej. Estrategias de aprendizaje activo con tecnología";
      } else {
        const targetAud = activeAudienceScope === "all" ? (Array.from(selectedAudiences)[0] || "educators") : activeAudienceScope;
        const currentVal = audienceTopics[targetAud] || (isShared ? (audienceTopics.all || centralTopic || "") : "");
        input.value = currentVal;
        const audMeta = AUDIENCE_META[targetAud] || { label: targetAud };
        if (topicFieldLabel) topicFieldLabel.textContent = `Tema / Título para: ${audMeta.shortLabel || audMeta.label}`;
        if (topicAudienceBadge) {
          topicAudienceBadge.textContent = audMeta.shortLabel || audMeta.label;
          topicAudienceBadge.classList.remove("hidden");
        }
        input.placeholder = `Ej. Título o enfoque específico para ${audMeta.label.toLowerCase()}`;
      }
      syncState();
    };

    topicModeSwitch?.addEventListener("change", () => {
      topicAssignmentMode = topicModeSwitch.checked ? "per_audience" : "shared";
      if (topicAssignmentMode === "per_audience" && activeAudienceScope === "all") {
        const firstAud = Array.from(selectedAudiences)[0] || "educators";
        setActiveAudience(firstAud);
      }
      persistBriefAndAudienceTopics();
      updateTopicUIForCurrentScope();
    });

    const renderTitleProposals = () => {
      if (!titleProposalsGrid || !titleProposalsCard) return;
      if (!hasTitleProposals(titleProposalsByAudience)) {
        titleProposalsCard.classList.add("hidden");
        return;
      }

      const currentAudMeta = AUDIENCE_META[activeAudienceScope] || { label: activeAudienceScope };
      if (titleProposalsAudienceBadge) {
        titleProposalsAudienceBadge.textContent = activeAudienceScope === "all" ? "Propuestas por público" : currentAudMeta.label;
      }

      if (activeAudienceScope === "all") {
        const generatedAudiences = ALL_AUDIENCE_KEYS.filter((audience) => {
          const proposals = titleProposalsForAudience(titleProposalsByAudience, audience);
          return proposals.hooks.length || proposals.contrahooks.length;
        });
        titleProposalsGrid.innerHTML = `
          <div class="col-span-full rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-[11px] text-cyan-950">
            <strong>Selecciona un público arriba.</strong>
            Cada pestaña muestra sus 3 títulos Hook y 3 títulos Antihook. Hay propuestas listas para ${generatedAudiences.length} ${generatedAudiences.length === 1 ? "público" : "públicos"}.
          </div>`;
        titleProposalsCard.classList.remove("hidden");
        return;
      }

      const { hooks, contrahooks } = titleProposalsForAudience(titleProposalsByAudience, activeAudienceScope);
      if (!hooks.length && !contrahooks.length) {
        titleProposalsGrid.innerHTML = `<div class="col-span-full rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">Todavía no hay propuestas para <strong>${escapeModalHtml(currentAudMeta.label)}</strong>. Pulsa “Generar propuestas por público” para crear 3 Hook y 3 Antihook por público seleccionado.</div>`;
        titleProposalsCard.classList.remove("hidden");
        return;
      }
      const activeSelectedTitle = getSelectedTitleForAudience(activeAudienceScope);

      titleProposalsGrid.innerHTML = `
        <div class="space-y-2">
          <div class="flex items-center gap-1.5 px-0.5">
            <span class="h-2 w-2 rounded-full bg-purple-600"></span>
            <span class="text-[10px] font-bold text-purple-900 uppercase tracking-wider">3 Títulos con Hook (Gancho)</span>
          </div>
          <div class="space-y-1.5">
            ${hooks.map((item, i) => {
              const isSelected = activeSelectedTitle && item.title.trim().toLowerCase() === activeSelectedTitle.trim().toLowerCase();
              return `
                <button type="button" data-select-title="${escapeModalHtml(item.title)}" class="group w-full text-left p-2 rounded-lg border transition-all text-xs cursor-pointer ${isSelected ? "ring-2 ring-purple-500 bg-purple-50 border-purple-500 shadow-xs" : "border-purple-200/80 bg-white hover:border-purple-500 hover:bg-purple-50/60 hover:shadow-xs"}">
                  <div class="flex items-start gap-1.5">
                    <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold transition-colors ${isSelected ? "bg-purple-600 text-white" : "bg-purple-100 text-purple-700 group-hover:bg-purple-600 group-hover:text-white"}">${isSelected ? "✓" : i+1}</span>
                    <span class="font-semibold leading-snug ${isSelected ? "text-purple-950 font-bold" : "text-slate-800 group-hover:text-purple-950"}">${escapeModalHtml(item.title)}</span>
                  </div>
                  ${item.rationale ? `<p class="mt-1 text-[10px] text-slate-500 pl-5.5 leading-tight font-normal">${escapeModalHtml(item.rationale)}</p>` : ""}
                </button>
              `;
            }).join("")}
          </div>
        </div>
        <div class="space-y-2">
          <div class="flex items-center gap-1.5 px-0.5">
            <span class="h-2 w-2 rounded-full bg-amber-600"></span>
            <span class="text-[10px] font-bold text-amber-900 uppercase tracking-wider">3 Títulos con Antihook (Mito/Contrapunto)</span>
          </div>
          <div class="space-y-1.5">
            ${contrahooks.map((item, i) => {
              const isSelected = activeSelectedTitle && item.title.trim().toLowerCase() === activeSelectedTitle.trim().toLowerCase();
              return `
                <button type="button" data-select-title="${escapeModalHtml(item.title)}" class="group w-full text-left p-2 rounded-lg border transition-all text-xs cursor-pointer ${isSelected ? "ring-2 ring-amber-500 bg-amber-50 border-amber-500 shadow-xs" : "border-amber-200/80 bg-white hover:border-amber-500 hover:bg-amber-50/60 hover:shadow-xs"}">
                  <div class="flex items-start gap-1.5">
                    <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold transition-colors ${isSelected ? "bg-amber-600 text-white" : "bg-amber-100 text-amber-700 group-hover:bg-amber-600 group-hover:text-white"}">${isSelected ? "✓" : i+1}</span>
                    <span class="font-semibold leading-snug ${isSelected ? "text-amber-950 font-bold" : "text-slate-800 group-hover:text-amber-950"}">${escapeModalHtml(item.title)}</span>
                  </div>
                  ${item.rationale ? `<p class="mt-1 text-[10px] text-slate-500 pl-5.5 leading-tight font-normal">${escapeModalHtml(item.rationale)}</p>` : ""}
                </button>
              `;
            }).join("")}
          </div>
        </div>
      `;
      titleProposalsCard.classList.remove("hidden");

      titleProposalsGrid.querySelectorAll("[data-select-title]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const selectedTitle = btn.getAttribute("data-select-title");
          const isAll = activeAudienceScope === "all";

          if (isAll) {
            const item = `#titulo ${selectedTitle}`;
            for (let index = specifications.length - 1; index >= 0; index -= 1) {
              const p = parseSpecItem(specifications[index], index);
              if ((p.category === "titulo" || p.category === "title" || p.category === "tema") && (!p.audience || p.audience === "all")) {
                specifications.splice(index, 1);
              }
            }
            specifications.unshift(item);
            audienceTopics.all = selectedTitle;
            centralTopic = selectedTitle;
          } else {
            topicAssignmentMode = "per_audience";
            const tagPrefix = `#titulo[${activeAudienceScope}]`;
            const item = `${tagPrefix} ${selectedTitle}`;

            for (let index = specifications.length - 1; index >= 0; index -= 1) {
              const p = parseSpecItem(specifications[index], index);
              if ((p.category === "titulo" || p.category === "title" || p.category === "tema") && p.audience === activeAudienceScope) {
                specifications.splice(index, 1);
              }
            }
            specifications.unshift(item);
            audienceTopics[activeAudienceScope] = selectedTitle;
          }

          if (input) input.value = selectedTitle;
          syncState();

          const audLabel = isAll ? "Todos los públicos" : (AUDIENCE_META[activeAudienceScope]?.label || activeAudienceScope);
          if (refineStatus) refineStatus.textContent = `✓ Título asignado para ${audLabel}: "${selectedTitle}".`;

          persistBriefAndAudienceTopics();

          renderSpecifications();
          renderTitleProposals();
          updateTopicUIForCurrentScope();
        });
      });
    };

    const setActiveTab = (tabId) => {
      tabButtons.forEach((btn) => {
        const isActive = btn.getAttribute("data-modal-tab-target") === tabId;
        btn.setAttribute("aria-selected", String(isActive));
        btn.classList.toggle("is-active", isActive);
      });
      tabPanels.forEach((panel) => {
        const isTarget = panel.getAttribute("data-modal-tab-panel") === tabId;
        panel.classList.toggle("hidden", !isTarget);
      });
    };

    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        setActiveTab(btn.getAttribute("data-modal-tab-target"));
      });
    });

    const setActiveAudience = (audienceId) => {
      activeAudienceScope = audienceId || "all";
      renderAudienceScopeButtons();
      updateTopicUIForCurrentScope();
      renderSpecifications();
      renderTitleProposals();
    };

    specAudienceTabs.forEach((tab) => {
      // 1 click: Ver configuración y enfocar el público objetivo (sin alterar selección)
      tab.addEventListener("click", () => {
        const audId = tab.getAttribute("data-spec-target-audience") || "all";
        setActiveAudience(audId);
      });

      // 2 clicks: Quitar o colocar selección (generar o no artículo para este público)
      tab.addEventListener("dblclick", (e) => {
        e.preventDefault();
        const audId = tab.getAttribute("data-spec-target-audience") || "all";
        if (audId === "all") {
          const allSelected = ALL_AUDIENCE_KEYS.every((k) => selectedAudiences.has(k));
          if (allSelected) {
            const keep = activeAudienceScope !== "all" ? activeAudienceScope : "educators";
            selectedAudiences.clear();
            selectedAudiences.add(keep);
            activeAudienceScope = keep;
          } else {
            ALL_AUDIENCE_KEYS.forEach((k) => selectedAudiences.add(k));
          }
        } else {
          if (selectedAudiences.has(audId)) {
            if (selectedAudiences.size > 1) {
              selectedAudiences.delete(audId);
            }
          } else {
            selectedAudiences.add(audId);
          }
          activeAudienceScope = audId;
        }
        renderAudienceScopeButtons();
        updateTopicUIForCurrentScope();
        renderSpecifications();
        renderTitleProposals();
      });
    });

    const getAudienceBadgeStyles = (audKey) => {
      switch (audKey) {
        case "educators":
          return {
            pill: "bg-indigo-50 text-indigo-800 border-indigo-200",
            tag: "bg-indigo-100 text-indigo-800 font-bold",
            label: "Docentes"
          };
        case "parents":
          return {
            pill: "bg-emerald-50 text-emerald-800 border-emerald-200",
            tag: "bg-emerald-100 text-emerald-800 font-bold",
            label: "Padres"
          };
        case "students":
          return {
            pill: "bg-amber-50 text-amber-900 border-amber-200",
            tag: "bg-amber-100 text-amber-900 font-bold",
            label: "Estudiantes"
          };
        case "coordinators":
          return {
            pill: "bg-purple-50 text-purple-800 border-purple-200",
            tag: "bg-purple-100 text-purple-800 font-bold",
            label: "Coordinadores"
          };
        default:
          return {
            pill: "bg-slate-100 text-slate-800 border-slate-200",
            tag: "bg-slate-200 text-slate-700 font-bold",
            label: "Todos"
          };
      }
    };

    const renderSpecifications = () => {
      const parsedItems = specifications.map((item, index) => parseSpecItem(item, index));

      const categories = ["tono", "extension", "fuentes", "concepto"];
      categories.forEach((cat) => {
        const container = modal.element.querySelector(`[data-spec-badge-container="${cat}"]`);
        if (!container) return;

        const catItems = parsedItems.filter((p) => p.category === cat);

        if (!catItems.length) {
          container.innerHTML = `<span class="text-[10px] text-slate-400 italic py-0.5">Sin selección</span>`;
        } else {
          container.innerHTML = catItems.map((p) => {
            const isTargetAud = p.audience === activeAudienceScope;
            const audStyles = getAudienceBadgeStyles(p.audience);

            return `
              <span class="inline-flex items-center gap-1 rounded-md border text-[10px] font-medium px-1.5 py-0.5 transition-all shadow-2xs ${audStyles.pill} ${isTargetAud ? "ring-1 ring-offset-1 ring-cyan-500" : ""}">
                <span class="text-[8px] px-1 rounded uppercase tracking-tight ${audStyles.tag}">${escapeModalHtml(audStyles.label)}</span>
                <span class="truncate max-w-[140px] sm:max-w-[190px]" title="${escapeModalHtml(p.value)}">${escapeModalHtml(p.value)}</span>
                <button type="button" data-remove-session-spec="${p.originalIndex}" class="opacity-60 hover:opacity-100 hover:text-red-600 font-bold ml-0.5 px-0.5 leading-none transition-opacity cursor-pointer" title="Eliminar opción">×</button>
              </span>
            `;
          }).join("");
        }
      });

      modal.element.querySelectorAll("[data-remove-session-spec]").forEach((button) => {
        button.addEventListener("click", (e) => {
          e.stopPropagation();
          const idx = Number(button.getAttribute("data-remove-session-spec"));
          if (!isNaN(idx) && idx >= 0 && idx < specifications.length) {
            const removed = specifications.splice(idx, 1)[0];
            const p = parseSpecItem(removed, idx);
            if ((p.category === "tema" || p.category === "titulo" || p.category === "title") && p.audience) {
              if (audienceTopics[p.audience] !== undefined) audienceTopics[p.audience] = "";
            }
            persistBriefAndAudienceTopics();
            renderSpecifications();
          }
        });
      });

      const nonTitleSpecs = specifications.filter(s => {
        const p = parseSpecItem(s);
        return p.category !== "titulo" && p.category !== "title" && p.category !== "tema";
      });

      if (specificationSummary) {
        specificationSummary.textContent = `${nonTitleSpecs.length} ${nonTitleSpecs.length === 1 ? "opción" : "opciones"}`;
      }
      const tabSpecsBadge = modal.element.querySelector("#tab-specs-count-badge");
      if (tabSpecsBadge) {
        tabSpecsBadge.textContent = String(nonTitleSpecs.length);
        tabSpecsBadge.classList.toggle("hidden", nonTitleSpecs.length === 0);
      }

      renderTitleProposals();
    };

    specSelects.forEach((select) => {
      select.addEventListener("change", () => {
        const val = String(select.value || "").trim();
        if (!val) return;
        const category = select.getAttribute("data-session-spec-select") || "personalizada";
        const isExclusive = select.getAttribute("data-session-spec-exclusive") === "true";
        const tagPrefix = activeAudienceScope !== "all" ? `#${category}[${activeAudienceScope}]` : `#${category}`;
        const item = `${tagPrefix} ${val}`;

        if (isExclusive) {
          for (let index = specifications.length - 1; index >= 0; index -= 1) {
            const p = parseSpecItem(specifications[index], index);
            if (p.category === category && p.audience === activeAudienceScope) {
              specifications.splice(index, 1);
            }
          }
        }

        const alreadyExists = specifications.some((s, idx) => {
          const p = parseSpecItem(s, idx);
          return p.category === category && p.audience === activeAudienceScope && p.value.toLowerCase() === val.toLowerCase();
        });

        if (!alreadyExists) {
          specifications.push(item);
        }
        select.selectedIndex = 0;
        select.value = "";
        persistBriefAndAudienceTopics();
        renderSpecifications();
      });
    });

    const renderPlatformBadges = () => {
      if (!platformBadgeContainer) return;
      if (selectedPlatforms.size === 0) {
        platformBadgeContainer.innerHTML = `<span class="text-[10px] text-amber-600/80 italic">Ninguna plataforma seleccionada</span>`;
        return;
      }
      platformBadgeContainer.innerHTML = Array.from(selectedPlatforms).map(pid => {
        const p = availablePlatforms.find(item => item.id === pid) || { id: pid, name: pid };
        return `
          <span class="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 text-amber-900 text-[10px] font-medium px-1.5 py-0.5 shadow-2xs">
            <span class="text-[8px] px-1 rounded uppercase tracking-tight bg-amber-200/80 text-amber-900 font-bold">Plataforma</span>
            <span class="truncate max-w-[130px]" title="${escapeModalHtml(p.name)}">${escapeModalHtml(p.name)}</span>
            <button type="button" data-remove-platform="${escapeModalHtml(p.id)}" class="opacity-60 hover:opacity-100 hover:text-red-600 font-bold ml-0.5 px-0.5 leading-none transition-opacity cursor-pointer" title="Eliminar plataforma">×</button>
          </span>
        `;
      }).join("");

      platformBadgeContainer.querySelectorAll("[data-remove-platform]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const pid = btn.getAttribute("data-remove-platform");
          if (pid) {
            selectedPlatforms.delete(pid);
            renderPlatformBadges();
          }
        });
      });
    };

    platformSelect?.addEventListener("change", () => {
      const pid = platformSelect.value;
      if (pid) {
        selectedPlatforms.add(pid);
        platformSelect.selectedIndex = 0;
        platformSelect.value = "";
        renderPlatformBadges();
      }
    });

    const setMode = (mode) => {
      selectedMode = mode === "automated" ? "automated" : "manual";
      modeButtons.forEach((button) => {
        const active = button.getAttribute("data-new-session-mode") === selectedMode;
        button.setAttribute("aria-pressed", String(active));
        button.setAttribute("aria-selected", String(active));
        button.classList.toggle("is-active", active);
      });
      const manualContainer = modal.element.querySelector("#new-session-manual-container");
      const autoContainer = modal.element.querySelector("#new-session-automated-container");
      if (manualContainer && autoContainer) {
        if (selectedMode === "automated") {
          manualContainer.classList.add("hidden");
          autoContainer.classList.remove("hidden");
        } else {
          manualContainer.classList.remove("hidden");
          autoContainer.classList.add("hidden");
        }
      }
      if (createButton) {
        createButton.textContent = selectedMode === "automated" ? "Iniciar automatización" : "Crear sesión";
      }
      if (modeInfoTitle && modeInfoDesc) {
        if (selectedMode === "automated") {
          modeInfoTitle.textContent = "Modo Automatizado:";
          modeInfoDesc.textContent = "Investiga fuentes y genera artículos independientes para cada público objetivo seleccionado de forma concurrente con verificación de citas y directrices editoriales.";
        } else {
          modeInfoTitle.textContent = "Modo Manual:";
          modeInfoDesc.textContent = "Crea una sesión limpia donde puedes redactar y perfeccionar el contenido paso a paso con las herramientas de Marcie.";
        }
      }
    };

    const syncState = () => {
      const value = String(input?.value || "").trim();
      const hasTopic = value.length > 0 || Object.values(audienceTopics).some(t => String(t || "").trim().length > 0);
      if (createButton) createButton.disabled = !hasTopic;
      if (count) count.textContent = `${String(input?.value || "").length}/180`;
      if (value && error) error.classList.add("hidden");
      return value;
    };

    const readEditorialSelection = () => {
      const editorialMode = editorialModeInputs.find((editorialInput) => editorialInput.checked)?.value || "marcie";
      const audiencesList = Array.from(selectedAudiences);
      const editorialProfileSnapshot = editorialMode === "custom" ? {
        id: modal.element.querySelector("#custom-profile-select")?.value || "",
        name: `Perfil híbrido ${new Date().toLocaleDateString("es-MX")}`,
        structure: modal.element.querySelector("#custom-structure")?.value || "hybrid",
        opening: modal.element.querySelector("#custom-opening")?.value || "scene",
        minimumSources: Number(modal.element.querySelector("#custom-minimum-sources")?.value || 8),
        historicalComparison: modal.element.querySelector("#custom-history")?.value || "when_supported",
        ctaPolicy: modal.element.querySelector("#custom-cta")?.value || "optional",
        brandLine: modal.element.querySelector("#custom-brand-line")?.value?.trim() || "",
        tone: modal.element.querySelector("#custom-tone")?.value?.trim() || "Cálido, riguroso y accesible",
        evidenceDensity: modal.element.querySelector("#custom-density")?.value || "high",
        length: modal.element.querySelector("#custom-length")?.value?.trim() || "1000–1600 palabras",
        sourceTypes: modal.element.querySelector("#custom-source-types")?.value.split(",").map((value) => value.trim()).filter(Boolean) || [],
        includeQuote: modal.element.querySelector("#custom-quote")?.checked === true,
        includeLists: modal.element.querySelector("#custom-lists")?.checked === true,
        includeCaseStudy: modal.element.querySelector("#custom-case")?.checked === true,
        includeAnalogy: modal.element.querySelector("#custom-analogy")?.checked === true,
        seo: modal.element.querySelector("#custom-seo")?.checked === true
      } : editorialMode === "aida"
        ? { name: "Guía Aida", minimumSources: 8, maximumSources: 12, historicalComparison: "when_supported", ctaPolicy: "none" }
        : { name: "Marcie" };
      return {
        searchPlatforms: Array.from(selectedPlatforms),
        sourceInputs: {
          youtube: youtubeToggle?.checked
            ? (manualVideoResearch?.videos || []).map((video) => ({ videoId: video.videoId, url: video.url }))
            : []
        },
        videoResearch: youtubeToggle?.checked ? manualVideoResearch : null,
        researchRegion: modal.element.querySelector("#new-session-region")?.value.trim() || "MX",
        researchPeriod: modal.element.querySelector("#new-session-period")?.value || "6m",
        editorialMode,
        humanizationEnabled: humanizeToggle?.checked === true,
        selectedAudiences: audiencesList.length ? audiencesList : (editorialMode === "aida" ? ["parents", "educators"] : ["educators"]),
        editorialProfileId: editorialMode,
        editorialProfileVersion: 1,
        editorialProfileSnapshot,
        preferredVocabulary: readPreferredVocabulary()
      };
    };

    const buildSessionSpecsData = () => {
      const editorial = readEditorialSelection();
      const primaryTopic = audienceTopics.all || centralTopic || input?.value?.trim() || "Tema sin título";
      const parsedItems = specifications.map((item, index) => parseSpecItem(item, index));

      const articles = editorial.selectedAudiences.map((audKey) => {
        const audMeta = AUDIENCE_META[audKey] || { label: audKey, shortLabel: audKey };
        const specificTopic = audienceTopics[audKey] || primaryTopic;

        // Find custom title proposal if assigned
        const titleItem = parsedItems.find(p => (p.category === "titulo" || p.category === "title") && (p.audience === audKey || p.audience === "all"));
        const customTitle = titleItem?.value || "";

        // Collect specs for this audience + general
        const tones = parsedItems.filter(p => p.category === "tono" && (p.audience === audKey || p.audience === "all")).map(p => p.value);
        const extensionItem = parsedItems.find(p => p.category === "extension" && (p.audience === audKey || p.audience === "all"));
        const sources = parsedItems.filter(p => p.category === "fuentes" && (p.audience === audKey || p.audience === "all")).map(p => p.value);
        const resources = parsedItems.filter(p => p.category === "concepto" && (p.audience === audKey || p.audience === "all")).map(p => p.value);

        return {
          audience: audKey,
          audienceLabel: audMeta.label,
          audienceShortLabel: audMeta.shortLabel,
          iconSvg: audMeta.iconSvg,
          topic: specificTopic,
          customTitle,
          tones,
          extension: extensionItem?.value || "Estándar (1200–1600 palabras)",
          sources,
          youtubeVideoCount: editorial.sourceInputs.youtube.length,
          resources
        };
      });

      return {
        topic: primaryTopic,
        topicMode: topicAssignmentMode,
        editorialMode: editorial.editorialMode,
        humanizationEnabled: editorial.humanizationEnabled,
        researchRegion: editorial.researchRegion,
        researchPeriod: editorial.researchPeriod,
        selectedAudiences: editorial.selectedAudiences,
        articles
      };
    };

    const showSpecPreview = () => {
      const data = buildSessionSpecsData();
      if (previewTotalBadge) previewTotalBadge.textContent = `${data.articles.length} ${data.articles.length === 1 ? "artículo" : "artículos"}`;

      if (previewCardsContainer) {
        previewCardsContainer.innerHTML = data.articles.map((art, idx) => `
          <div class="spec-preview-card">
            <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
              <div class="flex items-center gap-1.5">
                ${art.iconSvg}
                <span class="text-xs font-bold text-slate-800">${escapeModalHtml(art.audienceLabel)}</span>
              </div>
              <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">Artículo ${idx + 1}</span>
            </div>
            <div class="space-y-1 text-xs">
              <div class="text-[11px] font-semibold text-slate-900 leading-snug">
                <span class="text-slate-400 font-normal">Tema:</span> ${escapeModalHtml(art.topic)}
              </div>
              ${art.customTitle ? `<div class="text-[10px] text-purple-700 bg-purple-50 p-1 rounded font-medium"><span class="font-bold">Título:</span> ${escapeModalHtml(art.customTitle)}</div>` : ""}
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1 text-[10px] text-slate-600">
                <div><strong class="text-slate-700">Tono:</strong> ${art.tones.length ? escapeModalHtml(art.tones.join(", ")) : "Estándar"}</div>
                <div><strong class="text-slate-700">Extensión:</strong> ${escapeModalHtml(art.extension)}</div>
                <div><strong class="text-slate-700">Fuentes:</strong> ${art.sources.length ? escapeModalHtml(art.sources.join(", ")) : "Fiables verificables"}</div>
                ${art.youtubeVideoCount ? `<div><strong class="text-slate-700">YouTube:</strong> ${art.youtubeVideoCount} ${art.youtubeVideoCount === 1 ? "video analizado" : "videos analizados"}</div>` : ""}
                <div><strong class="text-slate-700">Recursos:</strong> ${art.resources.length ? escapeModalHtml(art.resources.join(", ")) : "APA 7, sin clichés"}</div>
              </div>
            </div>
          </div>
        `).join("");
      }

      topControlCard?.classList.add("hidden");
      const topicCard = modal.element.querySelector(".new-session-topic-card");
      topicCard?.classList.add("hidden");
      titleProposalsCard?.classList.add("hidden");
      audienceScopeBar?.classList.add("hidden");
      presetToolbar?.classList.add("hidden");
      modal.element.querySelector("#new-session-manual-container")?.classList.add("hidden");
      modal.element.querySelector("#new-session-automated-container")?.classList.add("hidden");
      tabNavContainer?.classList.add("hidden");
      tabPanels.forEach(p => p.classList.add("hidden"));
      previewPanel?.classList.remove("hidden");
      const footer = modal.element.querySelector(".marcie-modal-footer");
      if (footer) footer.classList.add("hidden");
    };

    const hideSpecPreview = () => {
      previewPanel?.classList.add("hidden");
      topControlCard?.classList.remove("hidden");
      const topicCard = modal.element.querySelector(".new-session-topic-card");
      topicCard?.classList.remove("hidden");
      if (hasTitleProposals(titleProposalsByAudience)) {
        titleProposalsCard?.classList.remove("hidden");
      }
      audienceScopeBar?.classList.remove("hidden");
      presetToolbar?.classList.remove("hidden");
      setMode(selectedMode);
      tabNavContainer?.classList.remove("hidden");
      setActiveTab("specs");
      const footer = modal.element.querySelector(".marcie-modal-footer");
      if (footer) footer.classList.remove("hidden");
    };

    btnDownloadSpecsWord?.addEventListener("click", () => {
      const data = buildSessionSpecsData();
      exportSessionSpecsToWord(data);
    });

    btnSpecPreviewBack?.addEventListener("click", hideSpecPreview);
    btnSpecPreviewConfirm?.addEventListener("click", () => {
      submitDirect();
    });

    const submitDirect = () => {
      const value = syncState();
      const editorial = readEditorialSelection();
      if (selectedMode === "automated") {
        try {
          localStorage.setItem(MARCIE_AUTOMATED_BRIEF_STORAGE_KEY, JSON.stringify(specifications));
        } catch (_) {}
      }
      const isFreeMode = freeModeInput?.checked === true;
      const promptProfileId = isFreeMode ? "free" : String(promptProfileSelect?.value || "default");
      const primaryTopic = audienceTopics.all || centralTopic || value;
      finish({
        mode: selectedMode,
        title: value || primaryTopic,
        topic: primaryTopic,
        topicAssignmentMode,
        audienceTopics: { ...audienceTopics },
        specifications: [...specifications],
        promptProfileId,
        freeMode: selectedMode === "automated" && isFreeMode,
        titleProposals: serializeTitleProposals(titleProposalsByAudience),
        ...editorial
      });
      modal.close();
    };

    const submit = () => {
      const value = syncState();
      if (youtubeToggle?.checked) {
        const urls = youtubeUrls();
        if (!urls.length) {
          setYoutubeStatus("Agrega al menos una URL pública de YouTube.", "error");
          youtubeEditor?.classList.remove("hidden");
          return;
        }
        if (!manualVideoResearch?.videos?.length) {
          setYoutubeStatus("Analiza los videos antes de crear la sesión.", "error");
          youtubeEditor?.classList.remove("hidden");
          return;
        }
      }
      if (selectedPlatforms.size === 0) {
        if (refineStatus) refineStatus.textContent = "Selecciona al menos una plataforma de investigación.";
        return;
      }
      if (!value && !audienceTopics.all && !centralTopic) {
        error?.classList.remove("hidden");
        setActiveTab("specs");
        input?.focus();
        return;
      }

      if (selectedMode === "automated") {
        showSpecPreview();
      } else {
        submitDirect();
      }
    };

    const submitBlank = () => {
      finish({ mode: "blank", title: blankTitle, topic: "", specifications: [], ...readEditorialSelection() });
      modal.close();
    };

    syncState();
    input?.addEventListener("input", () => {
      const currentVal = input.value.trim();
      if (topicAssignmentMode === "shared" || activeAudienceScope === "all") {
        audienceTopics.all = currentVal;
        centralTopic = currentVal;
      } else {
        audienceTopics[activeAudienceScope] = currentVal;
        const tagPrefix = `#tema[${activeAudienceScope}]`;
        for (let i = specifications.length - 1; i >= 0; i -= 1) {
          const p = parseSpecItem(specifications[i], i);
          if ((p.category === "tema" || p.category === "titulo" || p.category === "title") && p.audience === activeAudienceScope) {
            specifications.splice(i, 1);
          }
        }
        if (currentVal) {
          specifications.push(`${tagPrefix} ${currentVal}`);
        }
      }

      const proposalTargets = topicAssignmentMode === "shared" || activeAudienceScope === "all"
        ? Object.keys(titleProposalsByAudience)
        : [activeAudienceScope];
      const proposalsChanged = proposalTargets.some((audience) => {
        const generatedTopic = String(generatedForTopicByAudience[audience] || "").trim();
        return generatedTopic && currentVal.toLowerCase() !== generatedTopic.toLowerCase();
      });
      if (proposalsChanged) {
        proposalTargets.forEach((audience) => {
          delete titleProposalsByAudience[audience];
          delete generatedForTopicByAudience[audience];
        });
        for (let i = specifications.length - 1; i >= 0; i -= 1) {
          const p = parseSpecItem(specifications[i], i);
          const targetMatches = topicAssignmentMode === "shared" || activeAudienceScope === "all"
            ? true
            : p.audience === activeAudienceScope;
          if ((p.category === "titulo" || p.category === "title") && targetMatches) {
            specifications.splice(i, 1);
          }
        }
        persistTitleProposals();
        renderSpecifications();
        renderTitleProposals();
      }
      persistBriefAndAudienceTopics();
      syncState();
    });

    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    });

    modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.getAttribute("data-new-session-mode"))));

    editorialModeInputs.forEach((input) => input.addEventListener("change", () => {
      syncEditorialModeAndAudienceUI();
      customProfilePanel?.classList.toggle("hidden", input.value !== "custom" || !input.checked);
      if (input.value === "aida" && input.checked) {
        modal.element.querySelectorAll('input[name="session-audience"]').forEach((audienceInput) => { audienceInput.checked = ["parents", "educators"].includes(audienceInput.value); });
        syncEditorialModeAndAudienceUI();
      }
    }));

    modal.element.querySelectorAll('input[name="session-audience"]').forEach((checkbox) => {
      checkbox.addEventListener("change", syncEditorialModeAndAudienceUI);
    });

    modal.element.querySelector("#custom-profile-select")?.addEventListener("change", (event) => {
      const profile = editorialProfiles.find((item) => item.id === event.target.value);
      if (!profile) return;
      const assignments = {
        "#custom-structure": profile.structure,
        "#custom-opening": profile.opening,
        "#custom-minimum-sources": profile.minimumSources,
        "#custom-history": profile.historicalComparison,
        "#custom-cta": profile.ctaPolicy,
        "#custom-brand-line": profile.brandLine,
        "#custom-tone": profile.tone,
        "#custom-density": profile.evidenceDensity,
        "#custom-length": profile.length,
        "#custom-source-types": Array.isArray(profile.sourceTypes) ? profile.sourceTypes.join(", ") : profile.sourceTypes
      };
      Object.entries(assignments).forEach(([selector, value]) => { const field = modal.element.querySelector(selector); if (field && value != null) field.value = value; });
      [["#custom-quote", profile.includeQuote], ["#custom-lists", profile.includeLists], ["#custom-case", profile.includeCaseStudy], ["#custom-analogy", profile.includeAnalogy], ["#custom-seo", profile.seo]].forEach(([selector, checked]) => { const field = modal.element.querySelector(selector); if (field && checked != null) field.checked = Boolean(checked); });
    });

    promptProfileSelect?.addEventListener("change", () => {
      if (freeModeInput) freeModeInput.checked = promptProfileSelect.value === "free";
    });

    freeModeInput?.addEventListener("change", () => {
      if (!promptProfileSelect) return;
      if (freeModeInput.checked) promptProfileSelect.value = "free";
      else if (promptProfileSelect.value === "free") promptProfileSelect.value = "default";
    });

    resetBriefButton?.addEventListener("click", () => {
      specifications.splice(0, specifications.length);
      selectedPlatforms.clear();
      availablePlatforms.forEach(p => selectedPlatforms.add(p.id));
      Object.keys(audienceTopics).forEach(k => audienceTopics[k] = "");
      titleProposalsByAudience = {};
      Object.keys(generatedForTopicByAudience).forEach((audience) => delete generatedForTopicByAudience[audience]);
      centralTopic = "";
      if (input) input.value = "";
      syncState();
      try {
        localStorage.removeItem(MARCIE_AUTOMATED_BRIEF_STORAGE_KEY);
        localStorage.removeItem("marcie_saved_audience_topics");
        localStorage.removeItem("marcie_topic_assignment_mode");
        localStorage.removeItem("marcie_draft_title_proposals");
      } catch (_) {}
      updateTopicUIForCurrentScope();
      renderSpecifications();
      renderPlatformBadges();
      renderTitleProposals();
    });

    refineButton?.addEventListener("click", async () => {
      const value = syncState();
      if (!value) {
        error?.classList.remove("hidden");
        input?.focus();
        return;
      }
      if (typeof onRefineTopic !== "function") {
        if (refineStatus) refineStatus.textContent = "No está disponible la función para perfeccionar el título.";
        return;
      }
      refineButton.disabled = true;
      refineButton.innerHTML = `<svg class="h-3.5 w-3.5 animate-spin text-cyan-700" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> <span>Generando propuestas...</span>`;
      if (refineStatus) refineStatus.textContent = "Gemini está creando 3 propuestas Hook y 3 Antihook para cada público seleccionado.";
      try {
        const selectedEditorialMode = editorialModeInputs.find((input) => input.checked)?.value || "marcie";
        const refinementProfile = selectedEditorialMode === "custom"
          ? { structure: modal.element.querySelector("#custom-structure")?.value || "hybrid" }
          : {};
        const targetAudiences = ALL_AUDIENCE_KEYS.filter((audience) => selectedAudiences.has(audience));
        const sharedTopic = String(audienceTopics.all || centralTopic || value).trim();
        for (let index = 0; index < targetAudiences.length; index += 1) {
          const audience = targetAudiences[index];
          const audienceMeta = AUDIENCE_META[audience] || { label: audience };
          const audienceTopic = String(topicAssignmentMode === "per_audience" ? (audienceTopics[audience] || sharedTopic) : sharedTopic).trim();
          refineButton.innerHTML = `<span>Generando ${index + 1}/${targetAudiences.length}</span>`;
          if (refineStatus) refineStatus.textContent = `Redactando títulos para ${audienceMeta.label}...`;
          const result = await onRefineTopic(audienceTopic, [...specifications], selectedEditorialMode, refinementProfile, audience, readPreferredVocabulary());
          const raw = result && typeof result === "object"
            ? { topic: audienceTopic, hooks: result.hookTitles, contrahooks: result.contrahookTitles }
            : { topic: audienceTopic, hooks: typeof result === "string" ? [{ title: result, rationale: "Propuesta perfeccionada con Gemini" }] : [], contrahooks: [] };
          const normalized = normalizeAudienceTitleProposals(raw);
          const audienceLabel = audienceMeta.label.toLowerCase();
          const fallbackHooks = [
            { title: `${audienceTopic}: claves prácticas para ${audienceLabel}`, rationale: "Beneficio directo para este público" },
            { title: `Cómo convertir ${audienceTopic} en decisiones útiles para ${audienceLabel}`, rationale: "Aplicación concreta y contextualizada" },
            { title: `${audienceTopic} con evidencia: guía para ${audienceLabel}`, rationale: "Curiosidad y rigor profesional" }
          ];
          const fallbackAntihooks = [
            { title: `Mitos sobre ${audienceTopic} que conviene revisar con ${audienceLabel}`, rationale: "Cuestionamiento de ideas habituales" },
            { title: `${audienceTopic}: por qué la respuesta habitual puede fallar`, rationale: `Contrapunto relevante para ${audienceLabel}` },
            { title: `Antes de aplicar ${audienceTopic}: una mirada crítica para ${audienceLabel}`, rationale: "Advertencia basada en contexto y evidencia" }
          ];
          titleProposalsByAudience[audience] = {
            topic: audienceTopic,
            hooks: [...normalized.hooks, ...fallbackHooks].slice(0, 3),
            contrahooks: [...normalized.contrahooks, ...fallbackAntihooks].slice(0, 3)
          };
          generatedForTopicByAudience[audience] = audienceTopic;
        }
        persistTitleProposals();
        setMode("automated");
        if (activeAudienceScope === "all" || !selectedAudiences.has(activeAudienceScope)) setActiveAudience(targetAudiences[0] || "educators");
        renderTitleProposals();
        if (refineStatus) refineStatus.textContent = "Listo: selecciona una propuesta en cada pestaña de público.";
      } catch (refineError) {
        if (refineStatus) refineStatus.textContent = `No se pudo perfeccionar: ${refineError.message}`;
      } finally {
        refineButton.disabled = false;
        refineButton.innerHTML = '<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z"/></svg> Generar propuestas por público';
      }
    });

    createButton?.addEventListener("click", submit);
    createBlankButton?.addEventListener("click", submitBlank);
    cancelButton?.addEventListener("click", () => modal.close());

    loadPresetsFromStorage(true);
    updateTopicUIForCurrentScope();
    renderSpecifications();
    renderPlatformBadges();
    if (hasTitleProposals(titleProposalsByAudience)) {
      renderTitleProposals();
    }
    syncEditorialModeAndAudienceUI();
    setMode(initialConfiguration?.mode === "automated" ? "automated" : "manual");
    if (initialConfiguration) {
      if (initialConfiguration.humanizationEnabled != null && humanizeToggle) {
        humanizeToggle.checked = Boolean(initialConfiguration.humanizationEnabled);
      }
      if (initialConfiguration.freeMode != null && freeModeInput) {
        freeModeInput.checked = Boolean(initialConfiguration.freeMode);
      }
      if (initialConfiguration.researchRegion) {
        const regEl = modal.element.querySelector("#new-session-region");
        if (regEl) regEl.value = initialConfiguration.researchRegion;
      }
      if (initialConfiguration.researchPeriod) {
        const perEl = modal.element.querySelector("#new-session-period");
        if (perEl) perEl.value = initialConfiguration.researchPeriod;
      }
      if (Array.isArray(initialConfiguration.selectedAudiences)) {
        selectedAudiences.clear();
        initialConfiguration.selectedAudiences.forEach(a => selectedAudiences.add(a));
      }
      syncEditorialModeAndAudienceUI();
      const profile = initialConfiguration.editorialProfileSnapshot || {};
      const fields = { structure:"structure", opening:"opening", "minimum-sources":"minimumSources", history:"historicalComparison", cta:"ctaPolicy", "brand-line":"brandLine", tone:"tone", density:"evidenceDensity", length:"length", "source-types":"sourceTypes", quote:"includeQuote", lists:"includeLists", case:"includeCaseStudy", analogy:"includeAnalogy", seo:"seo" };
      Object.entries(fields).forEach(([id,key]) => {
        const input = modal.element.querySelector("#custom-" + id);
        if (!input || profile[key] == null) return;
        if (input.type === "checkbox") input.checked = Boolean(profile[key]);
        else input.value = Array.isArray(profile[key]) ? profile[key].join(", ") : profile[key];
      });
      if (createButton) createButton.textContent = "Continuar";
    }
    setTimeout(() => {
      input?.focus();
      input?.select();
    }, 40);
  });
}

export function showToast(message, type = "info") {
  const existing = document.getElementById("marcie-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "marcie-toast";
  const bgClass = type === "success"
    ? "bg-slate-900 text-white border-slate-800"
    : type === "error"
    ? "bg-red-600 text-white border-red-700"
    : "bg-slate-900 text-white border-slate-800";

  toast.className = `fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg shadow-xl border text-sm font-medium flex items-center gap-2 transform transition-all animate-in slide-in-from-bottom-5 ${bgClass}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;

  mountMarcieOverlay(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}
