import { authFetch, authFetchJson, buildApiUrl } from "../js/api-client-podcaster.js?v=2026-1.0.10.537";
import { uploadPodcasterAsset } from "./podcaster-resumable-upload.js";
import { normalizeSceneImageLayer, normalizeSceneImageLayers } from "./podcaster-scene-image-layers-model.js";
import { reduceGreenFringe, reduceMatteFringe, removeMatteScreenBackground } from "./podcaster-image-chroma-key.mjs";

const IMAGE_MODEL = "gemini-3.1-flash-image";
const TEXT_MODEL = "gemini-3.8-flash";
const REGION_COLORS = [
  { color: "#ff3b5c", label: "Rojo" }, { color: "#00c2ff", label: "Azul" },
  { color: "#ffd400", label: "Amarillo" }, { color: "#a855f7", label: "Violeta" },
  { color: "#00d084", label: "Verde" }, { color: "#ff7a00", label: "Naranja" },
  { color: "#ff4fc3", label: "Rosa" }, { color: "#ffffff", label: "Blanco" },
  { color: "#7b61ff", label: "Índigo" }, { color: "#8b5a2b", label: "Café" },
  { color: "#00a896", label: "Turquesa" }, { color: "#c8f000", label: "Lima" }
];
const DECOMPOSITION_PRESETS = [
  { group: "Composición", value: "elements", label: "Por elementos", help: "Una capa por sujeto u objeto independiente.", analysis: "Enumera sujetos y objetos principales individualmente, del más prominente al menos prominente; no los agrupes.", isolate: "Aísla únicamente el elemento descrito. No incluyas elementos vecinos." },
  { group: "Composición", value: "layers", label: "Por capas semánticas", help: "Agrupa objetos relacionados que deben editarse juntos.", analysis: "Agrupa el contenido en capas semánticas naturales (por ejemplo persona, ropa y accesorios juntos; vegetación; mobiliario).", isolate: "Aísla todos y solo los componentes de este grupo semántico. Mantén sus posiciones relativas." },
  { group: "Composición", value: "depth", label: "Por planos de profundidad", help: "Separa fondo lejano, plano medio y primer plano.", analysis: "Agrupa los objetos por distancia a cámara, en orden desde los planos lejanos hasta los cercanos.", isolate: "Aísla exclusivamente los objetos de este plano de profundidad, conservando su escala y posición." },
  { group: "Composición", value: "zones", label: "Por zonas del encuadre", help: "Divide la imagen en regiones alineadas al lienzo original.", analysis: "Divide el encuadre completo en regiones con contenido (arriba, centro, abajo y lados), sin solaparlas. Describe posición y contenido.", isolate: "Aísla únicamente el contenido de esta región. Conserva el lienzo completo y la ubicación original; no recortes ni acerques." },
  { group: "Sujetos", value: "foreground", label: "Sujeto y detalles", help: "Separa primero sujetos principales y luego detalles secundarios.", analysis: "Identifica sujetos principales primero; después, accesorios y detalles visuales secundarios que sean claramente independientes.", isolate: "Aísla este sujeto o detalle exacto y conserva su escala y ubicación." },
  { group: "Sujetos", value: "characters", label: "Personajes y criaturas", help: "Una capa por persona, animal o criatura; conserva cada silueta.", analysis: "Enumera cada persona, animal o criatura como una capa independiente; omite paisaje, arquitectura y utilería.", isolate: "Aísla solo este personaje, persona o criatura completa, sin partes de otros sujetos." },
  { group: "Sujetos", value: "props", label: "Objetos y utilería", help: "Separa objetos manipulables y accesorios del resto de la escena.", analysis: "Enumera objetos, herramientas, muebles y accesorios visibles como unidades independientes; excluye personajes y fondo.", isolate: "Aísla solo este objeto o accesorio completo, sin incluir manos, personajes ni fondo." },
  { group: "Entorno", value: "nature", label: "Vegetación y naturaleza", help: "Separa árboles, plantas, flores y otros elementos naturales.", analysis: "Enumera grupos naturales distinguibles (árboles, arbustos, flores, rocas o agua), del más grande al detalle menor.", isolate: "Aísla el grupo natural descrito y conserva sus hojas, ramas y bordes finos; no incluyas otros grupos." },
  { group: "Entorno", value: "architecture", label: "Arquitectura y estructuras", help: "Extrae edificios, ventanas, mobiliario fijo y estructuras.", analysis: "Enumera estructuras construidas distinguibles (edificios, puertas, ventanas, puentes, mobiliario fijo) por separado.", isolate: "Aísla solo esta estructura construida completa; no incluyas vegetación, personas ni cielo." },
  { group: "Entorno", value: "details", label: "Detalles y decoración", help: "Separa adornos, flores, letreros y acentos pequeños visibles.", analysis: "Identifica detalles decorativos pequeños y claramente separables, como flores, adornos o letreros; no inventes detalles ocultos.", isolate: "Aísla solo el detalle descrito a su tamaño y posición originales, sin añadir texto ni adornos." }
];
const SEQUENCE_PRESETS = [
  { group: "Narrativa", value: "elements", label: "Elemento por elemento", help: "Añade un objeto por fotograma según su orden natural.", planning: "Ordena los sujetos y objetos individuales por importancia visual y aparición natural.", step: "Añade únicamente el siguiente objeto individual." },
  { group: "Narrativa", value: "layers", label: "Por grupos semánticos", help: "Añade juntos grupos relacionados, como personaje y accesorios.", planning: "Agrupa los sujetos en conjuntos semánticos coherentes que puedan añadirse juntos.", step: "Añade el siguiente grupo semántico completo sin alterar lo anterior." },
  { group: "Narrativa", value: "story", label: "Aparición narrativa", help: "Ordena los elementos como si entraran naturalmente en una historia.", planning: "Ordena lo visible como progresión narrativa plausible: primero el foco de atención, luego los elementos que interactúan con él y al final los detalles complementarios.", step: "Añade el siguiente elemento en su etapa narrativa, manteniendo la continuidad de la escena." },
  { group: "Profundidad", value: "planes", label: "Del fondo al primer plano", help: "Construye desde objetos lejanos hacia sujetos cercanos.", planning: "Agrupa por profundidad y ordena estrictamente desde lo más lejano a cámara hasta lo más cercano.", step: "Añade el siguiente plano de profundidad delante de los planos ya presentes." },
  { group: "Profundidad", value: "foreground-first", label: "Del primer plano al fondo", help: "Empieza con los sujetos cercanos y revela después lo lejano.", planning: "Agrupa por profundidad y ordena desde los elementos más cercanos a cámara hacia los más lejanos.", step: "Añade el siguiente plano en el orden cercano-a-lejano, respetando oclusiones y perspectiva." },
  { group: "Espacio", value: "zones", label: "Por zonas del encuadre", help: "Añade regiones del lienzo completo, de arriba abajo.", planning: "Agrupa contenido por regiones no vacías del encuadre: arriba, centro, abajo; en cada franja, izquierda a derecha.", step: "Añade contenido de la siguiente región en su ubicación original; conserva toda la escena, sin recortar la zona." },
  { group: "Espacio", value: "left-right", label: "De izquierda a derecha", help: "Revela objetos por la posición de su centro visual.", planning: "Ordena los elementos por la coordenada horizontal de su centro visual, estrictamente de izquierda a derecha.", step: "Añade el siguiente elemento de izquierda a derecha, sin desplazar los ya presentes." },
  { group: "Espacio", value: "right-left", label: "De derecha a izquierda", help: "Revela objetos desde el borde derecho hacia la izquierda.", planning: "Ordena los elementos por su centro visual, estrictamente de derecha a izquierda.", step: "Añade el siguiente elemento de derecha a izquierda, sin desplazar los ya presentes." },
  { group: "Espacio", value: "top-bottom", label: "De arriba hacia abajo", help: "Revela primero el contenido superior y termina abajo.", planning: "Ordena por centro vertical, estrictamente desde la parte superior hacia la inferior.", step: "Añade el siguiente elemento desde arriba hacia abajo, manteniendo su posición en el lienzo." },
  { group: "Espacio", value: "bottom-top", label: "De abajo hacia arriba", help: "Construye desde la base de la escena hasta la parte superior.", planning: "Ordena por centro vertical, estrictamente desde la parte inferior hacia la superior.", step: "Añade el siguiente elemento desde abajo hacia arriba, manteniendo su posición en el lienzo." },
  { group: "Espacio", value: "center-out", label: "Del centro hacia afuera", help: "Empieza por el foco central y avanza hacia los bordes.", planning: "Ordena por distancia al centro del encuadre, de menor a mayor; desempata izquierda antes que derecha.", step: "Añade el siguiente elemento según la expansión del centro hacia los bordes." },
  { group: "Espacio", value: "outside-in", label: "De los bordes al centro", help: "Empieza en los extremos y termina en el foco central.", planning: "Ordena por distancia al centro del encuadre, de mayor a menor; desempata izquierda antes que derecha.", step: "Añade el siguiente elemento avanzando desde los bordes hacia el centro." },
  { group: "Escala", value: "small-large", label: "De pequeño a grande", help: "Añade primero detalles pequeños y termina con los elementos dominantes.", planning: "Ordena por tamaño aparente en el encuadre, de menor a mayor; considera área visible, no importancia.", step: "Añade el siguiente elemento según su tamaño aparente, sin cambiar su escala real en la escena." },
  { group: "Escala", value: "large-small", label: "De grande a pequeño", help: "Establece primero las masas principales y acaba con los detalles.", planning: "Ordena por tamaño aparente en el encuadre, de mayor a menor; termina con detalles pequeños.", step: "Añade el siguiente elemento por tamaño aparente y conserva su escala original." },
  { group: "Contenido", value: "characters-first", label: "Personajes primero", help: "Añade personas y animales antes que utilería y detalles.", planning: "Ordena primero personas, animales o criaturas; después objetos que interactúan con ellos y al final detalles complementarios.", step: "Añade el siguiente personaje o elemento asociado según el orden planificado." },
  { group: "Contenido", value: "environment-first", label: "Entorno primero", help: "Añade vegetación y estructuras antes que los sujetos principales.", planning: "Tras el fondo base, añade primero elementos ambientales distinguibles (vegetación, estructuras, mobiliario fijo), luego personajes y por último utilería pequeña.", step: "Añade el siguiente componente del entorno o sujeto en el orden establecido." }
];
const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const rootSession = () => window.getActiveSession?.() || window.PodcasterUI?.getActiveSession?.() || null;
const getRows = (session) => session?.script?.rows || session?.rows || [];
const rowFor = (session, rowId) => getRows(session).find((row) => String(row?.id || "") === String(rowId || "")) || null;
const generatedId = () => globalThis.crypto?.randomUUID?.() || `snoopy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const toDataUrl = (mime, base64) => `data:${mime};base64,${base64}`;

async function compressReference(dataUrl) {
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("No se pudo preparar la referencia para Gemini."));
    element.src = dataUrl;
  });
  let scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.88, 0.78, 0.68, 0.58]) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 3 * 1024 * 1024) {
        const reader = new FileReader();
        return await new Promise((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("No se pudo comprimir la referencia."));
          reader.readAsDataURL(blob);
        });
      }
    }
    scale *= 0.78;
  }
  throw new Error("La imagen de referencia es demasiado grande para prepararla. Usa una imagen más pequeña.");
}

async function referenceDataUrl(reference) {
  const direct = String(reference?.dataUrl || "").trim();
  if (direct.startsWith("data:image/")) return compressReference(direct);
  const url = String(window.resolveReferenceImagePreviewUrl?.(reference) || reference?.downloadUrl || reference?.url || "").trim();
  if (!url) throw new Error("La imagen de referencia no está disponible.");
  let hydrated = "";
  try { hydrated = await window.playbackController?.getBlobUrl?.(url, { persistent: true }) || ""; } catch (_) { /* Use the authenticated source below. */ }
  const source = hydrated || url;
  const response = source.startsWith("blob:") ? await fetch(source) : await authFetch(source);
  if (!response.ok) throw new Error(`No se pudo cargar la referencia (${response.status}).`);
  const blob = await response.blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer la referencia."));
    reader.readAsDataURL(blob);
  });
  return compressReference(dataUrl);
}

function imagePart(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/[\w.+-]+);base64,(.+)$/i);
  if (!match) throw new Error("La referencia no es una imagen válida.");
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

async function gemini(model, prompt, reference, { image = true, additionalReferences = [] } = {}) {
  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }, imagePart(reference), ...additionalReferences.map(imagePart)] }],
    ...(image ? { generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "16:9", imageSize: "1K" } } } : {})
  };
  let result;
  try {
    result = await authFetchJson(buildApiUrl("/api/gemini/generate"), { method: "POST", body: { model, payload, taskProfile: "podcaster_scene_image_generation" } });
  } catch (error) {
    if (Number(error?.status) === 413) throw new Error("El backend local rechazó la solicitud por tamaño. Actualiza o reinicia el servidor Snoopy para cargar el límite de generación de imágenes.");
    throw error;
  }
  const parts = result?.candidates?.[0]?.content?.parts || [];
  if (!image) return parts.map((part) => part?.text || "").join("\n").trim();
  const output = parts.find((part) => (part?.inlineData?.mimeType || part?.inline_data?.mime_type || "").startsWith("image/"));
  const mime = output?.inlineData?.mimeType || output?.inline_data?.mime_type || "image/png";
  const base64 = output?.inlineData?.data || output?.inline_data?.data || "";
  if (!base64) throw new Error("Gemini no devolvió una imagen. Puedes volver a intentarlo.");
  return toDataUrl(mime, base64);
}

function parseElementList(text, count) {
  const source = String(text || "").replace(/```(?:json)?|```/gi, "").trim();
  let parsed;
  try { parsed = JSON.parse(source); } catch (_) {
    const match = source.match(/\[[\s\S]*\]/);
    if (match) { try { parsed = JSON.parse(match[0]); } catch (_) { /* fall through */ } }
  }
  const values = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.elements) ? parsed.elements : [];
  return values.map((value) => typeof value === "string" ? value : String(value?.description || value?.name || "").trim()).filter(Boolean).slice(0, count);
}

function parseMarkedRegionDescriptions(text, regions) {
  const source = String(text || "").replace(/```(?:json)?|```/gi, "").trim();
  let parsed;
  try { parsed = JSON.parse(source); } catch (_) { const match = source.match(/\{[\s\S]*\}/); if (match) { try { parsed = JSON.parse(match[0]); } catch (_) { /* validated below */ } } }
  const values = Array.isArray(parsed?.regions) ? parsed.regions : [];
  const normalized = values.map((item) => ({ color: String(item?.color || "").replace(/^#/, "").toLowerCase(), name: String(item?.name || "").trim(), description: String(item?.description || "").trim() }));
  return regions.map((region, index) => normalized.find((item) => item.color === region.color.replace(/^#/, "").toLowerCase()) || normalized[index] || null);
}

async function imageFromDataUrl(dataUrl) {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo componer el fotograma acumulativo."));
    image.src = String(dataUrl || "");
  });
}

async function alignLayerCanvasToReference(layerDataUrl, referenceDataUrl) {
  const [layer, reference] = await Promise.all([imageFromDataUrl(layerDataUrl), imageFromDataUrl(referenceDataUrl)]);
  const canvas = document.createElement("canvas");
  canvas.width = reference.naturalWidth;
  canvas.height = reference.naturalHeight;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(layer, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

async function createAlignedTransparentLayer(rawDataUrl, referenceDataUrl, threshold = 82) {
  const transparent = await removeMatteScreenBackground(rawDataUrl, { color: "#ff00ff", threshold: Math.max(28, Math.round(threshold * 0.55)), softness: 42 });
  const refined = await reduceMatteFringe(transparent, { color: "#ff00ff" });
  return alignLayerCanvasToReference(refined, referenceDataUrl);
}

function setStatus(root, text, isError = false) {
  const status = root?.querySelector("[data-image-generation-status]");
  if (!status) return;
  status.textContent = String(text || "");
  status.dataset.error = String(isError);
}

function updatePresetHelp(root, mode, preset) {
  const presets = mode === "stop-motion" ? SEQUENCE_PRESETS : DECOMPOSITION_PRESETS;
  const help = root.querySelector("[data-image-generation-preset-help]");
  if (help) help.textContent = presets.find((item) => item.value === preset)?.help || "";
}

function presetOptionsMarkup(presets) {
  const groups = new Map();
  for (const preset of presets) {
    if (!groups.has(preset.group)) groups.set(preset.group, []);
    groups.get(preset.group).push(preset);
  }
  return [...groups].map(([group, options]) => `<optgroup label="${escapeHtml(group)}">${options.map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join("")}</optgroup>`).join("");
}

function ensureDialog() {
  let root = document.querySelector(".snoopy-image-generation-dialog");
  if (root) return root;
  root = document.createElement("div");
  root.className = "snoopy-image-generation-dialog pme-modal-overlay";
  root.hidden = true;
  root.innerHTML = `<section class="pme-modal-container" role="dialog" aria-modal="true" aria-labelledby="snoopyImageGenerationTitle">
    <header class="pme-modal-header"><div><h2 id="snoopyImageGenerationTitle"></h2><p>Usa la imagen de referencia de esta escena.</p></div><button type="button" data-image-generation-close aria-label="Cerrar"><i class="fas fa-times" aria-hidden="true"></i></button></header>
    <div class="pme-modal-body snoopy-image-generation-body"><aside class="snoopy-image-generation-sidebar" aria-label="Configuración de generación">
      <div class="snoopy-image-generation-controls">
        <label data-image-generation-preset-label hidden>Preset<select data-image-generation-preset></select></label>
        <p class="snoopy-image-generation-preset-help" data-image-generation-preset-help></p>
        <label data-image-generation-count-label>Cantidad de elementos<input data-image-generation-count type="number" min="1" max="12" value="2"></label>
        <label class="snoopy-image-generation-prompt-label" for="snoopyImageGenerationPrompt">Instrucciones para la generación<textarea id="snoopyImageGenerationPrompt" data-image-generation-prompt maxlength="1200" rows="4" placeholder="Ej.: muestra primero solo el fondo; añade el objeto de la derecha en el tercer fotograma."></textarea></label>
        <label class="snoopy-image-generation-sets-label" data-image-generation-sets-label hidden>Conjuntos anteriores<select data-image-generation-sets></select></label>
        <button type="button" class="btn btn-primary" data-image-generation-start><i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i><span>Generar vista previa</span></button>
      </div>
      <p class="snoopy-image-generation-hint">Puedes revisar y reordenar los resultados antes de aplicarlos.</p>
      <p data-image-generation-status role="status" aria-live="polite"></p>
    </aside><section class="snoopy-image-generation-workspace" aria-label="Vista previa de imágenes">
      <div class="snoopy-image-generation-reference-grid" data-image-generation-reference-grid>
        <article class="snoopy-image-generation-card snoopy-image-generation-reference-card" data-image-generation-reference-card hidden>
          <span>Imagen de referencia</span>
          <div class="snoopy-image-generation-reference-stage" data-reference-stage><img data-image-generation-reference-image alt="Imagen original de la escena"><canvas data-reference-ink aria-label="Pinta sobre la imagen para indicar qué elementos separar" hidden></canvas></div>
          <span data-image-generation-reference-name>Referencia original</span>
        </article>
      </div>
      <div class="snoopy-image-generation-markup" data-image-generation-markup hidden>
        <div class="snoopy-image-generation-markup-tools" role="group" aria-label="Herramientas para señalar elementos">
          <strong>Señala las partes que quieres separar</strong>
          <div class="snoopy-image-generation-color-tools" data-region-color-tools></div>
          <button type="button" data-region-add><i class="fas fa-plus" aria-hidden="true"></i> Otro color</button>
          <label>Tamaño del plumón <input type="range" data-region-brush min="8" max="72" step="2" value="28"><output data-region-brush-value>28 px</output></label>
          <button type="button" data-region-clear><i class="fas fa-eraser" aria-hidden="true"></i> Borrar marcas</button>
        </div>
        <p>Usa un color diferente para cada elemento. Gemini quitará las zonas marcadas del fondo y creará una capa transparente por color, alineada al lienzo original.</p>
      </div>
      <div class="snoopy-image-generation-results-toolbar" data-image-generation-results-toolbar hidden><button type="button" data-image-generation-clean disabled title="Vuelve a generar cada capa con Gemini y limpia el fondo"><i class="fas fa-eraser" aria-hidden="true"></i> Rehacer limpieza de fondos</button><span>Usa Gemini por capa. Las versiones originales se conservan.</span></div>
      <div class="snoopy-image-generation-results" data-image-generation-results></div>
    </section></div>
    <footer class="snoopy-image-generation-footer"><button type="button" data-image-generation-cancel>Cancelar</button><button type="button" class="btn btn-primary" data-image-generation-apply disabled>Aplicar a la escena</button></footer>
  </section>`;
  document.body.append(root);
  root._generationSetGroups = new Map();
  const markup = root.querySelector("[data-image-generation-markup]");
  const ink = root.querySelector("[data-reference-ink]");
  const image = root.querySelector("[data-image-generation-reference-image]");
  const stage = root.querySelector("[data-reference-stage]");
  const colorTools = root.querySelector("[data-region-color-tools]");
  root._regionColors = [REGION_COLORS[0]];
  root._markedColors = new Set();
  root._activeRegionColor = REGION_COLORS[0].color;
  root._brushSize = 28;
  const renderRegionColors = () => {
    colorTools.replaceChildren();
    root._regionColors.forEach((region) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.regionColor = region.color;
      button.title = `${region.label}: marca un elemento con este color`;
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-pressed", String(root._activeRegionColor === region.color));
      button.style.setProperty("--region-color", region.color);
      button.classList.toggle("is-active", root._activeRegionColor === region.color);
      button.innerHTML = `<span aria-hidden="true"></span><small>${escapeHtml(region.label)}</small>`;
      colorTools.append(button);
    });
  };
  const resizeReferenceStage = () => {
    if (!image.naturalWidth || !image.naturalHeight) return;
    if (ink.width !== image.naturalWidth || ink.height !== image.naturalHeight) {
      ink.width = image.naturalWidth;
      ink.height = image.naturalHeight;
    }
    const ratio = image.naturalWidth / image.naturalHeight;
    const parent = stage.parentElement;
    const parentStyle = parent ? getComputedStyle(parent) : null;
    const horizontalPadding = parentStyle ? parseFloat(parentStyle.paddingLeft || "0") + parseFloat(parentStyle.paddingRight || "0") : 0;
    const maxWidth = Math.max(1, (parent?.clientWidth || image.naturalWidth) - horizontalPadding);
    const width = Math.min(maxWidth, window.innerHeight * 0.62 * ratio);
    stage.style.width = `${width}px`;
    stage.style.height = `${width / ratio}px`;
    ink.hidden = root.dataset.mode === "stop-motion";
  };
  image.addEventListener("load", resizeReferenceStage);
  const referenceResizeObserver = new ResizeObserver(resizeReferenceStage);
  referenceResizeObserver.observe(stage.parentElement);
  window.addEventListener("resize", resizeReferenceStage);
  colorTools.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-region-color]");
    if (!button) return;
    root._activeRegionColor = button.dataset.regionColor;
    renderRegionColors();
  });
  root.querySelector("[data-region-add]").addEventListener("click", () => {
    const next = REGION_COLORS.find((item) => !root._regionColors.some((region) => region.color === item.color));
    if (!next) { setStatus(root, "Ya agregaste el máximo de 12 colores."); return; }
    root._regionColors.push(next);
    root._activeRegionColor = next.color;
    renderRegionColors();
  });
  const brushInput = root.querySelector("[data-region-brush]");
  brushInput.addEventListener("input", () => {
    root._brushSize = Number(brushInput.value);
    root.querySelector("[data-region-brush-value]").value = `${brushInput.value} px`;
  });
  root.querySelector("[data-region-clear]").addEventListener("click", () => {
    ink.getContext("2d")?.clearRect(0, 0, ink.width, ink.height);
    root._markedColors.clear();
    setStatus(root, "Se borraron las marcas de color.");
  });
  let activeStroke = false;
  const pointOnInk = (event) => {
    const rect = ink.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * ink.width / rect.width, y: (event.clientY - rect.top) * ink.height / rect.height };
  };
  ink.addEventListener("pointerdown", (event) => {
    if (root.dataset.mode !== "decompose" || ink.hidden || !ink.width) return;
    event.preventDefault();
    activeStroke = true;
    ink.setPointerCapture(event.pointerId);
    root._markedColors.add(root._activeRegionColor);
    const context = ink.getContext("2d");
    const point = pointOnInk(event);
    context.beginPath();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = root._activeRegionColor;
    context.fillStyle = root._activeRegionColor;
    const rect = ink.getBoundingClientRect();
    context.lineWidth = root._brushSize * ink.width / Math.max(1, rect.width);
    context.arc(point.x, point.y, context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(point.x, point.y);
    setStatus(root, `${root._markedColors.size} color(es) marcado(s). Cada color generará una capa.`);
  });
  ink.addEventListener("pointermove", (event) => {
    if (!activeStroke) return;
    const point = pointOnInk(event);
    const context = ink.getContext("2d");
    context.lineTo(point.x, point.y);
    context.stroke();
  });
  const finishStroke = () => { activeStroke = false; };
  ink.addEventListener("pointerup", finishStroke);
  ink.addEventListener("pointercancel", finishStroke);
  root._resetMarkup = () => {
    root._regionColors = [REGION_COLORS[0]];
    root._markedColors.clear();
    root._activeRegionColor = REGION_COLORS[0].color;
    ink.getContext("2d")?.clearRect(0, 0, ink.width, ink.height);
    renderRegionColors();
  };
  renderRegionColors();
  const updateMode = (mode) => {
    const previousMode = root.dataset.mode;
    const promptInput = root.querySelector("[data-image-generation-prompt]");
    root._customPrompts ||= {};
    if (previousMode) root._customPrompts[previousMode] = promptInput.value;
    root.dataset.mode = mode;
    const stopMotion = mode === "stop-motion";
    root.querySelector("[data-image-generation-results-toolbar]").hidden = stopMotion;
    root.querySelector("#snoopyImageGenerationTitle").textContent = stopMotion ? "Crear secuencia stop motion" : "Descomponer imagen";
    const presetSelect = root.querySelector("[data-image-generation-preset]");
    presetSelect.innerHTML = presetOptionsMarkup(stopMotion ? SEQUENCE_PRESETS : DECOMPOSITION_PRESETS);
    const count = root.querySelector("[data-image-generation-count]");
    count.min = stopMotion ? "2" : "1";
    count.max = "12";
    count.value = stopMotion ? "4" : "2";
    root.querySelector("[data-image-generation-count-label]").firstChild.textContent = stopMotion ? "Fotogramas totales" : "Capas además del fondo";
    root.querySelector("[data-image-generation-preset-label]").hidden = false;
    markup.hidden = stopMotion;
    ink.hidden = stopMotion;
    presetSelect.value = "elements";
    promptInput.value = root._customPrompts[mode] || "";
    promptInput.placeholder = stopMotion
      ? "Ej.: deja vacío el primer fotograma y añade el objeto de la derecha en el tercero."
      : "Ej.: rojo = niño, azul = perro; conserva el tamaño y la posición de cada uno.";
    updatePresetHelp(root, mode, presetSelect.value);
  };
  root._updateMode = updateMode;
  root.querySelectorAll("[data-image-generation-close], [data-image-generation-cancel]").forEach((button) => button.addEventListener("click", () => closeDialog(root)));
  root.querySelector("[data-image-generation-preset]").addEventListener("change", (event) => {
    const stopMotion = root.dataset.mode === "stop-motion";
    if (!stopMotion) root.querySelector("[data-image-generation-count-label]").firstChild.textContent = event.target.value === "zones" ? "Zonas además del fondo" : "Capas además del fondo";
    updatePresetHelp(root, root.dataset.mode, event.target.value);
  });
  root.querySelector("[data-image-generation-start]").addEventListener("click", () => void generatePreview(root));
  root.querySelector("[data-image-generation-sets]").addEventListener("change", (event) => showGenerationSet(root, event.target.value));
  root.querySelector("[data-image-generation-apply]").addEventListener("click", () => void applyResults(root));
  root.querySelector("[data-image-generation-clean]").addEventListener("click", () => void cleanGeneratedLayerBackgrounds(root));
  root.querySelector("[data-image-generation-results]").addEventListener("dragstart", (event) => {
    const handle = event.target.closest?.("[data-preview-drag-handle]");
    const card = handle?.closest("[data-generated-index]");
    if (!card) { event.preventDefault(); return; }
    event.dataTransfer?.setData("text/plain", card.dataset.generatedIndex);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    card.classList.add("is-dragging");
  });
  root.querySelector("[data-image-generation-results]").addEventListener("dragend", () => root.querySelector(".is-dragging")?.classList.remove("is-dragging"));
  root.querySelector("[data-image-generation-results]").addEventListener("change", (event) => {
    const checkbox = event.target.closest?.("[data-generated-selection]");
    const card = checkbox?.closest("[data-generated-index]");
    const item = pending?.generated?.[Number(card?.dataset.generatedIndex)];
    if (item && checkbox) item.selected = checkbox.checked;
  });
  root.querySelector("[data-image-generation-results]").addEventListener("dragover", (event) => {
    const target = event.target.closest?.("[data-generated-index]");
    if (!target || !root.querySelector(".is-dragging")) return;
    event.preventDefault();
    const box = target.getBoundingClientRect();
    if (event.clientY < box.top + box.height / 2) target.before(root.querySelector(".is-dragging"));
    else target.after(root.querySelector(".is-dragging"));
  });
  root.querySelector("[data-image-generation-results]").addEventListener("drop", (event) => {
    event.preventDefault();
    const cards = [...root.querySelectorAll(".snoopy-image-generation-card[data-generated-index]")];
    if (!pending?.generated || cards.length !== pending.generated.length) return;
    const reordered = cards.map((card) => pending.generated[Number(card.dataset.generatedIndex)]).filter(Boolean);
    if (reordered.length !== pending.generated.length) return;
    pending.generated.splice(0, pending.generated.length, ...reordered);
    cards.forEach((card, index) => {
      card.dataset.generatedIndex = String(index);
    });
  });
  root.addEventListener("click", (event) => { if (event.target === root) closeDialog(root); });
  return root;
}

let pending = null;
let busy = false;
let choiceMenu = null;
function generationSetKey(root) {
  return `${root.dataset.sessionId}|${root.dataset.rowId}|${root.dataset.mode}`;
}

function generationSetsFor(root) {
  return root._generationSetGroups.get(generationSetKey(root)) || [];
}

function refreshGenerationSetPicker(root, selected = root._generationSetView || "current") {
  const label = root.querySelector("[data-image-generation-sets-label]");
  const picker = root.querySelector("[data-image-generation-sets]");
  const sets = generationSetsFor(root);
  picker.replaceChildren();
  picker.add(new Option(root._currentSet ? "Generación actual" : "Generación actual (sin resultados)", "current"));
  picker.options[0].disabled = !root._currentSet;
  sets.forEach((set) => picker.add(new Option(set.name, set.id)));
  label.hidden = !root._currentSet && sets.length === 0;
  const target = [...picker.options].some((option) => option.value === selected) ? selected : picker.options[0]?.value;
  if (target) picker.value = target;
  root._generationSetView = target || "current";
}

function archiveCurrentGenerationSet(root) {
  const current = root._currentSet;
  if (!current?.generated?.length || current._archived) return null;
  const results = root.querySelector("[data-image-generation-results]");
  const generated = current.generated.map((item, index) => {
    const { rawDataUrl, referenceDataUrl, ...saved } = item;
    const checked = results.querySelector(`.snoopy-image-generation-card[data-generated-index="${index}"] [data-generated-selection]`);
    return { ...saved, selected: checked ? checked.checked : item.selected !== false };
  });
  const sets = generationSetsFor(root);
  const date = new Date();
  const name = `Conjunto ${sets.length + 1} · ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const archived = { id: generatedId(), name, createdAt: date.toISOString(), sessionId: current.sessionId, rowId: current.rowId, mode: current.mode, generated };
  sets.push(archived);
  root._generationSetGroups.set(generationSetKey(root), sets);
  current._archived = true;
  root._currentSet = null;
  if (pending === current) pending = archived;
  refreshGenerationSetPicker(root, archived.id);
  return archived;
}

function renderGenerationSet(root, set, viewId) {
  const results = root.querySelector("[data-image-generation-results]");
  results.replaceChildren();
  pending = set || null;
  root._generationSetView = viewId;
  (set?.generated || []).forEach((item, index) => appendPreviewCard(root, item, index));
  root.querySelector("[data-image-generation-clean]").disabled = !set?.generated?.some((item) => item.kind === "layer");
  root.querySelector("[data-image-generation-apply]").disabled = !set?.generated?.length;
  refreshGenerationSetPicker(root, viewId);
}

function showGenerationSet(root, setId) {
  if (setId === "current") {
    renderGenerationSet(root, root._currentSet, "current");
    setStatus(root, root._currentSet ? "Generación actual. Puedes revisar o aplicar este conjunto." : "Genera imágenes para crear un conjunto.");
    return;
  }
  const selectedSet = generationSetsFor(root).find((set) => set.id === setId);
  if (!selectedSet) return;
  if (root._generationSetView === "current") archiveCurrentGenerationSet(root);
  const archivedSet = generationSetsFor(root).find((set) => set.id === setId) || selectedSet;
  renderGenerationSet(root, archivedSet, archivedSet.id);
  setStatus(root, `${archivedSet.name}. Puedes aplicar este conjunto o generar uno nuevo.`);
}

function closeChoiceMenu() {
  choiceMenu?.remove();
  choiceMenu = null;
}

function openChoiceMenu(trigger) {
  const rowId = String(trigger?.dataset?.rowId || "").trim();
  const session = rootSession();
  const references = window.getRowReferenceImageList?.(session, rowId) || [];
  if (!session?.id || !rowFor(session, rowId)) { window.alert?.("Selecciona una escena válida."); return; }
  if (!references.length) { window.alert?.("Adjunta una imagen de referencia a esta escena antes de generar."); return; }
  closeChoiceMenu();
  const menu = document.createElement("div");
  menu.className = "snoopy-image-generation-choice-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Herramientas de imagen");
  menu.innerHTML = `<button type="button" role="menuitem" data-image-generation-choice="decompose"><i class="fas fa-layer-group" aria-hidden="true"></i><span><strong>Descomponer imagen</strong><small>Crear un fondo y capas editables</small></span></button><button type="button" role="menuitem" data-image-generation-choice="stop-motion"><i class="fas fa-film" aria-hidden="true"></i><span><strong>Crear secuencia stop motion</strong><small>Generar fotogramas progresivos</small></span></button>`;
  const rect = trigger.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - 300, rect.right - 286))}px`;
  menu.style.top = `${Math.max(8, Math.min(window.innerHeight - 150, rect.bottom + 6))}px`;
  menu.addEventListener("click", (event) => {
    const option = event.target.closest?.("[data-image-generation-choice]");
    if (!option) return;
    closeChoiceMenu();
    openDialog(rowId, option.dataset.imageGenerationChoice, references[0], session.id, trigger);
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    closeChoiceMenu();
    if (trigger.isConnected) trigger.focus();
  });
  document.body.append(menu);
  choiceMenu = menu;
  requestAnimationFrame(() => document.addEventListener("click", dismissChoiceMenu, { once: true, capture: true }));
  menu.querySelector("button")?.focus();
}

function dismissChoiceMenu(event) {
  if (!choiceMenu?.contains(event.target)) closeChoiceMenu();
}

function closeDialog(root) {
  if (busy) return;
  if (root._generationSetView === "current") archiveCurrentGenerationSet(root);
  root.hidden = true;
  root.querySelector("[data-image-generation-results]").replaceChildren();
  root.querySelector("[data-image-generation-apply]").disabled = true;
  pending = null;
}

function openDialog(rowId, mode, reference, sessionId, trigger) {
  const session = rootSession();
  if (!session?.id || session.id !== sessionId || !rowFor(session, rowId)) { window.alert?.("La escena cambió. Vuelve a abrir el menú de herramientas."); return; }
  const root = ensureDialog();
  const themeSource = trigger || document.querySelector("#podcastVideoShell") || document.documentElement;
  const themeStyles = window.getComputedStyle(themeSource);
  ["--snoopy-canvas", "--snoopy-surface", "--snoopy-surface-subtle", "--snoopy-surface-elevated", "--snoopy-control", "--snoopy-control-hover", "--snoopy-text", "--snoopy-text-muted", "--snoopy-border", "--snoopy-border-strong", "--snoopy-accent", "--snoopy-accent-soft", "--snoopy-shadow", "--pod-surface", "--pod-surface-2", "--pod-text", "--pod-muted", "--pod-border", "--pod-accent"].forEach((name) => {
    const value = themeStyles.getPropertyValue(name).trim();
    if (value) root.style.setProperty(name, value);
  });
  root.dataset.rowId = rowId;
  root.dataset.sessionId = session.id;
  root._reference = reference;
  root._updateMode(mode);
  root._resetMarkup?.();
  root._currentSet = null;
  root._generationSetView = "current";
  refreshGenerationSetPicker(root, "current");
  root.hidden = false;
  const referenceCard = root.querySelector("[data-image-generation-reference-card]");
  referenceCard.hidden = true;
  root.querySelector("[data-image-generation-reference-image]").removeAttribute("src");
  root.querySelector("[data-image-generation-status]").textContent = "";
  root.querySelector("[data-image-generation-results]").replaceChildren();
  root.querySelector("[data-image-generation-apply]").disabled = true;
  pending = null;
  root._previewLoadToken = (root._previewLoadToken || 0) + 1;
  const referenceToken = root._referencePreviewToken = (root._referencePreviewToken || 0) + 1;
  root._referenceDataPromise = referenceDataUrl(reference);
  void renderReferencePreview(root, referenceToken);
  void loadExistingResults(root, session, rowId, mode, root._previewLoadToken);
  root.querySelector("[data-image-generation-count]").focus();
}

async function renderReferencePreview(root, token) {
  const card = root.querySelector("[data-image-generation-reference-card]");
  const image = root.querySelector("[data-image-generation-reference-image]");
  if (!card || !image) return;
  try {
    const dataUrl = await root._referenceDataPromise;
    if (root._referencePreviewToken !== token || root.hidden) return;
    image.src = dataUrl;
    card.hidden = false;
  } catch (_) {
    if (root._referencePreviewToken === token) card.hidden = true;
  }
}

async function composeMarkedReference(root, referenceDataUrlValue, selectedColor = null) {
  const reference = await imageFromDataUrl(referenceDataUrlValue);
  const ink = root.querySelector("[data-reference-ink]");
  const canvas = document.createElement("canvas");
  canvas.width = reference.naturalWidth;
  canvas.height = reference.naturalHeight;
  const context = canvas.getContext("2d");
  context.drawImage(reference, 0, 0, canvas.width, canvas.height);
  if (selectedColor) {
    const inkCanvas = document.createElement("canvas"); inkCanvas.width = canvas.width; inkCanvas.height = canvas.height;
    const inkContext = inkCanvas.getContext("2d", { willReadFrequently: true }); inkContext.drawImage(ink, 0, 0, canvas.width, canvas.height);
    const pixels = inkContext.getImageData(0, 0, canvas.width, canvas.height), hex = selectedColor.replace("#", "");
    const target = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      const distance = Math.hypot(pixels.data[offset] - target[0], pixels.data[offset + 1] - target[1], pixels.data[offset + 2] - target[2]);
      if (pixels.data[offset + 3] < 12 || distance > 110) pixels.data[offset + 3] = 0;
    }
    inkContext.putImageData(pixels, 0, 0); context.drawImage(inkCanvas, 0, 0);
  } else context.drawImage(ink, 0, 0, canvas.width, canvas.height);
  return compressReference(canvas.toDataURL("image/jpeg", 0.9));
}

function appendPreviewCard(root, item, index) {
  const card = document.createElement("div");
  card.className = "snoopy-image-generation-card";
  card.dataset.generatedIndex = String(index);
  const handle = document.createElement("button"); handle.type = "button"; handle.className = "snoopy-image-generation-drag"; handle.draggable = true; handle.dataset.previewDragHandle = "true"; handle.setAttribute("aria-label", `Reordenar ${item.name}`); handle.innerHTML = '<i class="fas fa-grip-vertical" aria-hidden="true"></i>';
  const image = document.createElement("img"); image.src = item.dataUrl; image.alt = item.name;
  const description = document.createElement("span"); description.textContent = item.name;
  card.append(handle, image, description);
  if (item.kind === "layer") {
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = item.selected !== false; checkbox.dataset.generatedSelection = "true"; checkbox.setAttribute("aria-label", `Incluir ${item.name}`); card.prepend(checkbox);
    const restore = document.createElement("button"); restore.type = "button"; restore.className = "snoopy-image-generation-restore"; restore.textContent = "Restaurar versión anterior"; restore.hidden = !item.cleanupHistory?.length;
    restore.addEventListener("click", () => {
      const previous = item.cleanupHistory?.pop();
      if (!previous) return;
      item.dataUrl = previous.dataUrl;
      item.cleanedRawDataUrl = previous.cleanedRawDataUrl;
      item.needsUpload = previous.needsUpload;
      image.src = item.dataUrl;
      restore.hidden = !item.cleanupHistory.length;
      setStatus(root, `Se restauró la versión anterior de ${item.name}.`);
    });
    card.append(restore);
    if (item.rawDataUrl) {
      const control = document.createElement("input"); control.type = "range"; control.min = "20"; control.max = "160"; control.step = "2"; control.value = String(item.cutoutThreshold || 82); control.title = "Ajustar recorte y transparencia"; control.setAttribute("aria-label", `Ajustar recorte de ${item.name}`);
      control.addEventListener("input", async () => {
      item.cutoutThreshold = Number(control.value);
      try { item.dataUrl = await createAlignedTransparentLayer(item.rawDataUrl, item.referenceDataUrl, item.cutoutThreshold); image.src = item.dataUrl; }
      catch (error) { setStatus(root, error?.message || "No se pudo ajustar el recorte.", true); }
      });
      card.append(control);
    }
  }
  root.querySelector("[data-image-generation-results]").append(card);
  if (item.kind === "layer") root.querySelector("[data-image-generation-clean]").disabled = false;
}

async function cleanGeneratedLayerBackgrounds(root) {
  if (root._cleaningLayers || !pending?.generated?.length || pending.mode !== "decompose") return;
  const layers = pending.generated.filter((item) => item.kind === "layer");
  if (!layers.length) return;
  const button = root.querySelector("[data-image-generation-clean]");
  const applyButton = root.querySelector("[data-image-generation-apply]");
  const generateButton = root.querySelector("[data-image-generation-start]");
  const setPicker = root.querySelector("[data-image-generation-sets]");
  root._cleaningLayers = true;
  button.disabled = true;
  applyButton.disabled = true;
  generateButton.disabled = true;
  setPicker.disabled = true;
  let cleaned = 0, failed = 0;
  try {
    for (const [index, item] of layers.entries()) {
      setStatus(root, `Limpiando fondo de ${item.name || `capa ${index + 1}`} (${index + 1}/${layers.length})…`);
      try {
        const reference = item.referenceDataUrl || await (root._referenceDataPromise || referenceDataUrl(root._reference));
        let source = item.cleanedRawDataUrl || item.rawDataUrl || item.dataUrl;
        if (item.markedRegion?.guideDataUrl) {
          const region = item.markedRegion;
          setStatus(root, `Rehaciendo el recorte de ${region.name} con Gemini…`);
          source = await gemini(IMAGE_MODEL, `Usa la primera imagen como referencia original y la segunda únicamente como guía de selección. El trazo ${region.label} (${region.color}) señala el objeto ${region.name}: ${region.description}. Aísla solo ese objeto completo; no conserves el panel, la zona ni los fondos de la referencia. Reconstruye las partes del objeto que el trazo tapa copiándolas visualmente de la referencia original. Mantén lienzo completo, tamaño, perspectiva y ubicación exacta. Elimina por completo cualquier resto de las marcas. Rellena todo lo demás con magenta #FF00FF uniforme y limpio hasta los bordes; no uses ese color dentro del objeto.`, reference, { additionalReferences: [region.guideDataUrl] });
        } else if (item.elementDescription) {
          setStatus(root, `Rehaciendo el recorte de ${item.elementDescription} con Gemini…`);
          source = await gemini(IMAGE_MODEL, `Corrige esta capa generada. Conserva únicamente ${item.elementDescription}, usando la referencia original como guía. Elimina restos de cualquier otro objeto y los halos magenta sobre el sujeto; reconstruye el sujeto con su apariencia original. Mantén el lienzo completo, tamaño y posición. Rellena todo lo demás con magenta #FF00FF uniforme, sin marcas ni sombras.`, source, { additionalReferences: [reference] });
        }
        const cleanedDataUrl = await createAlignedTransparentLayer(source, reference, item.cutoutThreshold || 82);
        item.cleanupHistory ||= [];
        item.cleanupHistory.push({ dataUrl: item.dataUrl, cleanedRawDataUrl: item.cleanedRawDataUrl, needsUpload: item.needsUpload });
        if (item.markedRegion) item.cleanedRawDataUrl = source;
        item.dataUrl = cleanedDataUrl;
        item.needsUpload = true;
        const itemIndex = pending.generated.indexOf(item);
        const card = root.querySelector(`[data-generated-index="${itemIndex}"]`);
        const image = card?.querySelector("img");
        if (image) image.src = item.dataUrl;
        const restore = card?.querySelector(".snoopy-image-generation-restore");
        if (restore) restore.hidden = false;
        cleaned += 1;
      } catch (_) { failed += 1; }
    }
    applyButton.disabled = !pending.generated.length;
    setStatus(root, failed ? `Se limpiaron ${cleaned} capas; ${failed} no se pudieron procesar. Se conservaron las versiones originales.` : `Limpieza completada en ${cleaned} capas. Se conservaron las versiones originales por si quieres volver a intentarlo.`, failed > 0);
  } finally {
    root._cleaningLayers = false;
    generateButton.disabled = false;
    setPicker.disabled = false;
    button.disabled = !pending?.generated?.some((item) => item.kind === "layer");
  }
}

function savedMediaUrl(media) {
  if (String(media?.downloadUrl || "").startsWith("data:image/")) return media.downloadUrl;
  if (media?.downloadUrl) return String(media.downloadUrl);
  if (media?.storagePath) return buildApiUrl(`/api/assets/proxy-media?storagePath=${encodeURIComponent(media.storagePath)}`);
  return String(media?.url || media?.previewUrl || "");
}

async function savedMediaDataUrl(media) {
  const url = savedMediaUrl(media);
  if (!url) throw new Error("La imagen guardada no tiene una dirección disponible.");
  if (url.startsWith("data:image/")) return url;
  let blobUrl = "";
  try { blobUrl = await window.playbackController?.getBlobUrl?.(url, { persistent: true }) || ""; } catch (_) { /* Fall back to authenticated fetch. */ }
  const response = blobUrl.startsWith("blob:") ? await fetch(blobUrl) : await authFetch(blobUrl || url);
  if (!response.ok) throw new Error(`No se pudo recuperar la imagen guardada (${response.status}).`);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo mostrar la imagen guardada."));
    reader.readAsDataURL(blob);
  });
}

function persistedStopMotion(session, rowId) {
  const candidates = [session, session?.session, session?.script, session?.podcastStudioUiState, session?.podcastVideoConfig, session?.session?.podcastVideoConfig];
  for (const source of candidates) {
    const clip = source?.dialogueVideoMap?.[rowId] || source?.dialogueVideosByRowId?.[rowId];
    const stopMotion = clip?.stopMotion || clip?.video?.stopMotion || clip?.clip?.stopMotion;
    if (Array.isArray(stopMotion?.frames)) return stopMotion.frames.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  }
  const entry = window.buildTimelineRuntimeEntries?.(session)?.find((item) => String(item?.rowId || "") === String(rowId));
  const frames = entry?.video?.stopMotion?.frames || entry?.stopMotion?.frames || entry?.clip?.stopMotion?.frames;
  if (Array.isArray(frames)) return frames.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  return [];
}

function persistedSceneImage(session, rowId) {
  const candidates = [session, session?.session, session?.script, session?.podcastStudioUiState, session?.podcastVideoConfig, session?.payload, session?.config];
  for (const source of candidates) {
    const clip = source?.dialogueVideoMap?.[rowId] || source?.dialogueVideosByRowId?.[rowId];
    if (!clip) continue;
    const media = clip.image || clip.video || clip;
    const mime = String(media.mimeType || "").toLowerCase();
    if ((media.type && media.type !== "image" && !mime.startsWith("image/")) || mime.startsWith("video/")) continue;
    if (media.downloadUrl || media.storagePath || media.imageUrl || media.dataUrl || media.localDataUrl) {
      return { ...media, downloadUrl: media.downloadUrl || media.imageUrl || media.dataUrl || media.localDataUrl, storagePath: media.storagePath || media.imageStoragePath || media.videoStoragePath, name: "Fondo de escena", kind: "background", persisted: true };
    }
  }
  return null;
}

async function loadExistingResults(root, session, rowId, mode, loadToken) {
  const effectsMap = session?.visualEffectsMap || session?.session?.visualEffectsMap || session?.script?.visualEffectsMap || session?.podcastStudioUiState?.visualEffectsMap || session?.podcastVideoConfig?.visualEffectsMap || session?.payload?.visualEffectsMap || session?.config?.visualEffectsMap || {};
  const records = mode === "decompose"
    ? [persistedSceneImage(session, rowId), ...(effectsMap?.[rowId]?.imageLayers || []).map((layer) => ({ ...layer, kind: "layer", persisted: true, savedLayer: layer }))].filter(Boolean)
    : persistedStopMotion(session, rowId).map((frame) => ({ ...frame, kind: "frame", persisted: true, savedFrame: frame }));
  if (!records.length) {
    const previousSet = generationSetsFor(root).at(-1);
    if (previousSet && !root.hidden && root._previewLoadToken === loadToken) showGenerationSet(root, previousSet.id);
    return;
  }
  const generated = [];
  pending = { sessionId: session.id, rowId, mode, generated };
  setStatus(root, "Cargando imágenes guardadas…");
  for (const [index, record] of records.entries()) {
    if (root.hidden || root._previewLoadToken !== loadToken || root.dataset.rowId !== rowId || root.dataset.mode !== mode) return;
    try {
      const dataUrl = await savedMediaDataUrl(record);
      if (root.hidden || root._previewLoadToken !== loadToken || root.dataset.rowId !== rowId || root.dataset.mode !== mode) return;
      const cleanedUrl = mode === "decompose" ? await reduceGreenFringe(dataUrl) : dataUrl;
      const item = { ...record, name: String(record.name || `${mode === "decompose" ? "Capa" : "Fotograma"} ${index + 1}`), dataUrl: cleanedUrl, needsUpload: cleanedUrl !== dataUrl, selected: true };
      generated.push(item);
      appendPreviewCard(root, item, generated.length - 1);
      if (item.kind === "layer") root.querySelector("[data-image-generation-clean]").disabled = false;
    } catch (error) {
      if (root.hidden || root._previewLoadToken !== loadToken || root.dataset.rowId !== rowId || root.dataset.mode !== mode) return;
      setStatus(root, error?.message || "No se pudieron cargar todas las imágenes guardadas.", true);
    }
  }
  if (generated.length) {
    root.querySelector("[data-image-generation-apply]").disabled = false;
    root._currentSet = pending;
    refreshGenerationSetPicker(root, "current");
  }
  setStatus(root, generated.length ? "Imágenes guardadas. Puedes revisarlas, reordenarlas o volver a generarlas." : "No se pudieron recuperar las imágenes guardadas.", generated.length === 0);
}

async function generatePreview(root) {
  if (busy) return;
  const mode = root.dataset.mode;
  if (root._generationSetView === "current") archiveCurrentGenerationSet(root);
  root._currentSet = null;
  root._generationSetView = "current";
  const count = Math.max(mode === "stop-motion" ? 2 : 1, Math.min(12, Number(root.querySelector("[data-image-generation-count]").value) || 1));
  root.querySelector("[data-image-generation-count]").value = String(count);
  busy = true;
  root.querySelector("[data-image-generation-start]").disabled = true;
  root.querySelector("[data-image-generation-sets]").disabled = true;
  root.querySelector("[data-image-generation-apply]").disabled = true;
  const results = root.querySelector("[data-image-generation-results]");
  root._previewLoadToken = (root._previewLoadToken || 0) + 1;
  results.replaceChildren();
  pending = null;
  try {
    setStatus(root, "Preparando y comprimiendo la imagen de referencia…");
    const reference = await (root._referenceDataPromise || referenceDataUrl(root._reference));
    const generated = [];
    pending = { sessionId: root.dataset.sessionId, rowId: root.dataset.rowId, mode, generated };
    const addResult = (item) => {
      generated.push(item);
      appendPreviewCard(root, item, generated.length - 1);
      root.querySelector("[data-image-generation-apply]").disabled = false;
    };
    if (mode === "decompose") {
      const preset = root.querySelector("[data-image-generation-preset]").value;
      const presetConfig = DECOMPOSITION_PRESETS.find((item) => item.value === preset) || DECOMPOSITION_PRESETS[0];
      const customPrompt = root.querySelector("[data-image-generation-prompt]").value.trim();
      const customInstruction = customPrompt ? ` Instrucciones adicionales del usuario: ${customPrompt}.` : "";
      root.querySelector("[data-image-generation-count-label]").firstChild.textContent = preset === "zones" ? "Zonas además del fondo" : "Capas además del fondo";
      const markedColors = [...(root._markedColors || [])];
      if (markedColors.length) {
        const regions = markedColors.map((color) => root._regionColors.find((region) => region.color === color) || { color, label: "Color" });
        const annotatedReference = await composeMarkedReference(root, reference);
        setStatus(root, "Identificando qué objeto toca cada color…");
        const colorKey = regions.map((region) => `"${region.color}": ${region.label}`).join(", ");
        const analysis = await gemini(TEXT_MODEL, `Vas a recibir dos imágenes: la primera es la referencia limpia; la segunda es la misma referencia con trazos de colores. Cada color identifica un objeto completo tocado por ese trazo. No interpretes el trazo como máscara ni como zona rectangular: identifica el objeto real que atraviesa, incluyendo su silueta completa. No confundas paneles, columnas, fondos ni objetos vecinos. Mapa de colores: ${colorKey}. Para cada color devuelve el nombre y una descripción espacial concreta del objeto señalado (qué es, ubicación y límites visuales). Devuelve solo JSON válido: {"regions":[{"color":"#hex","name":"...","description":"..."}]}. Incluye exactamente una región por color y conserva los códigos hex.`, reference, { image: false, additionalReferences: [annotatedReference] });
        const descriptions = parseMarkedRegionDescriptions(analysis, regions);
        if (descriptions.some((item) => !item?.name || !item?.description)) throw new Error("No se pudieron asociar los colores con los elementos señalados. Marca cada objeto atravesando una parte reconocible y vuelve a generar.");
        regions.forEach((region, index) => { region.name = descriptions[index].name; region.description = descriptions[index].description; });
        setStatus(root, "Generando el fondo limpio a partir de los objetos identificados…");
        const cleanBackground = await gemini(IMAGE_MODEL, `Recibes la imagen original y una guía anotada. Elimina de la imagen original únicamente estos objetos completos: ${regions.map((region) => `${region.name} (${region.description}, marca ${region.color})`).join("; ")}. Los trazos solo señalan; no son parte de la imagen. Reconstruye lo que estaba detrás sin modificar el resto de la composición. Mantén lienzo, cámara, encuadre, perspectiva, iluminación, estilo y color. No elimines las columnas o paneles de la referencia ni los objetos no listados.${customInstruction}`, reference, { additionalReferences: [annotatedReference] });
        addResult({ name: "Fondo limpio", kind: "background", dataUrl: cleanBackground });
        for (const [index, region] of regions.entries()) {
          setStatus(root, `Separando elemento ${index + 1} de ${regions.length} (${region.label})…`);
          const isolatedGuide = await composeMarkedReference(root, reference, region.color);
          const raw = await gemini(IMAGE_MODEL, `La referencia principal es la imagen limpia. La segunda imagen solo guía la selección: el trazo ${region.label} (${region.color}) toca este objeto: ${region.name}. Aísla el objeto completo descrito aquí: ${region.description}. No incluyas el trazo, otros objetos, ni un panel o zona del encuadre. Reproduce la apariencia de la referencia original, conserva su lienzo completo, tamaño, escala y posición exacta; no recortes, no centres y no cambies la cámara. Rellena todo lo demás con magenta croma #FF00FF absolutamente uniforme hasta los cuatro bordes; no uses verde para el fondo. No pongas magenta sobre el objeto ni añadas texto, marcos u objetos nuevos.${customInstruction}`, reference, { additionalReferences: [isolatedGuide] });
          const item = { name: `Elemento ${index + 1} · ${region.label}`, kind: "layer", rawDataUrl: raw, referenceDataUrl: reference, markedRegion: { color: region.color, label: region.label, name: region.name, description: region.description, guideDataUrl: isolatedGuide }, cutoutThreshold: 82, dataUrl: raw, selected: true, x: 0.5, y: 0.5, width: 1 };
          addResult(item);
          try {
            item.dataUrl = await createAlignedTransparentLayer(raw, reference, item.cutoutThreshold);
            const card = results.lastElementChild;
            if (card) card.querySelector("img").src = item.dataUrl;
          } catch (error) {
            item.selected = false;
            const card = results.lastElementChild;
            if (card) {
              const checkbox = card.querySelector("input[type=checkbox]");
              if (checkbox) checkbox.checked = false;
              card.title = "No se pudo separar este fondo automáticamente. Ajusta el recorte o vuelve a generar el elemento.";
            }
            setStatus(root, error?.message || "No se pudo separar el fondo de una capa.", true);
          }
        }
      } else {
      setStatus(root, "Analizando elementos de la referencia…");
      const analysisGoal = `Identifica exactamente ${count} capas distintas. ${presetConfig.analysis} Describe cada una de forma breve, concreta y suficiente para distinguirla de las demás.${customInstruction}`;
      const text = await gemini(TEXT_MODEL, `Analiza la imagen. ${analysisGoal} Devuelve únicamente JSON válido: {"elements":[...]} con una descripción breve y concreta por elemento.`, reference, { image: false });
      const elements = parseElementList(text, count);
      if (elements.length !== count) throw new Error("No se pudieron identificar todos los elementos de la escena. Vuelve a intentarlo.");
      setStatus(root, "Generando fondo sin los elementos del primer plano…");
      addResult({ name: "Fondo", kind: "background", dataUrl: await gemini(IMAGE_MODEL, `Edita la referencia: elimina únicamente todos los sujetos y objetos del primer plano. Reconstruye con naturalidad el fondo que queda detrás. Conserva encuadre, perspectiva, estilo, iluminación y colores. No agregues texto ni sujetos.${customInstruction}`, reference) });
      for (let index = 0; index < elements.length; index += 1) {
        setStatus(root, `Generando ${preset === "zones" ? "zona" : "capa"} ${index + 1} de ${elements.length}…`);
        const cutoutPrompt = `${presetConfig.isolate}${customInstruction} El resultado debe conservar el mismo lienzo horizontal 16:9, encuadre, escala y posición de la referencia; no recortes, no acerques ni cambies la cámara. Sustituye todo lo demás por magenta croma #FF00FF sólido, uniforme, sin textura ni sombras, hasta los cuatro bordes. No añadas texto, marcos, objetos nuevos ni partes magenta al sujeto.`;
        const raw = await gemini(IMAGE_MODEL, cutoutPrompt, reference);
        const item = { name: `${preset === "zones" ? "Zona" : "Capa"} ${index + 1}: ${elements[index]}`, kind: "layer", elementDescription: elements[index], rawDataUrl: raw, referenceDataUrl: reference, cutoutThreshold: 82, dataUrl: raw, selected: true, x: 0.5, y: 0.5, width: 1 };
        addResult(item);
        try {
          item.dataUrl = await createAlignedTransparentLayer(raw, reference, item.cutoutThreshold);
          const card = results.lastElementChild;
          if (card) card.querySelector("img").src = item.dataUrl;
        } catch (error) {
          item.selected = false;
          const card = results.lastElementChild;
          if (card) {
            const checkbox = card.querySelector("input[type=checkbox]");
            if (checkbox) checkbox.checked = false;
            card.title = "No se pudo separar este fondo automáticamente. Ajusta el recorte o vuelve a generar el elemento.";
          }
          setStatus(root, error?.message || "No se pudo separar el fondo de una capa.", true);
        }
      }
      }
    } else {
      const preset = root.querySelector("[data-image-generation-preset]").value;
      const presetConfig = SEQUENCE_PRESETS.find((item) => item.value === preset) || SEQUENCE_PRESETS[0];
      const customPrompt = root.querySelector("[data-image-generation-prompt]").value.trim();
      const customInstruction = customPrompt ? ` Instrucciones del usuario para el orden y contenido: ${customPrompt}. Respeta los fotogramas o momentos indicados; si se especifica un número de fotograma, programa ese elemento para aparecer ahí y no antes.` : "";
      const additions = Math.max(0, count - 2);
      const additionsGoal = `Planifica exactamente ${additions} adiciones visuales distintas. ${presetConfig.planning} Cada adición debe describir contenido presente en la referencia y que pueda incorporarse en un paso. No uses regiones vacías ni incluyas el fondo base.${customInstruction}`;
      let elements = [];
      if (additions > 0) {
        setStatus(root, "Planeando las capas progresivas…");
        const analysis = await gemini(TEXT_MODEL, `Analiza la referencia para planear una secuencia stop motion de escenas completas y acumulativas. ${additionsGoal} Devuelve solo JSON válido {"elements":[...]} con exactamente ${additions} descripciones breves, una adición por fotograma. Ordénalas para cumplir las instrucciones y aparecer en el fotograma indicado; las adiciones se aplicarán una por una después del fotograma base. No incluyas el fondo como adición ni texto incrustado; el último fotograma será la imagen original completa.`, reference, { image: false });
        elements = parseElementList(analysis, additions);
        if (elements.length !== additions) throw new Error("No se pudieron planear todas las capas de la secuencia. Vuelve a intentarlo.");
      }

      setStatus(root, "Creando el fotograma base…");
      const excludedFromBase = elements.length ? ` Deja fuera estos elementos, que se añadirán progresivamente después: ${elements.join("; ")}.` : "";
      let previousFrame = await gemini(IMAGE_MODEL, `Crea el fotograma base de una secuencia stop motion. Devuelve una imagen completa de la escena, en el mismo lienzo horizontal 16:9. Conserva el escenario y el fondo de la referencia, con la misma cámara, perspectiva, estilo, iluminación y paleta. Deja fuera únicamente los sujetos u objetos principales que se incorporarán en los siguientes pasos.${excludedFromBase}${customInstruction} No recortes, no acerques la cámara, no cambies el encuadre, no uses fondo transparente ni verde, no crees un collage y no añadas texto.`, reference);
      addResult({ name: "Fotograma 1 · Escenario", kind: "frame", dataUrl: previousFrame });
      for (let index = 0; index < elements.length; index += 1) {
        const prompt = `Genera el fotograma ${index + 2} de una secuencia stop motion acumulativa. La primera imagen de entrada es el fotograma anterior; la segunda es la referencia final. ${presetConfig.step}${customInstruction} Añade ahora únicamente este contenido nuevo: ${elements[index]}. Conserva todos los objetos, detalles y partes del fondo ya presentes en el fotograma anterior; no elimines, sustituyas, ocultes ni recortes nada. Coloca el contenido nuevo en el lugar, escala, perspectiva e iluminación que le corresponden según la referencia final. Mantén exactamente el mismo lienzo completo 16:9, cámara, encuadre y estilo. Devuelve una sola escena completa, nunca una capa aislada, un recorte, un collage ni una imagen con fondo verde o transparente. No añadas texto; el último fotograma será la referencia original.`;
        setStatus(root, `Añadiendo elemento ${index + 1} de ${elements.length}…`);
        previousFrame = await gemini(IMAGE_MODEL, prompt, previousFrame, { additionalReferences: [reference] });
        addResult({ name: `Fotograma ${index + 2} · + ${elements[index]}`, kind: "frame", dataUrl: previousFrame });
      }
      addResult({ name: `Fotograma ${generated.length + 1} · Referencia final`, kind: "frame", dataUrl: reference, isReferenceFinal: true });
    }
    setStatus(root, "Revisa las imágenes y aplica las seleccionadas a la escena.");
  } catch (error) {
    if (pending?.generated?.length) {
      root.querySelector("[data-image-generation-apply]").disabled = mode === "stop-motion";
    }
    setStatus(root, error?.message || "Falló la generación. Puedes volver a intentarlo.", true);
  } finally {
    busy = false;
    root.querySelector("[data-image-generation-start]").disabled = false;
    root.querySelector("[data-image-generation-sets]").disabled = false;
    if (pending?.sessionId === root.dataset.sessionId && pending?.rowId === root.dataset.rowId && pending?.mode === root.dataset.mode && pending?.generated?.length) {
      root._currentSet = pending;
      refreshGenerationSetPicker(root, "current");
    } else {
      refreshGenerationSetPicker(root, "current");
    }
  }
}

function pngBlob(dataUrl) {
  const [header, encoded] = String(dataUrl).split(",");
  const mime = header.match(/^data:([^;]+)/)?.[1] || "image/png";
  const bytes = atob(encoded || "");
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) buffer[i] = bytes.charCodeAt(i);
  return new File([buffer], `snoopy-${generatedId()}.png`, { type: mime });
}

async function uploadGenerated(item, sessionId, rowId) {
  const result = await uploadPodcasterAsset(pngBlob(item.dataUrl), { kind: "scene-image", sessionId, rowId });
  if (!result?.media?.storagePath) throw new Error("No se pudo guardar una imagen generada en Storage.");
  return { ...result.media, mimeType: result.media.mimeType || "image/png" };
}

async function applyResults(root) {
  if (busy || !pending) return;
  busy = true;
  const state = pending;
  root.querySelector("[data-image-generation-apply]").disabled = true;
  root.querySelector("[data-image-generation-start]").disabled = true;
  root.querySelector("[data-image-generation-sets]").disabled = true;
  try {
    const session = rootSession();
    if (!session || session.id !== state.sessionId || root.dataset.rowId !== state.rowId) throw new Error("La sesión o la escena cambió. Vuelve a abrir la herramienta.");
    if (state.mode === "decompose") {
        const selectedLayers = state.generated.filter((item, index) => item.kind === "layer" && root.querySelector(`.snoopy-image-generation-card[data-generated-index="${index}"] [data-generated-selection]`)?.checked);
      const background = state.generated.find((item) => item.kind === "background");
      setStatus(root, background ? "Guardando fondo y capas…" : "Guardando capas…");
      if (background) {
        if (!background.persisted || background.needsUpload) {
          const uploadedBackground = await uploadGenerated(background, session.id, state.rowId);
          const applied = await window.PodcasterSceneMedia?.applyReference?.(session, state.rowId, uploadedBackground);
          if (applied?.status !== "applied") throw new Error("No se pudo aplicar el fondo a la escena.");
        }
      }
      const row = rowFor(session, state.rowId);
      const duration = Math.max(1, Number(row?.durationSec || 8));
      const uploadedLayers = [];
      for (let index = 0; index < selectedLayers.length; index += 1) {
        const item = selectedLayers[index];
        setStatus(root, `Guardando capa ${index + 1} de ${selectedLayers.length}…`);
        const media = item.persisted && !item.needsUpload ? item.savedLayer : await uploadGenerated(item, session.id, state.rowId);
        const original = item.persisted ? item.savedLayer : {};
        uploadedLayers.push(normalizeSceneImageLayer({ ...original, ...media, id: original.id || generatedId(), name: item.name, x: Number.isFinite(item.x) ? item.x : original.x ?? 0.5, y: Number.isFinite(item.y) ? item.y : original.y ?? 0.5, width: Number.isFinite(item.width) ? item.width : original.width ?? 1, startSec: original.startSec ?? index * 0.5, endSec: original.endSec ?? duration, motion: original.motion || "fade", exit: original.exit || "none", transitionSec: original.transitionSec ?? 0.55 }));
      }
      const updated = window.PodcasterUI?.upsertActiveSession?.((current) => ({ ...current, visualEffectsMap: { ...(current.visualEffectsMap || {}), [state.rowId]: { ...(current.visualEffectsMap?.[state.rowId] || {}), imageLayers: normalizeSceneImageLayers(uploadedLayers) } } }), { render: false, persist: true, autosaveReason: "scene-image-decomposition" });
      if (updated) {
        await window.persistReorderedTimelinePatchToCloud?.(updated, { visualEffectsMap: updated.visualEffectsMap });
        window.PodcasterUI?.renderPodcastVideoTimeline?.(updated, { force: true, reason: "scene-image-decomposition" });
        window.PodcasterUI?.syncPodcastStudioInspector?.(updated, { forceRender: true });
      }
    } else {
      setStatus(root, "Guardando fotogramas de la secuencia…");
      const frames = [];
      for (let index = 0; index < state.generated.length; index += 1) {
        const item = state.generated[index];
        const media = item.persisted ? item.savedFrame : await uploadGenerated(item, session.id, state.rowId);
        frames.push(item.persisted ? { ...media, order: index } : { id: generatedId(), order: index, name: item.name, mimeType: media.mimeType, storagePath: media.storagePath, downloadUrl: media.downloadUrl });
      }
      const finalFrame = frames.at(-1);
      const seedClip = { ...finalFrame, type: "image", mediaKind: "image", manuallyReplaced: true, durationSec: Math.max(1, Number(rowFor(session, state.rowId)?.durationSec || 8)), model: IMAGE_MODEL };
      const applied = await window.PodcasterSceneMedia?.applyReference?.(session, state.rowId, seedClip);
      if (applied?.status !== "applied") throw new Error("No se pudo preparar la escena para la secuencia.");
      const saved = window.updateDialogueVideoStopMotionForRow?.(state.rowId, { version: 2, timingMode: "fit-scene", frames }, { reason: "ai-stop-motion-sequence" });
      if (!saved) throw new Error("El editor no pudo guardar la secuencia stop motion.");
      const updated = rootSession();
      await window.persistReorderedTimelinePatchToCloud?.(updated, { dialogueVideoMap: updated?.dialogueVideoMap });
      window.PodcasterUI?.renderPodcastVideoTimeline?.(updated, { force: true, reason: "ai-stop-motion-sequence" });
    }
    setStatus(root, "Listo. Los resultados ya están aplicados a la escena.");
    window.setTimeout(() => closeDialog(root), 700);
  } catch (error) {
    setStatus(root, error?.message || "No se pudieron aplicar las imágenes. Puedes volver a intentarlo.", true);
    root.querySelector("[data-image-generation-apply]").disabled = false;
  } finally {
    busy = false;
    root.querySelector("[data-image-generation-sets]").disabled = false;
    root.querySelector("[data-image-generation-start]").disabled = false;
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest?.('[data-action="timeline-open-image-generation"][data-row-id]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  openChoiceMenu(button);
});
