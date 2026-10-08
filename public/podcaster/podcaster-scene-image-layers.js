import { buildApiUrl } from "../js/api-client-podcaster.js?v=2026-1.0.10.537";
import { uploadPodcasterAsset } from "./podcaster-resumable-upload.js";
import { drawImageWarpFrame, hasImageWarpMotion } from "./podcaster-image-warp.js?v=2026-10-07.smooth-warp-defaults-1";
import { normalizeSceneImageLayer, normalizeSceneImageLayers, sceneImageLayerFrame } from "./podcaster-scene-image-layers-model.js?v=2026-10-07.layer-visibility-1";
import { presentUnifiedToolModal } from "./podcaster-tool-modal-tabs.js?rev=2026-10-07.unified-tools-1";

const MOTIONS = [
  ["none", "Sin entrada", "fa-minus"], ["fade", "Aparecer", "fa-adjust"],
  ["slide-left", "Desde derecha", "fa-arrow-left"], ["slide-right", "Desde izquierda", "fa-arrow-right"],
  ["slide-up", "Desde abajo", "fa-arrow-up"], ["slide-down", "Desde arriba", "fa-arrow-down"]
];
const EXITS = [
  ["none", "Sin salida", "fa-minus"], ["fade", "Desvanecer", "fa-adjust"],
  ["slide-left", "Hacia izquierda", "fa-arrow-left"], ["slide-right", "Hacia derecha", "fa-arrow-right"],
  ["slide-up", "Hacia arriba", "fa-arrow-up"], ["slide-down", "Hacia abajo", "fa-arrow-down"]
];
const EFFECTS = [
  ["none", "Sin efecto", "fa-ban"], ["wave", "Onda", "fa-water"], ["bend", "Doblez", "fa-bezier-curve"],
  ["ripple", "Ondas radiales", "fa-bullseye"], ["flag", "Bandera", "fa-flag"], ["liquid", "Líquido", "fa-tint"],
  ["twist", "Giro", "fa-sync-alt"], ["jelly", "Gelatina", "fa-cube"]
];
const imageCache = new Map();
const warpCanvases = new Map();
let rowId = "";
let layers = [];
let selectedId = "";
let durationSec = 8;
let previewTime = 0;
let previewPlaying = false;
let previewFrame = 0;
let previewStartedAt = 0;
let stageFrame = 0;
let stageRowId = "";
let stageCanvas = null;
let backgroundImage = null;
let stageSession = null;
let stagePlaybackState = null;
let dragging = false;
let lastStagePaint = 0;
let visibilityCycleLayerId = "";
let visibilityCycleStep = 0;

const selected = () => layers.find((layer) => layer.id === selectedId) || null;
const host = () => document.querySelector(".podcast-scene-image-layers-editor");
const activeSession = () => stageSession || window.getActiveSession?.() || window.PodcasterVideoPlayerSession?.() || window.PodcasterUI?.getActiveSession?.();
const visualEffectsForRow = (session, rowId) => session?.visualEffectsMap?.[rowId]
  || session?.session?.visualEffectsMap?.[rowId]
  || session?.payload?.visualEffectsMap?.[rowId]
  || session?.script?.visualEffectsMap?.[rowId]
  || session?.config?.visualEffectsMap?.[rowId]
  || session?.podcastStudioUiState?.visualEffectsMap?.[rowId]
  || session?.podcastVideoConfig?.visualEffectsMap?.[rowId]
  || session?.session?.podcastVideoConfig?.visualEffectsMap?.[rowId]
  || null;
const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
// Prefer the persisted download URL in video-player.html; use the
// authenticated proxy only when a record has no usable browser URL.
const assetUrl = (layer) => String(layer.downloadUrl || '').trim()
  || (layer.storagePath
    ? buildApiUrl('/api/assets/proxy-media?storagePath=' + encodeURIComponent(layer.storagePath))
    : '');

function loadLayerImage(layer) {
  const key = layer.storagePath || layer.downloadUrl;
  if (!key) return null;
  if (imageCache.has(key)) return imageCache.get(key);
  const pending = (async () => {
    const logicalUrl = assetUrl(layer);
    let source = logicalUrl;
    if (window.playbackController?.getBlobUrl) {
      try {
        source = await window.playbackController.getBlobUrl(logicalUrl, { persistent: true }) || logicalUrl;
      } catch (_) {
        // The editor can be opened before the playback controller has finished
        // warming its authorized-asset cache. The proxy URL is still a valid
        // authenticated source and lets the browser load the newly uploaded layer.
        source = logicalUrl;
      }
    }
    if (!source) throw new Error("No se pudo abrir la imagen extra.");
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("No se pudo cargar la imagen extra."));
      image.src = source;
    });
  })();
  imageCache.set(key, pending);
  pending.catch(() => imageCache.delete(key));
  return pending;
}

function drawLayers(canvas, sourceLayers, timeSec, { selection = "", sceneDurationSec = durationSec } = {}) {
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  for (const layer of sourceLayers) {
    if (layer.visible === false) continue;
    const frame = sceneImageLayerFrame(layer, timeSec);
    if (!frame.visible) continue;
    const image = imageCache.get(layer.storagePath || layer.downloadUrl);
    if (!image?.__resolvedImage) continue;
    const img = image.__resolvedImage;
    const drawWidth = width * layer.width * frame.scale;
    const drawHeight = drawWidth * img.naturalHeight / img.naturalWidth;
    const x = frame.x * width - drawWidth / 2;
    const y = frame.y * height - drawHeight / 2;
    let visual = img;
    if (hasImageWarpMotion(layer.effect)) {
      let buffer = warpCanvases.get(layer.id);
      const bw = Math.max(2, Math.round(Math.min(960, drawWidth)));
      const bh = Math.max(2, Math.round(bw * img.naturalHeight / img.naturalWidth));
      if (!buffer) { buffer = document.createElement("canvas"); warpCanvases.set(layer.id, buffer); }
      if (buffer.width !== bw || buffer.height !== bh) { buffer.width = bw; buffer.height = bh; }
      drawImageWarpFrame(buffer, img, layer.effect, timeSec, sceneDurationSec);
      visual = buffer;
    }
    context.globalAlpha = frame.opacity;
    context.drawImage(visual, x, y, drawWidth, drawHeight);
    context.globalAlpha = 1;
    if (selection === layer.id) {
      context.strokeStyle = "#38bdf8";
      context.lineWidth = Math.max(2, width / 450);
      context.setLineDash([8, 5]);
      context.strokeRect(x, y, drawWidth, drawHeight);
      context.setLineDash([]);
    }
  }
}

function queueImages(sourceLayers) {
  for (const layer of sourceLayers) {
    const key = layer.storagePath || layer.downloadUrl;
    const cached = imageCache.get(key);
    if (!key || cached?.__resolvedImage || cached?.__observed) continue;
    const loading = loadLayerImage(layer);
    loading.__observed = true;
    void loading.then((image) => {
      const promise = imageCache.get(key);
      if (promise) promise.__resolvedImage = image;
      paintPreview();
      // The stage renderer is driven by its own RAF loop, but a failed
      // frame is throttled while the image is loading.  Wake it explicitly
      // when the asset resolves so the first scene is painted as well as
      // subsequent scenes.
      if (!stageFrame) stageFrame = requestAnimationFrame(tickStage);
    }).catch((error) => { if (host() && !host().hidden) setStatus(error.message, true); });
  }
}

function paintPreview() {
  const canvas = host()?.querySelector(".scene-image-layers-preview canvas");
  if (!canvas) return;
  const context = canvas.getContext("2d");
  context.fillStyle = "#101827";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (backgroundImage?.complete && backgroundImage.naturalWidth) {
    const scale = Math.max(canvas.width / backgroundImage.naturalWidth, canvas.height / backgroundImage.naturalHeight);
    const w = backgroundImage.naturalWidth * scale;
    const h = backgroundImage.naturalHeight * scale;
    context.drawImage(backgroundImage, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }
  const overlay = host().querySelector(".scene-image-layers-preview-overlay");
  drawLayers(overlay, layers, previewTime, { selection: selectedId });
  host().querySelector("[data-layer-time]").textContent = `${previewTime.toFixed(1)} / ${durationSec.toFixed(1)} s`;
}

function setStatus(message, error = false) {
  const node = host()?.querySelector("[data-layer-status]");
  if (node) {
    node.textContent = message;
    node.dataset.error = String(error);
  }
  const railStatus = layerRail()?.querySelector("[data-layer-rail-status]");
  if (railStatus) {
    railStatus.textContent = message;
    railStatus.dataset.error = String(error);
  }
}

function choiceButtons(items, field, value) {
  return items.map(([key, label, icon]) => `<button type="button" class="scene-image-layer-choice${value === key ? " is-active" : ""}" data-layer-choice="${field}" data-value="${key}" aria-pressed="${value === key}"><i class="fas ${icon}" aria-hidden="true"></i><span>${label}</span></button>`).join("");
}

const RAIL_PRESETS = { motion: MOTIONS, exit: EXITS, effect: EFFECTS };
const RAIL_TITLES = { motion: "Entrada", exit: "Salida", effect: "Efecto de imagen" };

// La barra vertical de capas vive en la orilla derecha del panel "Capas de escena"
// del inspector, no dentro del modal: así los accesos directos están visibles
// mientras se compone la escena y sólo muestran herramientas de capa.
const RAIL_HTML = `
  <button type="button" class="scene-image-layers-rail-btn" data-layer-action="upload" title="Añadir imagen" aria-label="Añadir imagen"><i class="fas fa-plus" aria-hidden="true"></i></button>
  <span class="scene-image-layers-rail-sep" aria-hidden="true"></span>
  <button type="button" class="scene-image-layers-rail-btn" data-layer-rail="motion" title="Entrada" aria-label="Entrada" aria-haspopup="true"><i class="fas fa-sign-in-alt" aria-hidden="true"></i></button>
  <button type="button" class="scene-image-layers-rail-btn" data-layer-rail="exit" title="Salida" aria-label="Salida" aria-haspopup="true"><i class="fas fa-sign-out-alt" aria-hidden="true"></i></button>
  <button type="button" class="scene-image-layers-rail-btn" data-layer-rail="effect" title="Efecto de imagen" aria-label="Efecto de imagen" aria-haspopup="true"><i class="fas fa-magic" aria-hidden="true"></i></button>
  <span class="scene-image-layers-rail-sep" aria-hidden="true"></span>
  <button type="button" class="scene-image-layers-rail-btn" data-layer-rail="center" title="Centrar en escena" aria-label="Centrar en escena"><i class="fas fa-crosshairs" aria-hidden="true"></i></button>
  <button type="button" class="scene-image-layers-rail-btn" data-layer-rail="forward" title="Traer al frente" aria-label="Traer al frente"><i class="fas fa-arrow-up" aria-hidden="true"></i></button>
  <button type="button" class="scene-image-layers-rail-btn" data-layer-rail="backward" title="Enviar al fondo" aria-label="Enviar al fondo"><i class="fas fa-arrow-down" aria-hidden="true"></i></button>
  <button type="button" class="scene-image-layers-rail-btn" data-layer-rail="duplicate" title="Duplicar capa" aria-label="Duplicar capa"><i class="fas fa-copy" aria-hidden="true"></i></button>
  <span class="scene-image-layers-rail-sep" aria-hidden="true"></span>
  <button type="button" class="scene-image-layers-rail-btn" data-layer-action="play" title="Ver animación" aria-label="Ver animación"><i class="fas fa-play" aria-hidden="true"></i></button>
  <button type="button" class="scene-image-layers-rail-btn" data-layer-action="save" title="Aplicar capas" aria-label="Aplicar capas"><i class="fas fa-check" aria-hidden="true"></i></button>
  <button type="button" class="scene-image-layers-rail-btn is-danger" data-layer-action="remove" title="Eliminar capa" aria-label="Eliminar capa"><i class="fas fa-trash-alt" aria-hidden="true"></i></button>
  <div class="scene-image-layers-flyout" data-layer-flyout hidden></div>
  <span class="scene-image-layers-rail-status" data-layer-rail-status aria-live="polite"></span>`;

function applyLayerThemeVars(targetEl) {
  const shell = document.querySelector("#podcastVideoShell");
  if (!targetEl || !shell) return;
  for (const [target, source] of Object.entries({ "--layer-surface": "--snoopy-surface", "--layer-control": "--snoopy-surface-subtle", "--layer-text": "--snoopy-text", "--layer-muted": "--snoopy-text-muted", "--layer-border": "--snoopy-border", "--layer-accent": "--snoopy-accent" })) {
    const value = getComputedStyle(shell).getPropertyValue(source).trim();
    if (value) targetEl.style.setProperty(target, value);
  }
}

function layerRail() {
  return document.querySelector("[data-scene-layer-rail]") || null;
}

// La barra de capas vive en la orilla derecha del panel "Capas de escena", no en
// el borde del inspector: así sólo muestra herramientas de capa y queda junto a
// la lista que edita. El inspector conserva su propia barra para las acciones de
// escena (menú del clip + herramientas del visor).
function ensureLayerRail() {
  const panel = document.querySelector('#podcastStudioInspector .inspector-panel[data-inspector-panel="layers"]');
  if (!panel) return null;
  const existing = panel.querySelector("[data-scene-layer-rail]");
  if (existing) return existing;
  const rail = document.createElement("nav");
  rail.className = "scene-image-layers-rail is-panel";
  rail.dataset.sceneLayerRail = "true";
  rail.setAttribute("role", "toolbar");
  rail.setAttribute("aria-orientation", "vertical");
  rail.setAttribute("aria-label", "Herramientas de capas de la escena");
  rail.innerHTML = RAIL_HTML;
  rail.addEventListener("click", handleRailClick);
  panel.append(rail);
  panel.classList.add("has-scene-layer-rail");
  applyLayerThemeVars(rail);
  syncLayerRail();
  return rail;
}

function presetChoices(field) {
  return RAIL_PRESETS[field] || [];
}

function presetValue(layer, field) {
  if (!layer) return "";
  return field === "effect" ? layer.effect?.type : layer[field];
}

function closeLayerFlyout() {
  const rail = layerRail();
  const flyout = rail?.querySelector("[data-layer-flyout]");
  if (!flyout) return;
  flyout.hidden = true;
  flyout.innerHTML = "";
  delete flyout.dataset.flyoutFor;
  for (const button of rail.querySelectorAll("[data-layer-rail]")) button.classList.remove("is-open");
}

function openLayerFlyout(field, button) {
  const rail = layerRail();
  const flyout = rail?.querySelector("[data-layer-flyout]");
  const layer = selected();
  if (!flyout || !layer) return;
  if (flyout.dataset.flyoutFor === field && !flyout.hidden) { closeLayerFlyout(); return; }
  flyout.dataset.flyoutFor = field;
  flyout.innerHTML = `<strong>${RAIL_TITLES[field]}</strong><div class="scene-image-layer-choices">${choiceButtons(presetChoices(field), field, presetValue(layer, field))}</div>`;
  flyout.style.top = `${Math.max(8, button.offsetTop)}px`;
  flyout.hidden = false;
  for (const node of rail.querySelectorAll("[data-layer-rail]")) node.classList.toggle("is-open", node === button);
}

function syncLayerRail() {
  const rail = layerRail();
  if (!rail) return;
  const layer = selected();
  const editorOpen = Boolean(host() && !host().hidden);
  for (const button of rail.querySelectorAll("[data-layer-rail]")) {
    const field = button.dataset.layerRail;
    // Sin el editor abierto la barra es un lanzador: el primer clic abre la
    // composición de la escena activa y los siguientes ya editan la capa.
    button.disabled = false;
    if (!RAIL_TITLES[field]) continue;
    const value = presetValue(layer, field);
    const label = presetChoices(field).find(([key]) => key === value)?.[1] || "—";
    button.title = editorOpen && layer ? `${RAIL_TITLES[field]}: ${label}` : RAIL_TITLES[field];
    button.setAttribute("aria-label", button.title);
    button.classList.toggle("is-active", Boolean(editorOpen && layer && value !== "none"));
  }
  for (const button of rail.querySelectorAll("[data-layer-action]")) {
    button.classList.toggle("is-launcher", !editorOpen);
  }
}

function moveSelectedLayer(direction) {
  const layer = selected();
  if (!layer) return;
  const index = layers.indexOf(layer);
  if (index < 0) return;
  if (direction === "forward" && index === layers.length - 1) return;
  if (direction === "backward" && index === 0) return;
  layers.splice(index, 1);
  if (direction === "forward") layers.push(layer);
  else layers.unshift(layer);
}

function duplicateSelectedLayer() {
  const layer = selected();
  if (!layer) return;
  if (layers.length >= 24) { setStatus("Puedes añadir hasta 24 imágenes por escena.", true); return; }
  const copy = normalizeSceneImageLayer({
    ...layer,
    id: globalThis.crypto?.randomUUID?.() || `layer-${Date.now()}`,
    x: Math.min(1, layer.x + 0.04),
    y: Math.min(1, layer.y + 0.04)
  });
  layers.splice(layers.indexOf(layer) + 1, 0, copy);
  selectedId = copy.id;
  queueImages([copy]);
}

function syncLayerTimeRange(panel, layer) {
  const range = panel.querySelector("[data-layer-time-range]");
  const start = panel.querySelector('[data-layer-time-point="start"]');
  const end = panel.querySelector('[data-layer-time-point="end"]');
  if (!range || !start || !end) return;
  const total = Math.max(0.5, durationSec);
  start.min = "0"; start.max = String(Math.max(0, layer.endSec - 0.1)); start.value = String(layer.startSec);
  end.min = String(Math.min(total, layer.startSec + 0.1)); end.max = String(total); end.value = String(layer.endSec);
  range.style.setProperty("--range-start", `${layer.startSec / total * 100}%`);
  range.style.setProperty("--range-end", `${layer.endSec / total * 100}%`);
  panel.querySelector("[data-layer-time-start]").textContent = `${layer.startSec.toFixed(1)} s`;
  panel.querySelector("[data-layer-time-end]").textContent = `${layer.endSec.toFixed(1)} s`;
  const totalLabel = panel.querySelector("[data-layer-time-total]");
  if (totalLabel) totalLabel.textContent = `${total.toFixed(1)} s`;
}

function initializeLayerToolAccordions(root) {
  const tools = root.querySelector(".scene-image-layers-tools");
  if (!tools || tools.dataset.accordionsReady === "true") return;
  tools.dataset.accordionsReady = "true";
  const sections = [...root.querySelectorAll(".scene-image-layers-tools > section, .scene-image-layers-config > section")];
  let settingsAccordionIndex = 0;
  sections.forEach((section) => {
    const heading = section.querySelector(":scope > h3");
    if (!heading) return;
    const inSettings = Boolean(section.closest(".scene-image-layers-config"));
    const scope = inSettings ? "layer-settings" : "layer-list";
    const details = document.createElement("details");
    details.className = "scene-layer-accordion";
    details.dataset.accordionScope = scope;
    details.open = inSettings ? settingsAccordionIndex++ === 0 : true;
    const summary = document.createElement("summary");
    summary.innerHTML = heading.innerHTML;
    const body = document.createElement("div");
    body.className = "scene-layer-accordion-body";
    for (const child of [...section.children]) {
      if (child === heading) continue;
      body.append(child);
    }
    details.append(summary, body);
    section.replaceWith(details);
    details.addEventListener("toggle", () => {
      if (!details.open) return;
      root.querySelectorAll(`details[data-accordion-scope="${scope}"][open]`).forEach((other) => {
        if (other !== details) other.open = false;
      });
    });
  });
}

function renderControls() {
  const root = host();
  if (!root) return;
  const list = root.querySelector("[data-layer-list]");
  list.innerHTML = layers.map((layer, index) => `<div class="scene-image-layer-item${layer.id === selectedId ? " is-active" : ""}${layer.visible === false ? " is-hidden" : ""}" data-layer-id="${escapeHtml(layer.id)}"><button type="button" class="scene-image-layer-select" data-select-layer="${escapeHtml(layer.id)}" aria-pressed="${layer.id === selectedId}"><i class="fas fa-image" aria-hidden="true"></i><span>${escapeHtml(layer.name || `Imagen ${index + 1}`)}</span><small>${layer.startSec.toFixed(1)}–${layer.endSec.toFixed(1)} s</small></button><button type="button" class="scene-image-layer-visibility" data-layer-visibility="${escapeHtml(layer.id)}" aria-label="${layer.visible === false ? "Mostrar" : "Ocultar"} ${escapeHtml(layer.name || `Imagen ${index + 1}`)}" aria-pressed="${layer.visible !== false}" title="${layer.visible === false ? "Mostrar capa" : "Ocultar capa"}"><i class="fas ${layer.visible === false ? "fa-eye-slash" : "fa-eye"}" aria-hidden="true"></i></button></div>`).join("");
  const layer = selected();
  syncLayerRail();
  const panel = root.querySelector("[data-layer-settings]");
  root.querySelector("[data-layer-meta]").hidden = !layer;
  root.querySelector(".scene-layer-time-panel").hidden = !layer;
  panel.hidden = !layer;
  if (!layer) { paintPreview(); return; }
  root.querySelector("[data-layer-name]").value = layer.name;
  panel.querySelector("[data-layer-motion]").innerHTML = choiceButtons(MOTIONS, "motion", layer.motion);
  panel.querySelector("[data-layer-exit]").innerHTML = choiceButtons(EXITS, "exit", layer.exit);
  panel.querySelector("[data-layer-effect]").innerHTML = choiceButtons(EFFECTS, "effect", layer.effect.type);
  for (const field of ["x", "y", "width", "startSec", "endSec"]) {
    panel.querySelector(`[data-layer-field="${field}"]`).value = String(layer[field]);
  }
  root.querySelector('[data-layer-field="transitionSec"]').value = String(layer.transitionSec);
  syncLayerTimeRange(root, layer);
  panel.querySelector('[data-layer-field="intensity"]').value = String(layer.effect.intensity);
  panel.querySelector('[data-layer-field="speed"]').value = String(layer.effect.speed);
  paintPreview();
}

function ensureEditor() {
  if (host()) return host();
  const root = document.createElement("div");
  root.className = "podcast-scene-image-layers-editor";
  root.hidden = true;
  root.innerHTML = `<div class="scene-image-layers-modal" role="dialog" aria-modal="true" aria-label="Imágenes extra de la escena">
    <header><div><h2>Capas de escena</h2></div><button type="button" data-layer-action="close" aria-label="Cerrar"><i class="fas fa-times"></i></button></header>
    <div class="scene-image-layers-grid">
      <aside class="scene-image-layers-tools"><section><h3><i class="fas fa-images"></i> Capas</h3><div data-layer-list class="scene-image-layers-list"></div><button type="button" class="scene-image-layer-add" data-layer-action="upload"><i class="fas fa-plus"></i> Añadir imagen</button><input type="file" accept="image/png,image/webp,image/jpeg" data-layer-file hidden><div data-layer-meta hidden><label>Nombre de la capa<input data-layer-name type="text" maxlength="120"></label><button type="button" class="scene-image-layer-remove" data-layer-action="remove"><i class="fas fa-trash-alt"></i> Eliminar capa</button></div><p class="scene-image-layer-hint">PNG o WebP transparente recomendado.</p></section></aside>
      <div class="scene-image-layers-preview-column">
      <div class="scene-image-layers-preview"><canvas width="960" height="540"></canvas><canvas class="scene-image-layers-preview-overlay" width="960" height="540" aria-label="Capas de imagen de la escena"></canvas></div>
      <div class="scene-image-layers-preview-actions snoopy-preview-player"><button type="button" data-layer-action="play" aria-label="Reproducir vista previa" title="Reproducir vista previa"><i class="fas fa-play"></i></button><input type="range" min="0" max="1000" value="0" data-layer-scrub aria-label="Recorrer escena"><span data-layer-time></span></div>
      <section class="scene-layer-time-panel snoopy-scene-time"><div class="scene-layer-time-heading"><i class="fas fa-clock" aria-hidden="true"></i><strong>Tiempo en escena</strong><span class="scene-layer-time-total" data-layer-time-total></span></div><div class="scene-layer-time-range" data-layer-time-range><div class="scene-layer-time-values"><span>Entrada <output data-layer-time-start>0.0 s</output></span><span>Salida <output data-layer-time-end>8.0 s</output></span></div><div class="scene-layer-dual-range snoopy-double-range"><input type="range" min="0" max="8" step="0.1" data-layer-time-point="start" aria-label="Punto de entrada de la capa"><input type="range" min="0.1" max="8" step="0.1" data-layer-time-point="end" aria-label="Punto de salida de la capa"></div></div></section>
      <p class="scene-image-layers-status" data-layer-status role="status"></p>
      </div>
      <div class="scene-image-layers-config" data-layer-settings hidden><section><h3><i class="fas fa-arrows-alt"></i> Posición y tamaño</h3><p class="scene-image-layer-hint">Arrastra la imagen en la vista previa para ubicarla.</p><div class="scene-image-layer-fields"><label>Horizontal<input data-layer-field="x" type="range" min="0" max="1" step="0.01"></label><label>Vertical<input data-layer-field="y" type="range" min="0" max="1" step="0.01"></label><label>Tamaño<input data-layer-field="width" type="range" min="0.05" max="1" step="0.01"></label><label class="scene-layer-transition-field">Transición (s)<input data-layer-field="transitionSec" type="number" min="0.1" max="3" step="0.1"></label></div></section><section><h3><i class="fas fa-sign-in-alt"></i> Entrada</h3><div class="scene-image-layer-choices" data-layer-motion></div></section><section><h3><i class="fas fa-sign-out-alt"></i> Salida</h3><div class="scene-image-layer-choices" data-layer-exit></div></section><section><h3><i class="fas fa-water"></i> Efecto de imagen</h3><div class="scene-image-layer-choices" data-layer-effect></div><div class="scene-image-layer-fields"><label>Intensidad<input data-layer-field="intensity" type="range" min="1" max="100" step="1"></label><label>Velocidad<input data-layer-field="speed" type="range" min="0.25" max="3" step="0.05"></label></div></section><input data-layer-field="startSec" type="number" min="0" step="0.1" hidden><input data-layer-field="endSec" type="number" min="0.1" step="0.1" hidden></div>
    </div>
    <footer><button type="button" data-layer-action="close">Cancelar</button><button type="button" class="is-primary" data-layer-action="save"><i class="fas fa-check"></i> Aplicar capas</button></footer></div>`;
  initializeLayerToolAccordions(root);
  document.body.append(root);
  root.addEventListener("click", handleClick);
  root.addEventListener("input", handleInput);
  root.querySelector("[data-layer-file]").addEventListener("change", handleUpload);
  const canvas = root.querySelector(".scene-image-layers-preview-overlay");
  canvas.addEventListener("pointerdown", (event) => {
    const point = { x: event.offsetX / canvas.clientWidth, y: event.offsetY / canvas.clientHeight };
    const hit = [...layers].reverse().find((layer) => {
      const frame = sceneImageLayerFrame(layer, previewTime);
      return frame.visible && Math.abs(point.x - frame.x) <= layer.width / 2 && Math.abs(point.y - frame.y) <= layer.width / 2;
    });
    if (!hit) return;
    selectedId = hit.id; dragging = true; canvas.setPointerCapture(event.pointerId); renderControls();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging || !selected()) return;
    const rect = canvas.getBoundingClientRect();
    selected().x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    selected().y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    paintPreview();
  });
  canvas.addEventListener("pointerup", () => { dragging = false; renderControls(); });
  canvas.addEventListener("pointercancel", () => { dragging = false; });
  return root;
}

function stopPreview() { previewPlaying = false; cancelAnimationFrame(previewFrame); previewFrame = 0; }
function tickPreview(now) {
  if (!previewPlaying) return;
  previewTime = ((now - previewStartedAt) / 1000) % durationSec;
  host().querySelector("[data-layer-scrub]").value = String(Math.round(previewTime / durationSec * 1000));
  paintPreview();
  previewFrame = requestAnimationFrame(tickPreview);
}

function closeEditor() { stopPreview(); closeLayerFlyout(); host().hidden = true; rowId = ""; syncLayerRail(); }
async function handleUpload(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!["image/png", "image/webp", "image/jpeg"].includes(file.type) || file.size > 24 * 1024 * 1024) { setStatus("Usa PNG, WebP o JPG de hasta 24 MB.", true); return; }
  const session = activeSession();
  if (!session?.id || !rowId) return;
  if (layers.length >= 24) { setStatus("Puedes añadir hasta 24 imágenes por escena.", true); return; }
  setStatus(`Subiendo ${file.name}…`);
  try {
    const result = await uploadPodcasterAsset(file, { kind: "scene-image", sessionId: session.id, rowId });
    const media = result?.media;
    if (!media?.storagePath) throw new Error("La carga no devolvió una ruta de Storage.");
    const next = normalizeSceneImageLayer({ id: globalThis.crypto?.randomUUID?.() || `layer-${Date.now()}`, name: file.name, storagePath: media.storagePath, downloadUrl: media.downloadUrl, mimeType: media.mimeType || file.type, endSec: durationSec });
    layers.push(next); selectedId = next.id; previewTime = Math.min(durationSec - 0.05, next.startSec + next.transitionSec); queueImages([next]); renderControls(); setStatus("Imagen lista. Ajusta su movimiento y posición.");
  } catch (error) { setStatus(error?.message || "No se pudo subir la imagen.", true); }
}

function togglePreview() {
  if (previewPlaying) { stopPreview(); return; }
  previewPlaying = true;
  previewStartedAt = performance.now() - previewTime * 1000;
  previewFrame = requestAnimationFrame(tickPreview);
}

function saveLayersAndClose() {
  const key = rowId;
  const saved = normalizeSceneImageLayers(layers);
  const updated = window.PodcasterUI?.upsertActiveSession?.((session) => ({ ...session, visualEffectsMap: { ...(session.visualEffectsMap || {}), [key]: { ...(session.visualEffectsMap?.[key] || {}), imageLayers: saved } } }), { render: false, persist: true, autosaveReason: "scene-image-layers" });
  if (updated) void window.persistReorderedTimelinePatchToCloud?.(updated, { visualEffectsMap: updated.visualEffectsMap });
  window.PodcasterUI?.renderPodcastVideoTimeline?.(updated, { force: true, reason: "scene-image-layers" });
  window.PodcasterUI?.syncPodcastStudioInspector?.(updated, { forceRender: true });
  window.scheduleMontageExportPreviewRefresh?.(90);
  closeEditor();
  syncStageImageLayers(key);
}

function cycleLayerVisibility(layerId) {
  const target = layers.find((layer) => layer.id === layerId);
  if (!target) return;
  if (visibilityCycleLayerId !== layerId) {
    visibilityCycleLayerId = layerId;
    visibilityCycleStep = 0;
  }
  if (visibilityCycleStep === 0) {
    target.visible = false;
    visibilityCycleStep = 1;
  } else if (visibilityCycleStep === 1) {
    layers.forEach((layer) => { layer.visible = layer === target; });
    visibilityCycleStep = 2;
  } else {
    layers.forEach((layer) => { layer.visible = true; });
    visibilityCycleStep = 0;
  }
  renderControls();
}

function runLayerAction(action) {
  if (action === "close") { closeEditor(); return; }
  if (action === "upload") { host()?.querySelector("[data-layer-file]")?.click(); return; }
  if (action === "remove") { layers = layers.filter((layer) => layer.id !== selectedId); selectedId = layers.at(-1)?.id || ""; renderControls(); return; }
  if (action === "play") { togglePreview(); return; }
  if (action === "save") { saveLayersAndClose(); }
}

function runLayerCommand(command, button) {
  if (RAIL_PRESETS[command]) { openLayerFlyout(command, button); return; }
  if (!selected()) { setStatus("Selecciona una capa para usar sus accesos directos.", true); return; }
  if (command === "center") { const layer = selected(); layer.x = 0.5; layer.y = 0.5; }
  if (command === "forward" || command === "backward") moveSelectedLayer(command);
  if (command === "duplicate") duplicateSelectedLayer();
  closeLayerFlyout();
  renderControls();
}

function applyLayerChoice(choice) {
  const layer = selected();
  if (!layer || !choice) return;
  const field = choice.dataset.layerChoice;
  if (field === "effect") layer.effect = { ...layer.effect, type: choice.dataset.value };
  else layer[field] = choice.dataset.value;
  closeLayerFlyout();
  renderControls();
}

function isEditorOpen() {
  return Boolean(host() && !host().hidden);
}

// Con el modal cerrado la barra vertical abre la composición de la escena
// activa; con el modal abierto aplica el atajo sobre la capa seleccionada.
function handleRailClick(event) {
  const target = event.target?.closest?.("[data-layer-choice],[data-layer-rail],[data-layer-action]");
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  if (target.matches("[data-layer-choice]")) { applyLayerChoice(target); return; }
  if (!isEditorOpen()) {
    const targetRowId = String(window.podcastVideoState?.activeRowId || "").trim();
    if (!targetRowId) { setStatus("Selecciona una escena en el timeline."); return; }
    openSceneImageLayersEditor(targetRowId);
    return;
  }
  if (target.dataset.layerRail) { runLayerCommand(target.dataset.layerRail, target); return; }
  runLayerAction(target.dataset.layerAction);
}

function handleClick(event) {
  const visibilityId = event.target.closest("[data-layer-visibility]")?.dataset.layerVisibility;
  if (visibilityId) { event.preventDefault(); event.stopPropagation(); cycleLayerVisibility(visibilityId); return; }
  const action = event.target.closest("[data-layer-action]")?.dataset.layerAction;
  if (action) runLayerAction(action);
  const selectId = event.target.closest("[data-select-layer]")?.dataset.selectLayer;
  if (selectId) { selectedId = selectId; closeLayerFlyout(); renderControls(); }
  const choice = event.target.closest("[data-layer-choice]");
  if (choice && selected()) applyLayerChoice(choice);
}

function handleInput(event) {
  if (event.target.matches("[data-layer-scrub]")) { stopPreview(); previewTime = Number(event.target.value) / 1000 * durationSec; paintPreview(); return; }
  const layer = selected();
  if (!layer) return;
  if (event.target.matches("[data-layer-time-point]")) {
    const startInput = host()?.querySelector('[data-layer-time-point="start"]');
    const endInput = host()?.querySelector('[data-layer-time-point="end"]');
    const gap = 0.1;
    if (event.target.dataset.layerTimePoint === "start") layer.startSec = Math.min(Number(startInput.value), layer.endSec - gap);
    else layer.endSec = Math.max(Number(endInput.value), layer.startSec + gap);
    renderControls();
    return;
  }
  if (event.target.matches("[data-layer-name]")) {
    layer.name = event.target.value;
    const label = host()?.querySelector(`[data-select-layer="${CSS.escape(layer.id)}"] span`);
    if (label) label.textContent = layer.name;
    return;
  }
  const field = event.target.dataset.layerField;
  if (!field) return;
  const value = Number(event.target.value);
  if (field === "intensity" || field === "speed") layer.effect = { ...layer.effect, [field]: value };
  else layer[field] = value;
  if (layer.endSec <= layer.startSec) layer.endSec = layer.startSec + 0.1;
  paintPreview();
}

export function openSceneImageLayersEditor(targetRowId) {
  const session = activeSession();
  if (!session || !targetRowId) return;
  const root = ensureEditor();
  applyLayerThemeVars(root);
  applyLayerThemeVars(ensureLayerRail());
  rowId = String(targetRowId);
  layers = normalizeSceneImageLayers(session.visualEffectsMap?.[rowId]?.imageLayers).map((layer) => ({ ...layer }));
  selectedId = layers[0]?.id || "";
  visibilityCycleLayerId = "";
  visibilityCycleStep = 0;
  const clip = window.ensureTimelineClipsByRowId?.(session, { persist: false })?.[rowId] || {};
  durationSec = Math.max(0.5, (Number(clip.trimOutMs || 0) - Number(clip.trimInMs || 0) || Number(clip.durationMs || 8000)) / 1000);
  root.querySelectorAll('[data-layer-field="startSec"], [data-layer-field="endSec"], [data-layer-time-point]').forEach((input) => { input.max = String(durationSec); });
  const reel = session.podcastVideoConfig?.reelModeEnabled === true;
  for (const canvas of root.querySelectorAll(".scene-image-layers-preview canvas")) { canvas.width = reel ? 540 : 960; canvas.height = reel ? 960 : 540; }
  root.dataset.reel = String(reel);
  previewTime = Math.min(durationSec - 0.05, (layers[0]?.startSec || 0) + (layers[0]?.transitionSec || 0.55)); stopPreview(); root.hidden = false; setStatus("");
  presentUnifiedToolModal("layers", root, rowId);
  const thumbnail = document.querySelector(`.podcast-video-timeline-clip[data-row-id="${CSS.escape(rowId)}"] .podcast-video-clip-preview img`);
  backgroundImage = thumbnail || null;
  const logicalBackground = String(thumbnail?.dataset?.previewSrc || "").trim();
  if ((!backgroundImage?.complete || !backgroundImage.naturalWidth) && logicalBackground) {
    const openingRowId = rowId;
    void Promise.resolve(window.PodcasterUI?.resolveStageImageSource?.(logicalBackground)).then((source) => {
      if (rowId !== openingRowId || root.hidden || !source) return;
      const image = new Image();
      image.onload = () => { if (rowId === openingRowId && !root.hidden) { backgroundImage = image; paintPreview(); } };
      image.src = source;
    }).catch(() => {});
  }
  queueImages(layers); renderControls();
  root.querySelector("[data-layer-action='upload']").focus();
}

function resolveTimelineClip(session, rowId, clock = null) {
  const key = String(rowId || "").trim();
  if (!key) return {};
  const clipsMap = (typeof window.ensureTimelineClipsByRowId === "function" ? window.ensureTimelineClipsByRowId(session, { persist: false }) : null)
    || session?.timelineClipMap
    || session?.podcastVideoConfig?.timelineClipsByRowId
    || session?.podcastStudioUiState?.timelineClipsByRowId
    || null;
  if (clipsMap && clipsMap[key]) {
    return clipsMap[key];
  }
  const runtimeEntries = window.PodcasterVideoPlayerState?.runtimeEntries
    || clock?.runtimeEntries
    || session?.runtimeEntries
    || null;
  if (Array.isArray(runtimeEntries)) {
    const entry = runtimeEntries.find((e) => String(e?.rowId || "") === key);
    if (entry) return entry;
  }
  return {};
}

function resolveActiveStageMedia(stage) {
  if (!stage) return null;
  const isVisible = (el) => {
    if (!el || el.hidden) return false;
    const style = window.getComputedStyle ? window.getComputedStyle(el) : el.style;
    return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || 1) > 0.01;
  };
  const activeImages = Array.from(stage.querySelectorAll(".podcast-active-speaker-image:not(.podcast-active-speaker-video-backdrop)"));
  const sceneImage = activeImages.find(isVisible) || activeImages.find((el) => !el.hidden) || null;
  const activeVideos = Array.from(stage.querySelectorAll("video:not(.player-video-backdrop):not(.podcast-active-speaker-video-backdrop)"));
  const sceneVideo = activeVideos.find(isVisible) || activeVideos.find((el) => !el.hidden) || stage.querySelector("video:not([hidden])") || null;
  return sceneImage || sceneVideo;
}

function tickStage() {
  stageFrame = 0;
  const stage = document.querySelector("#podcastVideoStage .podcast-video-preview, #playerStage");
  const currentRowId = String(stagePlaybackState?.activeRowId || window.podcastVideoState?.activeRowId || window.PodcasterVideoPlayerControllerState?.activeRowId || window.PodcasterVideoPlayerState?.activeRowId || stageRowId || "");
  const rawLayers = visualEffectsForRow(activeSession(), currentRowId)?.imageLayers;
  if (!stage || !Array.isArray(rawLayers) || !rawLayers.length) { stageCanvas?.remove(); stageCanvas = null; return; }
  if (!stageCanvas || !stageCanvas.isConnected) {
    stageCanvas = document.createElement("canvas"); stageCanvas.className = "podcast-scene-image-layers-stage"; stage.append(stageCanvas);
  }
  stageRowId = currentRowId;
  const clock = window.PodcasterUI?.getPlaybackState?.() || stagePlaybackState || window.PodcasterVideoPlayerControllerState || {};
  const now = performance.now();
  if (now - lastStagePaint < (clock.isPlaying ? 30 : 220)) { stageFrame = requestAnimationFrame(tickStage); return; }
  lastStagePaint = now;
  const sourceLayers = normalizeSceneImageLayers(rawLayers);
  const media = resolveActiveStageMedia(stage);
  const stageRect = stage.getBoundingClientRect();
  const rect = media?.getBoundingClientRect() || stageRect;
  stageCanvas.style.left = `${rect.left - stageRect.left}px`; stageCanvas.style.top = `${rect.top - stageRect.top}px`;
  stageCanvas.style.width = `${rect.width}px`; stageCanvas.style.height = `${rect.height}px`;
  const width = Math.max(2, Math.round(Math.min(960, rect.width * (devicePixelRatio || 1))));
  const height = Math.max(2, Math.round(width * rect.height / Math.max(1, rect.width)));
  if (stageCanvas.width !== width || stageCanvas.height !== height) { stageCanvas.width = width; stageCanvas.height = height; }
  const session = activeSession();
  const clip = resolveTimelineClip(session, currentRowId, clock);
  const timeSec = Math.max(0, (Number(clock.currentMs || 0) - Number(clip?.startMs || 0)) / 1000);
  const stageDurationSec = Math.max(0.5, (Number(clip?.trimOutMs || 0) - Number(clip?.trimInMs || 0) || Number(clip?.durationMs || 8000)) / 1000);
  queueImages(sourceLayers); drawLayers(stageCanvas, sourceLayers, timeSec, { sceneDurationSec: stageDurationSec });
  stageFrame = requestAnimationFrame(tickStage);
}

export function syncStageImageLayers(targetRowId = "", session = null, playbackState = null) {
  if (targetRowId) stageRowId = String(targetRowId);
  if (session) stageSession = session;
  if (playbackState) stagePlaybackState = playbackState;
  if (!stageFrame) stageFrame = requestAnimationFrame(tickStage);
}

export async function renderSceneImageLayersToCanvas(canvas, targetRowId = "", session = null, timeSec = 0, sceneDurationSec = 8) {
  if (!canvas || typeof canvas.getContext !== "function") return false;
  const effects = visualEffectsForRow(session || activeSession(), String(targetRowId || "").trim());
  const sourceLayers = normalizeSceneImageLayers(effects?.imageLayers || []);
  const visibleLayers = sourceLayers.filter((layer) => layer.visible !== false);
  await Promise.all(visibleLayers.map(async (layer) => {
    try {
      const image = await loadLayerImage(layer);
      const cached = imageCache.get(layer.storagePath || layer.downloadUrl);
      if (cached) cached.__resolvedImage = image;
    } catch (_) { /* A missing optional layer must not discard the scene video. */ }
  }));
  drawLayers(canvas, sourceLayers, Math.max(0, Number(timeSec || 0) || 0), {
    sceneDurationSec: Math.max(0.5, Number(sceneDurationSec || 8) || 8)
  });
  return visibleLayers.length > 0;
}

document.addEventListener("click", (event) => {
  const button = event.target.closest?.('[data-action="timeline-open-scene-image-layers"][data-row-id]');
  if (button) {
    event.preventDefault(); event.stopPropagation();
    openSceneImageLayersEditor(button.dataset.rowId);
    return;
  }
  if (!event.target.closest?.(".scene-image-layers-rail")) closeLayerFlyout();
});
ensureLayerRail();
window.PodcasterSceneImageLayers = { open: openSceneImageLayersEditor, sync: syncStageImageLayers, renderToCanvas: renderSceneImageLayersToCanvas, close: closeEditor, pause: stopPreview };
