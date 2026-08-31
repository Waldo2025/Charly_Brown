/**
 * Gestor de diálogos, modales y popovers estilo Shadcn UI para Marcie Blog Editor
 */

const MARCIE_OVERLAY_Z_INDEX = "2147483000";
const MARCIE_AUTOMATED_BRIEF_STORAGE_KEY = "marcie_automated_brief_v1";

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
    backdrop.remove();
    if (typeof onClose === "function") onClose();
  };

  backdrop.querySelector("#modal-close-btn").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      close();
      window.removeEventListener("keydown", onKeyDown);
    }
  };
  window.addEventListener("keydown", onKeyDown);

  return { close, element: backdrop };
}

export function closeActiveModal() {
  const existing = document.getElementById("marcie-modal-backdrop");
  if (existing) existing.remove();
}

export function showNewSessionModal({ defaultValue = "", allowBlankSession = false, freeModeDefault = false, promptProfiles = [], editorialProfiles = [], activePromptProfileId = "default", onRefineTopic = null } = {}) {
  const blankTitle = "Sin título";
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
      title: "Crear una sesión editorial",
      widthClass: "max-w-4xl",
      onClose: () => finish(null),
      contentHtml: `
        <div class="new-session-modal space-y-4">
          <fieldset class="rounded-xl border border-slate-200 p-4">
            <legend class="px-1 text-xs font-bold text-slate-700">Modo editorial fijo de la sesión</legend>
            <div class="mt-2 grid grid-cols-3 gap-2">
              <label class="rounded-lg border border-slate-200 p-3 text-xs"><input type="radio" name="editorial-mode" value="marcie" checked> <strong>Marcie</strong><small class="mt-1 block text-slate-500">Flujo editorial actual con evidencia.</small></label>
              <label class="rounded-lg border border-slate-200 p-3 text-xs"><input type="radio" name="editorial-mode" value="aida"> <strong>Aida</strong><small class="mt-1 block text-slate-500">Tema completo, datos y evolución respaldada.</small></label>
              <label class="rounded-lg border border-slate-200 p-3 text-xs"><input type="radio" name="editorial-mode" value="custom"> <strong>Otro</strong><small class="mt-1 block text-slate-500">Perfil híbrido versionado.</small></label>
            </div>
            <div class="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <label><input type="checkbox" name="session-audience" value="educators" checked> Docentes</label>
              <label><input type="checkbox" name="session-audience" value="parents" checked> Padres</label>
              <label><input type="checkbox" name="session-audience" value="students" checked> Estudiantes</label>
              <label><input type="checkbox" name="session-audience" value="coordinators"> Coordinadores</label>
            </div>
            <div id="new-session-custom-profile" class="mt-3 hidden grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs">
              <label class="col-span-2">Perfil reutilizable<select id="custom-profile-select" class="input-field mt-1"><option value="">Crear perfil nuevo</option>${editorialProfiles.map((profile) => `<option value="${escapeModalHtml(profile.id)}">${escapeModalHtml(profile.name || profile.id)} · v${Number(profile.version || 1)}</option>`).join("")}</select></label>
              <label>Estructura<select id="custom-structure" class="input-field mt-1"><option value="hybrid">Híbrida</option><option value="marcie">Marcie</option><option value="aida">Aida</option></select></label>
              <label>Apertura<select id="custom-opening" class="input-field mt-1"><option value="scene">Escena</option><option value="question">Pregunta</option><option value="data">Dato</option><option value="custom">Personalizada</option></select></label>
              <label>Fuentes objetivo<input id="custom-minimum-sources" type="number" class="input-field mt-1" min="4" max="20" value="8"></label>
              <label>Historia<select id="custom-history" class="input-field mt-1"><option value="when_supported">Cuando exista evidencia</option><option value="required_when_supported">Requerida si hay evidencia</option><option value="off">Desactivada</option></select></label>
              <label>CTA<select id="custom-cta" class="input-field mt-1"><option value="optional">Opcional</option><option value="required">Obligatorio</option><option value="none">Ausente</option></select></label>
              <label>Frase de marca<input id="custom-brand-line" class="input-field mt-1" maxlength="140"></label>
              <label class="col-span-2">Tono<input id="custom-tone" class="input-field mt-1" value="Cálido, riguroso y accesible"></label>
              <label>Densidad<select id="custom-density" class="input-field mt-1"><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option></select></label>
              <label>Extensión<input id="custom-length" class="input-field mt-1" value="1000–1600 palabras"></label>
              <label class="col-span-2">Tipos de fuente<input id="custom-source-types" class="input-field mt-1" value="academic, official, science_magazine, education_blog"></label>
              <div class="col-span-2 grid grid-cols-2 gap-2 sm:grid-cols-5"><label><input id="custom-quote" type="checkbox"> Citas</label><label><input id="custom-lists" type="checkbox" checked> Listas</label><label><input id="custom-case" type="checkbox" checked> Casos</label><label><input id="custom-analogy" type="checkbox" checked> Analogías</label><label><input id="custom-seo" type="checkbox" checked> SEO</label></div>
            </div>
          </fieldset>
          <div class="new-session-mode-tabs grid grid-cols-2" role="tablist" aria-label="Tipo de sesión">
            <button type="button" role="tab" data-new-session-mode="manual" aria-selected="true" aria-pressed="true" class="new-session-mode is-active">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
              <span><strong>Manual</strong><small>Controla cada etapa</small></span>
            </button>
            <button type="button" role="tab" data-new-session-mode="automated" aria-selected="false" aria-pressed="false" class="new-session-mode">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3ZM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z"/></svg>
              <span><strong>Automatizada</strong><small>Tres enfoques completos</small></span>
            </button>
          </div>

          <div class="new-session-topic-card rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div class="flex items-center justify-between gap-3">
              <label for="new-session-title-input" class="block text-xs font-semibold text-slate-800">Tema central del blog</label>
              <span id="new-session-title-count" class="text-[10px] tabular-nums text-slate-400">0/180</span>
            </div>
            <div class="mt-2 flex flex-col gap-2 sm:flex-row">
              <input id="new-session-title-input" type="text" class="input-field h-11 flex-1" maxlength="180" autocomplete="off" placeholder="Ej. Estrategias de aprendizaje activo con tecnología">
              <button id="new-session-refine-topic" type="button" class="hidden h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-cyan-200 bg-white px-3 text-[11px] font-bold text-cyan-800 shadow-xs transition-colors hover:bg-cyan-50">
                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z"/></svg>
                Perfeccionar tema
              </button>
            </div>
            <div class="mt-2 flex items-center justify-between gap-3">
              <p id="new-session-title-error" class="m-0 hidden text-[11px] font-medium text-red-600">Escribe un tema para continuar.</p>
              <p id="new-session-refine-status" class="m-0 text-[10px] text-slate-400" aria-live="polite"></p>
            </div>
          </div>

          <div id="new-session-manual-panel" class="new-session-mode-panel rounded-xl border border-dashed border-slate-200 px-4 py-3 text-[11px] text-slate-500">
            La sesión se abrirá lista para investigar, crear propuestas, redactar y revisar cuando tú decidas.
          </div>

          <div id="new-session-automation-fields" class="new-session-automation-fields hidden rounded-xl border border-cyan-200 p-4">
            <label class="new-session-free-mode">
              <span class="new-session-free-mode__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 8h10a3 3 0 1 0-3-3M4 12h15a3 3 0 1 1-3 3M4 16h6" stroke-width="1.8" stroke-linecap="round"/></svg></span>
              <span class="new-session-free-mode__copy"><strong>Modo libre</strong><small>El tema manda. No se aplicarán enfoques educativos ni directrices editoriales internas.</small></span>
              <input id="new-session-free-mode" type="checkbox" ${freeModeDefault ? "checked" : ""}>
              <span class="new-session-free-mode__switch" aria-hidden="true"></span>
            </label>
            <label class="new-session-prompt-profile">
              <span><strong>Configuración editorial</strong><small>Selecciona los prompts que conducirán toda esta automatización.</small></span>
              <select id="new-session-prompt-profile" aria-label="Configuración editorial para la sesión">${promptProfileOptionsHtml}</select>
            </label>
            <div class="flex items-start gap-3">
              <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cyan-100 text-cyan-700"><svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 6h16M4 12h10M4 18h7"/></svg></span>
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <label for="new-session-spec-input" class="block text-xs font-semibold text-slate-800">Especificaciones del artículo</label>
                    <p class="mt-1 text-[10px] leading-relaxed text-slate-500">Construye un brief completo seleccionando varias opciones. Puedes combinar presets y condiciones propias.</p>
                  </div>
                  <button id="new-session-reset-brief" type="button" class="new-session-reset-brief shrink-0">Reiniciar brief</button>
                </div>

                <div class="new-session-spec-builder mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <fieldset class="new-session-spec-section" data-spec-group-tone="purple">
                    <legend><span>Tono de redacción</span><small>Elige uno o varios</small></legend>
                    <div class="new-session-spec-options">
                      <button type="button" data-session-spec-category="tono" data-session-spec-value="Cálido y cercano">Cálido</button>
                      <button type="button" data-session-spec-category="tono" data-session-spec-value="Profesional y experto">Profesional</button>
                      <button type="button" data-session-spec-category="tono" data-session-spec-value="Conversacional y natural">Conversacional</button>
                      <button type="button" data-session-spec-category="tono" data-session-spec-value="Inspirador sin clichés">Inspirador</button>
                      <button type="button" data-session-spec-category="tono" data-session-spec-value="Analítico y riguroso">Analítico</button>
                      <button type="button" data-session-spec-category="tono" data-session-spec-value="Didáctico y claro">Didáctico</button>
                      <button type="button" data-session-spec-category="tono" data-session-spec-value="Narrativo con storytelling">Narrativo</button>
                      <button type="button" data-session-spec-category="tono" data-session-spec-value="Empático y comprensivo">Empático</button>
                      <button type="button" data-session-spec-category="tono" data-session-spec-value="Divulgativo y accesible">Divulgativo</button>
                      <button type="button" data-session-spec-category="tono" data-session-spec-value="Periodístico y objetivo">Periodístico</button>
                      <button type="button" data-session-spec-category="tono" data-session-spec-value="Reflexivo y pausado">Reflexivo</button>
                      <button type="button" data-session-spec-category="tono" data-session-spec-value="Persuasivo ético y fundamentado">Persuasivo</button>
                      <button type="button" data-session-spec-category="tono" data-session-spec-value="Académico pero accesible">Académico</button>
                      <button type="button" data-session-spec-category="tono" data-session-spec-value="Juvenil, ágil y respetuoso">Juvenil</button>
                      <button type="button" data-session-spec-category="tono" data-session-spec-value="Humor sutil y pertinente">Humor sutil</button>
                      <button type="button" data-session-spec-custom-trigger="tono" class="new-session-spec-other">+ Otro</button>
                    </div>
                    <div data-session-spec-custom-panel="tono" class="new-session-group-custom hidden"><input type="text" maxlength="120" placeholder="Escribe otro tono"><button type="button" data-add-group-spec="tono">Añadir</button></div>
                  </fieldset>

                  <fieldset class="new-session-spec-section" data-spec-group-tone="blue">
                    <legend><span>Extensión</span><small>Una opción</small></legend>
                    <div class="new-session-spec-options">
                      <button type="button" data-session-spec-category="extension" data-session-spec-value="Breve, entre 600 y 900 palabras" data-session-spec-exclusive="true">Breve</button>
                      <button type="button" data-session-spec-category="extension" data-session-spec-value="Media, entre 1000 y 1400 palabras" data-session-spec-exclusive="true">Media</button>
                      <button type="button" data-session-spec-category="extension" data-session-spec-value="Profunda, entre 1600 y 2200 palabras" data-session-spec-exclusive="true">Profunda</button>
                      <button type="button" data-session-spec-category="extension" data-session-spec-value="Guía extensa, más de 2500 palabras" data-session-spec-exclusive="true">Guía extensa</button>
                      <button type="button" data-session-spec-category="extension" data-session-spec-value="Microartículo, entre 300 y 500 palabras" data-session-spec-exclusive="true">Micro</button>
                      <button type="button" data-session-spec-category="extension" data-session-spec-value="Compacta, entre 900 y 1100 palabras" data-session-spec-exclusive="true">Compacta</button>
                      <button type="button" data-session-spec-category="extension" data-session-spec-value="Estándar, entre 1200 y 1600 palabras" data-session-spec-exclusive="true">Estándar</button>
                      <button type="button" data-session-spec-category="extension" data-session-spec-value="Newsletter, entre 500 y 800 palabras" data-session-spec-exclusive="true">Newsletter</button>
                      <button type="button" data-session-spec-category="extension" data-session-spec-value="Tutorial, entre 1500 y 2000 palabras" data-session-spec-exclusive="true">Tutorial</button>
                      <button type="button" data-session-spec-category="extension" data-session-spec-value="Ensayo, entre 1800 y 2400 palabras" data-session-spec-exclusive="true">Ensayo</button>
                      <button type="button" data-session-spec-category="extension" data-session-spec-value="Contenido pilar, entre 2500 y 3500 palabras" data-session-spec-exclusive="true">Pilar SEO</button>
                      <button type="button" data-session-spec-category="extension" data-session-spec-value="Lectura de 3 minutos, entre 450 y 600 palabras" data-session-spec-exclusive="true">3 min</button>
                      <button type="button" data-session-spec-category="extension" data-session-spec-value="Lectura de 5 minutos, entre 700 y 900 palabras" data-session-spec-exclusive="true">5 min</button>
                      <button type="button" data-session-spec-category="extension" data-session-spec-value="Lectura de 8 minutos, entre 1100 y 1400 palabras" data-session-spec-exclusive="true">8 min</button>
                      <button type="button" data-session-spec-category="extension" data-session-spec-value="Lectura de 12 minutos, entre 1700 y 2100 palabras" data-session-spec-exclusive="true">12 min</button>
                      <button type="button" data-session-spec-custom-trigger="extension" class="new-session-spec-other">+ Otra</button>
                    </div>
                    <div data-session-spec-custom-panel="extension" class="new-session-group-custom hidden"><input type="text" maxlength="120" placeholder="Ej. Entre 1300 y 1500 palabras"><button type="button" data-add-group-spec="extension">Añadir</button></div>
                  </fieldset>

                  <fieldset class="new-session-spec-section" data-spec-group-tone="amber">
                    <legend><span>Fuentes</span><small>Combina evidencia</small></legend>
                    <div class="new-session-spec-options">
                      <button type="button" data-session-spec-category="fuentes" data-session-spec-value="Libros de autores reconocidos">Libros</button>
                      <button type="button" data-session-spec-category="fuentes" data-session-spec-value="Artículos académicos revisados por pares">Académicas</button>
                      <button type="button" data-session-spec-category="fuentes" data-session-spec-value="Organismos oficiales y fuentes institucionales">Oficiales</button>
                      <button type="button" data-session-spec-category="fuentes" data-session-spec-value="Estudios recientes y verificables">Recientes</button>
                      <button type="button" data-session-spec-category="fuentes" data-session-spec-value="Casos reales documentados">Casos reales</button>
                      <button type="button" data-session-spec-category="fuentes" data-session-spec-value="Bibliografía final en formato APA">Formato APA</button>
                      <button type="button" data-session-spec-category="fuentes" data-session-spec-value="Metaanálisis y revisiones sistemáticas">Metaanálisis</button>
                      <button type="button" data-session-spec-category="fuentes" data-session-spec-value="Informes técnicos y libros blancos">Informes</button>
                      <button type="button" data-session-spec-category="fuentes" data-session-spec-value="Estadísticas públicas verificables">Estadísticas</button>
                      <button type="button" data-session-spec-category="fuentes" data-session-spec-value="Documentos y fuentes primarias">Primarias</button>
                      <button type="button" data-session-spec-category="fuentes" data-session-spec-value="Publicaciones de universidades reconocidas">Universidades</button>
                      <button type="button" data-session-spec-category="fuentes" data-session-spec-value="Normas y estándares profesionales vigentes">Estándares</button>
                      <button type="button" data-session-spec-category="fuentes" data-session-spec-value="Legislación y normativa oficial aplicable">Normativa</button>
                      <button type="button" data-session-spec-category="fuentes" data-session-spec-value="Conjuntos de datos abiertos y verificables">Datasets</button>
                      <button type="button" data-session-spec-category="fuentes" data-session-spec-value="Medios especializados de reconocido prestigio">Medios expertos</button>
                      <button type="button" data-session-spec-custom-trigger="fuentes" class="new-session-spec-other">+ Otra</button>
                    </div>
                    <div data-session-spec-custom-panel="fuentes" class="new-session-group-custom hidden"><input type="text" maxlength="120" placeholder="Escribe una fuente o tipo de fuente"><button type="button" data-add-group-spec="fuentes">Añadir</button></div>
                  </fieldset>

                  <fieldset class="new-session-spec-section" data-spec-group-tone="teal">
                    <legend><span>Recursos editoriales</span><small>Hazlo más útil</small></legend>
                    <div class="new-session-spec-options">
                      <button type="button" data-session-spec-category="concepto" data-session-spec-value="Incluir ejemplos prácticos y verosímiles">Ejemplos</button>
                      <button type="button" data-session-spec-category="concepto" data-session-spec-value="Incluir datos verificables con contexto">Datos</button>
                      <button type="button" data-session-spec-category="concepto" data-session-spec-value="Incluir pasos accionables para el lector">Pasos</button>
                      <button type="button" data-session-spec-category="concepto" data-session-spec-value="Incluir preguntas para la reflexión">Preguntas</button>
                      <button type="button" data-session-spec-category="concepto" data-session-spec-value="Aplicar SEO natural sin sobreoptimización">SEO natural</button>
                      <button type="button" data-session-spec-category="concepto" data-session-spec-value="Evitar clichés, lugares comunes y frases genéricas">Sin clichés</button>
                      <button type="button" data-session-spec-category="concepto" data-session-spec-value="Incluir una checklist práctica">Checklist</button>
                      <button type="button" data-session-spec-category="concepto" data-session-spec-value="Incluir una comparación clara de alternativas">Comparativa</button>
                      <button type="button" data-session-spec-category="concepto" data-session-spec-value="Diferenciar mitos y realidades con evidencia">Mitos y hechos</button>
                      <button type="button" data-session-spec-category="concepto" data-session-spec-value="Desarrollar un caso de estudio documentado">Caso de estudio</button>
                      <button type="button" data-session-spec-category="concepto" data-session-spec-value="Cerrar con aprendizajes clave memorables">Claves finales</button>
                      <button type="button" data-session-spec-category="concepto" data-session-spec-value="Incluir un glosario breve de términos">Glosario</button>
                      <button type="button" data-session-spec-category="concepto" data-session-spec-value="Añadir preguntas frecuentes útiles">FAQ</button>
                      <button type="button" data-session-spec-category="concepto" data-session-spec-value="Considerar objeciones y responderlas con rigor">Objeciones</button>
                      <button type="button" data-session-spec-category="concepto" data-session-spec-value="Usar analogías claras sin simplificar en exceso">Analogías</button>
                      <button type="button" data-session-spec-custom-trigger="concepto" class="new-session-spec-other">+ Otro</button>
                    </div>
                    <div data-session-spec-custom-panel="concepto" class="new-session-group-custom hidden"><input type="text" maxlength="120" placeholder="Escribe otro recurso o concepto"><button type="button" data-add-group-spec="concepto">Añadir</button></div>
                  </fieldset>
                </div>

                <div class="new-session-custom-spec mt-3">
                  <div class="mb-1.5 flex items-center justify-between gap-2">
                    <label for="new-session-spec-input" class="text-[10px] font-semibold text-slate-700">Añadir una indicación propia</label>
                    <span id="new-session-spec-summary" class="text-[9px] font-semibold text-cyan-700">0 seleccionadas</span>
                  </div>
                  <div class="flex flex-col gap-2 sm:flex-row">
                    <select id="new-session-custom-spec-type" class="input-field h-10 w-full sm:w-32" aria-label="Categoría de la especificación personalizada">
                      <option value="personalizada">Personalizada</option>
                      <option value="tono">Tono</option>
                      <option value="extension">Extensión</option>
                      <option value="fuentes">Fuentes</option>
                      <option value="concepto">Concepto</option>
                      <option value="condicion">Condición</option>
                    </select>
                    <input id="new-session-spec-input" type="text" class="input-field h-10 flex-1" maxlength="220" autocomplete="off" placeholder="Ej. Incluir casos prácticos para secundaria">
                    <button id="new-session-add-spec" type="button" class="h-10 shrink-0 rounded-lg bg-slate-900 px-3 text-[11px] font-bold text-white hover:bg-slate-800">Añadir</button>
                  </div>
                </div>
                <div id="new-session-spec-list" class="new-session-spec-list mt-3 flex min-h-7 flex-wrap gap-2" aria-live="polite"><span class="text-[10px] text-slate-400">Selecciona opciones o añade una indicación propia.</span></div>
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
    const automationFields = modal.element.querySelector("#new-session-automation-fields");
    const manualFields = modal.element.querySelector("#new-session-manual-panel");
    const refineButton = modal.element.querySelector("#new-session-refine-topic");
    const refineStatus = modal.element.querySelector("#new-session-refine-status");
    const specificationInput = modal.element.querySelector("#new-session-spec-input");
    const customSpecificationType = modal.element.querySelector("#new-session-custom-spec-type");
    const addSpecificationButton = modal.element.querySelector("#new-session-add-spec");
    const specificationList = modal.element.querySelector("#new-session-spec-list");
    const specificationSummary = modal.element.querySelector("#new-session-spec-summary");
    const resetBriefButton = modal.element.querySelector("#new-session-reset-brief");
    const freeModeInput = modal.element.querySelector("#new-session-free-mode");
    const promptProfileSelect = modal.element.querySelector("#new-session-prompt-profile");
    const editorialModeInputs = Array.from(modal.element.querySelectorAll('input[name="editorial-mode"]'));
    const customProfilePanel = modal.element.querySelector("#new-session-custom-profile");
    const quickSpecificationButtons = Array.from(modal.element.querySelectorAll("[data-session-spec-category]"));
    const customGroupTriggers = Array.from(modal.element.querySelectorAll("[data-session-spec-custom-trigger]"));
    const customGroupAddButtons = Array.from(modal.element.querySelectorAll("[data-add-group-spec]"));
    let selectedMode = "manual";
    const specifications = (() => {
      try {
        const saved = JSON.parse(localStorage.getItem(MARCIE_AUTOMATED_BRIEF_STORAGE_KEY) || "[]");
        return Array.isArray(saved) ? saved.filter((item) => typeof item === "string" && item.trim()).slice(0, 100) : [];
      } catch (_) {
        return [];
      }
    })();

    const encodeText = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));

    const renderSpecifications = () => {
      if (!specificationList) return;
      if (!specifications.length) {
        specificationList.innerHTML = '<span class="text-[10px] text-slate-400">Selecciona opciones o añade una indicación propia.</span>';
      } else {
        specificationList.innerHTML = specifications.map((item, index) => {
          const [tag, ...descriptionParts] = item.split(" ");
          return `
          <span class="new-session-spec-token inline-flex max-w-full items-center gap-1.5 rounded-full border border-cyan-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-700 shadow-xs">
            <strong>${encodeText(tag)}</strong>
            <span class="truncate">${encodeText(descriptionParts.join(" "))}</span>
            <button type="button" data-remove-session-spec="${index}" class="shrink-0 text-slate-400 hover:text-red-500" aria-label="Eliminar especificación">×</button>
          </span>
        `;
        }).join("");
      }
      specificationList.querySelectorAll("[data-remove-session-spec]").forEach((button) => {
        button.addEventListener("click", () => {
          specifications.splice(Number(button.getAttribute("data-remove-session-spec")), 1);
          renderSpecifications();
        });
      });
      quickSpecificationButtons.forEach((button) => {
        const item = `#${button.dataset.sessionSpecCategory} ${button.dataset.sessionSpecValue}`;
        const selected = specifications.includes(item);
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      if (specificationSummary) specificationSummary.textContent = `${specifications.length} ${specifications.length === 1 ? "seleccionada" : "seleccionadas"}`;
    };

    const addSpecification = () => {
      const value = String(specificationInput?.value || "").trim();
      if (!value) return;
      const category = String(customSpecificationType?.value || "personalizada").replace(/[^a-z]/g, "") || "personalizada";
      const item = value.startsWith("#") ? value : `#${category} ${value}`;
      if (specifications.includes(item)) return;
      specifications.push(item);
      specificationInput.value = "";
      renderSpecifications();
      specificationInput.focus();
    };

    const addGroupSpecification = (category) => {
      const panel = modal.element.querySelector(`[data-session-spec-custom-panel="${category}"]`);
      const customInput = panel?.querySelector("input");
      const value = String(customInput?.value || "").trim();
      if (!value) {
        customInput?.focus();
        return;
      }
      const prefix = `#${category} `;
      const item = `${prefix}${value}`;
      if (category === "extension") {
        for (let index = specifications.length - 1; index >= 0; index -= 1) {
          if (specifications[index].startsWith(prefix)) specifications.splice(index, 1);
        }
      }
      if (!specifications.includes(item)) specifications.push(item);
      customInput.value = "";
      panel.classList.add("hidden");
      renderSpecifications();
    };

    customGroupTriggers.forEach((button) => {
      button.addEventListener("click", () => {
        const category = button.dataset.sessionSpecCustomTrigger;
        const panel = modal.element.querySelector(`[data-session-spec-custom-panel="${category}"]`);
        panel?.classList.toggle("hidden");
        if (panel && !panel.classList.contains("hidden")) panel.querySelector("input")?.focus();
      });
    });

    customGroupAddButtons.forEach((button) => {
      const category = button.dataset.addGroupSpec;
      button.addEventListener("click", () => addGroupSpecification(category));
      button.previousElementSibling?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        addGroupSpecification(category);
      });
    });

    quickSpecificationButtons.forEach((button) => {
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        const category = button.dataset.sessionSpecCategory;
        const item = `#${category} ${button.dataset.sessionSpecValue}`;
        const existingIndex = specifications.indexOf(item);
        if (existingIndex >= 0) {
          specifications.splice(existingIndex, 1);
        } else {
          if (button.dataset.sessionSpecExclusive === "true") {
            const prefix = `#${category} `;
            for (let index = specifications.length - 1; index >= 0; index -= 1) {
              if (specifications[index].startsWith(prefix)) specifications.splice(index, 1);
            }
          }
          specifications.push(item);
        }
        renderSpecifications();
      });
    });

    const setMode = (mode) => {
      selectedMode = mode === "automated" ? "automated" : "manual";
      modeButtons.forEach((button) => {
        const active = button.getAttribute("data-new-session-mode") === selectedMode;
        button.setAttribute("aria-pressed", String(active));
        button.setAttribute("aria-selected", String(active));
        button.classList.toggle("is-active", active);
      });
      manualFields?.classList.toggle("hidden", selectedMode !== "manual");
      automationFields?.classList.toggle("hidden", selectedMode !== "automated");
      refineButton?.classList.toggle("hidden", selectedMode !== "automated");
      refineButton?.classList.toggle("flex", selectedMode === "automated");
      if (createButton) createButton.textContent = selectedMode === "automated" ? "Iniciar automatización" : "Crear sesión";
    };

    const syncState = () => {
      const value = String(input?.value || "").trim();
      if (createButton) createButton.disabled = value.length === 0;
      if (count) count.textContent = `${String(input?.value || "").length}/180`;
      if (value && error) error.classList.add("hidden");
      return value;
    };
    const readEditorialSelection = () => {
      const editorialMode = editorialModeInputs.find((editorialInput) => editorialInput.checked)?.value || "marcie";
      const selectedAudiences = Array.from(modal.element.querySelectorAll('input[name="session-audience"]:checked')).map((audienceInput) => audienceInput.value);
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
        editorialMode,
        selectedAudiences: selectedAudiences.length ? selectedAudiences : (editorialMode === "aida" ? ["parents", "educators"] : ["educators"]),
        editorialProfileId: editorialMode,
        editorialProfileVersion: 1,
        editorialProfileSnapshot
      };
    };
    const submit = () => {
      const value = syncState();
      if (!value) {
        error?.classList.remove("hidden");
        input?.focus();
        return;
      }
      if (selectedMode === "automated") {
        try {
          localStorage.setItem(MARCIE_AUTOMATED_BRIEF_STORAGE_KEY, JSON.stringify(specifications));
        } catch (_) {}
      }
      const promptProfileId = String(promptProfileSelect?.value || "default");
      finish({ mode: selectedMode, title: value, topic: value, specifications: [...specifications], promptProfileId, freeMode: selectedMode === "automated" && promptProfileId === "free", ...readEditorialSelection() });
      modal.close();
    };
    const submitBlank = () => {
      finish({ mode: "blank", title: blankTitle, topic: "", specifications: [], ...readEditorialSelection() });
      modal.close();
    };

    if (input) input.value = String(defaultValue || "").slice(0, 180);
    syncState();
    input?.addEventListener("input", syncState);
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    });
    modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.getAttribute("data-new-session-mode"))));
    editorialModeInputs.forEach((input) => input.addEventListener("change", () => {
      customProfilePanel?.classList.toggle("hidden", input.value !== "custom" || !input.checked);
      if (input.value === "aida" && input.checked) {
        modal.element.querySelectorAll('input[name="session-audience"]').forEach((audienceInput) => { audienceInput.checked = ["parents", "educators"].includes(audienceInput.value); });
      }
    }));
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
        "#custom-tone": profile.tone
        ,"#custom-density": profile.evidenceDensity
        ,"#custom-length": profile.length
        ,"#custom-source-types": Array.isArray(profile.sourceTypes) ? profile.sourceTypes.join(", ") : profile.sourceTypes
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
    addSpecificationButton?.addEventListener("click", addSpecification);
    resetBriefButton?.addEventListener("click", () => {
      specifications.splice(0, specifications.length);
      try {
        localStorage.removeItem(MARCIE_AUTOMATED_BRIEF_STORAGE_KEY);
      } catch (_) {}
      renderSpecifications();
    });
    specificationInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      addSpecification();
    });
    refineButton?.addEventListener("click", async () => {
      const value = syncState();
      if (!value || typeof onRefineTopic !== "function") {
        error?.classList.remove("hidden");
        input?.focus();
        return;
      }
      refineButton.disabled = true;
      refineButton.textContent = "Perfeccionando...";
      if (refineStatus) refineStatus.textContent = "Gemini está afinando el tema para el blog.";
      try {
        const selectedEditorialMode = editorialModeInputs.find((input) => input.checked)?.value || "marcie";
        const refinementProfile = selectedEditorialMode === "custom"
          ? { structure: modal.element.querySelector("#custom-structure")?.value || "hybrid" }
          : {};
        const refined = String(await onRefineTopic(value, [...specifications], selectedEditorialMode, refinementProfile) || "").trim();
        if (refined && input) input.value = refined.slice(0, 180);
        syncState();
        if (refineStatus) refineStatus.textContent = "Tema optimizado. Puedes editarlo antes de continuar.";
      } catch (refineError) {
        if (refineStatus) refineStatus.textContent = `No se pudo perfeccionar: ${refineError.message}`;
      } finally {
        refineButton.disabled = false;
        refineButton.innerHTML = '<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z"/></svg> Perfeccionar tema';
      }
    });
    createButton?.addEventListener("click", submit);
    createBlankButton?.addEventListener("click", submitBlank);
    cancelButton?.addEventListener("click", () => modal.close());
    renderSpecifications();
    setMode("manual");
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
