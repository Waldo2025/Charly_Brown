import { normalizeImageWarp, randomImageWarp, drawImageWarpFrame, syncCurrentSceneImageWarp } from "./podcaster-image-warp.js?v=2026-10-07.smooth-warp-defaults-1";
import { presentUnifiedToolModal } from "./podcaster-tool-modal-tabs.js?rev=2026-10-07.unified-tools-1";

const PRESETS = [
  { type: "none", label: "Sin efecto", icon: "fa-ban" },
  { type: "wave", label: "Onda suave", icon: "fa-water" },
  { type: "bend", label: "Doblez", icon: "fa-bezier-curve" },
  { type: "ripple", label: "Onda radial", icon: "fa-bullseye" },
  { type: "pulse", label: "Pulso", icon: "fa-expand-arrows-alt" },
  { type: "flag", label: "Bandera", icon: "fa-flag" },
  { type: "liquid", label: "Líquido", icon: "fa-tint" },
  { type: "twist", label: "Giro", icon: "fa-sync-alt" },
  { type: "shear", label: "Inclinación", icon: "fa-sliders-h" },
  { type: "jelly", label: "Gelatina", icon: "fa-cube" },
  { type: "particles", label: "Partículas", icon: "fa-magic" }
];

let currentRowId = "";
let draft = normalizeImageWarp();
let sourceImage = null;
let durationSec = 8;
let frameId = 0;
let startedAt = 0;
let previewTimeSec = 0;
let lastPreviewPaint = 0;
let selectedSpotId = "";
let draggedSpotId = "";
let dragOffset = { x: 0, y: 0 };

function createSpot(centerX = 0.5, centerY = 0.5) {
  return { id: `spot-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`, type: draft.type === "none" ? "ripple" : draft.type, centerX, centerY, radius: 0.3, feather: 0.15 };
}

function selectedSpot() {
  return draft.region.spots.find((spot) => spot.id === selectedSpotId) || draft.region.spots[0] || null;
}

function updateSpot(spotId, changes) {
  draft = normalizeImageWarp({ ...draft, region: { ...draft.region, spots: draft.region.spots.map((spot) => spot.id === spotId ? { ...spot, ...changes } : spot) } });
  syncControls();
  if (!frameId) paint(Math.min(durationSec, draft.startSec + 0.5));
}

function editor() { return document.querySelector(".podcast-image-effects-editor"); }
function effectsActionMenu() { return document.querySelector(".podcast-image-effects-action-menu"); }

function closeEffectsActionMenu() { effectsActionMenu()?.remove(); }

function syncEditorTheme(host) {
  const shell = document.querySelector("#podcastVideoShell");
  if (!shell || !host) return;
  const theme = window.getComputedStyle(shell);
  for (const [target, source] of Object.entries({
    "--image-effect-canvas": "--snoopy-canvas",
    "--image-effect-surface": "--snoopy-surface",
    "--image-effect-muted-surface": "--snoopy-surface-subtle",
    "--image-effect-text": "--snoopy-text",
    "--image-effect-muted": "--snoopy-text-muted",
    "--image-effect-border": "--snoopy-border",
    "--image-effect-accent": "--snoopy-accent"
  })) {
    const value = theme.getPropertyValue(source).trim();
    if (value) host.style.setProperty(target, value);
  }
  host.style.colorScheme = shell.matches(".is-editor-light-theme, .is-editor-mid-theme") ? "light" : "dark";
}

function saveImageWarp(rowId, effect) {
  const updated = window.PodcasterUI?.upsertActiveSession?.((session) => ({
    ...session,
    visualEffectsMap: {
      ...(session.visualEffectsMap || {}),
      [rowId]: { ...(session.visualEffectsMap?.[rowId] || {}), imageWarp: normalizeImageWarp(effect) }
    }
  }), { render: false, persist: true, autosaveReason: "image-warp" });
  if (updated) void window.persistReorderedTimelinePatchToCloud?.(updated, { visualEffectsMap: updated.visualEffectsMap });
  window.PodcasterUI?.renderPodcastVideoTimeline?.(window.getActiveSession?.(), { force: true, reason: "image-warp" });
  window.PodcasterUI?.syncStageMedia?.(rowId, { force: true });
  syncCurrentSceneImageWarp(rowId);
  window.scheduleMontageExportPreviewRefresh?.(90);
}

export function openImageEffectsActionMenu(rowId, anchor, onSelect) {
  const key = String(rowId || "").trim();
  if (!key || !window.getActiveSession?.()) return;
  closeEffectsActionMenu();
  const rect = anchor?.getBoundingClientRect?.() || anchor;
  const menu = document.createElement("div");
  menu.className = "podcast-image-effects-action-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Opciones de efectos de imagen");
  menu.innerHTML = `
    <button type="button" role="menuitem" data-image-effect-menu-action="configure"><i class="fas fa-sliders-h" aria-hidden="true"></i><span>Abrir configuración de efectos</span></button>
    <button type="button" role="menuitem" data-image-effect-menu-action="random"><i class="fas fa-random" aria-hidden="true"></i><span>Aplicar Efecto Random</span></button>`;
  const theme = window.getComputedStyle(anchor?.nodeType === 1 ? anchor : document.querySelector("#podcastVideoShell"));
  for (const [target, source] of Object.entries({
    "--image-effect-menu-surface": "--pod-surface",
    "--image-effect-menu-control": "--pod-surface-2",
    "--image-effect-menu-text": "--pod-text",
    "--image-effect-menu-border": "--pod-border",
    "--image-effect-menu-accent": "--pod-accent"
  })) {
    const value = theme.getPropertyValue(source).trim();
    if (value) menu.style.setProperty(target, value);
  }
  document.body.appendChild(menu);
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  const parentMenuTop = anchor?.closest?.(".podcast-video-clip-menu.is-visible")?.getBoundingClientRect().top;
  menu.style.left = `${Math.max(8, Math.min((rect?.left ?? 8), window.innerWidth - width - 8))}px`;
  menu.style.top = `${Math.max(8, (parentMenuTop ?? rect?.top ?? height + 16) - height - 8)}px`;
  menu.addEventListener("click", (event) => {
    const action = event.target.closest("[data-image-effect-menu-action]")?.dataset.imageEffectMenuAction;
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    closeEffectsActionMenu();
    if (typeof onSelect === "function") onSelect();
    if (action === "configure") { openImageEffectsEditor(key); return; }
    const previous = window.getActiveSession?.()?.visualEffectsMap?.[key]?.imageWarp;
    saveImageWarp(key, randomImageWarp(previous));
  });
  menu.querySelector("button")?.focus();
}

function ensureEditor() {
  if (editor()) return editor();
  const host = document.createElement("section");
  host.className = "podcast-image-effects-editor";
  host.hidden = true;
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-modal", "true");
  host.setAttribute("aria-label", "Efectos de imagen");
  host.innerHTML = `
    <div class="podcast-image-effects-modal">
      <header class="podcast-image-effects-header">
        <div><span class="podcast-image-effects-eyebrow"><i class="fas fa-magic" aria-hidden="true"></i> Imagen animada</span><h2>Efectos de imagen</h2><p>Elige un movimiento y ajusta su fuerza antes de aplicarlo a la escena.</p></div>
        <button type="button" class="podcast-image-effects-close" data-image-effect-action="close" aria-label="Cerrar"><i class="fas fa-times" aria-hidden="true"></i></button>
      </header>
      <div class="podcast-image-effects-grid">
        <div class="podcast-image-effects-tools">
          <section><h3>Movimiento</h3><div class="podcast-image-effects-options">${PRESETS.map((preset) => `<button type="button" data-image-effect-type="${preset.type}" aria-pressed="false"><i class="fas ${preset.icon}" aria-hidden="true"></i><span>${preset.label}</span></button>`).join("")}</div></section>
          <section class="podcast-image-effects-tuning"><h3>Ajustes</h3>
            <label><span><i class="fas fa-sliders-h" aria-hidden="true"></i> Intensidad <output data-image-effect-output="intensity">45%</output></span><input data-image-effect-field="intensity" type="range" min="1" max="100" step="1" value="45"></label>
            <label><span><i class="fas fa-tachometer-alt" aria-hidden="true"></i> Velocidad <output data-image-effect-output="speed">1.00×</output></span><input data-image-effect-field="speed" type="range" min="0.25" max="3" step="0.05" value="1"></label>
          </section>
          <section class="podcast-image-effects-tuning"><h3>Área animada</h3>
            <div class="podcast-image-effects-region-options"><button type="button" data-image-effect-region="all" aria-pressed="true"><i class="fas fa-expand" aria-hidden="true"></i><span>Toda</span></button><button type="button" data-image-effect-region="focus" aria-pressed="false"><i class="fas fa-crosshairs" aria-hidden="true"></i><span>Seleccionar área</span></button></div>
            <button type="button" class="podcast-image-effects-add-spot" data-image-effect-action="add-spot"><i class="fas fa-plus-circle" aria-hidden="true"></i> Añadir área <small data-image-effect-spot-count></small></button>
            <div class="podcast-image-effects-spot-list" role="group" aria-label="Áreas del efecto"></div>
            <p class="podcast-image-effects-hint">Selecciona un área para editarla. Arrástrala en la imagen para moverla.</p>
            <label data-image-effect-region-control><span><i class="fas fa-circle-notch" aria-hidden="true"></i> Tamaño <output data-image-effect-output="radius"></output></span><input data-image-effect-field="radius" type="range" min="0.05" max="1" step="0.01"></label>
            <label data-image-effect-region-control data-image-effect-feather-control><span><i class="fas fa-adjust" aria-hidden="true"></i> Suavidad <output data-image-effect-output="feather"></output></span><input data-image-effect-field="feather" type="range" min="0.01" max="0.5" step="0.01"></label>
          </section>
          <section class="podcast-image-effects-tuning podcast-image-effects-particles" data-image-effect-particles hidden><h3>Partículas</h3>
            <div class="podcast-image-effects-direction-options" role="group" aria-label="Dirección de partículas">
              <button type="button" data-particle-direction="up" title="Arriba"><i class="fas fa-arrow-up"></i></button><button type="button" data-particle-direction="down" title="Abajo"><i class="fas fa-arrow-down"></i></button><button type="button" data-particle-direction="left" title="Izquierda"><i class="fas fa-arrow-left"></i></button><button type="button" data-particle-direction="right" title="Derecha"><i class="fas fa-arrow-right"></i></button><button type="button" data-particle-direction="up-right" title="Diagonal arriba"><i class="fas fa-arrow-up"></i><i class="fas fa-arrow-right"></i></button><button type="button" data-particle-direction="down-right" title="Diagonal abajo"><i class="fas fa-arrow-down"></i><i class="fas fa-arrow-right"></i></button>
            </div>
            <label><span><i class="fas fa-braille" aria-hidden="true"></i> Cantidad <output data-image-effect-output="count"></output></span><input data-image-effect-field="count" type="range" min="3" max="16" step="1"></label>
            <label><span><i class="fas fa-circle" aria-hidden="true"></i> Tamaño <output data-image-effect-output="size"></output></span><input data-image-effect-field="size" type="range" min="2" max="18" step="1"></label>
            <label class="podcast-image-effects-color"><span><i class="fas fa-palette" aria-hidden="true"></i> Color</span><input data-image-effect-field="color" type="color"></label>
          </section>
        </div>
        <div class="podcast-image-effects-preview-panel">
          <div class="podcast-image-effects-preview-head"><strong>Vista previa de la escena</strong><span data-image-effect-scene></span></div>
          <div class="podcast-image-effects-preview"><div class="podcast-image-effects-canvas-wrap"><canvas width="960" height="540" aria-label="Vista previa del efecto"></canvas><svg class="podcast-image-effects-region-guide" role="group" aria-label="Áreas animadas"></svg></div><p data-image-effect-error hidden>No se pudo cargar la imagen de esta escena.</p></div>
          <div class="podcast-image-effects-preview-controls snoopy-preview-player"><button type="button" data-image-effect-action="play" aria-label="Reproducir animación" title="Reproducir animación"><i class="fas fa-play" aria-hidden="true"></i></button><input type="range" min="0" max="1000" step="1" value="0" data-image-effect-scrub aria-label="Recorrer animación"><span data-image-effect-time>0.0 / 8.0 s</span></div>
          <section class="podcast-image-effects-time-panel snoopy-scene-time"><div class="podcast-image-effects-time-head"><i class="fas fa-clock" aria-hidden="true"></i><strong>Tiempo en escena</strong><span class="snoopy-scene-time-total" data-image-effect-total>8.0 s</span></div><div class="podcast-image-effects-time-values"><span>Entrada <output data-image-effect-time-start>0.0 s</output></span><span>Salida <output data-image-effect-time-end>8.0 s</output></span></div><div class="podcast-image-effects-dual-range snoopy-double-range"><input data-image-effect-field="startSec" type="range" min="0" max="7.9" step="0.1" aria-label="Punto de entrada del efecto"><input data-image-effect-field="endSec" type="range" min="0.1" max="8" step="0.1" aria-label="Punto de salida del efecto"></div></section>
        </div>
      </div>
      <footer class="podcast-image-effects-footer"><button type="button" data-image-effect-action="close">Cancelar</button><button type="button" class="is-primary" data-image-effect-action="accept"><i class="fas fa-check" aria-hidden="true"></i> Aplicar efecto</button></footer>
    </div>`;
  const tools = host.querySelector(".podcast-image-effects-tools");
  [...tools.querySelectorAll(":scope > section")].forEach((section, index) => {
    const details = document.createElement("details");
    details.className = `podcast-image-effects-accordion ${section.className}`;
    if (section.hasAttribute("data-image-effect-particles")) details.setAttribute("data-image-effect-particles", "");
    details.open = index === 0;
    const summary = document.createElement("summary");
    summary.append(section.querySelector(":scope > h3"));
    const content = document.createElement("div");
    content.className = "podcast-image-effects-accordion-content";
    while (section.firstChild) content.append(section.firstChild);
    section.replaceWith(details);
    details.append(summary, content);
  });
  document.body.appendChild(host);
  host.addEventListener("click", handleClick);
  host.addEventListener("input", handleInput);
  const guide = host.querySelector(".podcast-image-effects-region-guide");
  guide.addEventListener("pointerdown", handleSpotPointerDown);
  guide.addEventListener("pointermove", handleSpotPointerMove);
  const finishSpotDrag = () => {
    draggedSpotId = "";
    guide.classList.remove("is-dragging");
  };
  guide.addEventListener("pointerup", finishSpotDrag);
  guide.addEventListener("pointercancel", finishSpotDrag);
  guide.addEventListener("lostpointercapture", finishSpotDrag);
  return host;
}

function stop() {
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  startedAt = 0;
  const button = editor()?.querySelector('[data-image-effect-action="play"]');
  if (button) { button.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i>'; button.setAttribute("aria-label", "Reproducir animación"); button.title = "Reproducir animación"; }
}

function paint(timeSec = 0) {
  const host = editor();
  if (!host || host.hidden || !sourceImage) return;
  drawImageWarpFrame(host.querySelector("canvas"), sourceImage, draft, timeSec, durationSec);
  previewTimeSec = Math.max(0, Math.min(durationSec, Number(timeSec) || 0));
  const time = host.querySelector("[data-image-effect-time]");
  if (time) time.textContent = `${previewTimeSec.toFixed(1)} / ${durationSec.toFixed(1)} s`;
  const scrub = host.querySelector("[data-image-effect-scrub]");
  if (scrub) scrub.value = String(Math.round(previewTimeSec / durationSec * 1000));
}

function playFrame(now) {
  const elapsed = Math.min(durationSec, (now - startedAt) / 1000);
  if (now - lastPreviewPaint >= 30 || elapsed >= durationSec) {
    lastPreviewPaint = now;
    paint(elapsed);
  }
  if (elapsed >= durationSec) { stop(); return; }
  frameId = requestAnimationFrame(playFrame);
}

function syncControls() {
  const host = editor();
  if (!host) return;
  const activeSpot = selectedSpot();
  const activeType = draft.region.mode === "focus" && activeSpot ? activeSpot.type : draft.type;
  host.querySelectorAll("[data-image-effect-type]").forEach((button) => {
    const active = button.dataset.imageEffectType === activeType;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  for (const field of ["intensity", "speed"]) {
    const input = host.querySelector(`[data-image-effect-field="${field}"]`);
    if (input) input.value = String(draft[field]);
  }
  host.querySelector('[data-image-effect-output="intensity"]').textContent = `${Math.round(draft.intensity)}%`;
  host.querySelector('[data-image-effect-output="speed"]').textContent = `${draft.speed.toFixed(2)}×`;
  host.querySelectorAll("[data-image-effect-region]").forEach((button) => {
    const active = button.dataset.imageEffectRegion === draft.region.mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (activeSpot && selectedSpotId !== activeSpot.id) selectedSpotId = activeSpot.id;
  for (const field of ["radius", "feather"]) {
    host.querySelector(`[data-image-effect-field="${field}"]`).value = String(activeSpot?.[field] ?? draft.region[field]);
    host.querySelector(`[data-image-effect-output="${field}"]`).textContent = `${Math.round((activeSpot?.[field] ?? draft.region[field]) * 100)}%`;
  }
  host.querySelectorAll("[data-image-effect-region-control]").forEach((node) => { node.hidden = draft.region.mode !== "focus" || !activeSpot; });
  host.querySelector("[data-image-effect-feather-control]").hidden = draft.region.mode !== "focus" || activeType === "particles" || !activeSpot;
  host.querySelector("[data-image-effect-spot-count]").textContent = `${draft.region.spots.length}/6`;
  host.querySelector('[data-image-effect-action="add-spot"]').disabled = draft.region.spots.length >= 6;
  const spotList = host.querySelector(".podcast-image-effects-spot-list");
  spotList.hidden = draft.region.mode !== "focus";
  spotList.replaceChildren(...draft.region.spots.map((spot, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.imageEffectSpotSelect = spot.id;
    button.className = `podcast-image-effects-spot-choice${spot.id === selectedSpotId ? " is-active" : ""}`;
    button.setAttribute("aria-pressed", String(spot.id === selectedSpotId));
    button.textContent = `Área ${index + 1} · ${PRESETS.find((preset) => preset.type === spot.type)?.label || "Sin efecto"}`;
    return button;
  }));
  const startInput = host.querySelector('[data-image-effect-field="startSec"]');
  const endInput = host.querySelector('[data-image-effect-field="endSec"]');
  const startSec = Math.max(0, Math.min(durationSec - 0.1, draft.startSec));
  const endSec = Math.max(startSec + 0.1, Math.min(durationSec, draft.endSec == null ? durationSec : draft.endSec));
  startInput.min = "0"; startInput.max = String(endSec - 0.1); startInput.value = String(startSec);
  endInput.min = String(startSec + 0.1); endInput.max = String(durationSec); endInput.value = String(endSec);
  host.querySelector('[data-image-effect-total]').textContent = `${durationSec.toFixed(1)} s`;
  host.querySelector('[data-image-effect-time-start]').textContent = `${startSec.toFixed(1)} s`;
  host.querySelector('[data-image-effect-time-end]').textContent = `${endSec.toFixed(1)} s`;
  const timeRange = host.querySelector(".podcast-image-effects-dual-range");
  timeRange.style.setProperty("--range-start", `${startSec / durationSec * 100}%`);
  timeRange.style.setProperty("--range-end", `${endSec / durationSec * 100}%`);
  const guide = host.querySelector(".podcast-image-effects-region-guide");
  guide.hidden = draft.region.mode !== "focus";
  const width = host.querySelector("canvas").width;
  const height = host.querySelector("canvas").height;
  guide.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const svg = "http://www.w3.org/2000/svg";
  const interactionSurface = document.createElementNS(svg, "rect");
  interactionSurface.setAttribute("width", String(width));
  interactionSurface.setAttribute("height", String(height));
  interactionSurface.setAttribute("fill", "transparent");
  interactionSurface.setAttribute("pointer-events", "all");
  guide.replaceChildren(interactionSurface, ...draft.region.spots.map((spot, index) => {
    const group = document.createElementNS(svg, "g");
    group.classList.add("podcast-image-effects-spot");
    group.classList.toggle("is-active", spot.id === selectedSpotId);
    group.dataset.imageEffectSpotId = spot.id;
    const cx = spot.centerX * width;
    const cy = spot.centerY * height;
    const radius = spot.radius * Math.sqrt(width * height);
    const circle = document.createElementNS(svg, "circle");
    circle.classList.add("podcast-image-effects-spot-ring");
    for (const [key, value] of Object.entries({ cx, cy, r: radius })) circle.setAttribute(key, String(value));
    const label = document.createElementNS(svg, "text");
    label.classList.add("podcast-image-effects-spot-number");
    label.setAttribute("x", String(cx));
    label.setAttribute("y", String(cy));
    label.textContent = String(index + 1);
    const remove = document.createElementNS(svg, "g");
    remove.classList.add("podcast-image-effects-spot-delete");
    remove.dataset.imageEffectDeleteSpotId = spot.id;
    remove.setAttribute("role", "button");
    remove.setAttribute("aria-label", `Eliminar área ${index + 1}`);
    const deleteCircle = document.createElementNS(svg, "circle");
    deleteCircle.setAttribute("cx", String(cx + radius * 0.7));
    deleteCircle.setAttribute("cy", String(cy - radius * 0.7));
    deleteCircle.setAttribute("r", "15");
    const deleteText = document.createElementNS(svg, "text");
    deleteText.setAttribute("x", String(cx + radius * 0.7));
    deleteText.setAttribute("y", String(cy - radius * 0.7));
    deleteText.textContent = "×";
    remove.append(deleteCircle, deleteText);
    group.append(circle, label, remove);
    return group;
  }));
  host.querySelector("[data-image-effect-particles]").hidden = activeType !== "particles";
  for (const field of ["count", "size", "color"]) {
    host.querySelector(`[data-image-effect-field="${field}"]`).value = String(draft.particles[field]);
    if (field !== "color") host.querySelector(`[data-image-effect-output="${field}"]`).textContent = String(draft.particles[field]);
  }
  host.querySelectorAll("[data-particle-direction]").forEach((button) => {
    const active = button.dataset.particleDirection === draft.particles.direction;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function spotPointerPosition(event) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
}

function handleSpotPointerDown(event) {
  if (draft.region.mode !== "focus") return;
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const deleteId = target?.closest?.("[data-image-effect-delete-spot-id]")?.dataset.imageEffectDeleteSpotId;
  if (deleteId) {
    const spots = draft.region.spots.filter((spot) => spot.id !== deleteId);
    selectedSpotId = spots[0]?.id || "";
    draft = normalizeImageWarp({ ...draft, region: { ...draft.region, mode: spots.length ? "focus" : "all", spots } });
    syncControls();
    if (!frameId) paint(Math.min(durationSec, draft.startSec + 0.5));
    event.preventDefault();
    return;
  }
  const spotId = target?.closest?.("[data-image-effect-spot-id]")?.dataset.imageEffectSpotId || selectedSpotId;
  const spot = draft.region.spots.find((entry) => entry.id === spotId);
  if (!spot) return;
  const point = spotPointerPosition(event);
  selectedSpotId = spot.id;
  draggedSpotId = spot.id;
  dragOffset = { x: spot.centerX - point.x, y: spot.centerY - point.y };
  // Capture before changing selection UI. Re-rendering the SVG here replaces
  // the exact ring that received pointerdown and can cancel its drag sequence.
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.currentTarget.classList.add("is-dragging");
  syncSpotSelectionUI(spot);
  event.preventDefault();
}

function syncSpotSelectionUI(spot) {
  const host = editor();
  if (!host) return;
  host.querySelectorAll(".podcast-image-effects-spot").forEach((group) => {
    group.classList.toggle("is-active", group.dataset.imageEffectSpotId === spot.id);
  });
  host.querySelectorAll("[data-image-effect-spot-select]").forEach((button) => {
    const active = button.dataset.imageEffectSpotSelect === spot.id;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  host.querySelectorAll("[data-image-effect-type]").forEach((button) => {
    const active = button.dataset.imageEffectType === spot.type;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  for (const field of ["radius", "feather"]) {
    const input = host.querySelector(`[data-image-effect-field="${field}"]`);
    const output = host.querySelector(`[data-image-effect-output="${field}"]`);
    if (input) input.value = String(spot[field]);
    if (output) output.textContent = `${Math.round(spot[field] * 100)}%`;
  }
  host.querySelectorAll("[data-image-effect-region-control]").forEach((node) => { node.hidden = false; });
  host.querySelector("[data-image-effect-feather-control]").hidden = spot.type === "particles";
}

function handleSpotPointerMove(event) {
  if (!draggedSpotId || (event.pointerType === "mouse" && event.buttons !== 1)) return;
  const point = spotPointerPosition(event);
  const centerX = Math.max(0, Math.min(1, point.x + dragOffset.x));
  const centerY = Math.max(0, Math.min(1, point.y + dragOffset.y));
  draft = normalizeImageWarp({
    ...draft,
    region: { ...draft.region, spots: draft.region.spots.map((spot) => spot.id === draggedSpotId ? { ...spot, centerX, centerY } : spot) }
  });
  const host = editor();
  const canvas = host?.querySelector("canvas");
  const group = [...(host?.querySelectorAll(".podcast-image-effects-spot") || [])].find((node) => node.dataset.imageEffectSpotId === draggedSpotId);
  if (!canvas || !group) return;
  const spot = draft.region.spots.find((entry) => entry.id === draggedSpotId);
  const cx = spot.centerX * canvas.width;
  const cy = spot.centerY * canvas.height;
  const radius = spot.radius * Math.sqrt(canvas.width * canvas.height);
  const [ring, label, remove] = group.children;
  for (const [key, value] of Object.entries({ cx, cy, r: radius })) ring.setAttribute(key, String(value));
  label.setAttribute("x", String(cx)); label.setAttribute("y", String(cy));
  const [deleteCircle, deleteText] = remove.children;
  deleteCircle.setAttribute("cx", String(cx + radius * 0.7)); deleteCircle.setAttribute("cy", String(cy - radius * 0.7));
  deleteText.setAttribute("x", String(cx + radius * 0.7)); deleteText.setAttribute("y", String(cy - radius * 0.7));
  if (!frameId) paint(Math.min(durationSec, draft.startSec + 0.5));
}

async function loadImage(rowId) {
  const selector = `[data-row-id="${CSS.escape(rowId)}"]`;
  const thumbnail = document.querySelector(`.podcast-video-timeline-clip${selector} .podcast-video-clip-preview img, .podcast-video-timeline-item${selector} .podcast-video-scene-preview img`);
  const logicalUrl = String(thumbnail?.dataset?.previewSrc || "").trim();
  let url = String(thumbnail?.getAttribute("src") || "").trim();
  const host = editor();
  const error = host?.querySelector("[data-image-effect-error]");
  sourceImage = null;
  if (!url && logicalUrl) {
    try { url = String(await window.PodcasterUI?.resolveStageImageSource?.(logicalUrl) || "").trim(); }
    catch (_) { url = ""; }
  }
  if (currentRowId !== rowId || host.hidden) return;
  if (!url) { if (error) error.hidden = false; return; }
  const image = new Image();
  image.onload = () => {
    if (currentRowId !== rowId || host.hidden) return;
    sourceImage = image;
    if (error) error.hidden = true;
    paint(Math.min(durationSec, draft.startSec + 0.5));
  };
  image.onerror = () => { if (currentRowId === rowId && error) error.hidden = false; };
  image.src = url;
}

export function openImageEffectsEditor(rowId) {
  const key = String(rowId || "").trim();
  const session = window.getActiveSession?.();
  if (!key || !session) return;
  const host = ensureEditor();
  syncEditorTheme(host);
  stop();
  currentRowId = key;
  draft = normalizeImageWarp(session.visualEffectsMap?.[key]?.imageWarp);
  selectedSpotId = draft.region.spots[0]?.id || "";
  draggedSpotId = "";
  const clips = window.ensureTimelineClipsByRowId?.(session, { persist: false }) || {};
  const clip = clips[key] || {};
  durationSec = Math.max(0.5, (Number(clip.trimOutMs || 0) - Number(clip.trimInMs || 0) || Number(clip.durationMs || 8000)) / 1000);
  const index = (session.script?.rows || []).findIndex((row) => String(row?.id || "") === key);
  host.querySelector("[data-image-effect-scene]").textContent = index >= 0 ? `Escena ${index + 1}` : "Escena";
  host.querySelector("[data-image-effect-error]").hidden = true;
  const canvas = host.querySelector("canvas");
  const reel = session.podcastVideoConfig?.reelModeEnabled === true;
  canvas.width = reel ? 540 : 960;
  canvas.height = reel ? 960 : 540;
  host.dataset.reel = String(reel);
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  host.hidden = false;
  presentUnifiedToolModal("effects", host, key);
  draft = normalizeImageWarp({ ...draft, startSec: Math.min(durationSec, draft.startSec), endSec: draft.endSec == null ? null : Math.min(durationSec, draft.endSec) });
  syncControls();
  loadImage(key);
  host.querySelector('[data-image-effect-type].is-active')?.focus();
}

function close() { stop(); const host = editor(); if (host) host.hidden = true; sourceImage = null; }

function handleClick(event) {
  const spotButton = event.target.closest("[data-image-effect-spot-select]");
  if (spotButton) {
    selectedSpotId = spotButton.dataset.imageEffectSpotSelect;
    syncControls();
    return;
  }
  const directionButton = event.target.closest("[data-particle-direction]");
  if (directionButton) {
    draft = normalizeImageWarp({ ...draft, particles: { ...draft.particles, direction: directionButton.dataset.particleDirection } });
    syncControls();
    if (!frameId) paint(Math.min(durationSec, draft.startSec + 0.5));
    return;
  }
  const regionButton = event.target.closest("[data-image-effect-region]");
  if (regionButton) {
    const mode = regionButton.dataset.imageEffectRegion;
    const spots = mode === "focus" && !draft.region.spots.length ? [createSpot()] : draft.region.spots;
    draft = normalizeImageWarp({ ...draft, type: draft.type === "none" && mode === "focus" ? "ripple" : draft.type, region: { ...draft.region, mode, spots } });
    if (mode === "focus") selectedSpotId = selectedSpot()?.id || "";
    syncControls();
    if (!frameId) paint(Math.min(durationSec, draft.startSec + 0.5));
    return;
  }
  const typeButton = event.target.closest("[data-image-effect-type]");
  if (typeButton) {
    const spot = draft.region.mode === "focus" ? selectedSpot() : null;
    if (spot) updateSpot(spot.id, { type: typeButton.dataset.imageEffectType });
    else draft = normalizeImageWarp({ ...draft, type: typeButton.dataset.imageEffectType });
    syncControls();
    if (!frameId) paint(Math.min(durationSec, draft.startSec + 0.5));
    return;
  }
  const action = event.target.closest("[data-image-effect-action]")?.dataset.imageEffectAction;
  if (action === "add-spot") {
    if (draft.region.spots.length >= 6) return;
    const current = selectedSpot();
    const spot = createSpot(Math.min(0.9, (current?.centerX ?? 0.38) + 0.12), Math.min(0.9, (current?.centerY ?? 0.38) + 0.12));
    draft = normalizeImageWarp({ ...draft, type: draft.type === "none" ? "ripple" : draft.type, region: { ...draft.region, mode: "focus", spots: [...draft.region.spots, spot] } });
    selectedSpotId = spot.id;
    syncControls();
    if (!frameId) paint(Math.min(durationSec, draft.startSec + 0.5));
    return;
  }
  if (action === "close") close();
  if (action === "play") {
    if (!sourceImage) return;
    if (frameId) { stop(); return; }
    if (previewTimeSec >= durationSec) previewTimeSec = 0;
    startedAt = performance.now() - previewTimeSec * 1000;
    lastPreviewPaint = 0;
    const button = editor().querySelector('[data-image-effect-action="play"]');
    button.innerHTML = '<i class="fas fa-pause" aria-hidden="true"></i>';
    button.setAttribute("aria-label", "Pausar animación"); button.title = "Pausar animación";
    frameId = requestAnimationFrame(playFrame);
  }
  if (action === "accept") {
    if (draft.type !== "none" && !sourceImage) return;
    const rowId = currentRowId;
    saveImageWarp(rowId, draft);
    close();
  }
}

function handleInput(event) {
  if (event.target?.matches?.("[data-image-effect-scrub]")) {
    stop();
    paint(Number(event.target.value) / 1000 * durationSec);
    return;
  }
  const field = event.target?.dataset?.imageEffectField;
  if (!["intensity", "speed", "radius", "feather", "startSec", "endSec", "count", "size", "color"].includes(field)) return;
  const value = field === "color" ? event.target.value : Number(event.target.value);
  if (field === "radius" || field === "feather") {
    const spot = selectedSpot();
    if (!spot) return;
    updateSpot(spot.id, { [field]: value });
    return;
  }
  else if (["count", "size", "color"].includes(field)) draft = normalizeImageWarp({ ...draft, particles: { ...draft.particles, [field]: value } });
  else if (field === "startSec") {
    const startSec = Math.max(0, Math.min(durationSec - 0.1, value));
    draft = normalizeImageWarp({ ...draft, startSec, endSec: Math.max(startSec + 0.1, draft.endSec == null ? durationSec : draft.endSec) });
  }
  else if (field === "endSec") draft = normalizeImageWarp({ ...draft, endSec: Math.min(durationSec, Math.max(draft.startSec + 0.1, value)) });
  else draft = normalizeImageWarp({ ...draft, [field]: value });
  syncControls();
  if (!frameId) paint(Math.min(durationSec, draft.startSec + 0.5));
}

document.addEventListener("click", (event) => {
  const badge = event.target?.closest?.('[data-action="timeline-edit-image-effects"][data-row-id]');
  if (!badge) return;
  event.preventDefault();
  const rowId = String(badge.dataset.rowId || "").trim();
  if (!rowId) return;
  window.PodcasterUI?.selectTimelineSceneRow?.(rowId, { syncStage: false });
  openImageEffectsEditor(rowId);
});

document.addEventListener("click", (event) => {
  const button = event.target?.closest?.('[data-action="timeline-open-image-effects"][data-row-id]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  openImageEffectsActionMenu(button.dataset.rowId, button);
});

document.addEventListener("click", (event) => {
  if (effectsActionMenu() && !event.target?.closest?.(".podcast-image-effects-action-menu, [data-action='timeline-open-image-effects']")) closeEffectsActionMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (effectsActionMenu()) { closeEffectsActionMenu(); return; }
  if (!editor()?.hidden) close();
});
window.PodcasterImageEffectsEditor = { openImageEffectsEditor, openImageEffectsActionMenu, close, pause: stop };
