import { getDefaultFirebaseApp } from './firebase-default-app.js';
import { getStorage, ref, uploadString, listAll, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js';
import { getFirestore, collection, addDoc, setDoc, getDocs, query, where, deleteDoc, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { buildGeminiApiUrl, authFetchJson } from './api-client.js?v=20260919-quota-retry-v2';
import { escapeHtml } from './security-utils.js';
import { inicializarGeneradorBatchStickers, construirPromptStickerSimple } from './mindmapBatchStickers.js?v=20260919-translate-prompt-v28';
import { traducirPromptConfiguradoLocal } from './mindmapPromptTranslation.mjs?v=20260919-translate-prompt-v1';
import { procesarStickerTransparente } from './mindmapImageTransparency.js?v=20260918-batch-manual-v7';
import {
  calcularEsquinasFusion,
  generarConectoresSerpenteantes
} from './mindmapConnectorGeometry.mjs?v=20260919-connector-square-v2';
import {
  limpiarDatosFirestore,
  normalizarFuenteImagenPersistente,
  resolverLecturaMindmap
} from './mindmapPersistence.mjs?v=20260919-persistent-stickers-v3';
import { exportarMindmapPsd } from './mindmapPsdExport.js?v=20260919-layered-psd-v2';

// Firebase initialization
const app = getDefaultFirebaseApp();
const storage = getStorage(app);
const firestore = getFirestore(app);
const auth = getAuth(app);

// State
let currentUser = null;
let estadoGeneracion = "stop"; // "play", "pause", "stop"
let zoomScale = 1.0;
let palabraSeleccionadaElemento = null;
let stickerCache = new Map(); // word -> url
let mindmapActualId = null;
let mindmapActualNombre = "";
let mindmapActualEsPropio = true;
let mindmapActualAcademico = {
  nivel: "Primaria",
  grado: "Primero",
  trimestre: "Trim 1",
  unidad: "Unidad 1"
};
const headerTitleEl = document.querySelector(".mc-header__title");
let textoSnapshotP1 = ""; // texto con el que se generó el canvas activo
let textoSnapshotP2 = "";
let estaGenerando = false;  // bloquear re-renders SVG durante generación de stickers
const tamanosStickerMindmapActual = new Map();

function obtenerTamanoStickerPreferido(palabra, fallback) {
  const key = normalizarPalabraClave(palabra);
  const saved = Number(tamanosStickerMindmapActual.get(key));
  return Number.isFinite(saved) && saved >= 20 && saved <= 160 ? saved : fallback;
}

function guardarTamanoStickerPreferido(palabra, size) {
  const key = normalizarPalabraClave(palabra);
  if (!key) return;
  tamanosStickerMindmapActual.set(key, Math.max(20, Math.min(160, Math.round(Number(size) || 42))));
}

function obtenerPalabraElementoSticker(el) {
  return el?.dataset?.palabra || el?.title || el?.getAttribute?.("alt") || el?.textContent || "";
}

function registrarTamanoStickerDesdeElemento(el) {
  const palabra = obtenerPalabraElementoSticker(el);
  const size = parseFloat(el?.style?.width || el?.offsetWidth || 0);
  if (palabra && Number.isFinite(size) && size > 0) {
    guardarTamanoStickerPreferido(palabra, size);
  }
}

function limpiarTamanosStickerMindmapActual() {
  tamanosStickerMindmapActual.clear();
}

function obtenerTamanosStickerMindmapActual() {
  return Object.fromEntries(tamanosStickerMindmapActual.entries());
}

function cargarTamanosStickerMindmapActual(tamanos) {
  if (!tamanos || typeof tamanos !== "object") return;
  Object.entries(tamanos).forEach(([palabra, size]) => {
    guardarTamanoStickerPreferido(palabra, size);
  });
}

// Registro de posiciones manuales de stickers (para conservar su ubicación al regenerar)
const posicionesManualesStickers = new Map();

function normalizarPalabraClave(p) {
  return String(p || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function generarClavesSticker(pageIndex, blockIndex, wordIndex, palabra) {
  const pNorm = normalizarPalabraClave(palabra);
  const p = pageIndex !== undefined && pageIndex !== null && String(pageIndex) !== "" ? String(pageIndex) : null;
  const b = blockIndex !== undefined && blockIndex !== null && String(blockIndex) !== "" ? String(blockIndex) : null;
  const w = wordIndex !== undefined && wordIndex !== null && String(wordIndex) !== "" ? String(wordIndex) : null;

  const keys = [];
  if (p !== null && b !== null && w !== null) {
    if (pNorm) keys.push(`pos:${p}:${b}:${w}:${pNorm}`);
    keys.push(`pos:${p}:${b}:${w}`);
  }
  if (p !== null && b !== null && pNorm) {
    keys.push(`blk:${p}:${b}:${pNorm}`);
  }
  return keys;
}

function guardarPosicionManualSticker(el) {
  if (!el) return;
  const left = parseFloat(el.style.left || 0);
  const top = parseFloat(el.style.top || 0);
  const width = parseFloat(el.style.width || el.offsetWidth || 0);
  const height = parseFloat(el.style.height || el.offsetHeight || 0);
  const palabra = el.dataset.palabra || el.textContent || el.title || "";
  const pageIndex = el.dataset.pageIndex;
  const blockIndex = el.dataset.blockIndex;
  const wordIndex = el.dataset.wordIndex;

  const data = { left, top, width, height, palabra, pageIndex, blockIndex, wordIndex };

  const keys = generarClavesSticker(pageIndex, blockIndex, wordIndex, palabra);
  for (const k of keys) {
    posicionesManualesStickers.set(k, data);
  }
}

function obtenerPosicionManual(pageIndex, blockIndex, wordIndex, palabra) {
  const keys = generarClavesSticker(pageIndex, blockIndex, wordIndex, palabra);
  for (const k of keys) {
    if (posicionesManualesStickers.has(k)) {
      return posicionesManualesStickers.get(k);
    }
  }
  return null;
}

function limpiarPosicionesManuales() {
  posicionesManualesStickers.clear();
}

// DOM Elements
const canvas = document.getElementById("canvasMindmap");
const blocksSvg = document.getElementById("mcBlocksSvg");
const stickersLayer = document.getElementById("mcStickersLayer");
const canvasScaler = document.getElementById("mcCanvasScaler");
const canvasStage = document.getElementById("mcCanvasStage");
const viewport = document.getElementById("mcViewport");
const zoomLevelLabel = document.getElementById("mcZoomLevel");
const statusBadge = document.getElementById("mcStatusBadge");

// Input Elements
const textoParte1El = document.getElementById("mcTextoParte1");
const textoParte2El = document.getElementById("mcTextoParte2");
const stepXIzqEl = document.getElementById("mcStepXIzq");
const stepXDerEl = document.getElementById("mcStepXDer");
const modoPlantillaEl = document.getElementById("mcModoPlantilla");
const checkEtiquetasEl = document.getElementById("mcCheckEtiquetas");
const btnRedrawBlocks = document.getElementById("mcBtnRedrawBlocks");

// Control de tamaño global y alineación
const stickerSizeGlobalEl = document.getElementById("mcStickerSizeGlobal");
const stickerSizeSliderEl = document.getElementById("mcGlobalStickerSlider");
const stickerSizeValEl = document.getElementById("mcStickerSizeVal");

// Controles de distribución en zigzag (arriba-abajo) y bajada de bloques
const nivelesYIzqEl = document.getElementById("mcNivelesYIzq");
const ampYIzqEl = document.getElementById("mcAmpYIzq");
const nivelesYDerEl = document.getElementById("mcNivelesYDer");
const ampYDerEl = document.getElementById("mcAmpYDer");
const rowGapYEl = document.getElementById("mcRowGapY");
const rowGapYValEl = document.getElementById("mcRowGapYVal");
const MAX_AMPLITUD_VERTICAL = 78;
const PADDING_HORIZONTAL_FILA = 26;
const MARGEN_VERTICAL_FILA = 2;

function normalizarAmplitudVertical(value) {
  const parsed = Number.parseInt(value, 10);
  const safeValue = Number.isFinite(parsed) ? parsed : 48;
  return Math.max(0, Math.min(MAX_AMPLITUD_VERTICAL, safeValue));
}

function obtenerSeparacionHorizontal(control) {
  if (!control) return 75;
  const actual = Number.parseInt(control.value, 10);
  return Number.isFinite(actual) ? Math.max(0, actual) : 75;
}
const offsetYEl = document.getElementById("mcOffsetY");
const offsetYValEl = document.getElementById("mcOffsetYVal");
const btnResetLayout = document.getElementById("mcBtnResetLayout");
const checkBajarMismoBloqueEl = document.getElementById("mcCheckBajarMismoBloque");

let redrawDebounceTimeout = null;

export function obtenerTamanoStickerGlobal() {
  const val = parseInt(stickerSizeGlobalEl?.value || 0, 10);
  if (val >= 16 && val <= 150) return val;
  return 42;
}

export function aplicarTamanoGlobalStickers(nuevoTamano, reubicar = false) {
  const size = Math.max(16, Math.min(120, parseInt(nuevoTamano, 10) || 42));
  if (stickerSizeGlobalEl && String(stickerSizeGlobalEl.value) !== String(size)) {
    stickerSizeGlobalEl.value = size;
  }
  if (stickerSizeSliderEl && String(stickerSizeSliderEl.value) !== String(size)) {
    stickerSizeSliderEl.value = size;
  }
  if (stickerSizeValEl) {
    stickerSizeValEl.textContent = `${size}px`;
  }

  const container = stickersLayer || canvas;
  if (container) {
    const stickers = container.querySelectorAll("img.sticker");
    stickers.forEach((img) => {
      img.style.width = `${size}px`;
      img.style.height = `${size}px`;
    });

    const chips = container.querySelectorAll(".draggable-text");
    chips.forEach((chip) => {
      if (size >= 52) {
        chip.style.fontSize = "14px";
        chip.style.padding = "5px 10px";
      } else if (size >= 36) {
        chip.style.fontSize = "12px";
        chip.style.padding = "3px 7px";
      } else {
        chip.style.fontSize = "10px";
        chip.style.padding = "2px 5px";
      }
    });
  }

  if (reubicar && typeof recalcularPosicionPalabrasCanvas === "function") {
    recalcularPosicionPalabrasCanvas(null);
  } else {
    guardarDraftLocalStorageDebounced();
  }
}

function updateWordCounts() {
  const t1 = (textoParte1El?.value || "").trim();
  const t2 = (textoParte2El?.value || "").trim();
  const c1 = t1 ? t1.split(/\s+/).filter(Boolean).length : 0;
  const c2 = t2 ? t2.split(/\s+/).filter(Boolean).length : 0;
  const total = c1 + c2;

  const p1 = document.getElementById("mcCountParte1");
  const p2 = document.getElementById("mcCountParte2");
  const badge = document.getElementById("mcWordsTotalBadge");

  if (p1) p1.textContent = `${c1} pal`;
  if (p2) p2.textContent = `${c2} pal`;
  if (badge) badge.textContent = `${total} palabras`;
}

function programarRedibujadoBloques() {
  updateWordCounts();
  if (estaGenerando) return; // no repintar mientras se insertan stickers
  clearTimeout(redrawDebounceTimeout);
  redrawDebounceTimeout = setTimeout(() => {
    if (typeof renderizarBloquesSvg === "function") {
      renderizarBloquesSvg();
    }
    if (typeof guardarDraftLocalStorageDebounced === "function") {
      guardarDraftLocalStorageDebounced();
    }
  }, 250);
}

textoParte1El?.addEventListener("input", programarRedibujadoBloques);
textoParte2El?.addEventListener("input", programarRedibujadoBloques);
modoPlantillaEl?.addEventListener("change", () => {
  renderizarBloquesSvg();
  if (typeof recalcularPosicionPalabrasCanvas === "function") {
    recalcularPosicionPalabrasCanvas(null);
  }
});
checkEtiquetasEl?.addEventListener("change", () => {
  renderizarBloquesSvg();
  renderizarEtiquetasStickers();
});
checkBajarMismoBloqueEl?.addEventListener("change", () => renderizarBloquesSvg());
btnRedrawBlocks?.addEventListener("click", () => renderizarBloquesSvg());

function liberarPosicionesManualesDePagina(filtroPagina = null) {
  const target = stickersLayer || canvas;
  target?.querySelectorAll(".sticker, .draggable-text").forEach((el) => {
    const pageIndex = el.dataset.pageIndex !== undefined
      ? parseInt(el.dataset.pageIndex, 10)
      : (parseFloat(el.style.left || 0) < 685 ? 0 : 1);
    if (filtroPagina === null || pageIndex === filtroPagina) delete el.dataset.manualPos;
  });

  limpiarPosicionesManuales();
  target?.querySelectorAll('[data-manual-pos="true"]').forEach(guardarPosicionManualSticker);
}

function aplicarAjusteDistribucion(filtroPagina = null) {
  actualizarValoresDistribucion();
  liberarPosicionesManualesDePagina(filtroPagina);
  if (typeof recalcularPosicionPalabrasCanvas === "function") {
    recalcularPosicionPalabrasCanvas(filtroPagina, true);
  }
}

function actualizarValoresDistribucion() {
  const actualizarSalida = (control, outputId, suffix) => {
    const output = document.getElementById(outputId);
    if (control && output) output.textContent = `${control.value}${suffix}`;
  };

  actualizarSalida(stepXIzqEl, "mcStepXIzqVal", "px");
  actualizarSalida(nivelesYIzqEl, "mcNivelesYIzqVal", " niv.");
  actualizarSalida(ampYIzqEl, "mcAmpYIzqVal", "px");
  actualizarSalida(stepXDerEl, "mcStepXDerVal", "px");
  actualizarSalida(nivelesYDerEl, "mcNivelesYDerVal", " niv.");
  actualizarSalida(ampYDerEl, "mcAmpYDerVal", "px");
  if (rowGapYValEl) rowGapYValEl.textContent = `${parseInt(rowGapYEl?.value || 0, 10)}px`;
  if (offsetYValEl) offsetYValEl.textContent = `${parseInt(offsetYEl?.value || 0, 10)}px`;
}

function aplicarConfigDistribucion(config = {}) {
  if (stepXIzqEl) stepXIzqEl.value = String(config.stepXIzq ?? 75);
  if (stepXDerEl) stepXDerEl.value = String(config.stepXDer ?? 75);
  if (nivelesYIzqEl) nivelesYIzqEl.value = String(config.nivelesYIzq ?? 2);
  if (nivelesYDerEl) nivelesYDerEl.value = String(config.nivelesYDer ?? 2);
  if (ampYIzqEl) ampYIzqEl.value = String(normalizarAmplitudVertical(config.ampYIzq));
  if (ampYDerEl) ampYDerEl.value = String(normalizarAmplitudVertical(config.ampYDer));
  if (rowGapYEl) rowGapYEl.value = String(config.rowGapY ?? 0);
  if (offsetYEl) offsetYEl.value = String(config.offsetY ?? 0);
  actualizarValoresDistribucion();
}

// Listeners para actualización de posiciones desde mc-param-grid
stepXIzqEl?.addEventListener("input", () => {
  aplicarAjusteDistribucion(0);
});
stepXIzqEl?.addEventListener("change", () => {
  aplicarAjusteDistribucion(0);
});

nivelesYIzqEl?.addEventListener("input", () => {
  aplicarAjusteDistribucion(0);
});
nivelesYIzqEl?.addEventListener("change", () => {
  aplicarAjusteDistribucion(0);
});

ampYIzqEl?.addEventListener("input", () => {
  aplicarAjusteDistribucion(0);
});
ampYIzqEl?.addEventListener("change", () => {
  aplicarAjusteDistribucion(0);
});

stepXDerEl?.addEventListener("input", () => {
  aplicarAjusteDistribucion(1);
});
stepXDerEl?.addEventListener("change", () => {
  aplicarAjusteDistribucion(1);
});

nivelesYDerEl?.addEventListener("input", () => {
  aplicarAjusteDistribucion(1);
});
nivelesYDerEl?.addEventListener("change", () => {
  aplicarAjusteDistribucion(1);
});

ampYDerEl?.addEventListener("input", () => {
  aplicarAjusteDistribucion(1);
});
ampYDerEl?.addEventListener("change", () => {
  aplicarAjusteDistribucion(1);
});

[rowGapYEl, offsetYEl].forEach((control) => {
  control?.addEventListener("input", () => {
    actualizarValoresDistribucion();
    aplicarAjusteDistribucion(null);
  });
  control?.addEventListener("change", () => {
    actualizarValoresDistribucion();
    aplicarAjusteDistribucion(null);
  });
});

btnResetLayout?.addEventListener("click", () => {
  aplicarConfigDistribucion();
  aplicarAjusteDistribucion(null);
});

// Listeners para tamaño global de imágenes de toda la lectura
stickerSizeGlobalEl?.addEventListener("input", (e) => {
  aplicarTamanoGlobalStickers(e.target.value);
});
stickerSizeSliderEl?.addEventListener("input", (e) => {
  aplicarTamanoGlobalStickers(e.target.value);
});

// Auth watcher
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    statusBadge.textContent = "Conectado";
    statusBadge.classList.add("mc-badge--accent");
  } else {
    statusBadge.textContent = "Sin sesión (Modo local)";
    statusBadge.classList.remove("mc-badge--accent");
  }
  cargarMindmapsGuardados();
});

// Setup Initial Canvas Fit
function fitCanvasToViewport() {
  if (!viewport || !canvasScaler) return;
  const vw = Math.max(160, viewport.clientWidth - 48);
  const vh = Math.max(160, viewport.clientHeight - 48);
  const cw = 1366;
  const ch = 904;
  const scale = Math.min(vw / cw, vh / ch, 1.0);
  const rounded = Math.max(0.2, Math.round(scale * 100) / 100);
  setZoom(rounded);
}

function setZoom(val) {
  zoomScale = Math.min(Math.max(0.2, val), 2.5);
  canvasScaler.style.transform = `scale(${zoomScale})`;
  if (canvasStage) {
    canvasStage.style.width = `${Math.round(1366 * zoomScale)}px`;
    canvasStage.style.height = `${Math.round(904 * zoomScale)}px`;
  }
  zoomLevelLabel.textContent = `${Math.round(zoomScale * 100)}%`;
}

document.getElementById("mcZoomIn")?.addEventListener("click", () => setZoom(zoomScale + 0.15));
document.getElementById("mcZoomOut")?.addEventListener("click", () => setZoom(zoomScale - 0.15));
document.getElementById("mcZoomFit")?.addEventListener("click", fitCanvasToViewport);

// --- Gemini Asistente ---
const modalGemini = document.getElementById("mcModalGemini");
const geminiFullTextEl = document.getElementById("mcGeminiFullText");
const geminiResultEl = document.getElementById("mcGeminiResult");
let lecturaPendienteNuevoMindmap = null;

function renderizarConceptosAsistente(conceptos = []) {
  const conceptsCard = document.getElementById("mcAiConceptsCard");
  const conceptsList = document.getElementById("mcAiConceptsList");
  if (!conceptsCard || !conceptsList || !Array.isArray(conceptos)) return;
  conceptsList.innerHTML = "";
  conceptos.forEach((concepto) => {
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "mc-concept-tag";
    const icon = document.createElement("i");
    icon.className = "fas fa-tag text-blue-500";
    const word = document.createElement("span");
    word.textContent = concepto.palabra || "Concepto";
    const visual = document.createElement("small");
    visual.className = "mc-concept-visual";
    visual.textContent = `(${concepto.visual || ""})`;
    badge.replaceChildren(icon, word, visual);
    badge.title = `Click para buscar sticker "${concepto.visual || concepto.palabra || ""}"`;
    badge.onclick = () => abrirDrawerStickers(concepto.visual || concepto.palabra);
    conceptsList.appendChild(badge);
  });
  conceptsCard.style.display = conceptos.length > 0 ? "flex" : "none";
}

document.getElementById("mcExecuteGeminiBtn")?.addEventListener("click", async () => {
  const fullText = geminiFullTextEl?.value.trim() || "";
  if (!fullText) {
    alert("Por favor escribe o pega un texto para analizar.");
    return;
  }

  const btn = document.getElementById("mcExecuteGeminiBtn");
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Analizando lectura...`;

  try {
    const prompt = `
Eres un diseñador pedagógico visual para niños. Analiza la siguiente historia o texto educativo:
"""${fullText}"""

Tu tarea es:
1. Dividir el texto cronológica y narrativamente en dos mitades equilibradas:
   - "parte1": primera mitad (lado izquierdo de la lámina)
   - "parte2": segunda mitad (lado derecho de la lámina)
2. Extraer de 5 a 8 conceptos clave o palabras con alta carga visual. Para cada uno, provee la palabra en español ("palabra") y un emoji o descriptor visual en inglés para sticker ("visual").

Responde ÚNICAMENTE un objeto JSON válido con esta estructura:
{
  "parte1": "texto de la primera mitad...",
  "parte2": "texto de la segunda mitad...",
  "conceptos": [
    { "palabra": "árbol", "visual": "tree" },
    { "palabra": "sol", "visual": "sun" }
  ]
}
`;

    const data = await authFetchJson(buildGeminiApiUrl("/api/gemini/generate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        payload: { contents: [{ parts: [{ text: prompt }] }] }
      })
    });

    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error("Respuesta vacía del asistente");

    const cleaned = raw.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleaned);

    lecturaPendienteNuevoMindmap = {
      parte1: String(result.parte1 || ""),
      parte2: String(result.parte2 || ""),
      conceptos: Array.isArray(result.conceptos) ? result.conceptos : []
    };
    if (geminiResultEl) {
      const total = [lecturaPendienteNuevoMindmap.parte1, lecturaPendienteNuevoMindmap.parte2]
        .join(" ").trim().split(/\s+/).filter(Boolean).length;
      geminiResultEl.textContent = `Lectura preparada: ${total} palabras`;
    }
  } catch (err) {
    console.error("Error al procesar con Gemini:", err);
    alert(`Error al estructurar la lectura: ${err.message || "Revisa la conexión"}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-sparkles"></i> Analizar y Dividir`;
  }
});

// --- Paleta de Colores Mnemotécnicos (Story Map / Dual-Coding) ---
const PALETA_BLOQUES = [
  { fill: "#fad2e1", stroke: "#e56b9c", text: "#9d174d", name: "Rosa Pastel" },
  { fill: "#d0f0eb", stroke: "#2ca898", text: "#0f766e", name: "Turquesa" },
  { fill: "#ebd6e8", stroke: "#9d579d", text: "#701a75", name: "Malva" },
  { fill: "#fedec5", stroke: "#e98738", text: "#c2410c", name: "Melocotón" },
  { fill: "#dad9eb", stroke: "#6e6a9f", text: "#4338ca", name: "Azul Pizarra" },
  { fill: "#e5f3cc", stroke: "#8cb542", text: "#3f6212", name: "Verde Claro" }
];

// Parser de texto: cada bloque lleva una frase completa delimitada por coma, punto, signo o salto
function segmentarTextoEnFrases(texto) {
  if (!texto || !texto.trim()) return [];
  const regex = /[^,.;:!?\n\r]+(?:[,.;:!?]+|\n+|$)/g;
  const matches = texto.match(regex) || [];
  const frases = [];

  for (const raw of matches) {
    const limpia = raw.trim();
    if (!limpia) continue;
    const palabras = limpia
      .split(/\s+/)
      .map((p) => p.replace(/[.,;:!?()¿¡"]/g, "").trim())
      .filter(Boolean);
    if (palabras.length > 0) {
      frases.push({
        textoOriginal: limpia,
        palabras: palabras,
        wordCount: palabras.length
      });
    }
  }
  return frases;
}

// Equilibra las frases para que siempre haya exactamente 5 filas en cada página
// Distribuye las oraciones de forma equitativa por palabras
function equilibrarFrasesParaFilas(frases, targetCount = 5) {
  if (!frases || frases.length === 0) return Array.from({ length: targetCount }, () => []);

  const items = frases.map((f, idx) => ({
    sentenceId: idx,
    textoOriginal: f.textoOriginal,
    palabras: [...f.palabras],
    wordCount: f.palabras.length,
    isContinuation: false
  }));

  const totalWords = items.reduce((sum, item) => sum + item.wordCount, 0);
  const filasGrupos = Array.from({ length: targetCount }, () => []);
  const capacidadObjetivo = Math.max(1, totalWords / targetCount);
  let fraseIndex = 0;
  let palabraIndex = 0;

  // Las cinco filas son siempre reales. Se reparten palabras de forma
  // proporcional y una continuación conserva el sentenceId de su frase.
  for (let fila = 0; fila < targetCount && fraseIndex < items.length; fila++) {
    let palabrasEnFila = 0;
    const capacidadFila = fila === targetCount - 1
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.round(capacidadObjetivo));

    while (fraseIndex < items.length && (palabrasEnFila < capacidadFila || filasGrupos[fila].length === 0)) {
      const frase = items[fraseIndex];
      const restantes = frase.palabras.length - palabraIndex;
      const espacio = capacidadFila === Number.POSITIVE_INFINITY
        ? restantes
        : Math.max(1, capacidadFila - palabrasEnFila);
      const cantidad = Math.min(restantes, espacio);
      const palabras = frase.palabras.slice(palabraIndex, palabraIndex + cantidad);

      filasGrupos[fila].push({
        ...frase,
        textoOriginal: palabras.join(" "),
        palabras,
        wordCount: palabras.length,
        isContinuation: palabraIndex > 0
      });

      palabrasEnFila += cantidad;
      palabraIndex += cantidad;
      if (palabraIndex >= frase.palabras.length) {
        fraseIndex += 1;
        palabraIndex = 0;
      }
      if (capacidadFila !== Number.POSITIVE_INFINITY && palabrasEnFila >= capacidadFila) break;
    }
  }

  return filasGrupos;
}

// Calcula los bloques dinámicos: SIEMPRE 5 filas en cada página
// Fila 1, 3, 5: LTR (izquierda a derecha)
// Fila 2, 4: RTL (derecha a izquierda)
// La última fila siempre es LTR
function calcularBloquesPagina(frases, pageIndex) {
  const pageX = pageIndex === 0 ? 36 : 702;
  const pageWidth = 628;
  const canvasH = 904;
  const startY = 56; // Más espacio arriba para respiración y títulos
  const endY = canvasH - 30; // La última fila más abajo (874px)
  const availH = endY - startY;

  // SIEMPRE 5 filas fijas en cada página
  const NUM_ROWS = 5;
  const rowGap = 20;
  const rowHeight = Math.floor((availH - rowGap * (NUM_ROWS - 1)) / NUM_ROWS); // 147px

  // Boustrophedon: filas 1, 3, 5 LTR; filas 2, 4 RTL
  const filasDef = [
    { r: 0, y: startY + 0 * (rowHeight + rowGap), dir: "ltr" },
    { r: 1, y: startY + 1 * (rowHeight + rowGap), dir: "rtl" },
    { r: 2, y: startY + 2 * (rowHeight + rowGap), dir: "ltr" },
    { r: 3, y: startY + 3 * (rowHeight + rowGap), dir: "rtl" },
    { r: 4, y: startY + 4 * (rowHeight + rowGap), dir: "ltr" }
  ];

  // Sin texto -> 5 bloques placeholder
  if (!frases || frases.length === 0) {
    return filasDef.map((f, idx) => ({
      pageIndex,
      row: f.r,
      dir: f.dir,
      x: pageX,
      y: f.y,
      width: pageWidth,
      height: rowHeight,
      palette: PALETA_BLOQUES[(pageIndex * NUM_ROWS + idx) % PALETA_BLOQUES.length],
      phrase: {
        textoOriginal: `Fila ${idx + 1} (${f.dir.toUpperCase()})`,
        palabras: [],
        wordCount: 0
      },
      blockIndex: pageIndex * NUM_ROWS + idx,
      sentenceId: idx,
      isContinuation: false
    }));
  }

  const filasGrupos = equilibrarFrasesParaFilas(frases, NUM_ROWS);
  const resultadoBloques = [];
  let globalBlockCounter = pageIndex === 0 ? 0 : NUM_ROWS;
  const gap = 14;

  for (let r = 0; r < NUM_ROWS; r++) {
    if (r >= filasGrupos.length) break;
    const fDef = filasDef[r];
    const grupo = filasGrupos[r];
    if (!grupo || grupo.length === 0) continue;

    const k = grupo.length;
    const totalGap = (k - 1) * gap;
    const availW = pageWidth - totalGap;
    const sumWords = grupo.reduce((acc, p) => acc + Math.max(1, p.wordCount), 0);

    const widths = grupo.map((p) => {
      const prop = Math.max(1, p.wordCount) / sumWords;
      // En filas densas se reduce el mínimo para que la ruta nunca salga del lienzo.
      const minWidth = k > 8 ? 24 : 60;
      return Math.max(minWidth, Math.round(availW * prop));
    });

    const curSum = widths.reduce((a, b) => a + b, 0);
    if (curSum > availW) {
      const factor = availW / curSum;
      for (let i = 0; i < widths.length; i++) {
        widths[i] = Math.max(18, Math.floor(widths[i] * factor));
      }
      const normalizedSum = widths.reduce((a, b) => a + b, 0);
      widths[widths.length - 1] = Math.max(18, widths[widths.length - 1] + availW - normalizedSum);
    } else {
      widths[widths.length - 1] += availW - curSum;
    }

    if (fDef.dir === "ltr") {
      let curX = pageX;
      for (let j = 0; j < k; j++) {
        const w = widths[j];
        const pObj = grupo[j];
        const pal = PALETA_BLOQUES[(pObj.sentenceId ?? (globalBlockCounter)) % PALETA_BLOQUES.length];
        resultadoBloques.push({
          pageIndex,
          row: r,
          dir: fDef.dir,
          x: curX,
          y: fDef.y,
          width: w,
          height: rowHeight,
          palette: pal,
          phrase: pObj,
          blockIndex: globalBlockCounter++,
          sentenceId: pObj.sentenceId,
          isContinuation: Boolean(pObj.isContinuation)
        });
        curX += w + gap;
      }
    } else {
      let curX = pageX + pageWidth;
      for (let j = 0; j < k; j++) {
        const w = widths[j];
        const pObj = grupo[j];
        const pal = PALETA_BLOQUES[(pObj.sentenceId ?? (globalBlockCounter)) % PALETA_BLOQUES.length];
        resultadoBloques.push({
          pageIndex,
          row: r,
          dir: fDef.dir,
          x: curX - w,
          y: fDef.y,
          width: w,
          height: rowHeight,
          palette: pal,
          phrase: pObj,
          blockIndex: globalBlockCounter++,
          sentenceId: pObj.sentenceId,
          isContinuation: Boolean(pObj.isContinuation)
        });
        curX -= (w + gap);
      }
    }
  }

  return resultadoBloques;
}

// Determina si un bloque es el último de su fila en orden de lectura
function esUltimoBloqueDeFila(bloque, listaBloques) {
  if (!listaBloques || listaBloques.length === 0) return true;
  const mismaFila = listaBloques.filter((b) => b.row === bloque.row);
  if (mismaFila.length <= 1) return true;
  if (bloque.dir === "rtl") {
    const minX = Math.min(...mismaFila.map((b) => b.x));
    return bloque.x === minX;
  } else {
    const maxX = Math.max(...mismaFila.map((b) => b.x));
    return bloque.x === maxX;
  }
}

// Genera puntos de transición entre Página 1 y Página 2 según los bloques extremos
function generarPuntosTransicion(bloquesP1, bloquesP2) {
  if (!bloquesP1 || bloquesP1.length === 0) return "";

  const NUM_DOTS = 10;
  let dots = "";

  // --- Dots al final de Página 1 (último bloque de la última fila) ---
  const lastB1 = bloquesP1[bloquesP1.length - 1];
  const colorP1 = lastB1.palette?.stroke || "#e56b9c";
  const xFinalP1 = lastB1.dir === "ltr" ? 664 : 36;
  const yTopP1 = lastB1.y;
  const yBotP1 = lastB1.y + lastB1.height;

  dots += `<g class="mc-transition-dots-p1">`;
  for (let i = 0; i < NUM_DOTS; i++) {
    const cy = Math.round(yTopP1 + (i / (NUM_DOTS - 1)) * (yBotP1 - yTopP1));
    dots += `<circle cx="${xFinalP1}" cy="${cy}" r="3.5" fill="${colorP1}" opacity="0.95" />`;
  }
  dots += `</g>`;

  // --- Dots al inicio de Página 2 (primer bloque de la primera fila) ---
  if (bloquesP2 && bloquesP2.length > 0) {
    const firstB2 = bloquesP2[0];
    const colorP2 = firstB2.palette?.stroke || "#2ca898";
    const xInicioP2 = firstB2.dir === "ltr" ? 702 : 1330;
    const yTopP2 = firstB2.y;
    const yBotP2 = firstB2.y + firstB2.height;

    dots += `<g class="mc-transition-dots-p2">`;
    for (let i = 0; i < NUM_DOTS; i++) {
      const cy = Math.round(yTopP2 + (i / (NUM_DOTS - 1)) * (yBotP2 - yTopP2));
      dots += `<circle cx="${xInicioP2}" cy="${cy}" r="3.5" fill="${colorP2}" opacity="0.95" />`;
    }
    dots += `</g>`;
  }

  return dots;
}

// Renderiza los bloques y canales SVG en el lienzo
function renderizarBloquesSvg() {
  if (!blocksSvg) return null;
  const modo = modoPlantillaEl?.value || "static";

  const t1 = (textoParte1El?.value || "").trim();
  const t2 = (textoParte2El?.value || "").trim();
  const frasesP1 = segmentarTextoEnFrases(t1);
  const frasesP2 = segmentarTextoEnFrases(t2);

  const bloquesP1 = calcularBloquesPagina(frasesP1, 0);
  const bloquesP2 = calcularBloquesPagina(frasesP2, 1);
  const todosLosBloques = [...bloquesP1, ...bloquesP2];

  if (modo === "static") {
    blocksSvg.style.display = "none";
    canvas.style.backgroundImage = "url('mindmapBackground.png')";
    return { bloquesP1, bloquesP2, todosLosBloques };
  }

  blocksSvg.style.display = "block";
  canvas.style.backgroundImage = "none";
  blocksSvg.innerHTML = "";

  const mostrarEtiquetas = checkEtiquetasEl ? checkEtiquetasEl.checked : true;

  let svgContent = `
    <defs>
      <filter id="mcBlockShadow" x="-5%" y="-5%" width="110%" height="115%" filterUnits="userSpaceOnUse">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.05" />
      </filter>
    </defs>

    <!-- Conectores Serpenteantes Dinámicos Página 1 -->
    <!-- La ruta se agrega después de los bloques para cubrir la línea de separación únicamente en las continuaciones. -->
  `;

  const mergeCorners = new Map([
    ...calcularEsquinasFusion(bloquesP1),
    ...calcularEsquinasFusion(bloquesP2)
  ]);

  // Identificar bloques de transición entre páginas
  const lastB1 = bloquesP1.length > 0 ? bloquesP1[bloquesP1.length - 1] : null;
  const firstB2 = bloquesP2.length > 0 ? bloquesP2[0] : null;

  const bloquePath = (b, corners = {}) => {
    const r = 18;
    const x = b.x;
    const y = b.y;
    const right = b.x + b.width;
    const bottom = b.y + b.height;
    const square = (position) => corners[position] === true;
    const tl = square("top-left") ? 0 : r;
    const tr = square("top-right") ? 0 : r;
    const br = square("bottom-right") ? 0 : r;
    const bl = square("bottom-left") ? 0 : r;

    // Si es el último bloque de P1 (dir=ltr), el borde derecho queda abierto (recto sin stroke en x=right)
    if (b.pageIndex === 0 && lastB1 && b.blockIndex === lastB1.blockIndex && b.dir === "ltr") {
      return {
        fillPath: `M ${x + tl} ${y} L ${right} ${y} L ${right} ${bottom} L ${x + bl} ${bottom} ${bl ? `Q ${x} ${bottom} ${x} ${bottom - bl}` : `L ${x} ${bottom}`} L ${x} ${y + tl} ${tl ? `Q ${x} ${y} ${x + tl} ${y}` : `L ${x} ${y}`} Z`,
        strokePath: `M ${right} ${y} L ${x + tl} ${y} ${tl ? `Q ${x} ${y} ${x} ${y + tl}` : ""} L ${x} ${bottom - bl} ${bl ? `Q ${x} ${bottom} ${x + bl} ${bottom}` : ""} L ${right} ${bottom}`
      };
    }

    // Si es el primer bloque de P2 (dir=ltr), el borde izquierdo queda abierto (recto sin stroke en x=left)
    if (b.pageIndex === 1 && firstB2 && b.blockIndex === firstB2.blockIndex && b.dir === "ltr") {
      return {
        fillPath: `M ${x} ${y} L ${right - tr} ${y} ${tr ? `Q ${right} ${y} ${right} ${y + tr}` : `L ${right} ${y}`} L ${right} ${bottom - br} ${br ? `Q ${right} ${bottom} ${right - br} ${bottom}` : `L ${right} ${bottom}`} L ${x} ${bottom} Z`,
        strokePath: `M ${x} ${y} L ${right - tr} ${y} ${tr ? `Q ${right} ${y} ${right} ${y + tr}` : ""} L ${right} ${bottom - br} ${br ? `Q ${right} ${bottom} ${right - br} ${bottom}` : ""} L ${x} ${bottom}`
      };
    }

    const standardD = [
      `M ${x + tl} ${y}`,
      `L ${right - tr} ${y}`,
      tr ? `Q ${right} ${y} ${right} ${y + tr}` : `L ${right} ${y}`,
      `L ${right} ${bottom - br}`,
      br ? `Q ${right} ${bottom} ${right - br} ${bottom}` : `L ${right} ${bottom}`,
      `L ${x + bl} ${bottom}`,
      bl ? `Q ${x} ${bottom} ${x} ${bottom - bl}` : `L ${x} ${bottom}`,
      `L ${x} ${y + tl}`,
      tl ? `Q ${x} ${y} ${x + tl} ${y}` : `L ${x} ${y}`,
      "Z"
    ].join(" ");

    return { fillPath: standardD, strokePath: standardD };
  };

  // Renderizar cada bloque de frase
  for (const b of todosLosBloques) {
    const p = b.palette;
    const merge = mergeCorners.get(b.blockIndex) || {};
    const corners = {
      "top-left": merge.top === "left" || merge.top === "both",
      "top-right": merge.top === "right" || merge.top === "both",
      "bottom-left": merge.bottom === "left" || merge.bottom === "both",
      "bottom-right": merge.bottom === "right" || merge.bottom === "both"
    };

    const pathData = bloquePath(b, corners);

    svgContent += `
      <g class="mc-svg-block" data-block-id="${b.blockIndex}">
        <path
          d="${pathData.fillPath}"
          fill="${p.fill}"
          stroke="none"
          filter="url(#mcBlockShadow)"
        />
        <path
          d="${pathData.strokePath}"
          fill="none"
          stroke="${p.stroke}"
          stroke-width="2.5"
        />
      </g>
    `;
  }

  svgContent += generarConectoresSerpenteantes(bloquesP1, 0);
  svgContent += generarConectoresSerpenteantes(bloquesP2, 1);
  svgContent += generarPuntosTransicion(bloquesP1, bloquesP2);
  svgContent += `<line x1="683" y1="24" x2="683" y2="880" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 5" />`;

  blocksSvg.innerHTML = svgContent;
  return { bloquesP1, bloquesP2, todosLosBloques };
}

function sincronizarEtiquetaSticker(el) {
  if (!el || el.tagName !== "IMG" || !el.classList.contains("sticker")) return;
  let label = el.nextElementSibling;
  if (!label || !label.classList.contains("sticker-word-label")) {
    label = document.createElement("span");
    label.className = "sticker-word-label";
    el.insertAdjacentElement("afterend", label);
  }
  const visible = checkEtiquetasEl?.checked !== false;
  label.textContent = el.dataset.palabra || el.title || "";
  label.classList.toggle("hidden", !visible || !label.textContent);
  const left = parseFloat(el.style.left || 0);
  const top = parseFloat(el.style.top || 0);
  const width = parseFloat(el.style.width || el.offsetWidth || 42);
  const height = parseFloat(el.style.height || el.offsetHeight || 42);
  const labelWidth = Math.max(44, Math.min(180, width * 2.5));
  label.style.width = `${labelWidth}px`;
  label.style.left = `${Math.round(left + width / 2 - labelWidth / 2)}px`;
  label.style.top = `${Math.max(4, Math.round(top - 22))}px`;
  label.style.fontSize = `${Math.max(10, Math.min(15, Math.round(width * 0.28)))}px`;
  label.dataset.forWord = el.dataset.palabra || "";
}

function renderizarEtiquetasStickers() {
  stickersLayer?.querySelectorAll("img.sticker").forEach(sincronizarEtiquetaSticker);
}

function redimensionarElementoSticker(el, nuevoTamano) {
  if (!el) return;
  const prevW = parseFloat(el.style.width || el.offsetWidth || obtenerTamanoStickerGlobal());
  const prevH = parseFloat(el.style.height || el.offsetHeight || obtenerTamanoStickerGlobal());
  const prevL = parseFloat(el.style.left || 0);
  const prevT = parseFloat(el.style.top || 0);

  // Mantener el centro visual estable al cambiar el tamaño.
  el.style.width = `${nuevoTamano}px`;
  el.style.height = `${nuevoTamano}px`;
  el.style.left = `${Math.round(prevL - (nuevoTamano - prevW) / 2)}px`;
  el.style.top = `${Math.round(prevT - (nuevoTamano - prevH) / 2)}px`;

  if (el.classList.contains("draggable-text")) {
    el.style.fontSize = `${Math.max(10, Math.round(nuevoTamano * 0.3))}px`;
  }

  if (el.dataset.manualPos === "true") {
    guardarPosicionManualSticker(el);
  }
  sincronizarEtiquetaSticker(el);
}

function aplicarTamanoAStickersMismaPalabra(palabra, nuevoTamano) {
  const palabraNorm = normalizarPalabraClave(palabra);
  if (!palabraNorm) return;

  const contenedores = [stickersLayer, canvas].filter(Boolean);
  const vistos = new Set();
  contenedores.forEach((container) => {
    container.querySelectorAll(".sticker, .draggable-text").forEach((el) => {
      if (vistos.has(el)) return;
      vistos.add(el);
      if (normalizarPalabraClave(obtenerPalabraElementoSticker(el)) !== palabraNorm) return;
      redimensionarElementoSticker(el, nuevoTamano);
    });
  });
}

// Index of existing stickers in Firebase Storage mindmap/ folder
let stickerIndex = new Map();
let stickerIndexLoaded = false;
let stickerIndexPromise = null;

async function asegurarIndiceStickers(forzar = false) {
  if (stickerIndexLoaded && !forzar) return stickerIndex;
  if (stickerIndexPromise && !forzar) return stickerIndexPromise;

  stickerIndexPromise = (async () => {
    try {
      const folderRef = ref(storage, "mindmap/");
      const result = await listAll(folderRef);
      stickerIndex.clear();
      for (const itemRef of result.items) {
        const cleanName = itemRef.name.replace(/\.png$/i, "").trim().toLowerCase();
        stickerIndex.set(cleanName, itemRef);
      }
      stickerIndexLoaded = true;
    } catch (err) {
      console.warn("No se pudo precargar el índice de stickers desde Storage:", err);
    }
    return stickerIndex;
  })();

  return stickerIndexPromise;
}

// Inicia la precarga silenciosa en segundo plano
asegurarIndiceStickers().catch(() => {});

async function resolverUrlSticker(palabra) {
  const clean = String(palabra || "").toLowerCase().trim();
  if (!clean) return null;
  if (stickerCache.has(clean)) return stickerCache.get(clean);

  await asegurarIndiceStickers();

  const variantes = [
    clean,
    clean.replace(/[_-]/g, " "),
    clean.replace(/\s+/g, "_"),
    clean.replace(/\s+/g, "-")
  ];

  let targetRef = null;
  for (const v of variantes) {
    if (stickerIndex.has(v)) {
      targetRef = stickerIndex.get(v);
      break;
    }
  }

  if (!targetRef) {
    stickerCache.set(clean, null);
    return null;
  }

  try {
    const url = await getDownloadURL(targetRef);
    stickerCache.set(clean, url);
    return url;
  } catch (_) {
    stickerCache.set(clean, null);
    return null;
  }
}

function reemplazarElementoConSticker(el, url, palabra = "") {
  if (!el || !url) return el;
  const palabraSticker = palabra || obtenerPalabraElementoSticker(el);

  if (el.tagName === "IMG" && el.classList.contains("sticker")) {
    el.src = url;
    sincronizarEtiquetaSticker(el);
    return el;
  }

  const preferredSize = obtenerTamanoStickerPreferido(palabraSticker, obtenerTamanoStickerGlobal());
  const inlineLeft = Number.parseFloat(el.style.left);
  const inlineTop = Number.parseFloat(el.style.top);
  const sourceLeft = Number.isFinite(inlineLeft) ? inlineLeft : (el.offsetLeft || 0);
  const sourceTop = Number.isFinite(inlineTop) ? inlineTop : (el.offsetTop || 0);
  const sourceWidth = el.offsetWidth || Number.parseFloat(el.style.width) || preferredSize;
  const sourceHeight = el.offsetHeight || Number.parseFloat(el.style.height) || preferredSize;
  const centeredLeft = sourceLeft + ((sourceWidth - preferredSize) / 2);
  const centeredTop = sourceTop + ((sourceHeight - preferredSize) / 2);
  const img = document.createElement("img");
  img.src = url;
  img.className = "sticker";
  img.style.top = `${centeredTop}px`;
  img.style.left = `${centeredLeft}px`;
  img.style.width = `${preferredSize}px`;
  img.style.height = `${preferredSize}px`;
  img.title = palabraSticker;
  img.dataset.palabra = palabraSticker;
  ["x", "y", "scale", "angle", "pageIndex", "blockIndex", "sentenceId", "wordIndex", "totalWords", "dir", "manualPos", "freeSticker"].forEach((key) => {
    if (el.dataset[key] !== undefined) img.dataset[key] = el.dataset[key];
  });
  el.replaceWith(img);
  hacerInteractuable(img);
  sincronizarEtiquetaSticker(img);
  if (img.dataset.manualPos === "true") guardarPosicionManualSticker(img);
  return img;
}

let hidratacionStickersVersion = 0;

async function rehidratarStickersPersistidos() {
  const version = ++hidratacionStickersVersion;
  const targetLayer = stickersLayer || canvas;
  if (!targetLayer) return 0;

  for (const [key, value] of stickerCache.entries()) {
    if (typeof value === "string" && /^(data:|blob:)/i.test(value)) stickerCache.delete(key);
  }

  try {
    await asegurarIndiceStickers(true);
  } catch (error) {
    console.warn("No se pudo recuperar la biblioteca de stickers persistentes:", error);
    return 0;
  }

  const candidatos = Array.from(targetLayer.querySelectorAll(".draggable-text, img.sticker"))
    .filter((el) => el.classList.contains("draggable-text") || !normalizarFuenteImagenPersistente(el.src));
  let recuperados = 0;

  for (const el of candidatos) {
    if (version !== hidratacionStickersVersion || !el.isConnected) return recuperados;
    const palabra = obtenerPalabraElementoSticker(el);
    if (!palabra) continue;
    const persistentUrl = await resolverUrlSticker(palabra);
    if (!persistentUrl || !normalizarFuenteImagenPersistente(persistentUrl)) continue;
    reemplazarElementoConSticker(el, persistentUrl, palabra);
    recuperados++;
  }

  if (version === hidratacionStickersVersion && recuperados > 0) {
    recalcularPosicionPalabrasCanvas(null, false);
    guardarDraftLocalStorageDebounced();
  }
  return recuperados;
}

// Recalcula y reposiciona las palabras/stickers en el lienzo según el Paso X y el Tamaño Global
function ajustarAnchoElementoAlBloque(el, bloque, margen = 5) {
  const anchoDisponible = Math.max(12, bloque.width - (margen * 2));
  let anchoElemento = el.offsetWidth || obtenerTamanoStickerGlobal();

  if (el.classList.contains("draggable-text") && anchoElemento > anchoDisponible) {
    const fontSizeActual = parseFloat(getComputedStyle(el).fontSize) || 12;
    const fontSizeAjustado = Math.max(8, Math.floor(fontSizeActual * (anchoDisponible / anchoElemento)));
    el.style.fontSize = `${fontSizeAjustado}px`;
    el.style.maxWidth = `${anchoDisponible}px`;
    anchoElemento = Math.min(el.offsetWidth || anchoDisponible, anchoDisponible);
  }

  return anchoElemento;
}

function limitarXAlBloque(posX, anchoElemento, bloque, margen = 5) {
  const minX = bloque.x + margen;
  const maxX = bloque.x + bloque.width - anchoElemento - margen;
  if (maxX < minX) return Math.round(bloque.x + (bloque.width - anchoElemento) / 2);
  return Math.round(Math.max(minX, Math.min(posX, maxX)));
}

export function recalcularPosicionPalabrasCanvas(filtroPagina = null, forzarAlineacion = false) {
  const sLayer = document.getElementById("mcStickersLayer");
  const container = sLayer || canvas;
  if (!container) return;
  const elementos = Array.from(canvas.querySelectorAll(".sticker, .draggable-text"))
    .filter((el) => el.dataset.freeSticker !== "true");
  if (elementos.length === 0) return;

  const modo = modoPlantillaEl?.value || "dynamic";
  const rowGapY = Math.max(-20, Math.min(24, parseInt(rowGapYEl?.value || 0, 10) || 0));
  const offsetY = Math.max(-80, Math.min(80, parseInt(offsetYEl?.value || 0, 10) || 0));
  const globalStickerSize = obtenerTamanoStickerGlobal();

  const t1 = (textoParte1El?.value || "").trim();
  const t2 = (textoParte2El?.value || "").trim();
  const frasesP1 = segmentarTextoEnFrases(t1);
  const frasesP2 = segmentarTextoEnFrases(t2);
  const bloquesP1 = calcularBloquesPagina(frasesP1, 0);
  const bloquesP2 = calcularBloquesPagina(frasesP2, 1);
  const stepXIzq = obtenerSeparacionHorizontal(stepXIzqEl);
  const stepXDer = obtenerSeparacionHorizontal(stepXDerEl);
  actualizarValoresDistribucion();

  const elementosP1 = [];
  const elementosP2 = [];

  elementos.forEach((el) => {
    const pIdx = el.dataset.pageIndex !== undefined
      ? parseInt(el.dataset.pageIndex, 10)
      : (parseFloat(el.style.left || 0) < 685 ? 0 : 1);
    if (pIdx === 0) elementosP1.push(el);
    else elementosP2.push(el);
  });

  // Ordenar elementos lógicamente por bloque y orden de palabra
  const ordenarElementos = (arr) => {
    return arr.slice().sort((a, b) => {
      const bA = a.dataset.blockIndex !== undefined ? parseInt(a.dataset.blockIndex, 10) : -1;
      const bB = b.dataset.blockIndex !== undefined ? parseInt(b.dataset.blockIndex, 10) : -1;
      if (bA >= 0 && bB >= 0 && bA !== bB) return bA - bB;

      const wA = a.dataset.wordIndex !== undefined ? parseInt(a.dataset.wordIndex, 10) : -1;
      const wB = b.dataset.wordIndex !== undefined ? parseInt(b.dataset.wordIndex, 10) : -1;
      if (wA >= 0 && wB >= 0 && wA !== wB) return wA - wB;

      const topA = parseFloat(a.style.top || 0);
      const topB = parseFloat(b.style.top || 0);
      if (Math.abs(topA - topB) > 25) return topA - topB;

      return parseFloat(a.style.left || 0) - parseFloat(b.style.left || 0);
    });
  };

  const reposicionarPagina = (bloquesPagina, elementosPagina, pIdx, userStepX) => {
    if (filtroPagina !== null && filtroPagina !== pIdx) return;
    let elemIdx = 0;
    const padX = PADDING_HORIZONTAL_FILA;

    const userNivelesY = pIdx === 0
      ? Math.max(1, Math.min(4, parseInt(nivelesYIzqEl?.value || 2, 10)))
      : Math.max(1, Math.min(4, parseInt(nivelesYDerEl?.value || 2, 10)));

    const userAmpY = pIdx === 0
      ? normalizarAmplitudVertical(ampYIzqEl?.value)
      : normalizarAmplitudVertical(ampYDerEl?.value);

    for (const b of bloquesPagina) {
      const palabras = b.phrase?.palabras || [];
      const numWords = palabras.length;
      if (numWords === 0) continue;

      const availW = Math.max(20, b.width - 2 * padX);
      const halfSize = Math.round(globalStickerSize / 2);
      const rowCenterY = b.y + (b.height / 2) + offsetY + ((b.row - 2) * rowGapY);

      const stepXEfectivo = numWords > 1 ? Math.max(0, userStepX) : 0;

      const totalSpan = (numWords - 1) * stepXEfectivo;
      // Centrar el grupo de palabras dentro del bloque con padding de seguridad
      const startOffset = padX + Math.max(0, Math.round((availW - totalSpan) / 2));

      for (let i = 0; i < numWords; i++) {
        if (elemIdx >= elementosPagina.length) break;
        const el = elementosPagina[elemIdx++];

        let wordX;
        if (numWords === 1) {
          wordX = Math.round(b.x + b.width / 2 - halfSize);
        } else if (b.dir === "rtl") {
          wordX = Math.round(b.x + b.width - startOffset - i * stepXEfectivo - halfSize);
        } else {
          wordX = Math.round(b.x + startOffset + i * stepXEfectivo - halfSize);
        }

        // Respetar márgenes internos para que el sticker no toque las orillas laterales
        const minAllowedX = b.x + padX - halfSize;
        const maxAllowedX = b.x + b.width - padX - halfSize;
        if (minAllowedX <= maxAllowedX) {
          wordX = Math.max(minAllowedX, Math.min(wordX, maxAllowedX));
        }

        let factorY = 0.5;
        if (userNivelesY === 1 || numWords === 1) {
          factorY = 0.5;
        } else if (userNivelesY === 2) {
          factorY = (i % 2 === 0) ? 0 : 1;
        } else if (userNivelesY === 3) {
          const pat3 = [0, 0.5, 1, 0.5];
          factorY = pat3[i % pat3.length];
        } else if (userNivelesY >= 4) {
          const pat4 = [0, 0.33, 0.67, 1, 0.67, 0.33];
          factorY = pat4[i % pat4.length];
        }

        const elementWidth = ajustarAnchoElementoAlBloque(el, b);
        const elementHeight = el.offsetHeight || globalStickerSize;
        const elementHalfWidth = Math.round(elementWidth / 2);
        const elementMaxAmpY = Math.max(0, b.height - elementHeight - (MARGEN_VERTICAL_FILA * 2));
        const elementAmpY = Math.min(userAmpY, elementMaxAmpY);
        let wordY = Math.round(rowCenterY + ((factorY - 0.5) * elementAmpY) - (elementHeight / 2));

        if (numWords === 1) {
          wordX = Math.round(b.x + b.width / 2 - elementHalfWidth);
        } else if (b.dir === "rtl") {
          wordX += halfSize - elementHalfWidth;
        } else {
          wordX += halfSize - elementHalfWidth;
        }

        // Ubicación vertical y zigzag en conectores de bajada hacia la fila inferior (filas 0 a 3)
        const esUltimo = esUltimoBloqueDeFila(b, bloquesPagina);
        if (esUltimo && b.row !== undefined && b.row < 4) {
          const rowGapRef = 20;
          if (numWords >= 3) {
            if (i === numWords - 2) {
              wordY += Math.round(rowGapRef * 0.55);
              // Zigzag lateral: alternar ligeramente a los lados del conector
              const shiftX = Math.round(globalStickerSize * 0.28);
              wordX += (b.dir === "ltr" ? -shiftX : shiftX);
            } else if (i === numWords - 1) {
              wordY += Math.round(rowGapRef * 1.35 + (elementMaxAmpY - elementAmpY) * 0.2);
              const shiftX = Math.round(globalStickerSize * 0.28);
              wordX += (b.dir === "ltr" ? shiftX : -shiftX);
            }
          } else if (numWords === 2 && i === 1) {
            wordY += Math.round(rowGapRef * 1.1);
          }
        }

        wordX = limitarXAlBloque(wordX, elementWidth, b);

        el.dataset.pageIndex = pIdx;
        el.dataset.blockIndex = b.blockIndex;
        el.dataset.sentenceId = b.sentenceId;
        el.dataset.wordIndex = i;
        el.dataset.totalWords = numWords;
        el.dataset.dir = b.dir;

        // Si fue movido manualmente por el usuario y no se fuerza la alineación, conservar su ubicación
        if (el.dataset.manualPos === "true" && !forzarAlineacion) {
          sincronizarEtiquetaSticker(el);
          continue;
        }

        el.style.left = `${wordX}px`;
        el.style.top = `${wordY}px`;
        sincronizarEtiquetaSticker(el);
      }
    }
  };

  reposicionarPagina(bloquesP1, ordenarElementos(elementosP1), 0, stepXIzq);
  reposicionarPagina(bloquesP2, ordenarElementos(elementosP2), 1, stepXDer);

  guardarDraftLocalStorageDebounced();
}

// Actualiza la etiqueta del botón Generar según si ya hay stickers en el canvas
function actualizarLabelBtnGenerar() {
  const btn = document.getElementById("mcBtnGenerar");
  if (!btn) return;
  const span = btn.querySelector("span");
  if (!span) return;
  const targetLayer = stickersLayer || canvas;
  const tieneStickers = targetLayer?.querySelector(".sticker, .draggable-text") !== null;
  span.textContent = tieneStickers ? "Actualizar MindMap" : "Generar MindMap en Canvas";
}

// Generador Animado — camino completo (primera vez o reset)
async function generarMindmapCompleto() {
  const t1 = (textoParte1El?.value || "").trim();
  const t2 = (textoParte2El?.value || "").trim();

  if (!t1 && !t2) {
    alert("Por favor ingresa texto en la Parte 1 o Parte 2.");
    return;
  }

  const targetLayer = stickersLayer || canvas;
  const yaExisteContenido = targetLayer?.querySelector(".sticker, .draggable-text") !== null;

  // Si ya hay stickers en canvas, usar camino incremental (solo actualizar los que cambiaron)
  if (yaExisteContenido) {
    await actualizarMindmapExistente();
    return;
  }

  // === CAMINO COMPLETO: primera generación ===

  // Refrescar índice en Firebase Storage y limpiar caché de stickers que antes no existían (null)
  try {
    await asegurarIndiceStickers(true);
    for (const [k, v] of stickerCache.entries()) {
      if (!v) stickerCache.delete(k);
    }
  } catch (err) {
    console.warn("No se pudo refrescar el índice de stickers:", err);
  }

  // Capturar stickers libres antes de limpiar el lienzo
  const elementosPrevios = Array.from(targetLayer.querySelectorAll(".sticker, .draggable-text"));
  const freeStickers = [];
  elementosPrevios.forEach((el) => {
    if (el.dataset.manualPos === "true") guardarPosicionManualSticker(el);
    if (el.dataset.blockIndex === undefined && el.dataset.pageIndex === undefined && el.dataset.freeSticker === "true") {
      freeStickers.push(el);
    }
  });

  // Limpiar capas de stickers anteriores
  if (stickersLayer) {
    stickersLayer.innerHTML = "";
  } else {
    canvas.querySelectorAll(".sticker, .draggable-text").forEach((el) => el.remove());
  }

  await _ejecutarGeneracionCompleta(freeStickers);
}

// Camino incremental: solo recarga las imágenes cuya URL de Firebase haya cambiado
async function actualizarMindmapExistente() {
  const t1 = (textoParte1El?.value || "").trim();
  const t2 = (textoParte2El?.value || "").trim();
  if (!t1 && !t2) return;

  // Si el texto cambió vs el snapshot guardado → regenerar todo desde cero
  if (t1 !== textoSnapshotP1 || t2 !== textoSnapshotP2) {
    const targetLayer = stickersLayer || canvas;
    const elementosPrevios = Array.from(targetLayer.querySelectorAll(".sticker, .draggable-text"));
    const freeStickers = [];
    elementosPrevios.forEach((el) => {
      if (el.dataset.manualPos === "true") guardarPosicionManualSticker(el);
      if (el.dataset.blockIndex === undefined && el.dataset.pageIndex === undefined && el.dataset.freeSticker === "true") {
        freeStickers.push(el);
      }
    });
    if (stickersLayer) {
      stickersLayer.innerHTML = "";
    } else {
      canvas.querySelectorAll(".sticker, .draggable-text").forEach((el) => el.remove());
    }
    await _ejecutarGeneracionCompleta(freeStickers);
    return;
  }

  // Refrescar índice y borrar caché de entradas null para re-resolver
  try {
    await asegurarIndiceStickers(true);
    for (const [k, v] of stickerCache.entries()) {
      if (!v) stickerCache.delete(k);
    }
  } catch (err) {
    console.warn("No se pudo refrescar el índice de stickers:", err);
  }

  const targetLayer = stickersLayer || canvas;
  const btn = document.getElementById("mcBtnGenerar");
  const span = btn?.querySelector("span");
  const originalLabel = span?.textContent || "Actualizar MindMap";
  if (span) span.textContent = "Actualizando…";
  if (btn) btn.disabled = true;

  let actualizados = 0;
  let nuevos = 0;

  try {
    const elementosExistentes = Array.from(targetLayer.querySelectorAll(".sticker, .draggable-text"));

    for (const el of elementosExistentes) {
      const palabra = el.dataset.palabra;
      if (!palabra) continue;

      const nuevaUrl = await resolverUrlSticker(palabra);

      if (el.tagName === "IMG" && el.classList.contains("sticker")) {
        // El elemento ya es un sticker-imagen
        if (!nuevaUrl) continue; // no hay imagen nueva, dejar como está
        // Comparar URL ignorando tokens de Firebase (diferente si el path cambia)
        const urlActual = el.src?.split("?")[0] || "";
        const urlNueva = nuevaUrl?.split("?")[0] || "";
        if (urlActual !== urlNueva) {
          el.src = nuevaUrl;
          actualizados++;
        }
      } else if (el.classList.contains("draggable-text") && nuevaUrl) {
        // El elemento era un chip de texto, ahora tiene imagen → reemplazar
        reemplazarElementoConSticker(el, nuevaUrl, palabra);
        nuevos++;
      }
    }
  } finally {
    if (span) span.textContent = originalLabel;
    if (btn) btn.disabled = false;
  }

  console.log(`[ActualizarMindmap] ${actualizados} sticker(s) actualizados, ${nuevos} chip(s) convertidos a imagen.`);
  guardarDraftLocalStorage();
}

// Núcleo compartido de generación animada completa
async function _ejecutarGeneracionCompleta(freeStickers = []) {
  estaGenerando = true;
  const layout = renderizarBloquesSvg();
  // Guardar snapshot del texto con el que se generó este canvas
  textoSnapshotP1 = (textoParte1El?.value || "").trim();
  textoSnapshotP2 = (textoParte2El?.value || "").trim();
  const globalStickerSize = obtenerTamanoStickerGlobal();
  const todosLosBloques = layout?.todosLosBloques || [];
  const stepXIzq = obtenerSeparacionHorizontal(stepXIzqEl);
  const stepXDer = obtenerSeparacionHorizontal(stepXDerEl);
  actualizarValoresDistribucion();
  const rowGapY = Math.max(-20, Math.min(24, parseInt(rowGapYEl?.value || 0, 10) || 0));
  const offsetY = Math.max(-80, Math.min(80, parseInt(offsetYEl?.value || 0, 10) || 0));

  estadoGeneracion = "play";
  actualizarLabelBtnGenerar();

  for (const b of todosLosBloques) {
    if (estadoGeneracion === "stop") break;
    const palabras = b.phrase?.palabras;
    if (!palabras || palabras.length === 0) continue;

    const numWords = palabras.length;
    const padX = PADDING_HORIZONTAL_FILA;
    const availW = Math.max(20, b.width - 2 * padX);
    const userStepX = b.pageIndex === 0 ? stepXIzq : stepXDer;

    const userNivelesY = b.pageIndex === 0
      ? Math.max(1, Math.min(4, parseInt(nivelesYIzqEl?.value || 2, 10)))
      : Math.max(1, Math.min(4, parseInt(nivelesYDerEl?.value || 2, 10)));

    const userAmpY = b.pageIndex === 0
      ? normalizarAmplitudVertical(ampYIzqEl?.value)
      : normalizarAmplitudVertical(ampYDerEl?.value);

    const stickerSize = globalStickerSize;
    const halfSize = Math.round(stickerSize / 2);

    const maxAmpY = Math.max(0, b.height - stickerSize - (MARGEN_VERTICAL_FILA * 2));
    const ampY = Math.min(userAmpY, maxAmpY);
    const rowCenterY = b.y + (b.height / 2) + offsetY + ((b.row - 2) * rowGapY);

    const stepXEfectivo = numWords > 1 ? Math.max(0, userStepX) : 0;
    const totalSpan = (numWords - 1) * stepXEfectivo;
    const startOffset = padX + Math.max(0, Math.round((availW - totalSpan) / 2));

    for (let i = 0; i < numWords; i++) {
      while (estadoGeneracion === "pause") {
        await new Promise((r) => setTimeout(r, 200));
      }
      if (estadoGeneracion === "stop") break;

      const palabra = palabras[i];
      let wordX;
      if (numWords === 1) {
        wordX = Math.round(b.x + b.width / 2 - halfSize);
      } else if (b.dir === "rtl") {
        wordX = Math.round(b.x + b.width - startOffset - i * stepXEfectivo - halfSize);
      } else {
        wordX = Math.round(b.x + startOffset + i * stepXEfectivo - halfSize);
      }

      // Respetar márgenes internos para que el sticker no toque las orillas laterales
      const minAllowedX = b.x + padX - halfSize;
      const maxAllowedX = b.x + b.width - padX - halfSize;
      if (minAllowedX <= maxAllowedX) {
        wordX = Math.max(minAllowedX, Math.min(wordX, maxAllowedX));
      }

      let factorY = 0.5;
      if (userNivelesY === 1 || numWords === 1) {
        factorY = 0.5;
      } else if (userNivelesY === 2) {
        factorY = (i % 2 === 0) ? 0 : 1;
      } else if (userNivelesY === 3) {
        const pat3 = [0, 0.5, 1, 0.5];
        factorY = pat3[i % pat3.length];
      } else if (userNivelesY >= 4) {
        const pat4 = [0, 0.33, 0.67, 1, 0.67, 0.33];
        factorY = pat4[i % pat4.length];
      }

      let wordY = Math.round(rowCenterY + ((factorY - 0.5) * ampY) - halfSize);

      // Ubicación vertical y zigzag en conectores de bajada hacia la fila inferior (filas 0 a 3)
      const esUltimo = esUltimoBloqueDeFila(b, todosLosBloques);
      if (esUltimo && b.row !== undefined && b.row < 4) {
        const rowGapRef = 20;
        if (numWords >= 3) {
          if (i === numWords - 2) {
            wordY += Math.round(rowGapRef * 0.55);
            const shiftX = Math.round(stickerSize * 0.28);
            wordX += (b.dir === "ltr" ? -shiftX : shiftX);
          } else if (i === numWords - 1) {
            wordY += Math.round(rowGapRef * 1.35 + (maxAmpY - ampY) * 0.2);
            const shiftX = Math.round(stickerSize * 0.28);
            wordX += (b.dir === "ltr" ? shiftX : -shiftX);
          }
        } else if (numWords === 2 && i === 1) {
          wordY += Math.round(rowGapRef * 1.1);
        }
      }


      wordX = limitarXAlBloque(wordX, stickerSize, b);

      // Si el usuario movió manualmente este sticker antes, conservar su ubicación exacta
      const manualPos = obtenerPosicionManual(b.pageIndex, b.blockIndex, i, palabra);
      let isManualPos = false;
      if (manualPos && Number.isFinite(manualPos.left) && Number.isFinite(manualPos.top)) {
        wordX = Math.round(manualPos.left);
        wordY = Math.round(manualPos.top);
        isManualPos = true;
      }

      await renderElementoEnCanvas(palabra, wordX, wordY, stickerSize, {
        pageIndex: b.pageIndex,
        blockIndex: b.blockIndex,
        sentenceId: b.sentenceId,
        wordIndex: i,
        totalWords: numWords,
        dir: b.dir,
        isManualPos
      });
      await new Promise((r) => setTimeout(r, 45));
    }
  }

  // Restaurar stickers libres de la biblioteca preservando su ubicación
  const targetLayer = stickersLayer || canvas;
  if (freeStickers.length > 0) {
    freeStickers.forEach((el) => {
      targetLayer.appendChild(el);
      hacerInteractuable(el);
      sincronizarEtiquetaSticker(el);
    });
  }

  // Ajuste final con las dimensiones reales de imágenes y chips de texto.
  recalcularPosicionPalabrasCanvas(null, false);

  estadoGeneracion = "stop";
  estaGenerando = false;
  actualizarLabelBtnGenerar();
  guardarDraftLocalStorage();
}

async function renderElementoEnCanvas(palabra, posX, posY, stickerSize = 42, meta = {}) {
  const container = stickersLayer || canvas;
  const url = await resolverUrlSticker(palabra);
  const preferredSize = obtenerTamanoStickerPreferido(palabra, stickerSize);

  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.className = "sticker";
    img.style.top = `${posY}px`;
    img.style.left = `${posX}px`;
    img.style.width = `${preferredSize}px`;
    img.style.height = `${preferredSize}px`;
    img.title = palabra;
    img.dataset.palabra = palabra;
    img.dataset.x = 0;
    img.dataset.y = 0;
    img.dataset.scale = 1;
    img.dataset.angle = 0;
    if (meta.isManualPos) img.dataset.manualPos = "true";
    if (meta.pageIndex !== undefined) img.dataset.pageIndex = meta.pageIndex;
    if (meta.blockIndex !== undefined) img.dataset.blockIndex = meta.blockIndex;
    if (meta.sentenceId !== undefined) img.dataset.sentenceId = meta.sentenceId;
    if (meta.wordIndex !== undefined) img.dataset.wordIndex = meta.wordIndex;
    if (meta.totalWords !== undefined) img.dataset.totalWords = meta.totalWords;
    if (meta.dir) img.dataset.dir = meta.dir;
    container.appendChild(img);
    hacerInteractuable(img);
    sincronizarEtiquetaSticker(img);
  } else {
    const chip = document.createElement("div");
    chip.textContent = palabra;
    chip.className = "draggable-text";
    chip.style.top = `${posY}px`;
    chip.style.left = `${posX}px`;
    if (preferredSize > 45) {
      chip.style.fontSize = "13px";
      chip.style.padding = "4px 8px";
    }
    chip.dataset.palabra = palabra;
    chip.dataset.x = 0;
    chip.dataset.y = 0;
    chip.dataset.scale = 1;
    chip.dataset.angle = 0;
    if (meta.isManualPos) chip.dataset.manualPos = "true";
    if (meta.pageIndex !== undefined) chip.dataset.pageIndex = meta.pageIndex;
    if (meta.blockIndex !== undefined) chip.dataset.blockIndex = meta.blockIndex;
    if (meta.sentenceId !== undefined) chip.dataset.sentenceId = meta.sentenceId;
    if (meta.wordIndex !== undefined) chip.dataset.wordIndex = meta.wordIndex;
    if (meta.totalWords !== undefined) chip.dataset.totalWords = meta.totalWords;
    if (meta.dir) chip.dataset.dir = meta.dir;
    container.appendChild(chip);
    hacerInteractuable(chip);
  }
}

// --- Slider flotante de tamaño del sticker seleccionado ---
let popupTamanoEl = null;

function asegurarPopupTamano() {
  if (popupTamanoEl) return popupTamanoEl;
  popupTamanoEl = document.getElementById("mcStickerSizePopup");
  if (!popupTamanoEl) return null;

  // Evitar que el slider deseleccione el sticker al hacer click
  popupTamanoEl.addEventListener("pointerdown", (e) => e.stopPropagation());
  popupTamanoEl.addEventListener("click", (e) => e.stopPropagation());

  const slider = document.getElementById("mcSelectedStickerSlider");
  slider?.addEventListener("input", (e) => {
    if (!palabraSeleccionadaElemento) return;
    const nuevoTamano = parseInt(e.target.value, 10);
    const palabra = obtenerPalabraElementoSticker(palabraSeleccionadaElemento);

    guardarTamanoStickerPreferido(palabra, nuevoTamano);
    aplicarTamanoAStickersMismaPalabra(palabra, nuevoTamano);

    posicionarPopupTamano(palabraSeleccionadaElemento);
    guardarDraftLocalStorageDebounced();
  });

  return popupTamanoEl;
}

function posicionarPopupTamano(el) {
  const popup = asegurarPopupTamano();
  if (!popup || !el) return;

  const x = parseFloat(el.style.left || 0);
  const y = parseFloat(el.style.top || 0);
  const w = parseFloat(el.style.width || el.offsetWidth || 48);
  const h = parseFloat(el.style.height || el.offsetHeight || 48);

  const centerX = x + w / 2;
  const popupWidth = popup.offsetWidth || 320;
  const halfPopup = popupWidth / 2;

  // Clampear X para que el popup nunca se salga del lienzo (1366px de ancho) ni se corte en las orillas
  const canvasW = 1366;
  const marginX = halfPopup + 12;
  const clampedX = Math.max(marginX, Math.min(centerX, canvasW - marginX));

  // Si está muy cerca del borde superior (< 60px), posicionarlo DEBAJO del sticker para que no se corte arriba
  const posY = y < 60 ? y + h + 14 : y - 46;

  popup.style.left = `${Math.round(clampedX)}px`;
  popup.style.top = `${Math.round(posY)}px`;
}

export function seleccionarElemento(el) {
  if (palabraSeleccionadaElemento && palabraSeleccionadaElemento !== el) {
    palabraSeleccionadaElemento.classList.remove("sticker--selected");
  }

  palabraSeleccionadaElemento = el;
  if (!el) { deseleccionarElemento(); return; }

  el.classList.add("sticker--selected");

  const popup = asegurarPopupTamano();
  if (!popup) return;

  const w = parseFloat(el.style.width || el.offsetWidth || obtenerTamanoStickerGlobal());
  const slider = document.getElementById("mcSelectedStickerSlider");
  if (slider) slider.value = Math.round(w);

  // Mostrar el nombre de la palabra en el popup
  const label = document.getElementById("mcStickerPopupLabel");
  if (label) {
    const palabra = el.dataset.palabra || el.title || el.getAttribute("alt") || el.textContent || "";
    label.textContent = palabra;
    label.title = palabra;
  }

  posicionarPopupTamano(el);
  popup.classList.remove("hidden");
}

export function deseleccionarElemento() {
  if (palabraSeleccionadaElemento) {
    palabraSeleccionadaElemento.classList.remove("sticker--selected");
    palabraSeleccionadaElemento = null;
  }
  const popup = document.getElementById("mcStickerSizePopup");
  if (popup) popup.classList.add("hidden");
}

// Drag & Drop fluido y optimizado
function hacerInteractuable(el) {
  let isDragging = false;
  let hasMoved = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  // Bloquear drag nativo de imagen HTML5 del navegador que causa trabas
  el.draggable = false;
  el.addEventListener("dragstart", (e) => e.preventDefault());

  const onPointerDown = (e) => {
    if (e.button === 2) return; // ignore right click
    e.preventDefault();
    isDragging = true;
    hasMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = parseFloat(el.style.left || 0);
    initialTop = parseFloat(el.style.top || 0);
    el.style.zIndex = 50;

    try {
      el.setPointerCapture(e.pointerId);
    } catch (_) {}

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    const diffX = e.clientX - startX;
    const diffY = e.clientY - startY;
    if (Math.abs(diffX) > 3 || Math.abs(diffY) > 3) {
      hasMoved = true;
    }
    const dx = diffX / zoomScale;
    const dy = diffY / zoomScale;
    el.style.left = `${Math.round(initialLeft + dx)}px`;
    el.style.top = `${Math.round(initialTop + dy)}px`;
    sincronizarEtiquetaSticker(el);

    // Si está seleccionado, sincronizar la posición del popup en tiempo real
    if (palabraSeleccionadaElemento === el) {
      posicionarPopupTamano(el);
    }
  };

  const onPointerUp = (e) => {
    if (!isDragging) return;
    isDragging = false;
    el.style.zIndex = el.classList.contains("draggable-text") ? 20 : 15;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch (_) {}

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);

    if (!hasMoved) {
      // Click simple sin desplazamiento: seleccionar elemento y mostrar slider de tamaño
      seleccionarElemento(el);
    } else {
      el.dataset.manualPos = "true";
      guardarPosicionManualSticker(el);
      sincronizarEtiquetaSticker(el);
      guardarDraftLocalStorageDebounced();
      if (palabraSeleccionadaElemento === el) {
        posicionarPopupTamano(el);
      }
    }
  };

  el.addEventListener("pointerdown", onPointerDown);

  // Context Menu Trigger
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    seleccionarElemento(el);
    mostrarContextMenu(e.clientX, e.clientY);
  });
}

// Context Menu Logic
const ctxMenu = document.getElementById("mcContextMenu");
function mostrarContextMenu(x, y) {
  if (!ctxMenu) return;
  ctxMenu.style.left = `${x}px`;
  ctxMenu.style.top = `${y}px`;
  ctxMenu.style.display = "block";
}

window.addEventListener("click", () => {
  if (ctxMenu) ctxMenu.style.display = "none";
});

// Deseleccionar al hacer click fuera en el fondo del lienzo
document.addEventListener("pointerdown", (e) => {
  if (e.target.closest("#mcStickerSizePopup") || e.target.closest("#mcContextMenu") || e.target.closest(".sticker") || e.target.closest(".draggable-text")) {
    return;
  }
  deseleccionarElemento();
});

// Deseleccionar o cerrar con tecla Escape
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    deseleccionarElemento();
    if (ctxMenu) ctxMenu.style.display = "none";
  }
});

// --- Gemini Image Generation (Using same API & config as PigPen / ImageCreator) ---
const GEMINI_IMAGE_MODEL_PRIMARY = "gemini-3.1-flash-image";
const GEMINI_IMAGE_MODEL_FALLBACK = "gemini-3-pro-image";
const GEMINI_IMAGE_MIN_INTERVAL_MS = 10000;
let geminiImageNextRequestAt = 0;
let geminiImageRequestGate = Promise.resolve();

function esErrorTemporalGemini(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.detail?.error || error?.code || "").toLowerCase();
  const message = String(error?.message || error?.detail?.message || "").toLowerCase();
  return status === 429
    || [502, 503, 504].includes(status)
    || /quota|resource.exhausted|too many requests|temporar|timeout|network|failed to fetch/.test(`${code} ${message}`);
}

function calcularEsperaGemini(error, retryIndex) {
  const serverDelay = Number(error?.detail?.retryAfterSeconds || 0) * 1000;
  if (serverDelay > 0) return Math.max(1000, Math.min(serverDelay, 60000));
  const baseDelay = Number(error?.status || 0) === 429 ? 5000 : 1500;
  return Math.max(1000, Math.min(baseDelay * (2 ** retryIndex), 32000));
}

async function esperarReintentoGemini(delayMs, shouldAbort) {
  const deadline = Date.now() + delayMs;
  while (Date.now() < deadline) {
    if (typeof shouldAbort === "function" && shouldAbort()) {
      throw new DOMException("Generación cancelada", "AbortError");
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(250, deadline - Date.now())));
  }
}

async function reservarTurnoGeminiImage({ onRetry, shouldAbort, model, attempt, totalAttempts }) {
  const previousRequest = geminiImageRequestGate;
  let releaseRequest;
  geminiImageRequestGate = new Promise((resolve) => {
    releaseRequest = resolve;
  });

  await previousRequest;
  try {
    const pacingDelayMs = Math.max(0, geminiImageNextRequestAt - Date.now());
    if (pacingDelayMs > 0) {
      if (typeof onRetry === "function") {
        onRetry({
          reason: "pacing",
          attempt,
          totalAttempts,
          delayMs: pacingDelayMs,
          model,
          switchedModel: false
        });
      }
      await esperarReintentoGemini(pacingDelayMs, shouldAbort);
    }
    return releaseRequest;
  } catch (error) {
    releaseRequest();
    throw error;
  }
}

let spanishEnglishTranslatorPromise = null;

async function translatePromptToEnglish(prompt) {
  const sourcePrompt = String(prompt || "").trim();
  if (!sourcePrompt) return "";
  const localTranslation = traducirPromptConfiguradoLocal(sourcePrompt);
  const TranslatorApi = globalThis.Translator;
  if (!TranslatorApi) {
    return localTranslation;
  }

  try {
    const options = { sourceLanguage: "es", targetLanguage: "en" };
    const availability = await TranslatorApi.availability(options);
    if (availability === "unavailable") return localTranslation;

    if (!spanishEnglishTranslatorPromise) {
      spanishEnglishTranslatorPromise = TranslatorApi.create(options).catch((error) => {
        spanishEnglishTranslatorPromise = null;
        throw error;
      });
    }

    const translator = await spanishEnglishTranslatorPromise;
    const translatedPrompt = String(await translator.translate(sourcePrompt)).trim();
    return translatedPrompt || localTranslation;
  } catch (error) {
    console.warn("[MindmapCreator] Traductor del navegador no disponible; se usa traducción local.", error);
    return localTranslation;
  }
}

function extractGeminiImageData(imageData = {}) {
  const response = imageData?.response && typeof imageData.response === "object" ? imageData.response : imageData;
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  for (const candidate of candidates) {
    for (const part of (candidate?.content?.parts || [])) {
      const inline = part?.inlineData || part?.inline_data;
      const mime = String(inline?.mimeType || inline?.mime_type || "").trim();
      const base64 = String(inline?.data || "").trim();
      if (mime && base64 && /^image\//i.test(mime)) {
        return `data:${mime};base64,${base64}`;
      }
    }
  }
  const finishReason = candidates.map((candidate) => candidate?.finishReason || candidate?.finish_reason).filter(Boolean).join(", ");
  const blockReason = response?.promptFeedback?.blockReason || response?.prompt_feedback?.block_reason || "";
  throw new Error(`No se recibió una imagen válida${blockReason ? `: solicitud bloqueada (${blockReason})` : finishReason ? `: ${finishReason}` : ""}.`);
}

async function generateGeminiImage(prompt, {
  aspectRatio = "1:1",
  imageSize = "1K",
  temperature = 0.58,
  model = GEMINI_IMAGE_MODEL_PRIMARY,
  transparent = true,
  onRetry = null,
  shouldAbort = null
} = {}) {
  const alternateModel = model === GEMINI_IMAGE_MODEL_FALLBACK
    ? GEMINI_IMAGE_MODEL_PRIMARY
    : GEMINI_IMAGE_MODEL_FALLBACK;
  const modelPlan = [model, alternateModel, model, alternateModel];
  let rawData = null;
  let lastError = null;

  for (let attemptIndex = 0; attemptIndex < modelPlan.length; attemptIndex++) {
    if (typeof shouldAbort === "function" && shouldAbort()) {
      throw new DOMException("Generación cancelada", "AbortError");
    }

    const attemptModel = modelPlan[attemptIndex];
    const releaseRequest = await reservarTurnoGeminiImage({
      onRetry,
      shouldAbort,
      model: attemptModel,
      attempt: attemptIndex + 1,
      totalAttempts: modelPlan.length
    });
    try {
      let response;
      try {
        response = await authFetchJson(buildGeminiApiUrl("/api/gemini/generate"), {
          method: "POST",
          body: {
            model: attemptModel,
            singleAttempt: true,
            payload: {
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                responseModalities: ["IMAGE"],
                imageConfig: { aspectRatio, imageSize },
                temperature
              }
            }
          }
        });
      } finally {
        geminiImageNextRequestAt = Date.now() + GEMINI_IMAGE_MIN_INTERVAL_MS;
        releaseRequest();
      }
      rawData = extractGeminiImageData(response);
      break;
    } catch (error) {
      lastError = error;
      const hasNextAttempt = attemptIndex < modelPlan.length - 1;
      if (!hasNextAttempt || !esErrorTemporalGemini(error) || error?.name === "AbortError") throw error;

      const delayMs = calcularEsperaGemini(error, attemptIndex);
      if (typeof onRetry === "function") {
        onRetry({
          attempt: attemptIndex + 2,
          totalAttempts: modelPlan.length,
          delayMs,
          model: modelPlan[attemptIndex + 1],
          switchedModel: modelPlan[attemptIndex + 1] !== attemptModel
        });
      }
      await esperarReintentoGemini(delayMs, shouldAbort);
    }
  }

  if (!rawData) throw lastError || new Error("Gemini no devolvió una imagen válida.");
  if (transparent) {
    try {
      return await procesarStickerTransparente(rawData);
    } catch (err) {
      console.warn("No se pudo procesar fondo transparente, usando original:", err);
      return rawData;
    }
  }
  return rawData;
}

async function actualizarImagenSeleccionada(triggerButton = null) {
  const targetEl = palabraSeleccionadaElemento;
  if (!targetEl) return;
  const palabra = targetEl.dataset.palabra || targetEl.textContent.trim();
  if (!palabra) return;

  const originalHtml = triggerButton?.innerHTML;
  if (triggerButton) {
    triggerButton.disabled = true;
    triggerButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
  }
  targetEl.style.opacity = "0.45";

  try {
    const dataUrl = await generateGeminiImage(construirPromptStickerSimple(palabra), { aspectRatio: "1:1", imageSize: "1K" });
    const cleanNombre = palabra.trim().toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").slice(0, 30);
    let stickerUrl = dataUrl;
    try {
      const refImg = ref(storage, `mindmap/${cleanNombre}.png`);
      await uploadString(refImg, dataUrl, "data_url");
      stickerUrl = await getDownloadURL(refImg);
      stickerIndex.set(cleanNombre, refImg);
      stickerCache.set(cleanNombre, stickerUrl);
      bibliotecaStickersCached = [];
    } catch (storageError) {
      console.warn("No se pudo actualizar la biblioteca, se usará la imagen en el lienzo:", storageError);
    }

    const img = reemplazarElementoConSticker(targetEl, stickerUrl, cleanNombre);
    img.title = palabra;
    deseleccionarElemento();
    guardarDraftLocalStorageDebounced();
  } catch (err) {
    targetEl.style.opacity = "1";
    alert(`No se pudo crear otra versión de “${palabra}”: ${err.message || "Revisa la conexión"}`);
  } finally {
    if (triggerButton) {
      triggerButton.disabled = false;
      triggerButton.innerHTML = originalHtml;
    }
  }
}

// Botones de rotación y restablecimiento (el popup nunca rota)
document.getElementById("mcRotateLeftSelectedSticker")?.addEventListener("click", () => {
  if (!palabraSeleccionadaElemento) return;
  const el = palabraSeleccionadaElemento;
  const prevAngle = parseFloat(el.dataset.angle || 0);
  const newAngle = (prevAngle - 15 + 360) % 360;
  el.dataset.angle = newAngle;
  el.style.transform = `rotate(${newAngle}deg)`;
  if (el.dataset.manualPos === "true") guardarPosicionManualSticker(el);
  guardarDraftLocalStorageDebounced();
});

document.getElementById("mcResetRotateSelectedSticker")?.addEventListener("click", () => {
  if (!palabraSeleccionadaElemento) return;
  const el = palabraSeleccionadaElemento;
  el.dataset.angle = 0;
  el.style.transform = "";
  if (el.dataset.manualPos === "true") guardarPosicionManualSticker(el);
  guardarDraftLocalStorageDebounced();
});

document.getElementById("mcRotateRightSelectedSticker")?.addEventListener("click", () => {
  if (!palabraSeleccionadaElemento) return;
  const el = palabraSeleccionadaElemento;
  const prevAngle = parseFloat(el.dataset.angle || 0);
  const newAngle = (prevAngle + 15) % 360;
  el.dataset.angle = newAngle;
  el.style.transform = `rotate(${newAngle}deg)`;
  if (el.dataset.manualPos === "true") guardarPosicionManualSticker(el);
  guardarDraftLocalStorageDebounced();
});

document.getElementById("mcCtxGenGemini")?.addEventListener("click", async () => {
  await actualizarImagenSeleccionada();
});

document.getElementById("mcCtxDelete")?.addEventListener("click", () => {
  if (palabraSeleccionadaElemento) {
    palabraSeleccionadaElemento.remove();
    deseleccionarElemento();
    guardarDraftLocalStorageDebounced();
  }
});

document.getElementById("mcCtxReplaceSticker")?.addEventListener("click", () => {
  const palabra = palabraSeleccionadaElemento?.dataset?.palabra || "";
  abrirDrawerStickers(palabra);
});

document.getElementById("mcCtxUploadSticker")?.addEventListener("click", () => {
  document.getElementById("mcUploadStickerInput")?.click();
});

// Playback Controls
document.getElementById("mcBtnGenerar")?.addEventListener("click", generarMindmapCompleto);
document.getElementById("mcBtnPlay")?.addEventListener("click", () => {
  if (estadoGeneracion === "pause") {
    estadoGeneracion = "play";
  } else {
    generarMindmapCompleto();
  }
});
document.getElementById("mcBtnPause")?.addEventListener("click", () => {
  estadoGeneracion = "pause";
});
document.getElementById("mcBtnStop")?.addEventListener("click", () => {
  estadoGeneracion = "stop";
});
document.getElementById("mcBtnLimpiar")?.addEventListener("click", () => {
  if (confirm("¿Seguro que deseas limpiar los stickers y palabras del lienzo?")) {
    limpiarPosicionesManuales();
    if (stickersLayer) {
      stickersLayer.innerHTML = "";
    } else {
      canvas.querySelectorAll(".sticker, .draggable-text").forEach((el) => el.remove());
    }
    estadoGeneracion = "stop";
    renderizarBloquesSvg();
    actualizarLabelBtnGenerar();
  }
});

// --- Drawer: Stickers & Biblioteca ---
const drawerStickers = document.getElementById("mcDrawerStickers");
const stickerGrid = document.getElementById("mcStickerGrid");
const stickerSearchInput = document.getElementById("mcStickerSearch");
const stickerViewButton = document.getElementById("mcBtnStickerView");
const stickerViewMenu = document.getElementById("mcStickerViewMenu");
const pageShell = document.querySelector(".mc-page-shell");
const MC_STICKER_VIEW_KEY = "mc_sticker_library_view";
const STICKER_VIEW_ICONS = {
  small: "fa-border-all",
  medium: "fa-table-cells",
  large: "fa-table-cells-large",
  list: "fa-list"
};
const STICKER_VIEW_LABELS = {
  small: "pequeñas",
  medium: "medianas",
  large: "grandes",
  list: "lista"
};
let stickerLibraryView = localStorage.getItem(MC_STICKER_VIEW_KEY) || "medium";
if (!STICKER_VIEW_ICONS[stickerLibraryView]) stickerLibraryView = "medium";

function aplicarVistaBiblioteca(view = "medium") {
  const nextView = STICKER_VIEW_ICONS[view] ? view : "medium";
  stickerLibraryView = nextView;
  if (stickerGrid) stickerGrid.dataset.view = nextView;
  stickerViewMenu?.querySelectorAll("[data-sticker-view]").forEach((option) => {
    option.setAttribute("aria-checked", String(option.dataset.stickerView === nextView));
  });
  const icon = stickerViewButton?.querySelector("i");
  if (icon) icon.className = `fas ${STICKER_VIEW_ICONS[nextView]} mc-icon--violet`;
  const viewLabel = STICKER_VIEW_LABELS[nextView];
  stickerViewButton?.setAttribute("title", `Vista de stickers: ${viewLabel}`);
  stickerViewButton?.setAttribute("aria-label", `Vista de stickers: ${viewLabel}`);
  localStorage.setItem(MC_STICKER_VIEW_KEY, nextView);
}

function cerrarMenuVistaBiblioteca() {
  if (stickerViewMenu) stickerViewMenu.hidden = true;
  stickerViewButton?.setAttribute("aria-expanded", "false");
}

aplicarVistaBiblioteca(stickerLibraryView);

stickerViewButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  if (!stickerViewMenu) return;
  stickerViewMenu.hidden = !stickerViewMenu.hidden;
  stickerViewButton.setAttribute("aria-expanded", String(!stickerViewMenu.hidden));
});

stickerViewMenu?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-sticker-view]");
  if (!option) return;
  aplicarVistaBiblioteca(option.dataset.stickerView);
  cerrarMenuVistaBiblioteca();
});

document.addEventListener("pointerdown", (event) => {
  if (stickerViewMenu?.hidden) return;
  if (stickerViewMenu?.contains(event.target) || stickerViewButton?.contains(event.target)) return;
  cerrarMenuVistaBiblioteca();
});
const quickLayoutPanel = document.getElementById("mcQuickLayoutPanel");
const quickLayoutButton = document.getElementById("mcBtnQuickLayout");

function cerrarPanelDistribucion() {
  quickLayoutPanel?.classList.add("hidden");
  quickLayoutButton?.setAttribute("aria-expanded", "false");
}

function alternarPanelDistribucion() {
  const willOpen = quickLayoutPanel?.classList.contains("hidden");
  quickLayoutPanel?.classList.toggle("hidden", !willOpen);
  quickLayoutButton?.setAttribute("aria-expanded", String(Boolean(willOpen)));
}

function sincronizarEspacioDrawerStickers() {
  const isOpen = Boolean(drawerStickers?.classList.contains("is-open"));
  const width = isOpen ? Math.round(drawerStickers.getBoundingClientRect().width) : 0;
  pageShell?.style.setProperty("--mc-tools-width", `${width}px`);
  pageShell?.classList.toggle("mc-tools-open", isOpen);
  document.body.style.setProperty("--mc-tools-width", `${width}px`);
  document.body.classList.toggle("mc-tools-open", isOpen);
}

function abrirDrawerStickers(filtro = "", tab = "library") {
  cerrarPanelDistribucion();
  seleccionarPestanaStickers(tab);
  drawerStickers.classList.add("is-open");
  sincronizarEspacioDrawerStickers();
  document.getElementById("mcBtnOpenStudioDrawer")?.setAttribute("aria-expanded", "true");
  if (stickerSearchInput) {
    stickerSearchInput.value = filtro;
  }
  if (tab === "library") cargarBibliotecaStickers(filtro);
}

const stickerTabButtons = Array.from(document.querySelectorAll("[data-mc-sticker-tab]"));
const stickerStudioPanel = document.getElementById("mcStickerStudioPanel");
const stickerLibraryPanel = document.getElementById("mcStickerLibraryPanel");
const stickerCreatePanel = document.getElementById("mcStickerCreatePanel");
const batchStickersModal = document.getElementById("mcModalBatchStickers");
const sidebarPanel = document.getElementById("mcSidebarPanel");
const drawerStickersResizer = document.getElementById("mcDrawerStickersResizer");

if (sidebarPanel && stickerStudioPanel && !stickerStudioPanel.contains(sidebarPanel)) {
  sidebarPanel.classList.remove("mc-sidebar-panel--pending-drawer");
  sidebarPanel.style.removeProperty("width");
  stickerStudioPanel.appendChild(sidebarPanel);
}

if (batchStickersModal && stickerCreatePanel && !stickerCreatePanel.contains(batchStickersModal)) {
  stickerCreatePanel.appendChild(batchStickersModal);
}

const MC_DRAWER_WIDTH_KEY = "mc_sticker_drawer_width";

function aplicarAnchoDrawerStickers(width) {
  const maxWidth = Math.max(360, Math.min(900, window.innerWidth - 24));
  const nextWidth = Math.max(360, Math.min(maxWidth, Number(width) || 620));
  drawerStickers?.style.setProperty("--mc-drawer-width", `${nextWidth}px`);
  if (drawerStickers?.classList.contains("is-open")) sincronizarEspacioDrawerStickers();
  return nextWidth;
}

aplicarAnchoDrawerStickers(localStorage.getItem(MC_DRAWER_WIDTH_KEY) || 620);

if (drawerStickersResizer && drawerStickers) {
  let resizingDrawer = false;
  let drawerStartX = 0;
  let drawerStartWidth = 0;

  drawerStickersResizer.addEventListener("pointerdown", (event) => {
    resizingDrawer = true;
    drawerStartX = event.clientX;
    drawerStartWidth = drawerStickers.getBoundingClientRect().width;
    drawerStickersResizer.classList.add("is-dragging");
    document.body.classList.add("mc-resizing");
    drawerStickersResizer.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  drawerStickersResizer.addEventListener("pointermove", (event) => {
    if (!resizingDrawer) return;
    aplicarAnchoDrawerStickers(drawerStartWidth + drawerStartX - event.clientX);
  });

  const detenerResizeDrawer = (event) => {
    if (!resizingDrawer) return;
    resizingDrawer = false;
    drawerStickersResizer.classList.remove("is-dragging");
    document.body.classList.remove("mc-resizing");
    localStorage.setItem(MC_DRAWER_WIDTH_KEY, String(Math.round(drawerStickers.getBoundingClientRect().width)));
    if (drawerStickersResizer.hasPointerCapture(event.pointerId)) drawerStickersResizer.releasePointerCapture(event.pointerId);
  };

  drawerStickersResizer.addEventListener("pointerup", detenerResizeDrawer);
  drawerStickersResizer.addEventListener("pointercancel", detenerResizeDrawer);
  drawerStickersResizer.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const currentWidth = drawerStickers.getBoundingClientRect().width;
    const delta = event.key === "ArrowLeft" ? 24 : -24;
    const nextWidth = aplicarAnchoDrawerStickers(currentWidth + delta);
    localStorage.setItem(MC_DRAWER_WIDTH_KEY, String(Math.round(nextWidth)));
  });
}

function seleccionarPestanaStickers(tab = "studio") {
  const panels = {
    studio: stickerStudioPanel,
    library: stickerLibraryPanel,
    create: stickerCreatePanel
  };
  const tabActiva = panels[tab] ? tab : "studio";
  Object.entries(panels).forEach(([panelTab, panel]) => {
    panel?.classList.toggle("hidden", panelTab !== tabActiva);
  });
  stickerTabButtons.forEach((button) => {
    const activa = button.dataset.mcStickerTab === tabActiva;
    button.classList.toggle("is-active", activa);
    button.setAttribute("aria-selected", String(activa));
    button.tabIndex = activa ? 0 : -1;
  });
}

stickerTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    seleccionarPestanaStickers(button.dataset.mcStickerTab || "library");
    drawerStickers?.classList.add("is-open");
    sincronizarEspacioDrawerStickers();
    if (button.dataset.mcStickerTab === "library") cargarBibliotecaStickers(stickerSearchInput?.value || "");
  });
  button.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const currentIndex = stickerTabButtons.indexOf(button);
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + offset + stickerTabButtons.length) % stickerTabButtons.length;
    const nextTab = stickerTabButtons[nextIndex]?.dataset.mcStickerTab || "studio";
    seleccionarPestanaStickers(nextTab);
    stickerTabButtons.find((tabButton) => tabButton.dataset.mcStickerTab === nextTab)?.focus();
  });
});

document.addEventListener("mc:sticker-workspace-open", (event) => {
  seleccionarPestanaStickers(event.detail?.tab || "create");
  drawerStickers?.classList.add("is-open");
  sincronizarEspacioDrawerStickers();
  document.getElementById("mcBtnOpenStudioDrawer")?.setAttribute("aria-expanded", "true");
});

document.addEventListener("mc:sticker-workspace-close", () => {
  drawerStickers?.classList.remove("is-open");
  sincronizarEspacioDrawerStickers();
  document.getElementById("mcBtnOpenStudioDrawer")?.setAttribute("aria-expanded", "false");
});

document.getElementById("mcBtnOpenStudioDrawer")?.addEventListener("click", () => abrirDrawerStickers("", "studio"));
quickLayoutButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  alternarPanelDistribucion();
});
document.getElementById("mcCloseQuickLayout")?.addEventListener("click", cerrarPanelDistribucion);
document.addEventListener("pointerdown", (event) => {
  if (quickLayoutPanel?.classList.contains("hidden")) return;
  if (quickLayoutPanel?.contains(event.target) || quickLayoutButton?.contains(event.target)) return;
  cerrarPanelDistribucion();
});
document.getElementById("mcCloseStickerDrawer")?.addEventListener("click", () => {
  drawerStickers?.classList.remove("is-open");
  sincronizarEspacioDrawerStickers();
  document.getElementById("mcBtnOpenStudioDrawer")?.setAttribute("aria-expanded", "false");
});

// Cerrar drawer al hacer clic fuera o presionar Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    cerrarPanelDistribucion();
    cerrarMenuAccionesMindmap();
    drawerStickers?.classList.remove("is-open");
    sincronizarEspacioDrawerStickers();
    document.getElementById("mcBtnOpenStudioDrawer")?.setAttribute("aria-expanded", "false");
    drawerSaved?.classList.remove("is-open");
    modalSave?.classList.remove("is-open");
    modalCommunityMindmaps?.classList.remove("is-open");
    modalExportPNG?.classList.remove("is-open");
    document.getElementById("mcModalBatchStickers")?.classList.remove("is-open");
  }
});

document.addEventListener("pointerdown", (e) => {
  if (drawerStickers?.classList.contains("is-open")) {
    const isInsideDrawer = drawerStickers.contains(e.target);
    const isTriggerBtn = document.getElementById("mcBtnOpenStudioDrawer")?.contains(e.target);
    if (!isInsideDrawer && !isTriggerBtn) {
      drawerStickers.classList.remove("is-open");
      sincronizarEspacioDrawerStickers();
      document.getElementById("mcBtnOpenStudioDrawer")?.setAttribute("aria-expanded", "false");
    }
  }
  if (drawerSaved?.classList.contains("is-open")) {
    const isInsideSaved = drawerSaved.contains(e.target);
    const isTriggerSaved = document.getElementById("mcBtnSavedMindmaps")?.contains(e.target);
    if (!isInsideSaved && !isTriggerSaved) {
      drawerSaved.classList.remove("is-open");
    }
  }
});

stickerSearchInput?.addEventListener("input", () => {
  cargarBibliotecaStickers(stickerSearchInput.value.trim().toLowerCase());
});

let bibliotecaStickersCached = [];

function insertarStickerBibliotecaEnCanvas(sticker, clientX, clientY) {
  if (!canvas || !sticker?.url) return;
  const rect = canvas.getBoundingClientRect();
  const size = obtenerTamanoStickerPreferido(sticker.name, obtenerTamanoStickerGlobal());
  const x = Math.round((clientX - rect.left) / zoomScale - size / 2);
  const y = Math.round((clientY - rect.top) / zoomScale - size / 2);
  const img = document.createElement("img");
  img.src = sticker.url;
  img.className = "sticker";
  img.style.left = `${x}px`;
  img.style.top = `${y}px`;
  img.style.width = `${size}px`;
  img.style.height = `${size}px`;
  img.dataset.palabra = sticker.name;
  img.title = sticker.name;
  img.dataset.freeSticker = "true";
  img.dataset.manualPos = "true";
  guardarPosicionManualSticker(img);
  (stickersLayer || canvas).appendChild(img);
  hacerInteractuable(img);
  sincronizarEtiquetaSticker(img);
  seleccionarElemento(img);
  guardarDraftLocalStorageDebounced();
}

function activarArrastreStickerBiblioteca(card, sticker) {
  card.draggable = true;
  card.addEventListener("dragstart", (e) => {
    e.dataTransfer?.setData("application/x-mc-sticker", JSON.stringify(sticker));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
    card.classList.add("is-dragging");
  });
  card.addEventListener("dragend", () => card.classList.remove("is-dragging"));

  let pointerDown = false;
  let ghost = null;
  card.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    pointerDown = true;
    ghost = document.createElement("img");
    ghost.src = sticker.url;
    ghost.alt = "";
    ghost.className = "mc-sticker-drag-ghost";
    document.body.appendChild(ghost);
    ghost.style.left = `${e.clientX}px`;
    ghost.style.top = `${e.clientY}px`;
    card.setPointerCapture?.(e.pointerId);
  });
  card.addEventListener("pointermove", (e) => {
    if (!pointerDown || !ghost) return;
    ghost.style.left = `${e.clientX}px`;
    ghost.style.top = `${e.clientY}px`;
  });
  card.addEventListener("pointerup", (e) => {
    if (!pointerDown) return;
    pointerDown = false;
    ghost?.remove();
    ghost = null;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (canvas && (target === canvas || canvas.contains(target))) {
      insertarStickerBibliotecaEnCanvas(sticker, e.clientX, e.clientY);
    }
  });
  card.addEventListener("pointercancel", () => {
    pointerDown = false;
    ghost?.remove();
    ghost = null;
  });
}

canvas?.addEventListener("dragover", (e) => {
  if (Array.from(e.dataTransfer?.types || []).includes("application/x-mc-sticker")) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
});

canvas?.addEventListener("drop", (e) => {
  const raw = e.dataTransfer?.getData("application/x-mc-sticker");
  if (!raw) return;
  e.preventDefault();
  try {
    insertarStickerBibliotecaEnCanvas(JSON.parse(raw), e.clientX, e.clientY);
  } catch (_) {}
});

async function cargarBibliotecaStickers(filtro = "") {
  if (!stickerGrid) return;
  aplicarVistaBiblioteca(stickerLibraryView);

  if (bibliotecaStickersCached.length === 0) {
    try {
      const folderRef = ref(storage, "mindmap/");
      const result = await listAll(folderRef);
      const items = await Promise.all(
        result.items.map(async (itemRef) => {
          const url = await getDownloadURL(itemRef);
          const name = itemRef.name.replace(/\.png$/i, "");
          return { name, url };
        })
      );
      bibliotecaStickersCached = items;
    } catch (err) {
      console.warn("Error cargando biblioteca de stickers:", err);
      stickerGrid.innerHTML = `<p class="text-xs text-red-400 col-span-full">No se pudo cargar la biblioteca.</p>`;
      return;
    }
  }

  const query = filtro.toLowerCase();
  const filtrados = query
    ? bibliotecaStickersCached.filter((s) => s.name.toLowerCase().includes(query))
    : bibliotecaStickersCached;

  stickerGrid.innerHTML = "";
  if (filtrados.length === 0) {
    stickerGrid.innerHTML = `<p class="text-xs text-muted-foreground col-span-full text-center py-4">No se encontraron stickers.</p>`;
    return;
  }

  filtrados.forEach((st) => {
    const card = document.createElement("div");
    card.className = "mc-sticker-item";
    card.title = `Arrastra "${st.name}" al lienzo`;
    card.innerHTML = `
      <img src="${st.url}" alt="${escapeHtml(st.name)}" loading="lazy">
      <span>${escapeHtml(st.name)}</span>
    `;

    activarArrastreStickerBiblioteca(card, st);

    stickerGrid.appendChild(card);
  });
}

// Subida de stickers
document.getElementById("mcUploadStickerInput")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const defaultName = palabraSeleccionadaElemento?.dataset?.palabra || file.name.replace(/\.[^/.]+$/, "");
  const nombre = prompt("¿Qué palabra o concepto representa este sticker?", defaultName);
  if (!nombre || !nombre.trim()) return;

  const cleanName = nombre.trim().toLowerCase();
  try {
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        let dataUrl = reader.result;
        try {
          dataUrl = await procesarStickerTransparente(dataUrl);
        } catch (_) {}
        const refImg = ref(storage, `mindmap/${cleanName}.png`);
        await uploadString(refImg, dataUrl, "data_url");
        alert(`✅ Sticker "${cleanName}" guardado.`);
        bibliotecaStickersCached = []; // invalidar cache
        cargarBibliotecaStickers();
      } catch (err) {
        alert(`No se pudo guardar el sticker: ${err.message || "Revisa la conexión"}`);
      }
    };
    reader.readAsDataURL(file);
  } catch (err) {
      alert("No se pudo guardar el sticker. Revisa la conexión.");
  }
});

// --- Drawer: Mis MindMaps (Firestore) ---
const drawerSaved = document.getElementById("mcDrawerSaved");
const savedList = document.getElementById("mcSavedList");

function actualizarMindmapActivoEnListas() {
  document.querySelectorAll(".mc-sessions-item[data-mindmap-id], .mc-saved-item[data-mindmap-id]").forEach((item) => {
    const isActive = Boolean(mindmapActualId) && item.dataset.mindmapId === String(mindmapActualId);
    item.classList.toggle("is-active", isActive);
    if (isActive) item.setAttribute("aria-current", "true");
    else item.removeAttribute("aria-current");
  });
}

function actualizarTituloSesionActiva(nombre = "") {
  mindmapActualNombre = String(nombre || "").trim();
  if (headerTitleEl) headerTitleEl.textContent = mindmapActualNombre || "MindMaps Creator";
}

function establecerMindmapActivo(id, nombre = "", esPropio = true) {
  mindmapActualId = id ? String(id) : null;
  mindmapActualEsPropio = mindmapActualId ? Boolean(esPropio) : true;
  actualizarTituloSesionActiva(mindmapActualId ? nombre : "");
  actualizarMindmapActivoEnListas();
}

function normalizarDatosAcademicos(data = {}) {
  const academico = data.academico || {};
  return {
    nivel: data.nivel || academico.nivel || "Primaria",
    grado: data.grado || academico.grado || "Primero",
    trimestre: data.trimestre || academico.trimestre || "Trim 1",
    unidad: data.unidad || academico.unidad || "Unidad 1"
  };
}

let contextoMenuMindmap = null;
const menuAccionesMindmap = document.createElement("div");
menuAccionesMindmap.className = "mc-mindmap-actions-menu";
menuAccionesMindmap.setAttribute("role", "menu");
menuAccionesMindmap.hidden = true;
menuAccionesMindmap.innerHTML = `
  <button type="button" role="menuitem" data-action="duplicate"><i class="fas fa-copy"></i><span>Duplicar</span></button>
  <button type="button" role="menuitem" data-action="edit"><i class="fas fa-pen"></i><span>Editar</span></button>
  <button type="button" role="menuitem" data-action="delete"><i class="fas fa-trash"></i><span>Eliminar</span></button>
`;
document.body.appendChild(menuAccionesMindmap);

function cerrarMenuAccionesMindmap() {
  contextoMenuMindmap?.trigger?.setAttribute("aria-expanded", "false");
  contextoMenuMindmap = null;
  menuAccionesMindmap.hidden = true;
}

function abrirMenuAccionesMindmap(trigger, id, data) {
  if (contextoMenuMindmap?.trigger === trigger && !menuAccionesMindmap.hidden) {
    cerrarMenuAccionesMindmap();
    return;
  }
  cerrarMenuAccionesMindmap();
  contextoMenuMindmap = { trigger, id, data };
  trigger.setAttribute("aria-expanded", "true");
  menuAccionesMindmap.hidden = false;
  const rect = trigger.getBoundingClientRect();
  const menuWidth = menuAccionesMindmap.offsetWidth;
  const menuHeight = menuAccionesMindmap.offsetHeight;
  const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
  const top = rect.bottom + menuHeight + 8 <= window.innerHeight
    ? rect.bottom + 4
    : Math.max(8, rect.top - menuHeight - 4);
  menuAccionesMindmap.style.left = `${left}px`;
  menuAccionesMindmap.style.top = `${top}px`;
  menuAccionesMindmap.querySelector("button")?.focus();
}

async function duplicarMindmap(id, data) {
  if (!currentUser) return;
  const nombre = `${data.nombre || "MindMap"} (copia)`;
  const savedDoc = await addDoc(collection(firestore, "mindmaps"), limpiarDatosFirestore({
    uid: currentUser.uid,
    nombre,
    textoParte1: data.textoParte1 || "",
    textoParte2: data.textoParte2 || "",
    creado: serverTimestamp(),
    actualizado: serverTimestamp(),
    contenido: Array.isArray(data.contenido) ? data.contenido : [],
    config: data.config || {},
    ...camposAcademicosFirestore(normalizarDatosAcademicos(data))
  }));
  establecerMindmapActivo(savedDoc.id, nombre);
  restaurarMindmap({ ...data, nombre });
  statusBadge.textContent = `Cargado: ${nombre}`;
  guardarDraftLocalStorage();
  await cargarMindmapsGuardados();
}

function editarMindmap(id, data) {
  abrirModalDatosAcademicos("edit", { id, data });
}

async function eliminarMindmap(id, data) {
  if (!confirm(`¿Eliminar el MindMap "${data.nombre || "Sin título"}"?`)) return;
  await deleteDoc(doc(firestore, "mindmaps", id));
  if (mindmapActualId === id) {
    establecerMindmapActivo(null);
    statusBadge.textContent = "Borrador nuevo";
    guardarDraftLocalStorage();
  }
  await cargarMindmapsGuardados();
}

function crearBotonMenuMindmap(id, data) {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "mc-btn mc-btn--ghost mc-btn-icon mc-session-menu-trigger";
  trigger.title = "Acciones del MindMap";
  trigger.setAttribute("aria-label", `Acciones para ${data.nombre || "MindMap"}`);
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML = `<i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>`;
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    abrirMenuAccionesMindmap(trigger, id, data);
  });
  return trigger;
}

menuAccionesMindmap.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || !contextoMenuMindmap) return;
  const { id, data } = contextoMenuMindmap;
  const action = button.dataset.action;
  cerrarMenuAccionesMindmap();
  try {
    if (action === "duplicate") await duplicarMindmap(id, data);
    if (action === "edit") editarMindmap(id, data);
    if (action === "delete") await eliminarMindmap(id, data);
  } catch (err) {
    console.error(`No se pudo ${action} el MindMap:`, err);
    alert("No se pudo completar la acción. Revisa la conexión.");
  }
});

document.addEventListener("pointerdown", (event) => {
  if (!menuAccionesMindmap.hidden && !menuAccionesMindmap.contains(event.target) && !event.target.closest(".mc-session-menu-trigger")) {
    cerrarMenuAccionesMindmap();
  }
});

document.getElementById("mcBtnSavedMindmaps")?.addEventListener("click", () => {
  drawerSaved.classList.add("is-open");
  cargarMindmapsGuardados();
});

document.getElementById("mcCloseSavedDrawer")?.addEventListener("click", () => {
  drawerSaved.classList.remove("is-open");
});

async function cargarMindmapsGuardados() {
  const sessionsList = document.getElementById("mcSessionsList");
  const targets = [savedList, sessionsList].filter(Boolean);
  if (targets.length === 0) return;

  targets.forEach((list) => {
    list.innerHTML = `<div class="text-xs text-center text-muted-foreground py-6">Consultando tus MindMaps...</div>`;
  });

  if (!currentUser) {
    targets.forEach((list) => {
      list.innerHTML = `<div class="text-xs text-center text-amber-500 py-6">Inicia sesión para ver tus MindMaps guardados.</div>`;
    });
    return;
  }

  try {
    // Ordenar en cliente permite recuperar documentos antiguos que perdieron
    // el campo `creado` durante una actualización completa con setDoc.
    const q = query(
      collection(firestore, "mindmaps"),
      where("uid", "==", currentUser.uid)
    );
    const snap = await getDocs(q);

    targets.forEach((list) => {
      list.innerHTML = "";
    });

    if (snap.empty) {
      targets.forEach((list) => {
        list.innerHTML = `<div class="text-xs text-center text-muted-foreground py-6">No tienes MindMaps guardados aún.</div>`;
      });
      return;
    }

    const timestampMs = (value) => {
      if (typeof value?.toMillis === "function") return value.toMillis();
      if (typeof value?.toDate === "function") return value.toDate().getTime();
      if (value instanceof Date) return value.getTime();
      return Number(value) || 0;
    };
    const docsOrdenados = [...snap.docs].sort((a, b) => {
      const dataA = a.data();
      const dataB = b.data();
      return timestampMs(dataB.actualizado || dataB.creado) - timestampMs(dataA.actualizado || dataA.creado);
    });

    docsOrdenados.forEach((docSnap, docIndex) => {
      const data = docSnap.data();
      const id = docSnap.id;
      const fechaReferencia = data.actualizado || data.creado;
      const fecha = fechaReferencia?.toDate ? fechaReferencia.toDate().toLocaleDateString() : "Reciente";
      const totalItems = data.contenido?.length || 0;
      const isActive = (mindmapActualId === id);
      if (isActive && data.nombre) actualizarTituloSesionActiva(data.nombre);

      // Renderizar en Drawer (si está abierto)
      if (savedList) {
        const cardDrawer = document.createElement("div");
        cardDrawer.className = `mc-saved-item ${isActive ? "is-active" : ""}`;
        cardDrawer.dataset.mindmapId = id;
        if (isActive) cardDrawer.setAttribute("aria-current", "true");
        cardDrawer.innerHTML = `
          <div class="mc-saved-item__info">
            <div class="mc-saved-item__title">
              <i class="fas fa-file-lines mc-session-file-icon ${docIndex % 2 === 0 ? "mc-session-file-icon--blue" : "mc-session-file-icon--magenta"}"></i>
              ${escapeHtml(data.nombre || "Sin título")}
            </div>
            <div class="mc-saved-item__date"><i class="fas fa-calendar-alt"></i> ${fecha} • ${totalItems} elementos</div>
          </div>
        `;
        cardDrawer.appendChild(crearBotonMenuMindmap(id, data));
        cardDrawer.querySelector(".mc-saved-item__info").onclick = () => {
          establecerMindmapActivo(id, data.nombre || "MindMap");
          restaurarMindmap(data);
          drawerSaved?.classList.remove("is-open");
        };
        savedList.appendChild(cardDrawer);
      }

      // Renderizar en Panel de Sesiones Lateral
      if (sessionsList) {
        const itemSession = document.createElement("div");
        itemSession.className = `mc-sessions-item ${isActive ? "is-active" : ""}`;
        itemSession.dataset.mindmapId = id;
        if (isActive) itemSession.setAttribute("aria-current", "true");
        itemSession.innerHTML = `
          <div class="mc-sessions-item__info">
            <div class="mc-sessions-item__title" title="${escapeHtml(data.nombre || "Sin título")}">
              <i class="fas fa-file-lines mc-session-file-icon ${docIndex % 2 === 0 ? "mc-session-file-icon--blue" : "mc-session-file-icon--magenta"}"></i>
              ${escapeHtml(data.nombre || "Sin título")}
            </div>
            <div class="mc-sessions-item__meta">${fecha} • ${totalItems} items</div>
          </div>
          <span class="mc-sessions-item__active-indicator" title="MindMap activo" aria-hidden="true">
            <i class="fas fa-circle-check"></i>
          </span>
        `;
        itemSession.appendChild(crearBotonMenuMindmap(id, data));
        itemSession.querySelector(".mc-sessions-item__info").onclick = () => {
          establecerMindmapActivo(id, data.nombre || "MindMap");
          restaurarMindmap(data);
        };
        sessionsList.appendChild(itemSession);
      }
    });
    const canvasSinContenido = !canvas?.querySelector(".sticker, .draggable-text");
    if (mindmapActualId && canvasSinContenido) {
      const activeDoc = docsOrdenados.find((docSnap) => docSnap.id === mindmapActualId);
      const activeData = activeDoc?.data();
      if (activeData && Array.isArray(activeData.contenido) && activeData.contenido.length > 0) {
        establecerMindmapActivo(activeDoc.id, activeData.nombre || "MindMap");
        restaurarMindmap(activeData);
      }
    }
    actualizarMindmapActivoEnListas();
  } catch (err) {
    console.error("Error al cargar mindmaps:", err);
    targets.forEach((list) => {
      list.innerHTML = `<div class="text-xs text-center text-red-400 py-6">Error al cargar tus mapas guardados.</div>`;
    });
  }
}

const modalCommunityMindmaps = document.getElementById("mcModalCommunityMindmaps");
const communityUserSelect = document.getElementById("mcCommunityUserSelect");
const communityMindmapsList = document.getElementById("mcCommunityMindmapsList");

function resolverNombreUsuario(data = {}, fallback = "Usuario") {
  return String(
    data.fullName || data.nombre || data.name || data.displayName || data.userName || data.email || fallback
  ).trim() || fallback;
}

async function cargarUsuariosCommunity() {
  if (!communityUserSelect || !communityMindmapsList || !currentUser) return;
  communityUserSelect.innerHTML = `<option value="">Cargando usuarios...</option>`;
  communityMindmapsList.innerHTML = `<p class="mc-community-empty">Selecciona un usuario para consultar sus MindMaps.</p>`;
  try {
    const usersSnap = await getDocs(collection(firestore, "users"));
    const usuarios = usersSnap.docs
      .map((userDoc) => {
        const data = userDoc.data() || {};
        return {
          uid: String(data.uid || userDoc.id),
          nombre: resolverNombreUsuario(data, userDoc.id),
          email: String(data.email || "")
        };
      })
      .filter((user) => user.uid && user.uid !== currentUser.uid && user.email !== currentUser.email)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    communityUserSelect.innerHTML = `<option value="">Selecciona un usuario</option>`;
    usuarios.forEach((user) => {
      const option = document.createElement("option");
      option.value = user.uid;
      option.textContent = user.nombre;
      option.dataset.userName = user.nombre;
      communityUserSelect.appendChild(option);
    });
    if (usuarios.length === 0) {
      communityUserSelect.innerHTML = `<option value="">No hay otros usuarios disponibles</option>`;
    }
  } catch (err) {
    console.error("No se pudieron cargar los usuarios:", err);
    communityUserSelect.innerHTML = `<option value="">No se pudieron cargar los usuarios</option>`;
    communityMindmapsList.innerHTML = `<p class="mc-community-empty">No tienes permiso para consultar otros usuarios.</p>`;
  }
}

async function cargarMindmapsCommunity(uid, nombreUsuario) {
  if (!communityMindmapsList) return;
  if (!uid) {
    communityMindmapsList.innerHTML = `<p class="mc-community-empty">Selecciona un usuario para consultar sus MindMaps.</p>`;
    return;
  }
  communityMindmapsList.innerHTML = `<p class="mc-community-empty">Consultando MindMaps...</p>`;
  try {
    const mapsSnap = await getDocs(query(collection(firestore, "mindmaps"), where("uid", "==", uid)));
    const maps = [...mapsSnap.docs].sort((a, b) => {
      const aDate = a.data().actualizado || a.data().creado;
      const bDate = b.data().actualizado || b.data().creado;
      const toMs = (value) => typeof value?.toMillis === "function" ? value.toMillis() : 0;
      return toMs(bDate) - toMs(aDate);
    });
    communityMindmapsList.innerHTML = "";
    if (maps.length === 0) {
      communityMindmapsList.innerHTML = `<p class="mc-community-empty">${escapeHtml(nombreUsuario)} no tiene MindMaps guardados.</p>`;
      return;
    }
    maps.forEach((mapDoc) => {
      const data = mapDoc.data();
      const academic = normalizarDatosAcademicos(data);
      const item = document.createElement("button");
      item.type = "button";
      item.className = "mc-community-item";
      item.innerHTML = `
        <span class="mc-community-item__info">
          <span class="mc-community-item__title">${escapeHtml(data.nombre || "Sin título")}</span>
          <span class="mc-community-item__meta">${escapeHtml(academic.nivel)} · ${escapeHtml(academic.grado)} · ${escapeHtml(academic.trimestre)} · ${escapeHtml(academic.unidad)}</span>
        </span>
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
      `;
      item.addEventListener("click", () => {
        establecerMindmapActivo(mapDoc.id, data.nombre || "MindMap", false);
        restaurarMindmap(data);
        statusBadge.textContent = `Consulta: ${data.nombre || "MindMap"} · ${nombreUsuario}`;
        modalCommunityMindmaps?.classList.remove("is-open");
      });
      communityMindmapsList.appendChild(item);
    });
  } catch (err) {
    console.error("No se pudieron cargar los MindMaps del usuario:", err);
    communityMindmapsList.innerHTML = `<p class="mc-community-empty">No se pudieron consultar los MindMaps de este usuario.</p>`;
  }
}

document.getElementById("mcBtnCommunityMindmaps")?.addEventListener("click", () => {
  if (!currentUser) {
    alert("Inicia sesión para consultar MindMaps de otros usuarios.");
    return;
  }
  modalCommunityMindmaps?.classList.add("is-open");
  cargarUsuariosCommunity();
});

document.getElementById("mcCloseCommunityMindmaps")?.addEventListener("click", () => {
  modalCommunityMindmaps?.classList.remove("is-open");
});

communityUserSelect?.addEventListener("change", () => {
  const option = communityUserSelect.selectedOptions[0];
  cargarMindmapsCommunity(communityUserSelect.value, option?.dataset.userName || option?.textContent || "Usuario");
});

function asegurarCapasCanvas() {
  let sSvg = document.getElementById("mcBlocksSvg");
  let sLayer = document.getElementById("mcStickersLayer");
  if (!sSvg && canvas) {
    sSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    sSvg.id = "mcBlocksSvg";
    sSvg.setAttribute("class", "mc-blocks-layer");
    sSvg.setAttribute("viewBox", "0 0 1366 904");
    sSvg.setAttribute("preserveAspectRatio", "none");
    canvas.prepend(sSvg);
  }
  if (!sLayer && canvas) {
    sLayer = document.createElement("div");
    sLayer.id = "mcStickersLayer";
    sLayer.className = "mc-stickers-layer";
    canvas.appendChild(sLayer);
  }
  return { sSvg, sLayer };
}

const MC_STORAGE_DRAFT_KEY = "mc_draft_mindmap";
let draftSaveTimer = null;

function guardarDraftLocalStorage() {
  let draftData = null;
  try {
    const { sLayer } = asegurarCapasCanvas();
    const target = sLayer || stickersLayer || canvas;
    const items = Array.from(target.querySelectorAll(".sticker, .draggable-text")).map((el) => ({
      tag: el.tagName,
      text: el.textContent || "",
      palabra: el.dataset.palabra || el.textContent || "",
      top: parseFloat(el.style.top || 0),
      left: parseFloat(el.style.left || 0),
      width: parseFloat(el.style.width || 42),
      height: parseFloat(el.style.height || 42),
      src: el.tagName === "IMG" ? normalizarFuenteImagenPersistente(el.src) : null,
      title: el.title || "",
      pageIndex: el.dataset.pageIndex,
      blockIndex: el.dataset.blockIndex,
      sentenceId: el.dataset.sentenceId,
      wordIndex: el.dataset.wordIndex,
      totalWords: el.dataset.totalWords,
      dir: el.dataset.dir,
      manualPos: el.dataset.manualPos === "true" || el.dataset.manualPos === true,
      freeSticker: el.dataset.freeSticker === "true" || el.dataset.freeSticker === true,
      angle: el.dataset.angle ? parseFloat(el.dataset.angle) : 0
    }));

    draftData = {
      textoParte1: textoParte1El?.value || "",
      textoParte2: textoParte2El?.value || "",
      stepXIzq: stepXIzqEl?.value || "75",
      nivelesYIzq: nivelesYIzqEl?.value || "2",
      ampYIzq: ampYIzqEl?.value || "48",
      stepXDer: stepXDerEl?.value || "75",
      nivelesYDer: nivelesYDerEl?.value || "2",
      ampYDer: ampYDerEl?.value || "48",
      rowGapY: rowGapYEl?.value || "0",
      offsetY: offsetYEl?.value || "0",
      bajarMismoBloque: true,
      modoPlantilla: modoPlantillaEl?.value || "static",
      mostrarEtiquetas: checkEtiquetasEl ? checkEtiquetasEl.checked : true,
      stickerSizeGlobal: stickerSizeGlobalEl?.value || "42",
      stickerSizesByWord: obtenerTamanosStickerMindmapActual(),
      mindmapActualId: mindmapActualId || null,
      mindmapActualNombre: mindmapActualNombre || "",
      mindmapActualEsPropio,
      mindmapActualAcademico: { ...mindmapActualAcademico },
      contenido: items,
      updatedAt: Date.now()
    };

    localStorage.setItem(MC_STORAGE_DRAFT_KEY, JSON.stringify(draftData));
  } catch (err) {
    const esCuotaExcedida = err?.name === "QuotaExceededError" || err?.code === 22;
    if (!esCuotaExcedida || !draftData) {
      console.warn("No se pudo guardar el borrador en localStorage:", err);
      return;
    }

    try {
      const contenidoLigero = draftData.contenido.map((item) => ({
        ...item,
        src: typeof item.src === "string" && /^(data:|blob:)/i.test(item.src) ? null : item.src
      }));
      localStorage.removeItem(MC_STORAGE_DRAFT_KEY);
      localStorage.setItem(MC_STORAGE_DRAFT_KEY, JSON.stringify({
        ...draftData,
        contenido: contenidoLigero,
        contenidoOptimizado: true
      }));
    } catch (fallbackError) {
      try {
        localStorage.setItem(MC_STORAGE_DRAFT_KEY, JSON.stringify({
          ...draftData,
          contenido: [],
          contenidoOptimizado: true
        }));
      } catch (minimalError) {
        console.warn("No se pudo guardar ni el borrador mínimo en localStorage:", minimalError || fallbackError);
      }
    }
  }
}

function guardarDraftLocalStorageDebounced() {
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(guardarDraftLocalStorage, 350);
}

function cargarDraftLocalStorage() {
  try {
    const raw = localStorage.getItem(MC_STORAGE_DRAFT_KEY);
    if (!raw) return false;
    const draft = JSON.parse(raw);
    if (!draft || (typeof draft.textoParte1 !== "string" && typeof draft.textoParte2 !== "string" && !Array.isArray(draft.contenido))) {
      return false;
    }

    if (typeof draft.textoParte1 === "string" && textoParte1El) textoParte1El.value = draft.textoParte1;
    if (typeof draft.textoParte2 === "string" && textoParte2El) textoParte2El.value = draft.textoParte2;
    aplicarConfigDistribucion(draft);
    if (draft.bajarMismoBloque !== undefined && checkBajarMismoBloqueEl) {
      checkBajarMismoBloqueEl.checked = true;
    }
    if (draft.modoPlantilla && modoPlantillaEl) modoPlantillaEl.value = draft.modoPlantilla;
    if (draft.mostrarEtiquetas !== undefined && checkEtiquetasEl) {
      checkEtiquetasEl.checked = Boolean(draft.mostrarEtiquetas);
    }
    if (draft.stickerSizeGlobal) {
      const sSize = parseInt(draft.stickerSizeGlobal, 10);
      if (stickerSizeGlobalEl) stickerSizeGlobalEl.value = sSize;
      if (stickerSizeSliderEl) stickerSizeSliderEl.value = sSize;
      if (stickerSizeValEl) stickerSizeValEl.textContent = `${sSize}px`;
    }
    if (draft.mindmapActualId) {
      establecerMindmapActivo(
        draft.mindmapActualId,
        draft.mindmapActualNombre || "MindMap",
        draft.mindmapActualEsPropio !== false
      );
    } else {
      establecerMindmapActivo(null);
    }
    limpiarTamanosStickerMindmapActual();
    mindmapActualAcademico = normalizarDatosAcademicos(draft.mindmapActualAcademico || {});
    cargarTamanosStickerMindmapActual(draft.stickerSizesByWord);

    const { sLayer } = asegurarCapasCanvas();
    if (sLayer) {
      sLayer.innerHTML = "";
      if (Array.isArray(draft.contenido)) {
        const currentSize = obtenerTamanoStickerGlobal();
        draft.contenido.forEach((item) => {
          const itemSize = item.width || currentSize || 42;
          if (item.src) {
            const img = document.createElement("img");
            img.src = item.src;
            img.className = "sticker";
            img.style.top = `${item.top}px`;
            img.style.left = `${item.left}px`;
            img.style.width = `${itemSize}px`;
            img.style.height = `${itemSize}px`;
            img.dataset.palabra = item.palabra || "";
            img.title = item.title || item.palabra || "";
            if (item.pageIndex !== undefined) img.dataset.pageIndex = item.pageIndex;
            if (item.blockIndex !== undefined) img.dataset.blockIndex = item.blockIndex;
            if (item.sentenceId !== undefined) img.dataset.sentenceId = item.sentenceId;
            if (item.wordIndex !== undefined) img.dataset.wordIndex = item.wordIndex;
            if (item.totalWords !== undefined) img.dataset.totalWords = item.totalWords;
            if (item.dir) img.dataset.dir = item.dir;
            if (item.angle) {
              img.dataset.angle = item.angle;
              img.style.transform = `rotate(${item.angle}deg)`;
            }
            if (item.manualPos) {
              img.dataset.manualPos = "true";
              guardarPosicionManualSticker(img);
            }
            if (item.freeSticker) img.dataset.freeSticker = "true";
            sLayer.appendChild(img);
            hacerInteractuable(img);
            sincronizarEtiquetaSticker(img);
            registrarTamanoStickerDesdeElemento(img);
          } else {
            const chip = document.createElement("div");
            chip.textContent = item.text || item.palabra || "";
            chip.className = "draggable-text";
            chip.style.top = `${item.top}px`;
            chip.style.left = `${item.left}px`;
            chip.dataset.palabra = item.palabra || item.text || "";
            if (itemSize > 45) {
              chip.style.fontSize = "13px";
              chip.style.padding = "4px 8px";
            }
            if (item.pageIndex !== undefined) chip.dataset.pageIndex = item.pageIndex;
            if (item.blockIndex !== undefined) chip.dataset.blockIndex = item.blockIndex;
            if (item.sentenceId !== undefined) chip.dataset.sentenceId = item.sentenceId;
            if (item.wordIndex !== undefined) chip.dataset.wordIndex = item.wordIndex;
            if (item.totalWords !== undefined) chip.dataset.totalWords = item.totalWords;
            if (item.dir) chip.dataset.dir = item.dir;
            if (item.manualPos) {
              chip.dataset.manualPos = "true";
              guardarPosicionManualSticker(chip);
            }
            if (item.freeSticker) chip.dataset.freeSticker = "true";
            sLayer.appendChild(chip);
            hacerInteractuable(chip);
            registrarTamanoStickerDesdeElemento(chip);
          }
        });
      }
    }

    updateWordCounts();
    renderizarBloquesSvg();
    renderizarEtiquetasStickers();
    if (typeof recalcularPosicionPalabrasCanvas === "function") {
      recalcularPosicionPalabrasCanvas(null, false);
    }
    actualizarLabelBtnGenerar();
    if (statusBadge) statusBadge.textContent = "Borrador activo";
    void rehidratarStickersPersistidos();
    return true;
  } catch (err) {
    console.warn("No se pudo cargar el borrador de localStorage:", err);
    return false;
  }
}

function restaurarMindmap(data) {
  if (!data) return;
  hidratacionStickersVersion++;
  actualizarTituloSesionActiva(data.nombre || "MindMap");
  mindmapActualAcademico = normalizarDatosAcademicos(data);
  limpiarTamanosStickerMindmapActual();
  cargarTamanosStickerMindmapActual(data.config?.stickerSizesByWord);
  const { sLayer } = asegurarCapasCanvas();
  if (sLayer) sLayer.innerHTML = "";

  const lectura = resolverLecturaMindmap(data);
  if (textoParte1El) textoParte1El.value = lectura.textoParte1;
  if (textoParte2El) textoParte2El.value = lectura.textoParte2;
  textoSnapshotP1 = lectura.textoParte1.trim();
  textoSnapshotP2 = lectura.textoParte2.trim();
  aplicarConfigDistribucion(data.config || {});
  if (data.config?.modoPlantilla && modoPlantillaEl) modoPlantillaEl.value = data.config.modoPlantilla;
  if (data.config?.mostrarEtiquetas !== undefined && checkEtiquetasEl) checkEtiquetasEl.checked = Boolean(data.config.mostrarEtiquetas);
  if (checkBajarMismoBloqueEl) checkBajarMismoBloqueEl.checked = true;
  if (data.config?.stickerSizeGlobal && stickerSizeGlobalEl) {
    aplicarTamanoGlobalStickers(data.config.stickerSizeGlobal);
  }
  updateWordCounts();
  renderizarBloquesSvg();

  if (Array.isArray(data.contenido) && sLayer) {
    data.contenido.forEach((item) => {
      if (item.src) {
        const img = document.createElement("img");
        img.src = item.src;
        img.className = "sticker";
        img.style.top = `${item.top}px`;
        img.style.left = `${item.left}px`;
        img.style.width = `${item.width || 38}px`;
        img.style.height = `${item.height || 38}px`;
        img.dataset.palabra = item.palabra || "";
        img.title = item.title || item.palabra || "";
        ["pageIndex", "blockIndex", "sentenceId", "wordIndex", "totalWords", "dir", "manualPos", "freeSticker"].forEach((key) => {
          if (item[key] !== undefined) img.dataset[key] = item[key];
        });
        if (item.manualPos) {
          img.dataset.manualPos = "true";
          guardarPosicionManualSticker(img);
        }
        sLayer.appendChild(img);
        hacerInteractuable(img);
        sincronizarEtiquetaSticker(img);
        registrarTamanoStickerDesdeElemento(img);
      } else {
        const chip = document.createElement("div");
        chip.textContent = item.text || item.palabra || "";
        chip.className = "draggable-text";
        chip.style.top = `${item.top}px`;
        chip.style.left = `${item.left}px`;
        chip.dataset.palabra = item.palabra || item.text || "";
        ["pageIndex", "blockIndex", "sentenceId", "wordIndex", "totalWords", "dir", "manualPos", "freeSticker"].forEach((key) => {
          if (item[key] !== undefined) chip.dataset[key] = item[key];
        });
        if (item.manualPos) {
          chip.dataset.manualPos = "true";
          guardarPosicionManualSticker(chip);
        }
        sLayer.appendChild(chip);
        hacerInteractuable(chip);
        registrarTamanoStickerDesdeElemento(chip);
      }
    });
  }

  // Las sesiones antiguas guardaban coordenadas absolutas sin página/bloque.
  // Reasignarlas al layout actual evita que el desfase vertical se acumule por fila.
  recalcularPosicionPalabrasCanvas(null, false);

  statusBadge.textContent = `Cargado: ${data.nombre || "MindMap"}`;
  actualizarLabelBtnGenerar();
  guardarDraftLocalStorage();
  void rehidratarStickersPersistidos();
}

// --- Datos academicos, creacion y guardado en Firestore ---
const modalSave = document.getElementById("mcModalSave");
const saveTitleInput = document.getElementById("mcSaveTitleInput");
const academicLevelInput = document.getElementById("mcAcademicLevel");
const academicGradeInput = document.getElementById("mcAcademicGrade");
const academicTrimesterInput = document.getElementById("mcAcademicTrimester");
const academicUnitInput = document.getElementById("mcAcademicUnit");
const academicModalTitle = document.getElementById("mcSaveTitle");
const academicConfirmButton = document.getElementById("mcConfirmSaveBtn");
let academicModalContext = { mode: "new", id: null, data: null };

function camposAcademicosFirestore(academic) {
  return {
    nivel: academic.nivel,
    grado: academic.grado,
    trimestre: academic.trimestre,
    unidad: academic.unidad,
    academico: { ...academic }
  };
}

function obtenerDatosAcademicosFormulario() {
  return {
    nivel: academicLevelInput?.value || "Primaria",
    grado: academicGradeInput?.value || "Primero",
    trimestre: academicTrimesterInput?.value || "Trim 1",
    unidad: academicUnitInput?.value || "Unidad 1"
  };
}

function rellenarFormularioAcademico(data = {}) {
  const academic = normalizarDatosAcademicos(data);
  if (saveTitleInput) saveTitleInput.value = data.nombre || "";
  if (academicLevelInput) academicLevelInput.value = academic.nivel;
  if (academicGradeInput) academicGradeInput.value = academic.grado;
  if (academicTrimesterInput) academicTrimesterInput.value = academic.trimestre;
  if (academicUnitInput) academicUnitInput.value = academic.unidad;
}

function abrirModalDatosAcademicos(mode = "new", context = {}) {
  if (!currentUser) {
    alert("Inicia sesión para crear o editar un MindMap.");
    return;
  }
  academicModalContext = { mode, id: context.id || null, data: context.data || null };
  const source = mode === "edit" ? (context.data || {}) : {};
  rellenarFormularioAcademico(source);
  if (modalGemini) modalGemini.hidden = mode !== "new";
  if (mode === "new") {
    lecturaPendienteNuevoMindmap = null;
    if (geminiFullTextEl) geminiFullTextEl.value = "";
    if (geminiResultEl) geminiResultEl.textContent = "";
  }
  if (academicModalTitle) {
    academicModalTitle.innerHTML = mode === "edit"
      ? `<i class="fas fa-pen text-blue-600"></i> Editar MindMap`
      : `<i class="fas fa-graduation-cap text-blue-600"></i> Nuevo MindMap`;
  }
  const buttonLabel = mode === "edit" ? "Guardar cambios" : "Crear MindMap";
  if (academicConfirmButton) academicConfirmButton.innerHTML = `<i class="fas fa-check"></i><span>${buttonLabel}</span>`;
  modalSave?.classList.add("is-open");
  saveTitleInput?.focus();
}

function cerrarModalDatosAcademicos() {
  modalSave?.classList.remove("is-open");
  lecturaPendienteNuevoMindmap = null;
  if (geminiResultEl) geminiResultEl.textContent = "";
}

function serializarContenidoMindmap() {
  const { sLayer } = asegurarCapasCanvas();
  const targetLayer = sLayer || stickersLayer || canvas;
  return Array.from(targetLayer?.querySelectorAll(".sticker, .draggable-text") || []).map((el) => limpiarDatosFirestore({
    text: el.textContent || "",
    palabra: el.dataset.palabra || el.textContent || "",
    top: parseFloat(el.style.top || 0),
    left: parseFloat(el.style.left || 0),
    width: parseFloat(el.style.width || el.offsetWidth || 42),
    height: parseFloat(el.style.height || el.offsetHeight || 42),
    title: el.title || "",
    pageIndex: el.dataset.pageIndex,
    blockIndex: el.dataset.blockIndex,
    sentenceId: el.dataset.sentenceId,
    wordIndex: el.dataset.wordIndex,
    totalWords: el.dataset.totalWords,
    dir: el.dataset.dir,
    src: el.tagName === "IMG" ? normalizarFuenteImagenPersistente(el.src) : null,
    manualPos: el.dataset.manualPos === "true" || el.dataset.manualPos === true,
    freeSticker: el.dataset.freeSticker === "true" || el.dataset.freeSticker === true,
    angle: el.dataset.angle ? parseFloat(el.dataset.angle) : 0
  }));
}

function construirConfigMindmap() {
  return {
    modoPlantilla: modoPlantillaEl?.value || "static",
    mostrarEtiquetas: checkEtiquetasEl?.checked ?? true,
    bajarMismoBloque: true,
    stepXIzq: stepXIzqEl?.value || "75",
    nivelesYIzq: nivelesYIzqEl?.value || "2",
    ampYIzq: ampYIzqEl?.value || "48",
    stepXDer: stepXDerEl?.value || "75",
    nivelesYDer: nivelesYDerEl?.value || "2",
    ampYDer: ampYDerEl?.value || "48",
    rowGapY: rowGapYEl?.value || "0",
    offsetY: offsetYEl?.value || "0",
    stickerSizeGlobal: stickerSizeGlobalEl?.value || "42",
    stickerSizesByWord: obtenerTamanosStickerMindmapActual()
  };
}

function limpiarLienzoParaNuevoMindmap(lectura = {}) {
  hidratacionStickersVersion++;
  limpiarPosicionesManuales();
  limpiarTamanosStickerMindmapActual();
  aplicarConfigDistribucion();
  const { sLayer } = asegurarCapasCanvas();
  if (sLayer) sLayer.innerHTML = "";
  if (textoParte1El) textoParte1El.value = lectura.parte1 || "";
  if (textoParte2El) textoParte2El.value = lectura.parte2 || "";
  textoSnapshotP1 = String(lectura.parte1 || "").trim();
  textoSnapshotP2 = String(lectura.parte2 || "").trim();
  updateWordCounts();
  renderizarBloquesSvg();
  estadoGeneracion = "stop";
  actualizarLabelBtnGenerar();
}

function crearNuevoMindmap() {
  abrirModalDatosAcademicos("new");
}

document.getElementById("mcBtnNuevoSesion")?.addEventListener("click", crearNuevoMindmap);

document.getElementById("mcBtnSave")?.addEventListener("click", async () => {
  if (!currentUser) {
    alert("Inicia sesión en la plataforma para guardar tu MindMap en la nube.");
    return;
  }

  if (mindmapActualId && !mindmapActualEsPropio) {
    alert("Este MindMap pertenece a otro usuario y está abierto en modo consulta.");
    return;
  }

  if (mindmapActualId) {
    const items = serializarContenidoMindmap();
    const saveBtn = document.getElementById("mcBtnSave");
    const originalHtml = saveBtn?.innerHTML || "";
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`; }
    try {
      const nombreActual = mindmapActualNombre || "MindMap";
      await setDoc(doc(firestore, "mindmaps", mindmapActualId), limpiarDatosFirestore({
        uid: currentUser.uid,
        nombre: nombreActual,
        textoParte1: textoParte1El?.value || "",
        textoParte2: textoParte2El?.value || "",
        actualizado: serverTimestamp(),
        contenido: items,
        config: construirConfigMindmap(),
        ...camposAcademicosFirestore(mindmapActualAcademico)
      }), { merge: true });
      statusBadge.textContent = `Guardado: ${nombreActual}`;
      guardarDraftLocalStorage();
      await cargarMindmapsGuardados();
      alert("✅ MindMap actualizado en la nube.");
    } catch (err) {
      console.error("Error al actualizar MindMap:", err);
      alert("No se pudo guardar el mapa. Revisa la conexión.");
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = originalHtml; }
    }
    return;
  }

  abrirModalDatosAcademicos("save-current");
});

document.getElementById("mcCloseSaveModal")?.addEventListener("click", cerrarModalDatosAcademicos);
document.getElementById("mcCancelSaveBtn")?.addEventListener("click", cerrarModalDatosAcademicos);

document.getElementById("mcConfirmSaveBtn")?.addEventListener("click", async () => {
  const nombre = saveTitleInput?.value.trim() || "";
  if (!nombre) {
    alert("Por favor ingresa un nombre para este MindMap.");
    saveTitleInput?.focus();
    return;
  }
  const academic = obtenerDatosAcademicosFormulario();
  const { mode, id, data } = academicModalContext;
  const btn = academicConfirmButton;
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>Guardando...</span>`;

  try {
    if (mode === "edit" && id) {
      await setDoc(doc(firestore, "mindmaps", id), limpiarDatosFirestore({
        nombre,
        actualizado: serverTimestamp(),
        ...camposAcademicosFirestore(academic)
      }), { merge: true });
      if (data) Object.assign(data, { nombre, ...academic, academico: { ...academic } });
      if (mindmapActualId === id) {
        mindmapActualAcademico = academic;
        actualizarTituloSesionActiva(nombre);
        statusBadge.textContent = `Guardado: ${nombre}`;
        guardarDraftLocalStorage();
      }
      cerrarModalDatosAcademicos();
      await cargarMindmapsGuardados();
      return;
    }

    const iniciarVacio = mode === "new";
    const lecturaNueva = iniciarVacio
      ? (lecturaPendienteNuevoMindmap || { parte1: "", parte2: "", conceptos: [] })
      : null;
    const items = iniciarVacio ? [] : serializarContenidoMindmap();
    const savedDoc = await addDoc(collection(firestore, "mindmaps"), limpiarDatosFirestore({
      uid: currentUser.uid,
      nombre,
      autorNombre: currentUser.displayName || currentUser.email?.split("@")[0] || "Usuario",
      textoParte1: iniciarVacio ? lecturaNueva.parte1 : (textoParte1El?.value || ""),
      textoParte2: iniciarVacio ? lecturaNueva.parte2 : (textoParte2El?.value || ""),
      creado: serverTimestamp(),
      actualizado: serverTimestamp(),
      contenido: items,
      config: construirConfigMindmap(),
      ...camposAcademicosFirestore(academic)
    }));

    if (iniciarVacio) {
      limpiarLienzoParaNuevoMindmap(lecturaNueva);
      renderizarConceptosAsistente(lecturaNueva.conceptos);
    }
    mindmapActualAcademico = academic;
    establecerMindmapActivo(savedDoc.id, nombre);
    statusBadge.textContent = `Guardado: ${nombre}`;
    cerrarModalDatosAcademicos();
    guardarDraftLocalStorage();
    await cargarMindmapsGuardados();
    alert("✅ MindMap guardado exitosamente en la nube.");
  } catch (err) {
    console.error("Error al guardar MindMap:", err);
    alert("No se pudo guardar el mapa. Revisa la conexión.");
  } finally {
    btn.disabled = false;
    const label = academicModalContext.mode === "edit" ? "Guardar cambios" : "Crear MindMap";
    btn.innerHTML = `<i class="fas fa-check"></i><span>${label}</span>`;
  }
});

// --- Exportar PNG (Alta Resolución 300 DPI) ---
const modalExportPNG = document.getElementById("mcModalExportPNG");
const cerrarModalExportPNG = () => modalExportPNG?.classList.remove("is-open");
const exportBackgroundSection = document.getElementById("mcExportBackgroundSection");
const confirmExportButton = document.getElementById("mcConfirmExportPNG");

function formatoExportacionSeleccionado() {
  return document.querySelector("input[name='mcExportFormat']:checked")?.value || "png";
}

function actualizarControlesExportacion() {
  const formato = formatoExportacionSeleccionado();
  if (exportBackgroundSection) exportBackgroundSection.hidden = formato === "psd";
  if (confirmExportButton) {
    const label = formato === "psd" ? "Exportar PSD" : "Exportar PNG";
    confirmExportButton.title = label;
    confirmExportButton.setAttribute("aria-label", label);
    confirmExportButton.innerHTML = `<i class="fas fa-download mc-icon--blue"></i><span>${label}</span>`;
  }
}

document.getElementById("mcBtnExportPNG")?.addEventListener("click", () => {
  actualizarControlesExportacion();
  modalExportPNG?.classList.add("is-open");
});
document.getElementById("mcCloseExportPNGModal")?.addEventListener("click", cerrarModalExportPNG);
document.getElementById("mcCancelExportPNG")?.addEventListener("click", cerrarModalExportPNG);
document.querySelectorAll("input[name='mcExportFormat']").forEach((radio) => {
  radio.addEventListener("change", actualizarControlesExportacion);
});

async function exportarPNG(modoExportacion = "with-background") {
  const btn = document.getElementById("mcConfirmExportPNG");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>Exportando...</span>`;
  }

  try {
    const width = 1366;
    const height = 904;
    const scaleFactor = 300 / 72; // ~4.16

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = width * scaleFactor;
    exportCanvas.height = height * scaleFactor;
    const ctx = exportCanvas.getContext("2d");
    ctx.scale(scaleFactor, scaleFactor);

    const incluirFondo = modoExportacion === "with-background";

    // 1. Dibujar fondo solo cuando fue solicitado.
    const modo = modoPlantillaEl?.value || "dynamic";
    if (incluirFondo && modo === "static") {
      await new Promise((resolve) => {
        const bgImg = new Image();
        bgImg.onload = () => {
          ctx.drawImage(bgImg, 0, 0, width, height);
          resolve();
        };
        bgImg.onerror = resolve;
        bgImg.src = "mindmapBackground.png";
      });
    } else if (incluirFondo && blocksSvg) {
      // Fondo blanco del lienzo
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      // Serializar SVG a imagen y dibujar con precisión vectorial
      await new Promise((resolve) => {
        const svgString = new XMLSerializer().serializeToString(blocksSvg);
        const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const svgUrl = URL.createObjectURL(svgBlob);
        const svgImg = new Image();
        svgImg.onload = () => {
          ctx.drawImage(svgImg, 0, 0, width, height);
          URL.revokeObjectURL(svgUrl);
          resolve();
        };
        svgImg.onerror = () => {
          URL.revokeObjectURL(svgUrl);
          resolve();
        };
        svgImg.src = svgUrl;
      });
    }

    // 2. Dibujar elementos
    const elements = canvas.querySelectorAll(".sticker, .draggable-text");
    for (const el of elements) {
      const left = parseFloat(el.style.left || 0);
      const top = parseFloat(el.style.top || 0);

      if (el.tagName === "IMG") {
        await new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          const elementWidth = parseFloat(el.style.width || el.getBoundingClientRect().width || 38);
          const elementHeight = parseFloat(el.style.height || el.getBoundingClientRect().height || elementWidth);
          img.onload = () => {
            ctx.drawImage(img, left, top, elementWidth, elementHeight);
            resolve();
          };
          img.onerror = resolve;
          img.src = el.src;
        });
      } else if (el.classList.contains("draggable-text")) {
        // Draw badge background
        const text = el.textContent || "";
        ctx.font = "bold 13px 'Comic Neue', 'Comic Sans MS', sans-serif";
        const textMetrics = ctx.measureText(text);
        const padX = 8;
        const padY = 4;
        const badgeW = textMetrics.width + padX * 2;
        const badgeH = 22;

        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1.5;

        // rounded rect
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(left, top, badgeW, badgeH, 11);
        } else {
          ctx.rect(left, top, badgeW, badgeH);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#0f172a";
        ctx.textBaseline = "middle";
        ctx.fillText(text, left + padX, top + badgeH / 2);
      }

      if (el.tagName === "IMG" && checkEtiquetasEl?.checked !== false) {
        const label = el.nextElementSibling;
        const labelText = label?.classList.contains("sticker-word-label") ? label.textContent.trim() : "";
        if (labelText) {
          const labelLeft = parseFloat(label.style.left || left);
          const labelTop = parseFloat(label.style.top || Math.max(4, top - 22));
          const labelWidth = parseFloat(label.style.width || el.style.width || 48);
          const fontSize = parseFloat(label.style.fontSize || 12);
          ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
          ctx.fillStyle = getComputedStyle(label).color || "#172033";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(labelText, labelLeft + labelWidth / 2, labelTop);
          ctx.textAlign = "left";
        }
      }
    }

    // Trigger download
    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MindMaps_${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  } catch (err) {
    console.error("Error al exportar PNG:", err);
    alert("Hubo un error al exportar la imagen.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-download"></i><span>Exportar PNG</span>`;
    }
  }
}

document.getElementById("mcConfirmExportPNG")?.addEventListener("click", async () => {
  const formato = formatoExportacionSeleccionado();
  const modoExportacion = document.querySelector("input[name='mcExportBackground']:checked")?.value || "with-background";
  cerrarModalExportPNG();
  if (formato === "png") {
    await exportarPNG(modoExportacion);
    return;
  }

  const btn = confirmExportButton;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>Creando PSD...</span>`;
  }

  try {
    const safeName = String(mindmapActualNombre || "MindMap")
      .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "MindMap";
    const result = await exportarMindmapPsd({
      canvas,
      blocksSvg,
      modoPlantilla: modoPlantillaEl?.value || "dynamic",
      incluirEtiquetas: checkEtiquetasEl?.checked !== false,
      filename: `${safeName}.psd`
    });
    if (result.skipped.length > 0) {
      alert(`El PSD se descargó, pero ${result.skipped.length} capa(s) no pudieron incluirse.`);
    }
  } catch (err) {
    console.error("Error al exportar PSD:", err);
    alert("Hubo un error al crear el PSD por capas.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-download mc-icon--blue"></i><span>Exportar PSD</span>`;
    }
  }
});

// Auto-fit on resize and startup
window.addEventListener("resize", () => {
  if (zoomScale <= 1.0 && !drawerStickers?.classList.contains("is-open")) fitCanvasToViewport();
});

if (typeof ResizeObserver !== "undefined" && viewport) {
  const ro = new ResizeObserver(() => {
    if (zoomScale <= 1.0 && !drawerStickers?.classList.contains("is-open")) fitCanvasToViewport();
  });
  ro.observe(viewport);
}

// Inicializador de Generación Batch de Stickers Faltantes
inicializarGeneradorBatchStickers({
  storage,
  generateGeminiImage,
  translatePromptToEnglish,
  asegurarIndiceStickers,
  stickerIndex,
  stickerCache,
  getTextos: () => ({
    textoParte1: textoParte1El?.value || "",
    textoParte2: textoParte2El?.value || ""
  }),
  onStickerGuardado: (cleanNombre, persistentUrl, palabraOriginal) => {
    bibliotecaStickersCached = [];
    if (!stickersLayer) return;
    const normalizarPalabra = (value) => String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 30);
    const elements = Array.from(stickersLayer.querySelectorAll(".sticker, .draggable-text"))
      .filter((el) => normalizarPalabra(el.dataset.palabra || el.textContent) === cleanNombre);
    elements.forEach((el) => {
      if (el.tagName.toLowerCase() === "img") {
        el.src = persistentUrl;
        el.dataset.palabra = cleanNombre;
        el.title = palabraOriginal;
        sincronizarEtiquetaSticker(el);
      } else {
        const img = reemplazarElementoConSticker(el, persistentUrl, cleanNombre);
        img.title = palabraOriginal;
      }
    });
    guardarDraftLocalStorageDebounced();
  },
  onFinalizado: () => {
    renderizarBloquesSvg();
    guardarDraftLocalStorage();
  }
});

// --- Inicialización de Paneles Redimensionables (Left Sessions & Right Sidebar) ---
function inicializarPanelesRedimensionables() {
  const leftPanel = document.getElementById("mcSessionsPanel");
  const resizerLeft = document.getElementById("mcResizerLeft");

  const SESSIONS_WIDTH_KEY = "mc_sessions_panel_width";

  // Cargar anchos guardados
  const savedSessionsW = localStorage.getItem(SESSIONS_WIDTH_KEY);
  if (savedSessionsW && leftPanel) {
    const w = Math.max(170, Math.min(480, parseInt(savedSessionsW, 10)));
    leftPanel.style.width = `${w}px`;
  }

  // Resizer Izquierdo (Panel de Sesiones)
  if (resizerLeft && leftPanel) {
    let isDraggingLeft = false;
    let startX = 0;
    let startWidth = 0;

    resizerLeft.addEventListener("pointerdown", (e) => {
      isDraggingLeft = true;
      startX = e.clientX;
      startWidth = leftPanel.offsetWidth;
      resizerLeft.classList.add("is-dragging");
      document.body.classList.add("mc-resizing");
      resizerLeft.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    resizerLeft.addEventListener("pointermove", (e) => {
      if (!isDraggingLeft) return;
      const dx = e.clientX - startX;
      const newWidth = Math.max(170, Math.min(480, startWidth + dx));
      leftPanel.style.width = `${newWidth}px`;
      fitCanvasToViewport();
    });

    const stopDraggingLeft = (e) => {
      if (!isDraggingLeft) return;
      isDraggingLeft = false;
      resizerLeft.classList.remove("is-dragging");
      document.body.classList.remove("mc-resizing");
      localStorage.setItem(SESSIONS_WIDTH_KEY, leftPanel.offsetWidth);
      fitCanvasToViewport();
    };

    resizerLeft.addEventListener("pointerup", stopDraggingLeft);
    resizerLeft.addEventListener("pointercancel", stopDraggingLeft);
  }

}

inicializarPanelesRedimensionables();

// Inicialización de arranque: restaurar borrador de localStorage si existe
const draftRestaurado = cargarDraftLocalStorage();
if (!draftRestaurado) {
  updateWordCounts();
  renderizarBloquesSvg();
}
setTimeout(fitCanvasToViewport, 150);
setTimeout(fitCanvasToViewport, 450);
