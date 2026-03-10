// lecturas-asc-unificado.js
// ------------------------------------------------------------
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-auth.js";

const ASC_EDITOR_GEMINI_API_KEY = "__GEMINI_API_KEY_LOCAL__";

const firebaseConfig = {
  apiKey: window.__CB_FIREBASE_WEB_API_KEY__ || window.__CHARLY_CONFIG__?.firebase?.apiKey || "",
  authDomain: "charly-brown.firebaseapp.com",
  projectId: "charly-brown",
  storageBucket: "charly-brown.firebasestorage.app",
  messagingSenderId: "128488238449",
  appId: "1:128488238449:web:2b99ef5c2f0272e9871ad0",
  measurementId: "G-RL0BMDZKE6",
};

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// Utils
const $ = (q, ctx=document)=>ctx.querySelector(q);
const $$= (q, ctx=document)=>Array.from(ctx.querySelectorAll(q));
const esc = s=>String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
async function ensureXLSX(){
  if (window.XLSX) return;
  await new Promise((res, rej)=>{
    const s=document.createElement("script");
    s.src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.onload=res; s.onerror=rej; document.head.appendChild(s);
  });
}

// Estado/refs
let ascModal, ascBackdrop, ascBtnCerrar, ascBtnNuevo, ascBtnImport, ascInputImport, ascBtnExport, ascBuscador;
let ascFiltroNivel, ascFiltroGrado, ascFiltroTrimestre, ascFiltroUnidad;
let ascTbody, ascVacio;

// ⤵️ Modal del editor (nuevo)
let ascEditorModal, ascEditorBackdrop, ascEditorClose, ascBtnCancelar, ascForm;
let ascEditorShell;
let ascId, ascSerie, ascNivel, ascGrado, ascTrimestre, ascUnidad, ascTitulo, ascTexto;
let ascEditorFontFamily, ascEditorFontSize, ascEditorSheetSize, ascEditorFontColor, ascEditorHighlightColor;
let ascEditorZoomRange, ascEditorZoomLabel;
let ascQuestionModal, ascQuestionModalClose, ascQuestionModalDone, ascQuestionModalTitle;
let ascToggleMeta, ascToggleQuestions;
let ascAiAssistBtn, ascAiEditorModal, ascAiClose, ascAiPrompt, ascAiSend, ascAiChatList, ascAiScopePreview, ascAiRefreshScope, ascAiStatus;
let ascQuestionAiBtn, ascQuestionAiPanel, ascQuestionAiPreview, ascQuestionAiChat, ascQuestionAiPrompt, ascQuestionAiSend, ascQuestionAiStatus;

let cache = [];
let MODO = "new";
let ascQuestionActiva = 0;
let ascEditorSheetSizeActual = "carta";
let ascEditorFontSizeActual = 18;
let ascEditorZoomActual = 100;
let ascAiScopeMode = "paragraph";
let ascAiScopeSnapshot = null;
let ascAiBusy = false;
let ascQuestionAiScope = "texto";
let ascQuestionAiBusy = false;
let ascSharedEditorContext = null;

// INIT
document.addEventListener("DOMContentLoaded", () => {
  // MODAL LISTA
  ascModal       = $("#ascModal");
  ascBackdrop    = $("#ascBackdrop");
  ascBtnCerrar   = $("#ascBtnCerrar");
  ascBtnNuevo    = $("#ascBtnNuevo");
  ascBtnImport   = $("#ascBtnImport");
  ascInputImport = $("#ascInputImport");
  ascBtnExport   = $("#ascBtnExport");
  ascBuscador    = $("#ascBuscador");
  ascFiltroNivel = $("#ascFiltroNivel");
  ascFiltroGrado = $("#ascFiltroGrado");
  ascFiltroTrimestre = $("#ascFiltroTrimestre");
  ascFiltroUnidad = $("#ascFiltroUnidad");
  ascTbody       = $("#ascTbody");
  ascVacio       = $("#ascVacio");

  // MODAL EDITOR (asegúrate de tener este HTML con estos IDs)
  ascEditorModal    = $("#ascEditorModal");
  ascEditorShell    = ascEditorModal?.querySelector(".asc-editor-shell") || null;
  ascEditorBackdrop = $("#ascEditorBackdrop");
  ascEditorClose    = $("#ascEditorClose");
  ascBtnCancelar    = $("#ascBtnCancelar");
  ascForm           = $("#ascForm");

  ascId        = $("#ascId");
  ascSerie     = $("#ascSerie");
  ascNivel     = $("#ascNivel");
  ascGrado     = $("#ascGrado");
  ascTrimestre = $("#ascTrimestre");
  ascUnidad    = $("#ascUnidad");
  ascTitulo    = $("#ascTitulo");
  ascTexto     = $("#ascTexto");
  ascEditorFontFamily = $("#ascEditorFontFamily");
  ascEditorFontSize = $("#ascEditorFontSize");
  ascEditorSheetSize = $("#ascEditorSheetSize");
  ascEditorFontColor = $("#ascEditorFontColor");
  ascEditorHighlightColor = $("#ascEditorHighlightColor");
  ascEditorZoomRange = $("#ascEditorZoomRange");
  ascEditorZoomLabel = $("#ascEditorZoomLabel");
  ascQuestionModal = $("#ascQuestionModal");
  ascQuestionModalClose = $("#ascQuestionModalClose");
  ascQuestionModalDone = $("#ascQuestionModalDone");
  ascQuestionModalTitle = $("#ascQuestionModalTitle");
  ascToggleMeta = $("#ascToggleMeta");
  ascToggleQuestions = $("#ascToggleQuestions");
  ascAiAssistBtn = $("#ascAiAssistBtn");
  ascAiEditorModal = $("#ascAiEditorModal");
  ascAiClose = $("#ascAiClose");
  ascAiPrompt = $("#ascAiPrompt");
  ascAiSend = $("#ascAiSend");
  ascAiChatList = $("#ascAiChatList");
  ascAiScopePreview = $("#ascAiScopePreview");
  ascAiRefreshScope = $("#ascAiRefreshScope");
  ascAiStatus = $("#ascAiStatus");
  ascQuestionAiBtn = $("#ascQuestionAiBtn");
  ascQuestionAiPanel = $("#ascQuestionAiPanel");
  ascQuestionAiPreview = $("#ascQuestionAiPreview");
  ascQuestionAiChat = $("#ascQuestionAiChat");
  ascQuestionAiPrompt = $("#ascQuestionAiPrompt");
  ascQuestionAiSend = $("#ascQuestionAiSend");
  ascQuestionAiStatus = $("#ascQuestionAiStatus");

  // Botón externo que abre el modal lista
  document.getElementById("btnLecturasAsc")?.addEventListener("click", openAscModal);

  // Eventos LISTA
  ascBtnCerrar?.addEventListener("click", closeAscModal);
  ascBackdrop?.addEventListener("click", closeAscModal);
  document.addEventListener("keydown", (e)=>{
    if (e.key !== "Escape") return;
    if (ascQuestionModal && !ascQuestionModal.classList.contains("hidden")) {
      closePreguntaModalAsc();
      return;
    }
    closeAscModal();
    closeEditorModal();
  });

  ascBtnNuevo?.addEventListener("click", openEditorNew);
  ascBtnImport?.addEventListener("click", ()=> ascInputImport?.click());
  ascInputImport?.addEventListener("change", async (ev)=>{
    const file = ev.target.files?.[0]; if(!file) return;
    await importarXlsx(file);
    ev.target.value="";
  });
  ascBtnExport?.addEventListener("click", exportarXlsx);
  ascBuscador?.addEventListener("input", aplicarFiltrosAsc);
  ascFiltroNivel?.addEventListener("change", aplicarFiltrosAsc);
  ascFiltroGrado?.addEventListener("change", aplicarFiltrosAsc);
  ascFiltroTrimestre?.addEventListener("change", aplicarFiltrosAsc);
  ascFiltroUnidad?.addEventListener("change", aplicarFiltrosAsc);

  // Eventos EDITOR
  ascEditorClose?.addEventListener("click", closeEditorModal);
  ascEditorBackdrop?.addEventListener("click", closeEditorModal);
  ascBtnCancelar?.addEventListener("click", closeEditorModal);
  ascQuestionModalClose?.addEventListener("click", closePreguntaModalAsc);
  ascQuestionModalDone?.addEventListener("click", closePreguntaModalAsc);
  ascQuestionAiBtn?.addEventListener("click", toggleAscQuestionAiPanel);
  ascQuestionAiSend?.addEventListener("click", enviarAscQuestionAiPrompt);
  ascToggleMeta?.addEventListener("click", () => toggleMetaAsc());
  ascToggleQuestions?.addEventListener("click", () => togglePreguntasAsc());
  ascAiAssistBtn?.addEventListener("click", toggleAscAiEditor);
  ascAiClose?.addEventListener("click", closeAscAiEditor);
  ascAiSend?.addEventListener("click", enviarAscAiPrompt);
  ascAiRefreshScope?.addEventListener("click", () => refrescarAscAiScope(true));
  ascForm?.addEventListener("submit", onSubmit);
  bindAscEditorToolbar();
  bindPreguntasAsc();
  bindAscAiEditor();
  aplicarTamanoHojaEditor(ascEditorSheetSize?.value || "carta");
  renderResumenPreguntasAsc();
  actualizarBotonesPanelesAsc();

  // Auto-carga si ya visible
  if (!ascModal.classList.contains("hidden")) boot();
});

// API UI (lista)
function openAscModal(){
  ascModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  boot();
}
function closeAscModal(){
  ascModal.classList.add("hidden");
  document.body.style.overflow = "auto";
}

function getResultadoLecturaRefs() {
  return {
    modal: document.getElementById("modalResultadoLectura"),
    contenido: document.getElementById("resultadoContenido")
  };
}

// API UI (editor)
function openEditorModal(){
  if (!ascEditorModal) return;
  ascEditorModal.classList.remove("hidden");
  // body scroll permitido DENTRO del modal del editor
  document.body.style.overflow = "hidden";
  const formScroll = ascForm;
  const stage = ascEditorModal.querySelector(".asc-editor-stage");
  const canvas = ascEditorModal.querySelector(".asc-editor-canvas");
  if (formScroll) formScroll.scrollTop = 0;
  if (stage) stage.scrollTop = 0;
  if (canvas) canvas.scrollTop = 0;
  requestAnimationFrame(() => {
    if (formScroll) formScroll.scrollTop = 0;
    if (stage) stage.scrollTop = 0;
    if (canvas) canvas.scrollTop = 0;
  });
}
function closeEditorModal(){
  if (!ascEditorModal) return;
  ascEditorModal.classList.add("hidden");
  closePreguntaModalAsc();
  closeAscAiEditor();
  configureAscSharedEditor(null);
  document.body.style.overflow = "auto";
}

function setAscFieldLabel(inputEl, label = "") {
  const field = inputEl?.closest(".asc-editor-field");
  const labelEl = field?.querySelector("span");
  if (labelEl) labelEl.textContent = label;
}

function applyAscEditorSchema(schema = {}) {
  if (!ascEditorModal) return;
  setAscFieldLabel(ascSerie, schema.serieLabel || "Serie");
  setAscFieldLabel(ascNivel, schema.nivelLabel || "Nivel");
  setAscFieldLabel(ascGrado, schema.gradoLabel || "Grado");
  setAscFieldLabel(ascTrimestre, schema.trimestreLabel || "Trimestre");
  setAscFieldLabel(ascUnidad, schema.unidadLabel || "Unidad");
  if (ascTitulo) {
    ascTitulo.placeholder = schema.titlePlaceholder || "Escribe un título editorial";
  }
  ascEditorModal.dataset.editorMode = schema.mode || "asc";
}

function configureAscSharedEditor(context = null) {
  ascSharedEditorContext = context || null;
  if (!ascEditorModal) return;
  if (!ascSharedEditorContext) {
    applyAscEditorSchema({
      mode: "asc",
      serieLabel: "Serie",
      nivelLabel: "Nivel",
      gradoLabel: "Grado",
      trimestreLabel: "Trimestre",
      unidadLabel: "Unidad",
      titlePlaceholder: "Escribe un título editorial"
    });
    ascEditorModal.classList.remove("is-shared-editor");
    togglePreguntasAsc(false);
    toggleMetaAsc(false);
    return;
  }
  applyAscEditorSchema({
    mode: ascSharedEditorContext.mode || "shared",
    serieLabel: ascSharedEditorContext.serieLabel || "Sinopsis",
    nivelLabel: ascSharedEditorContext.nivelLabel || "Nivel",
    gradoLabel: ascSharedEditorContext.gradoLabel || "Grado",
    trimestreLabel: ascSharedEditorContext.trimestreLabel || "Trimestre",
    unidadLabel: ascSharedEditorContext.unidadLabel || "Unidad",
    titlePlaceholder: ascSharedEditorContext.titlePlaceholder || "Escribe el título de la lectura"
  });
  ascEditorModal.classList.add("is-shared-editor");
  togglePreguntasAsc(true);
}

function collectSharedEditorPayload() {
  const html = String(ascTexto?.innerHTML || "").trim();
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return {
    id: String(ascId?.value || "").trim(),
    titulo: String(ascTitulo?.value || "").trim(),
    tema: String(ascSerie?.value || "").trim(),
    nivel: String(ascNivel?.value || "").trim(),
    grado: String(ascGrado?.value || "").trim(),
    trimestre: String(ascTrimestre?.value || "").trim(),
    unidad: String(ascUnidad?.value || "").trim(),
    contenidoHTML: html,
    contenidoPlano: String(tmp.textContent || tmp.innerText || "").trim()
  };
}

function actualizarBotonesPanelesAsc() {
  const metaCollapsed = !!ascEditorShell?.classList.contains("is-meta-collapsed");
  const preguntasCollapsed = !!ascEditorShell?.classList.contains("is-questions-collapsed");
  if (ascToggleMeta) {
    ascToggleMeta.title = metaCollapsed ? "Expandir metadatos" : "Colapsar metadatos";
    ascToggleMeta.setAttribute("aria-label", ascToggleMeta.title);
  }
  if (ascToggleQuestions) {
    ascToggleQuestions.title = preguntasCollapsed ? "Expandir preguntas" : "Colapsar preguntas";
    ascToggleQuestions.setAttribute("aria-label", ascToggleQuestions.title);
  }
}

function toggleMetaAsc(force = null) {
  if (!ascEditorShell) return;
  const next = typeof force === "boolean" ? force : !ascEditorShell.classList.contains("is-meta-collapsed");
  ascEditorShell.classList.toggle("is-meta-collapsed", next);
  aplicarTamanoHojaEditor(ascEditorSheetSizeActual);
  actualizarBotonesPanelesAsc();
}

function togglePreguntasAsc(force = null) {
  if (!ascEditorShell) return;
  const next = typeof force === "boolean" ? force : !ascEditorShell.classList.contains("is-questions-collapsed");
  ascEditorShell.classList.toggle("is-questions-collapsed", next);
  aplicarTamanoHojaEditor(ascEditorSheetSizeActual);
  actualizarBotonesPanelesAsc();
}

function focusAscTexto() {
  if (!ascTexto) return;
  try { ascTexto.focus(); } catch (_) {}
}

function ejecutarComandoEditor(command = "", value = null) {
  if (!command) return;
  focusAscTexto();
  try {
    document.execCommand(command, false, value);
  } catch (_) {
    // noop
  }
}

function aplicarBloqueEditor(tagName = "P") {
  const tag = String(tagName || "P").toUpperCase();
  const htmlTag = tag === "P" ? "<p>" : `<${tag.toLowerCase()}>`;
  ejecutarComandoEditor("formatBlock", htmlTag);
}

function aplicarFuenteEditor(fontFamily = "") {
  const family = String(fontFamily || "").trim();
  if (!family || !ascTexto) return;
  focusAscTexto();
  const sel = window.getSelection?.();
  if (sel && sel.rangeCount && !sel.isCollapsed && ascTexto.contains(sel.anchorNode)) {
    try {
      document.execCommand("styleWithCSS", false, true);
      document.execCommand("fontName", false, family);
      return;
    } catch (_) {
      // noop
    }
  }
  ascTexto.style.fontFamily = family;
}

function limpiarEstilosTipograficosAsc(root) {
  if (!root) return;
  root.querySelectorAll("*").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.style.removeProperty("font-size");
    node.style.removeProperty("font-family");
    node.style.removeProperty("line-height");
    if (node.tagName === "FONT") {
      node.removeAttribute("size");
      node.removeAttribute("face");
    }
  });
}

function aplicarTamanoEditor(fontSize = "") {
  const size = Number(fontSize || 0);
  if (!Number.isFinite(size) || size <= 0 || !ascTexto) return;
  ascEditorFontSizeActual = size;
  limpiarEstilosTipograficosAsc(ascTexto);
  if (ascEditorFontSize) ascEditorFontSize.value = String(Math.round(size));
  aplicarTamanoHojaEditor(ascEditorSheetSize?.value || ascEditorSheetSizeActual || "carta");
  focusAscTexto();
}

function aplicarColorEditor(command = "", color = "") {
  const value = String(color || "").trim();
  if (!command || !ascTexto) return;
  focusAscTexto();
  try {
    document.execCommand("styleWithCSS", false, true);
  } catch (_) {}
  if (!value) {
    if (command === "hiliteColor") {
      try { document.execCommand("backColor", false, "transparent"); } catch (_) {}
    }
    return;
  }
  try {
    document.execCommand(command, false, value);
  } catch (_) {
    if (command === "hiliteColor") {
      try { document.execCommand("backColor", false, value); } catch (_) {}
    }
  }
}

function _refrescarPaletasColorAsc() {
  const map = [
    { input: ascEditorFontColor, kind: "text", fallback: "#111827" },
    { input: ascEditorHighlightColor, kind: "highlight", fallback: "#fef08a" }
  ];
  map.forEach(({ input, kind, fallback }) => {
    const value = String(input?.value || "").trim();
    const preview = ascEditorModal?.querySelector(`[data-swatch-preview="${kind}"]`);
    if (preview) {
      preview.style.setProperty("--swatch-color", value || fallback);
    }
    $$(`[data-palette-popover="${kind}"] .asc-editor-color-swatch`, ascEditorModal).forEach((btn) => {
      btn.classList.toggle("is-active", String(btn.dataset.colorValue || "") === value);
    });
  });
}

function aplicarTamanoHojaEditor(sheetSize = "") {
  const size = String(sheetSize || "carta").trim().toLowerCase();
  const styleTarget = ascEditorShell || ascEditorModal;
  if (!styleTarget) return;
  const mapa = {
    compacta: { width: 720, minHeight: 360, fontSize: 17, titleSize: 22, paddingX: 34, paddingTop: 28, paddingBottom: 32 },
    carta: { width: 860, minHeight: 420, fontSize: 18, titleSize: 24, paddingX: 42, paddingTop: 34, paddingBottom: 40 },
    oficio: { width: 920, minHeight: 560, fontSize: 18.5, titleSize: 25, paddingX: 46, paddingTop: 36, paddingBottom: 42 },
    ancha: { width: 1040, minHeight: 460, fontSize: 19, titleSize: 26, paddingX: 52, paddingTop: 36, paddingBottom: 42 }
  };
  const conf = mapa[size] || mapa.carta;
  const selectSize = Number(ascEditorFontSize?.value || 0);
  const baseFontSize = Number.isFinite(selectSize) && selectSize > 0 ? selectSize : (Number(ascEditorFontSizeActual || 0) || conf.fontSize);
  const zoomPct = Number(ascEditorZoomRange?.value || ascEditorZoomActual || 100);
  const zoomFactor = Number.isFinite(zoomPct) && zoomPct > 0 ? (zoomPct / 100) : 1;
  ascEditorZoomActual = zoomPct;
  ascEditorSheetSizeActual = size;
  const panelesColapsados = Number(!!ascEditorShell?.classList.contains("is-meta-collapsed")) + Number(!!ascEditorShell?.classList.contains("is-questions-collapsed"));
  const widthExtra = panelesColapsados === 2 ? 280 : panelesColapsados === 1 ? 150 : 0;
  const heightExtra = panelesColapsados === 2 ? 140 : panelesColapsados === 1 ? 72 : 0;
  const paddingExtra = panelesColapsados === 2 ? 14 : panelesColapsados === 1 ? 7 : 0;
  const anchoFinal = conf.width + widthExtra;
  const proporcionAncho = anchoFinal / conf.width;
  const fontSizeFinal = Number((baseFontSize * proporcionAncho * zoomFactor).toFixed(2));
  const titleSizeFinal = Number((Math.max(conf.titleSize, baseFontSize * 1.22) * proporcionAncho * zoomFactor).toFixed(2));
  const lineHeight = panelesColapsados === 2 ? 1.95 : panelesColapsados === 1 ? 1.88 : 1.8;
  styleTarget.style.setProperty("--asc-editor-page-width", `${Math.round(anchoFinal * zoomFactor)}px`);
  styleTarget.style.setProperty("--asc-editor-page-min-height", `${Math.round((conf.minHeight + heightExtra) * zoomFactor)}px`);
  styleTarget.style.setProperty("--asc-editor-page-font-size", `${fontSizeFinal}px`);
  styleTarget.style.setProperty("--asc-editor-page-title-size", `${titleSizeFinal}px`);
  styleTarget.style.setProperty("--asc-editor-page-line-height", `${lineHeight}`);
  styleTarget.style.setProperty("--asc-editor-page-padding-x", `${Math.round((conf.paddingX + paddingExtra) * zoomFactor)}px`);
  styleTarget.style.setProperty("--asc-editor-page-padding-top", `${Math.round((conf.paddingTop + paddingExtra) * zoomFactor)}px`);
  styleTarget.style.setProperty("--asc-editor-page-padding-bottom", `${Math.round((conf.paddingBottom + paddingExtra) * zoomFactor)}px`);
  styleTarget.style.setProperty("--asc-editor-page-zoom", `${zoomFactor}`);
  const extraSpace = zoomFactor > 1 ? Math.round((conf.minHeight + heightExtra) * (zoomFactor - 1) * 0.9) : 0;
  styleTarget.style.setProperty("--asc-editor-stage-extra-space", `${extraSpace}px`);
  ascEditorModal.dataset.sheetSize = size;
  if (ascEditorZoomLabel) ascEditorZoomLabel.textContent = `Zoom ${zoomPct}%`;
}

function _ascExtraerJson(raw = "") {
  const cleaned = String(raw || "").replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  if (!cleaned) return null;
  try { return JSON.parse(cleaned); } catch (_) {}
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try { return JSON.parse(cleaned.slice(first, last + 1)); } catch (_) {}
  }
  return null;
}

function _ascModeloGeminiActual() {
  return String(document.getElementById("selectGeminiEndpoint2")?.value || "gemini-2.5-flash-lite")
    .replace(":generateContent", "")
    .trim() || "gemini-2.5-flash-lite";
}

async function _ascEditarConGemini({ instruccion = "", scope = {} } = {}) {
  const modelo = _ascModeloGeminiActual();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${ASC_EDITOR_GEMINI_API_KEY}`;
  const prompt = `
Eres un editor experto de textos escolares en HTML.
Debes editar SOLO el alcance indicado. No resumas fuera del alcance. No expliques el proceso.
Devuelve estrictamente JSON válido con este formato:
{"replacement_html":"...","summary":"..."}

Reglas:
- Mantén el idioma y el tono del texto.
- Conserva etiquetas HTML válidas y simples.
- Si el alcance es "selection", devuelve solo el fragmento corregido o reemplazado.
- Si el alcance es "paragraph", devuelve solo el HTML del párrafo o bloque reemplazado.
- Si el alcance es "document", devuelve el HTML completo actualizado.
- No uses markdown ni fences.

Título del documento: ${ascTitulo?.value || "Sin título"}
Alcance: ${scope.mode}
Descripción del alcance: ${scope.label}
Texto actual del alcance:
${scope.text || ""}

HTML actual del alcance:
${scope.html || ""}

Contexto del documento completo:
${(ascTexto?.innerText || "").slice(0, 6000)}

Solicitud del usuario:
${instruccion}
`.trim();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.55,
        topP: 0.9,
        topK: 30,
        maxOutputTokens: 4096
      }
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "No se pudo editar con Gemini.");
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = _ascExtraerJson(text);
  if (!parsed?.replacement_html) throw new Error("Gemini no devolvió un HTML válido para aplicar.");
  return parsed;
}

function _ascNodoBloqueDesde(node) {
  if (!node || !ascTexto) return null;
  const base = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  if (!(base instanceof Element)) return null;
  return base.closest("p, h1, h2, h3, h4, h5, h6, li, blockquote, div");
}

function _ascHtmlDesdeRange(range) {
  const wrap = document.createElement("div");
  wrap.appendChild(range.cloneContents());
  return wrap.innerHTML;
}

function _ascTextoRecortado(text = "", max = 220) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}

function _ascConstruirScope(mode = "paragraph") {
  const sel = window.getSelection?.();
  const hasSelection = sel && sel.rangeCount && !sel.isCollapsed && ascTexto?.contains(sel.anchorNode);
  if (mode === "selection" && hasSelection) {
    const range = sel.getRangeAt(0).cloneRange();
    return {
      mode,
      label: "Selección actual",
      text: String(range.toString() || "").trim(),
      html: _ascHtmlDesdeRange(range),
      range
    };
  }
  if (mode === "selection") {
    mode = "paragraph";
  }
  if (mode === "paragraph") {
    const baseNode = sel?.rangeCount ? sel.getRangeAt(0).startContainer : ascTexto?.firstChild;
    const block = _ascNodoBloqueDesde(baseNode) || ascTexto?.querySelector("p, h2, h3, li, blockquote, div");
    return {
      mode: "paragraph",
      label: block ? "Párrafo actual" : "Bloque principal",
      text: String(block?.textContent || ascTexto?.innerText || "").trim(),
      html: block?.outerHTML || "<p></p>",
      blockEl: block || null
    };
  }
  return {
    mode: "document",
    label: "Documento completo",
    text: String(ascTexto?.innerText || "").trim(),
    html: String(ascTexto?.innerHTML || "<p></p>").trim()
  };
}

function refrescarAscAiScope(forceRender = false) {
  const snapshot = _ascConstruirScope(ascAiScopeMode);
  ascAiScopeSnapshot = snapshot;
  if (!ascAiScopePreview) return;
  ascAiScopePreview.textContent = `${snapshot.label}: ${_ascTextoRecortado(snapshot.text || "(Sin contenido)")}`;
  $$(".asc-ai-scope-btn[data-asc-ai-scope]", ascEditorModal).forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.ascAiScope === snapshot.mode);
  });
  if (forceRender && ascAiChatList && !ascAiChatList.children.length) {
    _ascAgregarMensajeChat("system", "La IA puede trabajar sobre la selección actual, el párrafo activo o el documento completo. Los cambios se quedan sólo en el editor hasta guardar.");
  }
}

function _ascAgregarMensajeChat(tipo = "ai", texto = "") {
  if (!ascAiChatList) return;
  const bubble = document.createElement("div");
  bubble.className = `asc-ai-chat-bubble ${tipo}`;
  bubble.textContent = String(texto || "").trim();
  ascAiChatList.appendChild(bubble);
  ascAiChatList.scrollTop = ascAiChatList.scrollHeight;
}

function openAscAiEditor() {
  if (!ascAiEditorModal) return;
  ascAiEditorModal.classList.remove("hidden");
  ascAiEditorModal.setAttribute("aria-hidden", "false");
  refrescarAscAiScope(true);
  requestAnimationFrame(() => {
    try { ascAiPrompt?.focus(); } catch (_) {}
  });
}

function closeAscAiEditor() {
  if (!ascAiEditorModal) return;
  ascAiEditorModal.classList.add("hidden");
  ascAiEditorModal.setAttribute("aria-hidden", "true");
  ascAiBusy = false;
  if (ascAiStatus) ascAiStatus.textContent = "Los cambios se aplican sólo en el editor hasta guardar.";
}

function toggleAscAiEditor() {
  if (!ascAiEditorModal) return;
  if (ascAiEditorModal.classList.contains("hidden")) openAscAiEditor();
  else closeAscAiEditor();
}

function bindAscAiEditor() {
  if (!ascEditorModal || ascEditorModal.dataset.aiBound === "1") return;
  ascEditorModal.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-asc-ai-scope]");
    if (!btn) return;
    e.preventDefault();
    ascAiScopeMode = String(btn.dataset.ascAiScope || "paragraph");
    refrescarAscAiScope();
  });
  ascAiPrompt?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      enviarAscAiPrompt();
    }
  });
  ascQuestionAiPrompt?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      enviarAscQuestionAiPrompt();
    }
  });
  ascEditorModal.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-asc-question-scope]");
    if (!btn) return;
    e.preventDefault();
    ascQuestionAiScope = String(btn.dataset.ascQuestionScope || "texto");
    refrescarAscQuestionAiScope();
  });
  ascEditorModal.dataset.aiBound = "1";
}

function _ascAplicarRespuestaIA(scope = {}, replacementHtml = "") {
  const html = normalizarContenidoAscEditor(replacementHtml || "<p></p>");
  if (scope.mode === "selection" && scope.range) {
    const range = scope.range;
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    const frag = document.createDocumentFragment();
    while (wrap.firstChild) frag.appendChild(wrap.firstChild);
    range.deleteContents();
    range.insertNode(frag);
    ascTexto.normalize();
    return true;
  }
  if (scope.mode === "paragraph" && scope.blockEl?.parentNode) {
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    const frag = document.createDocumentFragment();
    while (wrap.firstChild) frag.appendChild(wrap.firstChild);
    scope.blockEl.replaceWith(frag);
    return true;
  }
  if (scope.mode === "document") {
    ascTexto.innerHTML = html;
    return true;
  }
  return false;
}

async function enviarAscAiPrompt() {
  const texto = String(ascAiPrompt?.value || "").trim();
  if (!texto || ascAiBusy) return;
  const scope = (ascAiScopeMode === "selection" && ascAiScopeSnapshot?.mode === "selection")
    ? ascAiScopeSnapshot
    : _ascConstruirScope(ascAiScopeMode);
  ascAiScopeSnapshot = scope;
  ascAiBusy = true;
  if (ascAiStatus) ascAiStatus.textContent = "Editando con Gemini...";
  _ascAgregarMensajeChat("user", texto);
  if (ascAiPrompt) ascAiPrompt.value = "";
  try {
    const result = await _ascEditarConGemini({ instruccion: texto, scope });
    const ok = _ascAplicarRespuestaIA(scope, result.replacement_html || "");
    if (!ok) throw new Error("No pude aplicar la edición sobre el alcance actual.");
    _ascAgregarMensajeChat("ai", result.summary || "Cambio aplicado en el editor. Guarda la lectura cuando quieras conservarlo.");
    refrescarAscAiScope();
  } catch (err) {
    _ascAgregarMensajeChat("system", err?.message || "No se pudo editar la lectura con IA.");
  } finally {
    ascAiBusy = false;
    if (ascAiStatus) ascAiStatus.textContent = "Los cambios se aplican sólo en el editor hasta guardar.";
  }
}

function bindAscEditorToolbar() {
  if (!ascEditorModal || ascEditorModal.dataset.toolbarBound === "1") return;
  ascEditorModal.addEventListener("click", (e) => {
    const paletteToggle = e.target.closest("[data-palette-toggle]");
    if (paletteToggle) {
      e.preventDefault();
      const kind = String(paletteToggle.dataset.paletteToggle || "").trim();
      $$(".asc-editor-palette", ascEditorModal).forEach((wrap) => {
        wrap.classList.toggle("is-open", wrap.dataset.paletteKind === kind && !wrap.classList.contains("is-open"));
      });
      return;
    }
    const colorSwatch = e.target.closest("[data-color-target]");
    if (colorSwatch) {
      e.preventDefault();
      const targetId = String(colorSwatch.dataset.colorTarget || "").trim();
      const value = String(colorSwatch.dataset.colorValue || "");
      const input = targetId ? document.getElementById(targetId) : null;
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      $$(".asc-editor-palette", ascEditorModal).forEach((wrap) => wrap.classList.remove("is-open"));
      return;
    }
    const btn = e.target.closest("[data-editor-cmd], [data-editor-block]");
    if (!btn) return;
    e.preventDefault();
    const cmd = btn.getAttribute("data-editor-cmd");
    const block = btn.getAttribute("data-editor-block");
    if (cmd) ejecutarComandoEditor(cmd);
    if (block) aplicarBloqueEditor(block);
  });
  document.addEventListener("click", (e) => {
    if (!ascEditorModal || ascEditorModal.classList.contains("hidden")) return;
    if (e.target.closest(".asc-editor-palette")) return;
    $$(".asc-editor-palette", ascEditorModal).forEach((wrap) => wrap.classList.remove("is-open"));
  });
  ascEditorFontFamily?.addEventListener("change", (e) => {
    aplicarFuenteEditor(e.currentTarget?.value || "");
  });
  ascEditorFontSize?.addEventListener("change", (e) => {
    aplicarTamanoEditor(e.currentTarget?.value || "");
  });
  ascEditorSheetSize?.addEventListener("change", (e) => {
    aplicarTamanoHojaEditor(e.currentTarget?.value || "");
  });
  ascEditorZoomRange?.addEventListener("input", (e) => {
    ascEditorZoomActual = Number(e.currentTarget?.value || 100) || 100;
    aplicarTamanoHojaEditor(ascEditorSheetSize?.value || ascEditorSheetSizeActual || "carta");
  });
  ascEditorFontColor?.addEventListener("change", (e) => {
    aplicarColorEditor("foreColor", e.currentTarget?.value || "");
    _refrescarPaletasColorAsc();
  });
  ascEditorHighlightColor?.addEventListener("change", (e) => {
    aplicarColorEditor("hiliteColor", e.currentTarget?.value || "");
    _refrescarPaletasColorAsc();
  });
  _refrescarPaletasColorAsc();
  ascEditorModal.dataset.toolbarBound = "1";
}

function bindPreguntasAsc() {
  if (!ascEditorModal || ascEditorModal.dataset.questionsBound === "1") return;
  ascEditorModal.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-question-open]");
    if (!trigger) return;
    e.preventDefault();
    openPreguntaModalAsc(Number(trigger.getAttribute("data-question-open") || 0));
  });
  getPRefs().forEach((ref) => {
    [ref.t, ref.n, ref.r, ref.c].forEach((input) => {
      input?.addEventListener("input", renderResumenPreguntasAsc);
    });
  });
  ascQuestionModal?.addEventListener("click", (e) => {
    if (e.target === ascQuestionModal) closePreguntaModalAsc();
  });
  ascEditorModal.dataset.questionsBound = "1";
}

function renderResumenPreguntasAsc() {
  const refs = getPRefs();
  $$(".asc-question-summary", ascEditorModal).forEach((btn, index) => {
    const ref = refs[index];
    const titulo = btn.querySelector("strong");
    const subtitulo = btn.querySelector("small");
    const numero = btn.querySelector(".asc-question-summary-num");
    const texto = String(ref?.t?.value || "").trim();
    const nivel = String(ref?.n?.value || "").trim();
    const criterio = String(ref?.c?.value || "").trim();
    if (titulo) titulo.textContent = texto ? `Pregunta ${index + 1}` : `Pregunta ${index + 1}`;
    if (subtitulo) {
      subtitulo.textContent = texto
        ? `${texto.slice(0, 64)}${texto.length > 64 ? "..." : ""}`
        : "Vacía";
    }
    if (numero) numero.textContent = String(index + 1).padStart(2, "0");
    btn.classList.toggle("is-active", index === ascQuestionActiva && !ascQuestionModal?.classList.contains("hidden"));
    btn.classList.toggle("is-filled", !!texto);
    if (nivel || criterio) {
      btn.title = [nivel ? `Nivel: ${nivel}` : "", criterio ? `Criterio: ${criterio}` : ""].filter(Boolean).join(" · ");
    } else {
      btn.removeAttribute("title");
    }
  });
  $$(".asc-question-index.is-compact", ascEditorModal).forEach((btn, index) => {
    const ref = refs[index];
    btn.classList.toggle("is-active", index === ascQuestionActiva && !ascQuestionModal?.classList.contains("hidden"));
    btn.classList.toggle("is-filled", !!String(ref?.t?.value || "").trim());
  });
}

function openPreguntaModalAsc(index = 0) {
  const idx = Math.max(0, Math.min(4, Number(index) || 0));
  ascQuestionActiva = idx;
  if (ascQuestionModalTitle) ascQuestionModalTitle.textContent = `Pregunta ${idx + 1}`;
  $$("[data-question-edit]", ascQuestionModal).forEach((block) => {
    block.classList.toggle("is-active", Number(block.getAttribute("data-question-edit")) === idx);
  });
  ascQuestionModal?.classList.remove("hidden");
  ascQuestionModal?.setAttribute("aria-hidden", "false");
  refrescarAscQuestionAiScope();
  renderResumenPreguntasAsc();
  const ref = getPRefs()[idx];
  requestAnimationFrame(() => {
    try { ref?.t?.focus(); } catch (_) {}
  });
}

function closePreguntaModalAsc() {
  ascQuestionModal?.classList.add("hidden");
  ascQuestionModal?.setAttribute("aria-hidden", "true");
  closeAscQuestionAiPanel();
  renderResumenPreguntasAsc();
}

function _ascQuestionScopeSnapshot() {
  const ref = getPRefs()[ascQuestionActiva] || {};
  const texto = String(ref.t?.value || "").trim();
  const nivel = String(ref.n?.value || "").trim();
  const criterio = String(ref.c?.value || "").trim();
  const respuesta = String(ref.r?.value || "").trim();
  if (ascQuestionAiScope === "criterio") {
    return { field: "criterio", label: "Criterio", text: criterio, payload: { criterio } };
  }
  if (ascQuestionAiScope === "respuesta") {
    return { field: "respuesta", label: "Respuesta esperada", text: respuesta, payload: { respuesta } };
  }
  if (ascQuestionAiScope === "bloque") {
    return {
      field: "bloque",
      label: "Pregunta completa",
      text: [texto, nivel, criterio, respuesta].filter(Boolean).join(" | "),
      payload: { texto, nivel, criterio, respuesta }
    };
  }
  return { field: "texto", label: "Pregunta", text: texto, payload: { texto } };
}

function refrescarAscQuestionAiScope() {
  const snap = _ascQuestionScopeSnapshot();
  if (ascQuestionAiPreview) {
    ascQuestionAiPreview.textContent = `${snap.label}: ${_ascTextoRecortado(snap.text || "(Vacío)")}`;
  }
  $$(".asc-ai-scope-btn[data-asc-question-scope]", ascQuestionModal).forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.ascQuestionScope === ascQuestionAiScope);
  });
}

function _ascQuestionChat(tipo = "ai", texto = "") {
  if (!ascQuestionAiChat) return;
  const bubble = document.createElement("div");
  bubble.className = `asc-ai-chat-bubble ${tipo}`;
  bubble.textContent = String(texto || "").trim();
  ascQuestionAiChat.appendChild(bubble);
  ascQuestionAiChat.scrollTop = ascQuestionAiChat.scrollHeight;
}

function openAscQuestionAiPanel() {
  if (!ascQuestionAiPanel) return;
  ascQuestionAiPanel.classList.remove("hidden");
  ascQuestionAiPanel.setAttribute("aria-hidden", "false");
  if (ascQuestionAiChat && !ascQuestionAiChat.children.length) {
    _ascQuestionChat("system", "Gemini puede editar la pregunta activa por campo o como bloque completo. Los cambios sólo se conservan al guardar la lectura.");
  }
  refrescarAscQuestionAiScope();
}

function closeAscQuestionAiPanel() {
  if (!ascQuestionAiPanel) return;
  ascQuestionAiPanel.classList.add("hidden");
  ascQuestionAiPanel.setAttribute("aria-hidden", "true");
  ascQuestionAiBusy = false;
  if (ascQuestionAiStatus) ascQuestionAiStatus.textContent = "Los cambios sólo se aplican en el modal hasta guardar.";
}

function toggleAscQuestionAiPanel() {
  if (!ascQuestionAiPanel) return;
  if (ascQuestionAiPanel.classList.contains("hidden")) openAscQuestionAiPanel();
  else closeAscQuestionAiPanel();
}

async function _ascEditarPreguntaConGemini({ instruccion = "", scope = {} } = {}) {
  const modelo = _ascModeloGeminiActual();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${ASC_EDITOR_GEMINI_API_KEY}`;
  const prompt = `
Eres un editor experto de preguntas de comprensión escolar.
Debes devolver estrictamente JSON válido con este formato:
{"texto":"","criterio":"","respuesta":"","summary":""}

Reglas:
- Edita sólo el campo o bloque solicitado.
- Si el alcance es un campo individual, devuelve únicamente ese campo cambiado y deja los demás intactos con el mismo valor recibido.
- Si el alcance es "bloque", puedes mejorar pregunta, criterio y respuesta de forma coherente.
- No uses markdown ni fences.

Título de lectura: ${ascTitulo?.value || "Sin título"}
Pregunta activa: ${ascQuestionActiva + 1}
Alcance: ${scope.field}
Contenido actual:
${JSON.stringify(scope.payload || {}, null, 2)}

Solicitud del usuario:
${instruccion}
`.trim();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.55, topP: 0.9, topK: 30, maxOutputTokens: 2048 }
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "No se pudo editar la pregunta con Gemini.");
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = _ascExtraerJson(text);
  if (!parsed) throw new Error("Gemini no devolvió un JSON válido para la pregunta.");
  return parsed;
}

function _ascAplicarRespuestaPreguntaIA(payload = {}) {
  const ref = getPRefs()[ascQuestionActiva] || {};
  if (typeof payload.texto === "string" && ref.t) ref.t.value = payload.texto;
  if (typeof payload.criterio === "string" && ref.c) ref.c.value = payload.criterio;
  if (typeof payload.respuesta === "string" && ref.r) ref.r.value = payload.respuesta;
  renderResumenPreguntasAsc();
  refrescarAscQuestionAiScope();
}

async function enviarAscQuestionAiPrompt() {
  const texto = String(ascQuestionAiPrompt?.value || "").trim();
  if (!texto || ascQuestionAiBusy) return;
  const scope = _ascQuestionScopeSnapshot();
  ascQuestionAiBusy = true;
  if (ascQuestionAiStatus) ascQuestionAiStatus.textContent = "Editando pregunta con Gemini...";
  _ascQuestionChat("user", texto);
  if (ascQuestionAiPrompt) ascQuestionAiPrompt.value = "";
  try {
    const result = await _ascEditarPreguntaConGemini({ instruccion: texto, scope });
    _ascAplicarRespuestaPreguntaIA({
      texto: scope.field === "texto" ? (result.texto ?? scope.payload.texto ?? "") : (result.texto ?? getPRefs()[ascQuestionActiva]?.t?.value ?? ""),
      criterio: scope.field === "criterio" ? (result.criterio ?? scope.payload.criterio ?? "") : (result.criterio ?? getPRefs()[ascQuestionActiva]?.c?.value ?? ""),
      respuesta: scope.field === "respuesta" ? (result.respuesta ?? scope.payload.respuesta ?? "") : (result.respuesta ?? getPRefs()[ascQuestionActiva]?.r?.value ?? "")
    });
    _ascQuestionChat("ai", result.summary || "Cambios aplicados en la pregunta activa.");
  } catch (err) {
    _ascQuestionChat("system", err?.message || "No se pudo editar la pregunta con IA.");
  } finally {
    ascQuestionAiBusy = false;
    if (ascQuestionAiStatus) ascQuestionAiStatus.textContent = "Los cambios sólo se aplican en el modal hasta guardar.";
  }
}

function normalizarContenidoAscEditor(html = "") {
  const raw = String(html || "").trim();
  if (!raw) return "";
  const wrap = document.createElement("div");
  wrap.innerHTML = raw;
  if (!wrap.querySelector("*")) {
    return raw
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => `<p>${esc(chunk)}</p>`)
      .join("") || "<p></p>";
  }
  wrap.querySelectorAll("*").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.style.removeProperty("color");
    node.style.removeProperty("background");
    node.style.removeProperty("background-color");
    node.style.removeProperty("background-image");
    node.style.removeProperty("text-shadow");
    node.style.removeProperty("filter");
    node.style.removeProperty("opacity");
    node.style.removeProperty("mix-blend-mode");
    node.style.removeProperty("font-size");
    node.style.removeProperty("font-family");
    node.style.removeProperty("line-height");
    if (node.tagName === "FONT") {
      node.removeAttribute("color");
      node.removeAttribute("face");
      node.removeAttribute("size");
    }
  });
  return wrap.innerHTML || "<p></p>";
}

// Boot de datos
async function boot(){ await renderTabla(); }

// Render tabla
async function renderTabla(){
  ascTbody.innerHTML = `<tr><td colspan="7" class="px-3 py-6 text-center text-gray-500">Cargando lecturas…</td></tr>`;
  const snap = await getDocs(collection(db, "lecturasASC"));
  cache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  poblarFiltrosAsc(cache);

  if (!cache.length){
    ascTbody.innerHTML = "";
    ascVacio.classList.remove("hidden");
    return;
  } else {
    ascVacio.classList.add("hidden");
  }

  let html = "";
  for (const r of cache){
      html += `
      <tr data-id="${esc(r.id)}">
        <td>${esc(r.titulo||"—")}</td>
        <td>${esc(r.serie||"—")}</td>
        <td>${esc(r.nivel||"—")}</td>
        <td>${esc(r.grado||"—")}</td>
        <td>${esc(r.trimestre??"—")}</td>
        <td>${esc(r.unidad??"—")}</td>
        <td>
          <div class="lectura-row-actions">
            <button class="lectura-action-btn action-ver ascView" title="Ver lectura" aria-label="Ver lectura">
              <i class="far fa-eye"></i>
            </button>
            <button class="lectura-action-btn action-live ascReadLive" title="Leer con Gemini Flash Live" aria-label="Leer con Gemini Flash Live" data-coleccion="lecturasASC">
              <i class="fas fa-volume-up"></i>
            </button>
            <button class="lectura-action-btn action-editar ascEdit" title="Editar lectura" aria-label="Editar lectura">
              <i class="fas fa-pen"></i>
            </button>
            <button class="lectura-action-btn action-eliminar ascDel" title="Eliminar lectura" aria-label="Eliminar lectura">
              <i class="fas fa-trash"></i>
            </button>
            <button class="lectura-action-btn action-word ascWord" title="Descargar Word" aria-label="Descargar Word">
              <i class="fas fa-file-word"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }
  ascTbody.innerHTML = html;

  $$(".ascView", ascTbody).forEach(b => b.addEventListener("click", onViewRow));
  $$(".ascReadLive", ascTbody).forEach(b => b.addEventListener("click", onReadLiveRow));
  $$(".ascReadLive", ascTbody).forEach(b => b.addEventListener("dblclick", onStopLiveRow));
  $$(".ascEdit", ascTbody).forEach(b => b.addEventListener("click", onEditRow));
  $$(".ascDel",  ascTbody).forEach(b => b.addEventListener("click", onDeleteRow));
  $$(".ascWord", ascTbody).forEach(b => b.addEventListener("click", onDownloadWordRow));
  actualizarEstadoBotonesAscLive();
}

function poblarSelectAsc(selectEl, values = [], placeholder = "") {
  if (!selectEl) return;
  const current = String(selectEl.value || "");
  const unique = Array.from(new Set((Array.isArray(values) ? values : [])
    .map((v) => String(v ?? "").trim())
    .filter((v) => v && v !== "—")))
    .sort((a, b) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" }));
  selectEl.innerHTML = `<option value="">${placeholder}</option>${unique.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}`;
  if (current && unique.includes(current)) selectEl.value = current;
}

function poblarFiltrosAsc(items = []) {
  const rows = Array.isArray(items) ? items : [];
  poblarSelectAsc(ascFiltroNivel, rows.map((r) => r?.nivel || ""), "Nivel");
  poblarSelectAsc(ascFiltroGrado, rows.map((r) => r?.grado || ""), "Grado");
  poblarSelectAsc(ascFiltroTrimestre, rows.map((r) => r?.trimestre ?? ""), "Trim.");
  poblarSelectAsc(ascFiltroUnidad, rows.map((r) => r?.unidad ?? ""), "Unidad");
}

function actualizarEstadoBotonesAscLive(){
  const getter = window.cbGetLecturaGeminiLiveState;
  $$(".ascReadLive", ascTbody).forEach((btn) => {
    const id = btn.closest("tr")?.dataset.id || "";
    const coleccion = btn.dataset.coleccion || "lecturasASC";
    const state = typeof getter === "function"
      ? String(getter({ id, coleccion })?.state || "idle")
      : "idle";
    btn.dataset.state = state;
    if (state === "starting") {
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      btn.title = "Iniciando lectura...";
      btn.setAttribute("aria-label", "Iniciando lectura");
    } else if (state === "playing") {
      btn.innerHTML = '<i class="fas fa-pause"></i>';
      btn.title = "Pausar lectura";
      btn.setAttribute("aria-label", "Pausar lectura");
    } else if (state === "paused") {
      btn.innerHTML = '<i class="fas fa-play"></i>';
      btn.title = "Reanudar lectura";
      btn.setAttribute("aria-label", "Reanudar lectura");
    } else {
      btn.innerHTML = '<i class="fas fa-volume-up"></i>';
      btn.title = "Leer con Gemini Flash Live";
      btn.setAttribute("aria-label", "Leer con Gemini Flash Live");
    }
  });
}

// Filtros
function aplicarFiltrosAsc(){
  const q = String(ascBuscador?.value || "").toLowerCase().trim();
  const nivel = String(ascFiltroNivel?.value || "").toLowerCase().trim();
  const grado = String(ascFiltroGrado?.value || "").toLowerCase().trim();
  const trimestre = String(ascFiltroTrimestre?.value || "").toLowerCase().trim();
  const unidad = String(ascFiltroUnidad?.value || "").toLowerCase().trim();

  const filtradas = cache.filter((r) => {
    const coincideTexto = !q || [
      r?.titulo,
      r?.serie,
      r?.nivel,
      r?.grado,
      r?.trimestre,
      r?.unidad
    ].some((v) => String(v ?? "").toLowerCase().includes(q));
    const coincideNivel = !nivel || String(r?.nivel || "").toLowerCase() === nivel;
    const coincideGrado = !grado || String(r?.grado || "").toLowerCase() === grado;
    const coincideTrimestre = !trimestre || String(r?.trimestre ?? "").toLowerCase() === trimestre;
    const coincideUnidad = !unidad || String(r?.unidad ?? "").toLowerCase() === unidad;
    return coincideTexto && coincideNivel && coincideGrado && coincideTrimestre && coincideUnidad;
  });

  if (!filtradas.length) {
    ascTbody.innerHTML = "";
    ascVacio.classList.remove("hidden");
    return;
  }
  ascVacio.classList.add("hidden");

  let html = "";
  for (const r of filtradas){
      html += `
      <tr data-id="${esc(r.id)}">
        <td>${esc(r.titulo||"—")}</td>
        <td>${esc(r.serie||"—")}</td>
        <td>${esc(r.nivel||"—")}</td>
        <td>${esc(r.grado||"—")}</td>
        <td>${esc(r.trimestre??"—")}</td>
        <td>${esc(r.unidad??"—")}</td>
        <td>
          <div class="lectura-row-actions">
            <button class="lectura-action-btn action-ver ascView" title="Ver lectura" aria-label="Ver lectura">
              <i class="far fa-eye"></i>
            </button>
            <button class="lectura-action-btn action-live ascReadLive" title="Leer con Gemini Flash Live" aria-label="Leer con Gemini Flash Live" data-coleccion="lecturasASC">
              <i class="fas fa-volume-up"></i>
            </button>
            <button class="lectura-action-btn action-editar ascEdit" title="Editar lectura" aria-label="Editar lectura">
              <i class="fas fa-pen"></i>
            </button>
            <button class="lectura-action-btn action-eliminar ascDel" title="Eliminar lectura" aria-label="Eliminar lectura">
              <i class="fas fa-trash"></i>
            </button>
            <button class="lectura-action-btn action-word ascWord" title="Descargar Word" aria-label="Descargar Word">
              <i class="fas fa-file-word"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }
  ascTbody.innerHTML = html;
  $$(".ascView", ascTbody).forEach(b => b.addEventListener("click", onViewRow));
  $$(".ascReadLive", ascTbody).forEach(b => b.addEventListener("click", onReadLiveRow));
  $$(".ascReadLive", ascTbody).forEach(b => b.addEventListener("dblclick", onStopLiveRow));
  $$(".ascEdit", ascTbody).forEach(b => b.addEventListener("click", onEditRow));
  $$(".ascDel",  ascTbody).forEach(b => b.addEventListener("click", onDeleteRow));
  $$(".ascWord", ascTbody).forEach(b => b.addEventListener("click", onDownloadWordRow));
  actualizarEstadoBotonesAscLive();
}

// ---------- Refs del editor SIEMPRE scoped al modal del editor ----------
function getPRefs() {
  const w = ascEditorModal || document; // 🔧 reemplazo de ascEditorWrap
  return [
    { t: w.querySelector("#ascP1"), n: w.querySelector("#ascP1Nivel"), r: w.querySelector("#ascP1Resp"), c: w.querySelector("#ascP1Crit") },
    { t: w.querySelector("#ascP2"), n: w.querySelector("#ascP2Nivel"), r: w.querySelector("#ascP2Resp"), c: w.querySelector("#ascP2Crit") },
    { t: w.querySelector("#ascP3"), n: w.querySelector("#ascP3Nivel"), r: w.querySelector("#ascP3Resp"), c: w.querySelector("#ascP3Crit") },
    { t: w.querySelector("#ascP4"), n: w.querySelector("#ascP4Nivel"), r: w.querySelector("#ascP4Resp"), c: w.querySelector("#ascP4Crit") },
    { t: w.querySelector("#ascP5"), n: w.querySelector("#ascP5Nivel"), r: w.querySelector("#ascP5Resp"), c: w.querySelector("#ascP5Crit") },
  ];
}

// Editor: Nuevo / Editar
function openEditorNew(){
  configureAscSharedEditor(null);
  MODO = "new";
  ascId.value = "";
  ascForm.reset();
  ascSerie.value = "Primaria en Forma";
  ascTexto.innerHTML = "<p></p>";
  if (ascEditorFontColor) ascEditorFontColor.value = "";
  if (ascEditorHighlightColor) ascEditorHighlightColor.value = "";
  toggleMetaAsc(false);
  togglePreguntasAsc(false);
  ascEditorFontSizeActual = 18;
  if (ascEditorFontSize) ascEditorFontSize.value = "18";
  ascEditorZoomActual = 100;
  if (ascEditorZoomRange) ascEditorZoomRange.value = "100";
  if (ascEditorSheetSize) ascEditorSheetSize.value = "carta";
  aplicarTamanoHojaEditor("carta");

  // limpiar preguntas con scope
  getPRefs().forEach(ref=>{
    if (ref.t) ref.t.value = "";
    if (ref.n) ref.n.value = "";
    if (ref.r) ref.r.value = "";
    if (ref.c) ref.c.value = "";
  });

  renderResumenPreguntasAsc();
  _refrescarPaletasColorAsc();
  openEditorModal(); // 🔁 en lugar de toggleEditor(true)
}

function onEditRow(e){
  const id = e.currentTarget.closest("tr")?.dataset.id;
  const x = cache.find(d=>d.id===id);
  if (!x) return;

  configureAscSharedEditor(null);
  MODO = "edit";
  ascId.value = id;

  ascSerie.value     = x.serie || "";
  ascNivel.value     = x.nivel || "";
  ascGrado.value     = x.grado || "";
  ascTrimestre.value = x.trimestre ?? "";
  ascUnidad.value    = x.unidad ?? "";
  ascTitulo.value    = x.titulo || "";
  ascTexto.innerHTML = normalizarContenidoAscEditor(x.textoLectura || "<p></p>");
  if (!String(ascTexto.innerHTML || "").trim()) {
    ascTexto.innerHTML = "<p></p>";
  }
  toggleMetaAsc(false);
  togglePreguntasAsc(false);
  ascEditorFontSizeActual = Number(ascEditorFontSize?.value || 18) || 18;
  if (ascEditorFontSize) ascEditorFontSize.value = String(Math.round(ascEditorFontSizeActual));
  ascEditorZoomActual = Number(ascEditorZoomRange?.value || 100) || 100;
  if (ascEditorZoomRange) ascEditorZoomRange.value = String(Math.round(ascEditorZoomActual));
  if (ascEditorSheetSize) ascEditorSheetSize.value = ascEditorModal?.dataset.sheetSize || "carta";
  aplicarTamanoHojaEditor(ascEditorSheetSize?.value || "carta");
  if (ascEditorFontColor) ascEditorFontColor.value = "";
  if (ascEditorHighlightColor) ascEditorHighlightColor.value = "";

const P = getPRefs();
const preguntas = Array.isArray(x.preguntas) ? x.preguntas : [];
P.forEach((ref, i) => {
  const p = preguntas[i] || {};
  if (ref.t) ref.t.value = p.texto || "";
  if (ref.n) ref.n.value = p.nivel || "";
  if (ref.r) ref.r.value = p.respuesta || "";
  if (ref.c) ref.c.value = p.criterio || "";
});
  renderResumenPreguntasAsc();
  _refrescarPaletasColorAsc();
  openEditorModal();
  requestAnimationFrame(() => {
    try { ascTexto.scrollIntoView({ block: "start", inline: "nearest" }); } catch (_) {}
  });
}

async function onReadLiveRow(e){
  e.preventDefault();
  e.stopPropagation();
  const id = e.currentTarget.closest("tr")?.dataset.id;
  if (!id) return;
  const controller = window.cbControlLecturaGeminiLive;
  if (typeof controller !== "function") {
    alert("La lectura con Gemini Flash Live no está disponible en este momento.");
    return;
  }
  actualizarEstadoBotonesAscLive();
  const result = await controller({ id, coleccion: "lecturasASC" });
  actualizarEstadoBotonesAscLive();
  if (!result?.ok) {
    alert("No se pudo iniciar la lectura con Gemini Flash Live.");
  }
}

async function onStopLiveRow(e){
  e.preventDefault();
  e.stopPropagation();
  const id = e.currentTarget.closest("tr")?.dataset.id;
  if (!id) return;
  const controller = window.cbControlLecturaGeminiLive;
  if (typeof controller !== "function") return;
  await controller({ id, coleccion: "lecturasASC" }, { stop: true });
  actualizarEstadoBotonesAscLive();
}

async function onViewRow(e){
  e.preventDefault();
  e.stopPropagation();
  const id = e.currentTarget.closest("tr")?.dataset.id;
  if (!id) return;
  const snap = await getDoc(doc(db, "lecturasASC", id));
  if (!snap.exists()) {
    alert("Lectura no encontrada.");
    return;
  }
  const d = snap.data() || {};
  const agentExclusive = typeof window.cbIsAgentExclusiveMode === "function"
    ? window.cbIsAgentExclusiveMode() === true
    : false;
  if (agentExclusive && typeof window.cbOpenLecturasAgentViewer === "function") {
    window.cbOpenLecturasAgentViewer({
      id,
      coleccion: "lecturasASC",
      sourceCollection: "lecturasASC",
      titulo: d.titulo || "Lectura sin título",
      htmlLectura: d.textoLectura || "<p>(Sin contenido)</p>",
      preguntas: Array.isArray(d.preguntas) ? d.preguntas : [],
      metadatos: {
        nivel: d.nivel || "",
        grado: d.grado || "",
        trimestre: d.trimestre || "",
        unidad: d.unidad || ""
      }
    });
    return;
  }
  const { modal, contenido } = getResultadoLecturaRefs();
  if (!modal || !contenido) {
    alert("No está disponible el visor de lectura.");
    return;
  }
  contenido.innerHTML = `
    <article class="lectura-vista-completa">
      <h2 style="margin-bottom:20px; color:#333;">${esc(d.titulo || "Lectura sin título")}</h2>
      <div class="lectura-vista-body">
        ${d.textoLectura || "<p>(Sin contenido)</p>"}
      </div>
    </article>
  `;
  const ascFilter = String(ascBuscador?.value || "").trim();
  try { window.cbUnidadDock?.openSection?.("modalResultadoLectura"); } catch (_) {}
  if (typeof window.cbOpenReadingResultPanel === "function") {
    window.cbOpenReadingResultPanel(modal, {
      returnToSection: "ascModal",
      ascFilter,
      ascRowId: id
    });
  } else {
    modal.style.display = "block";
    document.body.style.overflow = "hidden";
  }
}

async function onDownloadWordRow(e){
  e.preventDefault();
  e.stopPropagation();
  const id = e.currentTarget.closest("tr")?.dataset.id;
  if (!id) return;
  const snap = await getDoc(doc(db, "lecturasASC", id));
  if (!snap.exists()) {
    alert("No se pudo descargar. Lectura no encontrada.");
    return;
  }
  const d = snap.data() || {};
  if (!window.htmlDocx?.asBlob) {
    alert("La librería para descargar Word no está disponible.");
    return;
  }
  const titulo = d.titulo || "lectura-asc";
  const preguntas = Array.isArray(d.preguntas) && d.preguntas.length
    ? `
      <ol>
        ${d.preguntas.map((p) => `
          <li>
            <p><strong>${p?.texto || ""}</strong></p>
            <p><strong>Nivel PISA:</strong> Nivel ${p?.nivel || "?"} — <strong>Criterio:</strong> ${p?.criterio || "—"}</p>
            <p style="color:#c970d6;">${p?.respuesta || ""}</p>
          </li>
        `).join("")}
      </ol>
    `
    : "<p>(Sin preguntas guardadas)</p>";

  const fullHTML = `
    <h2 style="margin-bottom:10px;">${esc(titulo)}</h2>
    ${d.textoLectura || "<p>(Sin contenido)</p>"}
    <hr style="margin:30px 0;"/>
    <h2 style="margin-bottom:10px;">Preguntas de Comprensión</h2>
    ${preguntas}
  `.trim();

  const blob = window.htmlDocx.asBlob(fullHTML);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${titulo.replace(/[^a-z0-9]/gi, "_").toLowerCase()}-${id}.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

window.addEventListener("cb:lectura-live-state", actualizarEstadoBotonesAscLive);


// Eliminar
async function onDeleteRow(e){
  const id = e.currentTarget.closest("tr")?.dataset.id; if (!id) return;
  if (!confirm("¿Eliminar esta lectura?")) return;
  try{
    await deleteDoc(doc(db,"lecturasASC", id));
    await renderTabla();
  }catch(err){
    alert("❌ No se pudo eliminar.");
  }
}

// Guardar
async function onSubmit(ev){
  ev.preventDefault();
  if (ascSharedEditorContext?.onSave) {
    const payload = collectSharedEditorPayload();
    if (!payload.titulo || !payload.nivel || !payload.grado || !payload.contenidoHTML) {
      alert("Completa título, nivel, grado y texto de lectura.");
      return;
    }
    try {
      await ascSharedEditorContext.onSave(payload);
      closeEditorModal();
      alert("✅ Guardado.");
    } catch (_) {
      alert("❌ No se pudo guardar.");
    }
    return;
  }
  const payload = collectForm();
  if (!payload.titulo || !payload.nivel || !payload.grado || !payload.textoLectura){
    alert("Completa título, nivel, grado y texto de lectura.");
    return;
  }
  try{
    if (MODO==="edit" && ascId.value){
      await updateDoc(doc(db,"lecturasASC", ascId.value), payload);
    } else {
      await addDoc(collection(db,"lecturasASC"), { ...payload, createdAt:new Date(), userId: auth.currentUser?.uid || "anónimo" });
    }
    closeEditorModal();
    await renderTabla();
    alert("✅ Guardado.");
  }catch(err){
    alert("❌ No se pudo guardar.");
  }
}

function collectForm(){
  const preguntas = [];
  
  // Usar las referencias correctas del editor modal
  const P = getPRefs();
  
  P.forEach((ref, index) => {
    // Verificar que existe contenido en la pregunta antes de incluirla
    const textoPregunta = ref.t?.value?.trim() || "";
    const respuesta = ref.r?.value?.trim() || "";
    const criterio = ref.c?.value?.trim() || "";
    const nivel = ref.n?.value?.trim() || "";
    
    // Solo incluir pregunta si tiene texto
    if (textoPregunta) {
      preguntas.push({
        texto: textoPregunta,
        respuesta: respuesta,
        criterio: criterio,
        nivel: nivel
      });
    }
  });

  // 🔥 CONVERTIR GRADO A STRING
  const gradoRaw = ascGrado?.value || "";
  const gradoFinal = String(gradoRaw).trim();

  return {
    serie: (ascSerie?.value || "").trim(),
    nivel: (ascNivel?.value || "").trim(),
    grado: gradoFinal,
    trimestre: ascTrimestre?.value ? String(ascTrimestre.value).trim() : "",
    unidad: ascUnidad?.value ? String(ascUnidad.value).trim() : "",
    titulo: (ascTitulo?.value || "").trim(),
    textoLectura: (ascTexto?.innerHTML || "").trim(),
    preguntas: preguntas
  };
}

window.cbOpenLecturaEditorCompartido = async function cbOpenLecturaEditorCompartido(options = {}) {
  const context = {
    mode: options.mode || "lecturas-nuevas",
    serieLabel: options.serieLabel || "Sinopsis",
    nivelLabel: options.nivelLabel || "Nivel",
    gradoLabel: options.gradoLabel || "Grado",
    trimestreLabel: options.trimestreLabel || "Trimestre",
    unidadLabel: options.unidadLabel || "Unidad",
    titlePlaceholder: options.titlePlaceholder || "Escribe el título de la lectura",
    onSave: typeof options.onSave === "function" ? options.onSave : null
  };
  configureAscSharedEditor(context);
  MODO = "shared";
  if (ascId) ascId.value = String(options.id || "");
  if (ascSerie) ascSerie.value = String(options.tema || options.serie || "");
  if (ascNivel) ascNivel.value = String(options.nivel || "");
  if (ascGrado) ascGrado.value = String(options.grado || "");
  if (ascTrimestre) ascTrimestre.value = String(options.trimestre || "");
  if (ascUnidad) ascUnidad.value = String(options.unidad || "");
  if (ascTitulo) ascTitulo.value = String(options.titulo || "");
  if (ascTexto) {
    ascTexto.innerHTML = normalizarContenidoAscEditor(options.contenidoHTML || options.textoLectura || options.contenidoPlano || "<p></p>");
    if (!String(ascTexto.innerHTML || "").trim()) ascTexto.innerHTML = "<p></p>";
  }
  getPRefs().forEach((ref) => {
    if (ref.t) ref.t.value = "";
    if (ref.n) ref.n.value = "";
    if (ref.r) ref.r.value = "";
    if (ref.c) ref.c.value = "";
  });
  renderResumenPreguntasAsc();
  if (ascEditorFontColor) ascEditorFontColor.value = "";
  if (ascEditorHighlightColor) ascEditorHighlightColor.value = "";
  _refrescarPaletasColorAsc();
  ascEditorFontSizeActual = Number(ascEditorFontSize?.value || 18) || 18;
  ascEditorZoomActual = Number(ascEditorZoomRange?.value || 100) || 100;
  aplicarTamanoHojaEditor(ascEditorSheetSize?.value || "carta");
  toggleMetaAsc(false);
  togglePreguntasAsc(true);
  openEditorModal();
  requestAnimationFrame(() => {
    try { ascTexto?.focus(); } catch (_) {}
  });
};



// Import / Export XLSX
async function importarXlsx(file){
  try{
    await ensureXLSX();
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf, {type:"array"});
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const rows= XLSX.utils.sheet_to_json(ws, {defval:""});

    let ok=0;
    for (const r of rows){
      const preguntas=[];
      for (let i=1;i<=5;i++){
        const t = r[`p${i}`]||"";
        if (!t) continue;
        preguntas.push({
          texto: t,
          nivel: r[`p${i}_nivel`]||"",
          criterio: r[`p${i}_criterio`]||"",
          respuesta: r[`p${i}_resp`]||""
        });
      }

      const textoImportado = r.textoLectura || "";
      const textoFormateado = procesarTextoLectura(textoImportado);

      // 🔥 CONVERTIR GRADO A STRING (por si viene como número del Excel)
      const gradoImportado = r.grado || "";
      const gradoFinal = String(gradoImportado).trim(); // "1", "2", "3", etc.

      const docu = {
        serie: r.serie||"",
        nivel: r.nivel||"",
        grado: gradoFinal, // 🔥 Siempre string
        trimestre: r.trimestre||"",
        unidad: r.unidad||"",
        titulo: r.titulo||"",
        textoLectura: textoFormateado,
        preguntas,
        createdAt: new Date()
      };

      if (!docu.titulo || !docu.nivel || !docu.grado) continue;
      await addDoc(collection(db,"lecturasASC"), docu);
      ok++;
    }
    await renderTabla();
    alert(`✅ Importación completada (${ok})`);
  }catch(err){
    alert("❌ No se pudo importar el XLSX.");
  }
}


async function exportarXlsx(){
  try{
    await ensureXLSX();
    const snap = await getDocs(collection(db,"lecturasASC"));
    const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    if (!rows.length){ alert("No hay lecturas para exportar."); return; }

    const headers = ["id","serie","nivel","grado","trimestre","unidad","titulo","textoLectura",
      "p1","p1_nivel","p1_criterio","p1_resp",
      "p2","p2_nivel","p2_criterio","p2_resp",
      "p3","p3_nivel","p3_criterio","p3_resp",
      "p4","p4_nivel","p4_criterio","p4_resp",
      "p5","p5_nivel","p5_criterio","p5_resp"
    ];
    const aoa = [headers];

    for (const r of rows){
      const p = (r.preguntas||[]);
      const flat = (i)=>[ p[i]?.texto||"", p[i]?.nivel||"", p[i]?.criterio||"", p[i]?.respuesta||"" ];
      
      // 🔥 ASEGURAR QUE EL GRADO SEA STRING AL EXPORTAR
      const gradoExportar = String(r.grado || "");
      
      aoa.push([
        r.id||"", 
        r.serie||"", 
        r.nivel||"", 
        gradoExportar, // 🔥 Siempre string al exportar
        r.trimestre||"", 
        r.unidad||"", 
        r.titulo||"", 
        extraerTextoPlano(r.textoLectura || ""),
        ...flat(0), ...flat(1), ...flat(2), ...flat(3), ...flat(4)
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = headers.map(h=>({ wch: Math.min(60, Math.max(10, String(h).length+2)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "LecturasASC");
    XLSX.writeFile(wb, `Lecturas_ASC_${new Date().toISOString().slice(0,10)}.xlsx`, {compression:true});
  }catch(err){
    alert("❌ Error al exportar.");
  }
}

function extraerTextoPlano(html){
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const texto = tmp.innerText || tmp.textContent || "";
  // Normaliza saltos dobles para separar párrafos de forma legible
  return texto.replace(/\n{2,}/g, '\n').trim();
}

function convertirTextoPlanoAHTML(textoPlano) {
  return textoPlano
    .split('\n')
    .map(linea => `<p>${linea.trim()}</p>`)
    .join('');
}

function convertirMarkdownBasicoAHTML(texto) {
  return texto
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')   // negrita
    .replace(/_(.*?)_/g, '<em>$1</em>');                 // cursiva
}

function procesarTextoLectura(textoPlano) {
  const conEstilo = convertirMarkdownBasicoAHTML(textoPlano);
  return convertirTextoPlanoAHTML(conEstilo);
}

window.cbAgentLecturaAsc = {
  openLista() {
    openAscModal();
  },
  openNueva() {
    openEditorNew();
  }
};
