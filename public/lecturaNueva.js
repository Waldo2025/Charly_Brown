
// ---------------------- Imports Firebase ----------------------
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import {
  getFirestore, doc, getDoc, updateDoc, collection, addDoc,
  query, where, getDocs, deleteDoc, orderBy, onSnapshot, limit
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js';
import { buildApiUrl } from './api-client.js';
import { firebaseWebConfig, assertFirebaseWebConfig } from './firebase-web-config.js';
import { bootstrapFirebaseAppCheck } from './firebase-app-check.js';

// ---------------------- Firebase ----------------------
const firebaseConfig = assertFirebaseWebConfig(firebaseWebConfig);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
void bootstrapFirebaseAppCheck(app);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// ---------------------- Gemini ----------------------
let runtimeConfigLoadPromise = null;

async function ensureRuntimeConfigLoaded() {
  if (window.__CHARLY_CONFIG__) return;
  if (runtimeConfigLoadPromise) return runtimeConfigLoadPromise;
  runtimeConfigLoadPromise = new Promise((resolve) => {
    (async () => {
      try {
        const host = String(window.location.hostname || "").toLowerCase();
        const isLocalHost = host === "127.0.0.1" || host === "localhost";
        const allowRuntimeConfig = isLocalHost || window.__CHARLY_ENABLE_RUNTIME_CONFIG__ === true;
        if (!allowRuntimeConfig) {
          resolve();
          return;
        }
        const stamp = Date.now();
        const candidates = [
          `./config.local.js?v=${stamp}`,   // when server root is /public
          `../config.local.js?v=${stamp}`,  // when server root is project root
          `/config.local.js?v=${stamp}`,
          `/public/config.local.js?v=${stamp}`
        ];
        const canUseJsMime = (contentType = "") => {
          const ct = String(contentType || "").toLowerCase();
          if (!ct) return true;
          return ct.includes("javascript") || ct.includes("text/plain") || ct.includes("application/octet-stream");
        };
        for (const url of candidates) {
          if (window.__CHARLY_CONFIG__) break;
          try {
            const probe = await fetch(url, { method: "GET", cache: "no-store" });
            if (!probe.ok) continue;
            if (!canUseJsMime(probe.headers.get("content-type"))) continue;
            await new Promise((done) => {
              const s = document.createElement("script");
              s.src = url;
              s.async = true;
              s.onload = () => done();
              s.onerror = () => done();
              document.head.appendChild(s);
              setTimeout(done, 1200);
            });
          } catch (_) {
            // try next
          }
        }
      } catch (_) {
        // noop
      } finally {
        resolve();
      }
    })();
  });
  return runtimeConfigLoadPromise;
}

function normalizeGeminiModel(model = "") {
  return String(model || "")
    .replace(/^models\//i, "")
    .replace(/:generateContent$/i, "")
    .replace(/:streamGenerateContent$/i, "")
    .trim();
}

async function parseJsonResponseSafe(response) {
  const rawText = await response.text().catch(() => "");
  if (!rawText) return { data: {}, rawText: "" };
  try {
    return { data: JSON.parse(rawText), rawText };
  } catch (_) {
    return { data: {}, rawText };
  }
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function buildGenerationConfig(task = 'default') {
  const base = {
    maxOutputTokens: 8192,
    candidateCount: 1
  };

  const profiles = {
    default: { temperature: 0.75, topP: 0.9, topK: 40 },
    creative: { temperature: 0.95, topP: 0.95, topK: 40 },
    factual: { temperature: 0.35, topP: 0.8, topK: 20 },
    rewrite: { temperature: 0.6, topP: 0.9, topK: 30 },
    json: { temperature: 0.45, topP: 0.85, topK: 25 }
  };

  const selected = profiles[task] || profiles.default;
  return { ...base, ...selected };
}

function extractJSONFromModelText(raw = '') {
  const cleaned = String(raw || '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  if (!cleaned) return null;

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // intenta rescatar el primer bloque JSON
  }

  const firstObj = cleaned.indexOf('{');
  const lastObj = cleaned.lastIndexOf('}');
  if (firstObj !== -1 && lastObj > firstObj) {
    try { return JSON.parse(cleaned.slice(firstObj, lastObj + 1)); } catch (_) {}
  }

  const firstArr = cleaned.indexOf('[');
  const lastArr = cleaned.lastIndexOf(']');
  if (firstArr !== -1 && lastArr > firstArr) {
    try { return JSON.parse(cleaned.slice(firstArr, lastArr + 1)); } catch (_) {}
  }

  return null;
}

async function enviarPrompt(mensajes, intentos = 0, options = {}) {
  const {
    task = 'default',
    generationConfig = {},
    responseMimeType = null
  } = options;

  // ✅ Obtener el modelo seleccionado del select
  const modeloSelect = document.getElementById("selectGeminiEndpoint2");
  const modeloSeleccionado = normalizeGeminiModel(modeloSelect?.value || "gemini-2.5-flash-lite");
  
  const finalGenerationConfig = {
    ...buildGenerationConfig(task),
    ...generationConfig
  };

  // Añade una ligera variación por llamada para evitar respuestas casi idénticas
  if (task === 'creative' || task === 'default') {
    finalGenerationConfig.temperature = Number(
      Math.max(0, Math.min(1.5, randRange(
        (finalGenerationConfig.temperature ?? 0.8) - 0.08,
        (finalGenerationConfig.temperature ?? 0.8) + 0.08
      ))).toFixed(2)
    );
    finalGenerationConfig.topP = Number(
      Math.max(0.1, Math.min(1, randRange(
        (finalGenerationConfig.topP ?? 0.9) - 0.03,
        (finalGenerationConfig.topP ?? 0.9) + 0.03
      ))).toFixed(2)
    );
  }

  if (responseMimeType) {
    finalGenerationConfig.responseMimeType = responseMimeType;
  }

  await ensureRuntimeConfigLoaded();
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : "";
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(buildApiUrl("/api/gemini/generate"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: modeloSeleccionado,
      payload: {
        contents: mensajes.map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        })),
        generationConfig: finalGenerationConfig
      }
    })
  });

  if (response.status === 503 && intentos < 2) {
    await new Promise(res => setTimeout(res, 1500));
    return await enviarPrompt(mensajes, intentos + 1, options);
  }

  const { data, rawText } = await parseJsonResponseSafe(response);
  if (!response.ok) {
    const detail = String(
      data?.error?.message ||
      data?.error ||
      rawText ||
      `HTTP ${response.status}`
    ).slice(0, 280);
    throw new Error(detail || "Error al generar contenido");
  }
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ---------------------- Utilidades ----------------------
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const stripHTML = (html) => (html || '').replace(/<[^>]+>/g, '').trim();
const truncateText = (txt = '', max = 120) => {
  const clean = String(txt || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
};
const escapeHTML = (txt = '') =>
  String(txt)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const show = (el) => el && (el.style.display = 'block');
const hide = (el) => el && (el.style.display = 'none');
let modalNuevaLecturaCloseTimer = null;
let modalResultadoLecturaCloseTimer = null;
let modalResultadoLecturaReturnState = null;

function abrirPanelNuevaLectura(modal = null) {
  const el = modal || document.getElementById('modalNuevaLectura');
  if (!el) return;
  if (modalNuevaLecturaCloseTimer) {
    clearTimeout(modalNuevaLecturaCloseTimer);
    modalNuevaLecturaCloseTimer = null;
  }
  el.style.display = 'block';
  el.classList.add('is-open');
  el.setAttribute('aria-hidden', 'false');
}

function cerrarPanelNuevaLectura(modal = null) {
  const el = modal || document.getElementById('modalNuevaLectura');
  if (!el) return;
  el.classList.remove('is-open');
  el.setAttribute('aria-hidden', 'true');
  if (modalNuevaLecturaCloseTimer) clearTimeout(modalNuevaLecturaCloseTimer);
  modalNuevaLecturaCloseTimer = setTimeout(() => {
    if (!el.classList.contains('is-open')) el.style.display = 'none';
    modalNuevaLecturaCloseTimer = null;
  }, 240);
}

function abrirPanelResultadoLectura(modal = null) {
  const el = modal || document.getElementById('modalResultadoLectura');
  if (!el) return;
  if (modalResultadoLecturaCloseTimer) {
    clearTimeout(modalResultadoLecturaCloseTimer);
    modalResultadoLecturaCloseTimer = null;
  }
  el.style.display = 'block';
  requestAnimationFrame(() => {
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
  });
}

function restaurarSeccionTrasCerrarResultado(state = null) {
  const target = String(state?.returnToSection || "").trim();
  if (!target) return;
  if (target !== "ascModal") return;
  try {
    window.cbUnidadDock?.openSection?.("ascModal");
  } catch (_) {}
  const ascFilter = String(state?.ascFilter || "").trim();
  const targetId = String(state?.ascRowId || "").trim();
  const tryRestoreAsc = async () => {
    const btnAsc = document.getElementById("btnLecturasAsc");
    if (btnAsc && typeof btnAsc.click === "function") {
      btnAsc.click();
    }
    for (let i = 0; i < 24; i++) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      const ascTbody = document.getElementById("ascTbody");
      if (!ascTbody) continue;
      const rowsReady = ascTbody.querySelectorAll("tr[data-id]").length > 0;
      const htmlReady = String(ascTbody.innerHTML || "").trim().length > 0;
      if (!rowsReady && !htmlReady) continue;
      const input = document.getElementById("ascBuscador");
      if (input && ascFilter) {
        input.value = ascFilter;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (typeof window.aplicarFiltrosAsc === "function") {
        try { window.aplicarFiltrosAsc(); } catch (_) {}
      }
      if (targetId) {
        const safeId = (typeof CSS !== "undefined" && typeof CSS.escape === "function")
          ? CSS.escape(targetId)
          : targetId.replace(/["\\]/g, "\\$&");
        const row = document.querySelector(`#ascTbody tr[data-id="${safeId}"]`);
        if (row && typeof row.scrollIntoView === "function") {
          try { row.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (_) {}
        }
      }
      return;
    }
  };
  tryRestoreAsc().catch(() => {});
}

function cerrarPanelResultadoLectura(modal = null, options = {}) {
  const el = modal || document.getElementById('modalResultadoLectura');
  if (!el) return;
  const explicitReturn = options && typeof options === "object" ? options.returnToSection : undefined;
  const shouldKeepReturn = explicitReturn !== undefined && explicitReturn !== null && String(explicitReturn).trim() !== "";
  const returnState = shouldKeepReturn
    ? {
      ...modalResultadoLecturaReturnState,
      ...options,
      returnToSection: String(explicitReturn).trim()
    }
    : (modalResultadoLecturaReturnState ? { ...modalResultadoLecturaReturnState } : null);
  modalResultadoLecturaReturnState = null;
  el.classList.remove('is-open');
  el.setAttribute('aria-hidden', 'true');
  if (modalResultadoLecturaCloseTimer) clearTimeout(modalResultadoLecturaCloseTimer);
  modalResultadoLecturaCloseTimer = setTimeout(() => {
    if (!el.classList.contains('is-open')) el.style.display = 'none';
    modalResultadoLecturaCloseTimer = null;
    restaurarSeccionTrasCerrarResultado(returnState);
  }, 240);
}

window.cbOpenReadingResultPanel = function cbOpenReadingResultPanel(modalEl = null, options = {}) {
  const target = options && typeof options === "object"
    ? String(options.returnToSection || "").trim()
    : "";
  const ascFilter = options && typeof options === "object"
    ? String(options.ascFilter || "").trim()
    : "";
  const ascRowId = options && typeof options === "object"
    ? String(options.ascRowId || "").trim()
    : "";
  modalResultadoLecturaReturnState = target
    ? { returnToSection: target, ascFilter, ascRowId }
    : null;
  abrirPanelResultadoLectura(modalEl);
  return true;
};

window.cbCloseReadingResultPanel = function cbCloseReadingResultPanel(modalEl = null, options = {}) {
  cerrarPanelResultadoLectura(modalEl, options);
  return true;
};

// Spinner inteligente (usa el del modal visible)
function getVisibleSpinner() {
  const resVisible = $('#modalResultadoLectura') && getComputedStyle($('#modalResultadoLectura')).display !== 'none';
  if (resVisible) {
    return { box: $('#spinnerResultadoLectura'), label: $('#progresoTextoResultado') };
  }
  return { box: $('#spinnerNuevaLectura'), label: $('#progresoTexto') };
}
function showSpinner(msg = '') {
  hideSpinner();
  const { box, label } = getVisibleSpinner();
  if (box) box.style.display = 'flex';
  if (label && msg) label.textContent = msg;
}
function hideSpinner() {
  ['spinnerNuevaLectura','spinnerResultadoLectura'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}
function setProgress(msg='') {
  const { label } = getVisibleSpinner();
  if (label) label.textContent = msg;
}

function htmlToPlainText(html = '') {
  let txt = (html || '')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<h[1-6][^>]*>/gi, '')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>\s*/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<[^>]+>/g, '');
  return txt.replace(/\n{3,}/g, '\n\n').trim();
}

// 🔒 Sanitiza y PRESERVA color (magenta en solucionario) y margin-bottom en <p> + enlaces seguros
// ⛑️ Limpia CSS pegado en texto y cabeceras tipo "Lectura: ..."
function cleanGeneratedHTML(raw = "") {
  if (!raw) return "";

  // 1) Fuera cualquier <style>…</style> y <script>…</script> por si vinieran
  let html = raw
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "");

  // 2) Quita bloques CSS “en texto plano” (body {…} .clase {…} th, td {…})
  //    – de forma segura, solo cuando no están dentro de etiquetas válidas
  html = html.replace(/(^|[\n\r])\s*([^{<>\n\r]{0,60})\s*\{[^}]*\}\s*(?=$|[\n\r])/g, "$1");

  // 3) Quita posible cabecera tipo "Lectura: Título …"
  html = html.replace(/(^|\n|\r)\s*Lectura:\s.*?(?=<|$)/i, "");

  // 4) Limpia restos de líneas vacías múltiples
  html = html.replace(/\n{3,}/g, "\n\n");

  return html.trim();
}

// 🔒 Sanitiza y PRESERVA color (magenta en solucionario) y margin-bottom en <p> + enlaces seguros
function sanitizeHTML(html = '') {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  const allowed = new Set([
    'P','BR','STRONG','EM','UL','OL','LI','H2','H3','H4',
    'TABLE','THEAD','TBODY','TR','TH','TD','SMALL','SPAN','A'
  ]);

  // Etiquetas que se eliminan COMPLETAS (con su contenido) — no se desenvuelven
  const dropEntirely = new Set(['STYLE','SCRIPT','HEAD']);

  // Recorremos con snapshot porque iremos eliminando nodos
  const all = tmp.getElementsByTagName('*');
  const nodes = Array.from(all);

  for (const el of nodes) {
    const tag = el.tagName;

    if (dropEntirely.has(tag)) {
      el.remove();               // 🔥 fuera CSS/JS/HEAD completo
      continue;
    }

    if (!allowed.has(tag)) {
      // Desenvuelve (conserva hijos) solo si es una etiqueta normal no permitida
      const frag = document.createDocumentFragment();
      while (el.firstChild) frag.appendChild(el.firstChild);
      el.replaceWith(frag);
      continue;
    }

    // Normaliza estilos permitidos
    if (tag === 'P') {
      const style = el.getAttribute('style') || '';
      let newStyle = style;
      if (!/margin-bottom\s*:/i.test(newStyle)) {
        newStyle = (newStyle ? newStyle.trim().replace(/;?$/, '; ') : '') + 'margin-bottom:20px;';
      } else {
        newStyle = newStyle.replace(/margin-bottom\s*:\s*[^;]+;/i, 'margin-bottom:20px;');
      }
      el.setAttribute('style', newStyle.trim());
    } else if (tag === 'SPAN') {
      const style = el.getAttribute('style') || '';
      const m = style.match(/color\s*:\s*[^;]+/i);
      el.setAttribute('style', m ? m[0] + ';' : '');
    } else if (tag === 'A') {
      const href = el.getAttribute('href') || '';
      if (!/^https?:\/\//i.test(href)) {
        const frag = document.createDocumentFragment();
        while (el.firstChild) frag.appendChild(el.firstChild);
        el.replaceWith(frag);
      } else {
        el.removeAttribute('style');
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    } else {
      el.removeAttribute('style');
    }
  }

  return tmp.innerHTML;
}

function buildQuestionListItem(pregunta = {}, index = 0) {
  const li = document.createElement("li");
  const strong = document.createElement("strong");
  strong.textContent = `${index + 1}.`;
  li.appendChild(strong);
  li.append(` ${String(pregunta?.texto || "Pregunta sin texto")}`);

  const details = document.createElement("div");
  details.style.marginLeft = "1em";

  const nivel = document.createElement("small");
  nivel.innerHTML = `<strong>Nivel:</strong> ${escapeHTML(pregunta?.nivel || "—")}`;
  const criterio = document.createElement("small");
  criterio.innerHTML = `<strong>Criterio:</strong> ${escapeHTML(pregunta?.criterio || "—")}`;
  const respuesta = document.createElement("small");
  respuesta.innerHTML = `<strong>Respuesta esperada:</strong> ${escapeHTML(pregunta?.respuesta || "—")}`;

  details.append(nivel, document.createElement("br"), criterio, document.createElement("br"), respuesta);
  li.appendChild(details);
  return li;
}

// 🧮 Contar PALABRAS de la lectura (ignora etiquetas)
function contarPalabrasDesdeHTML(html='') {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  tmp.querySelectorAll('script, style').forEach(n => n.remove());
  const texto = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
  return (texto.match(/\b[\wáéíóúüñ\'-]+\b/gi) || []).length;
}

function contarMetricasTextoPlano(texto = '') {
  const plain = String(texto || '').replace(/\s+/g, ' ').trim();
  const palabras = (plain.match(/\b[\wáéíóúüñ'-]+\b/gi) || []).length;
  const letras = (plain.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length;
  const caracteres = plain.length;
  return { palabras, letras, caracteres };
}

function extraerTextoCuerpoLecturaDesdeHTML(html = '') {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  tmp.querySelectorAll('script, style').forEach(n => n.remove());

  // Contar SOLO párrafos del cuerpo. Se detiene al inicio de "Tabla de Sinónimos" o "Bibliografía",
  // aunque esos títulos vengan como <p>, <h3>, <caption> o encabezado de tabla.
  const bloques = Array.from(tmp.querySelectorAll('h2,h3,h4,p,table,caption,th'));
  const partes = [];
  let cortar = false;

  for (const el of bloques) {
    if (cortar) break;
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!txt) continue;

    if (/^(tabla de sin[oó]nimos|bibliograf[ií]a)\b/i.test(txt)) {
      cortar = true;
      break;
    }

    // Si aparece una tabla cuyo contenido ya menciona "sinónimos"/"bibliografía", cortamos.
    if (el.tagName === 'TABLE' && /\b(sin[oó]nimos|bibliograf[ií]a)\b/i.test(txt)) {
      cortar = true;
      break;
    }

    if (el.tagName === 'P' && !el.closest('table')) {
      partes.push(txt);
    }
  }

  return partes.join(' ').replace(/\s+/g, ' ').trim();
}

function obtenerTextoLecturaGeneradaActual() {
  const bloque = document.getElementById('bloqueLecturaGenerada');
  if (bloque) return extraerTextoCuerpoLecturaDesdeHTML(bloque.innerHTML || '');
  const cont = document.getElementById('resultadoContenido');
  return cont ? extraerTextoCuerpoLecturaDesdeHTML(cont.innerHTML || '') : '';
}

function resetIndicadorMetricasLectura() {
  const wrap = document.getElementById('indicadorMetricasLectura');
  const p = document.getElementById('metricasLecturaPalabras');
  const l = document.getElementById('metricasLecturaLetras');
  const c = document.getElementById('metricasLecturaCaracteres');
  if (p) p.textContent = '0';
  if (l) l.textContent = '0';
  if (c) c.textContent = '0';
  if (wrap) wrap.classList.add('hidden');
}

function actualizarIndicadorMetricasLectura(textoOverride = null) {
  const wrap = document.getElementById('indicadorMetricasLectura');
  const p = document.getElementById('metricasLecturaPalabras');
  const l = document.getElementById('metricasLecturaLetras');
  const c = document.getElementById('metricasLecturaCaracteres');
  if (!wrap || !p || !l || !c) return;

  const texto = textoOverride == null ? obtenerTextoLecturaGeneradaActual() : String(textoOverride || '');
  const metricas = contarMetricasTextoPlano(texto);
  p.textContent = String(metricas.palabras);
  l.textContent = String(metricas.letras);
  c.textContent = String(metricas.caracteres);

  if (metricas.palabras > 0 || metricas.letras > 0) wrap.classList.remove('hidden');
  else wrap.classList.add('hidden');
}

function contarPalabrasCuerpoLectura(html = '') {
  const texto = extraerTextoCuerpoLecturaDesdeHTML(html);
  return (texto.match(/\b[\wáéíóúüñ\'-]+\b/gi) || []).length;
}

function recortarTextoPorPalabras(texto = '', maxPalabras = 0) {
  const limite = Number(maxPalabras || 0);
  if (!limite || limite < 1) return '';
  const txt = String(texto || '');
  const re = /\b[\wáéíóúüñ'-]+\b/gi;
  let match;
  let count = 0;
  let endIndex = 0;
  while ((match = re.exec(txt))) {
    count += 1;
    endIndex = re.lastIndex;
    if (count >= limite) break;
  }
  if (count < limite) return txt.trim();
  return txt.slice(0, endIndex).replace(/\s+$/g, '').trim();
}

function forzarMaximoPalabrasCuerpoLectura(html = '', objetivo = 0) {
  const max = Math.round(Number(objetivo || 0) * 1.1);
  if (!html || !max || max < 1) return html;

  const actual = contarPalabrasCuerpoLectura(html);
  if (actual <= max) return html;

  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  tmp.querySelectorAll('script, style').forEach(n => n.remove());

  const bloques = Array.from(tmp.querySelectorAll('h2,h3,h4,p'));
  let total = 0;
  let cortar = false;
  let recorteAplicado = false;

  for (const el of bloques) {
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!txt) continue;

    if (/^(tabla de sin[oó]nimos|bibliograf[ií]a)\b/i.test(txt)) {
      cortar = true;
      continue;
    }

    if (cortar || el.tagName !== 'P') continue;

    const palabrasP = (txt.match(/\b[\wáéíóúüñ'-]+\b/gi) || []).length;
    if (!palabrasP) continue;

    if (total + palabrasP <= max) {
      total += palabrasP;
      continue;
    }

    const restantes = Math.max(0, max - total);
    if (restantes <= 0) {
      el.remove();
      recorteAplicado = true;
      continue;
    }

    // Fallback duro: preserva estructura del párrafo, pero simplifica formato interno si hace falta.
    const textoRecortado = recortarTextoPorPalabras(txt, restantes);
    el.textContent = textoRecortado;
    total = max;
    recorteAplicado = true;
  }

  return recorteAplicado ? tmp.innerHTML : html;
}

function dentroDeRangoPalabras(actual, objetivo) {
  if (!objetivo) return true;
  const min = Math.round(objetivo * 0.9);
  const max = Math.round(objetivo * 1.1);
  return actual >= min && actual <= max;
}

function normalizeForOverlap(text = '') {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñáéíóúü\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectarCopiaDeAutor({ html = '', ejemploAutor = '' } = {}) {
  const ejemplo = normalizeForOverlap(ejemploAutor);
  const lectura = normalizeForOverlap(htmlToPlainText(html));
  if (!ejemplo || !lectura) return { hayCopia: false, maxCoincidencia: 0, frase: '' };

  const tokensEj = ejemplo.split(' ').filter(Boolean);
  const tokensLe = lectura.split(' ').filter(Boolean);
  if (tokensEj.length < 8 || tokensLe.length < 8) return { hayCopia: false, maxCoincidencia: 0, frase: '' };

  let maxCoincidencia = 0;
  let frase = '';
  for (let n = Math.min(12, tokensEj.length, tokensLe.length); n >= 6; n--) {
    const ngrams = new Set();
    for (let i = 0; i <= tokensEj.length - n; i++) {
      ngrams.add(tokensEj.slice(i, i + n).join(' '));
    }
    for (let j = 0; j <= tokensLe.length - n; j++) {
      const candidato = tokensLe.slice(j, j + n).join(' ');
      if (ngrams.has(candidato)) {
        maxCoincidencia = n;
        frase = candidato;
        return { hayCopia: true, maxCoincidencia, frase };
      }
    }
  }
  return { hayCopia: false, maxCoincidencia, frase };
}

async function reescribirLecturaSinCopiarAutor(htmlOriginal, {
  autorNombre = '',
  ejemploAutor = '',
  titulo = '',
  palabrasObjetivo = null
} = {}) {
  const muestraAutor = String(ejemploAutor || '').slice(0, 1200);
  const prompt = [{
    role: 'user',
    text: `
Reescribe la siguiente lectura HTML para conservar el estilo general inspirado en ${autorNombre || 'el autor de referencia'}, pero SIN copiar frases textuales de la muestra.

Reglas estrictas:
- Mantén el mismo título exacto: <h2>${titulo}</h2>
- Conserva el tema, tono pedagógico y estructura HTML.
- NO reutilices secuencias de más de 4 palabras consecutivas de la muestra del autor.
- Mantén contenido original y natural.
${palabrasObjetivo ? `- Mantén el cuerpo cerca de ${palabrasObjetivo} palabras (±10%).` : ''}
- Devuelve solo HTML.

Muestra del autor (NO COPIAR):
${muestraAutor || '(sin muestra)'}

Lectura a reescribir:
${htmlOriginal}
`.trim()
  }];

  const reescrito = await enviarPrompt(prompt, 0, { task: 'rewrite' });
  return String(reescrito || '').replace(/```html\s*/gi, '').replace(/```/g, '').trim();
}

function analizarBibliografiaHTML(html = '') {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  const texto = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
  const tieneBibliografia = /bibliograf[ií]a/i.test(texto);
  const enlaces = Array.from(tmp.querySelectorAll('a[href]'))
    .map(a => (a.getAttribute('href') || '').trim())
    .filter(h => /^https?:\/\//i.test(h));
  const dominios = Array.from(new Set(enlaces.map(url => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  }).filter(Boolean)));

  return {
    tieneBibliografia,
    enlacesValidos: enlaces.length,
    dominios
  };
}

async function fetchJSONConTimeout(url, { timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function slugRef(str = '') {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function formatearAutoresAPA(nombres = []) {
  const autores = (Array.isArray(nombres) ? nombres : [])
    .map(n => String(n || '').trim())
    .filter(Boolean)
    .slice(0, 5);
  if (!autores.length) return 'Autor desconocido';

  const apas = autores.map(nombreCompleto => {
    const partes = nombreCompleto.split(/\s+/).filter(Boolean);
    if (!partes.length) return nombreCompleto;
    const apellido = partes.pop();
    const iniciales = partes.map(p => `${p.charAt(0).toUpperCase()}.`).join(' ');
    return `${apellido}, ${iniciales}`.trim();
  });

  if (apas.length === 1) return apas[0];
  if (apas.length === 2) return `${apas[0]} & ${apas[1]}`;
  return `${apas.slice(0, -1).join(', ')}, & ${apas.at(-1)}`;
}

function extraerAnio(valor) {
  const m = String(valor || '').match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : 's. f.';
}

function limpiarTituloRef(t = '') {
  return String(t || '').replace(/\s+/g, ' ').trim().replace(/[.]+$/g, '');
}

function construirAnchorBibliografico(url = '') {
  const href = String(url || '').trim();
  if (!/^https?:\/\//i.test(href)) return '';
  return `<a href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(href)}</a>`;
}

function construirRefCrossref(item) {
  const titulo = limpiarTituloRef(item?.title?.[0] || '');
  if (!titulo) return null;

  const autores = Array.isArray(item?.author)
    ? item.author.map(a => [a?.given, a?.family].filter(Boolean).join(' ').trim()).filter(Boolean)
    : [];
  const authors = formatearAutoresAPA(autores);
  const authorsSafe = escapeHTML(authors);
  const year = item?.issued?.['date-parts']?.[0]?.[0] || 's. f.';
  const journal = limpiarTituloRef(item?.['container-title']?.[0] || item?.publisher || '');
  const volume = limpiarTituloRef(item?.volume || '');
  const issue = limpiarTituloRef(item?.issue || '');
  const pages = limpiarTituloRef(item?.page || '');
  const doi = (item?.DOI || '').trim();
  const doiUrl = doi ? `https://doi.org/${doi}` : '';
  const url = doiUrl || (item?.URL || '');
  if (!url) return null;
  const link = construirAnchorBibliografico(url);
  if (!link) return null;

  const partesRevista = [];
  if (journal) {
    let revista = `<em>${escapeHTML(journal)}</em>`;
    if (volume) revista += `, <em>${escapeHTML(volume)}</em>`;
    if (issue) revista += `(${escapeHTML(issue)})`;
    if (pages) revista += `, ${escapeHTML(pages)}`;
    partesRevista.push(`${revista}.`);
  }
  return {
    tipo: 'article',
    score: 1,
    source: 'Crossref',
    titulo,
    url,
    apa: `${authorsSafe} (${year}). ${escapeHTML(titulo)}. ${partesRevista.join(' ')} ${link}`.replace(/\s+/g, ' ').trim(),
    sortKey: slugRef(authors),
    key: `${slugRef(titulo)}|${slugRef(doi || url)}`
  };
}

async function buscarFuentesCrossref({ tema = '', limite = 4 } = {}) {
  const params = new URLSearchParams({
    rows: String(Math.min(10, Math.max(2, limite + 2))),
    'query.bibliographic': tema || ''
  });
  const url = `https://api.crossref.org/works?${params.toString()}`;
  const data = await fetchJSONConTimeout(url, { timeoutMs: 9000 });
  return (data?.message?.items || [])
    .map(construirRefCrossref)
    .filter(Boolean)
    .slice(0, limite);
}

async function obtenerFuentesBibliograficasVerificadas({ tema = '', nivel = '', grado = '', limite = 5 } = {}) {
  void nivel;
  void grado;
  const merged = await buscarFuentesCrossref({ tema, limite }).catch(() => []);
  const seen = new Set();
  const unicos = [];
  for (const ref of merged) {
    const key = ref?.key || `${slugRef(ref?.titulo)}|${slugRef(ref?.url)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unicos.push(ref);
  }

  const seleccionadas = unicos
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, Math.max(3, Math.min(5, limite)));

  return seleccionadas.sort((a, b) => {
    const ka = (a?.sortKey || slugRef(a?.titulo || '') || '');
    const kb = (b?.sortKey || slugRef(b?.titulo || '') || '');
    return ka.localeCompare(kb, 'es');
  });
}

function esHeadingDeSeccion(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = el.tagName;
  return tag === 'H2' || tag === 'H3' || tag === 'H4';
}

function normalizarHeadingSeccion(tmp, patron, textoCanonico, {
  classes = [],
  preferTag = 'H3'
} = {}) {
  const candidatos = Array.from(tmp.querySelectorAll('h2,h3,h4,p,div,strong'));
  let anchor = candidatos.find(el => patron.test((el.textContent || '').trim()));
  if (!anchor) return null;

  let base = anchor;
  const parent = anchor.parentElement;
  const parentTxt = (parent?.textContent || '').replace(/\s+/g, ' ').trim();
  const anchorTxt = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
  if (parent && /^(P|DIV)$/.test(parent.tagName) && parentTxt === anchorTxt) {
    base = parent;
  }

  let heading = base;
  if (!esHeadingDeSeccion(base) || base.tagName !== preferTag) {
    const nuevo = document.createElement(preferTag.toLowerCase());
    nuevo.innerHTML = escapeHTML(textoCanonico);
    if (base.parentNode) base.parentNode.replaceChild(nuevo, base);
    heading = nuevo;
  } else {
    heading.textContent = textoCanonico;
  }

  classes.forEach(c => c && heading.classList.add(c));
  return heading;
}

function marcarBibliografiaEstructurada(tmp, headingBibliografia) {
  if (!headingBibliografia) return;
  let nextEl = headingBibliografia.nextElementSibling;

  if (nextEl && nextEl.tagName === 'UL') {
    const ol = document.createElement('ol');
    while (nextEl.firstChild) ol.appendChild(nextEl.firstChild);
    nextEl.replaceWith(ol);
    nextEl = ol;
  }

  if (!nextEl) return;

  if (nextEl.tagName !== 'OL') {
    const bloques = [];
    let cursor = nextEl;
    while (cursor) {
      if (esHeadingDeSeccion(cursor)) break;
      if (/^(P|DIV)$/.test(cursor.tagName) && (cursor.textContent || '').trim()) {
        bloques.push(cursor);
      } else if (cursor.tagName === 'OL' || cursor.tagName === 'UL') {
        break;
      } else if (cursor.tagName === 'TABLE') {
        break;
      }
      cursor = cursor.nextElementSibling;
    }

    if (bloques.length >= 2) {
      const ol = document.createElement('ol');
      ol.classList.add('lectura-bibliografia-lista');
      bloques.forEach(b => {
        const li = document.createElement('li');
        li.classList.add('lectura-bibliografia-item');
        li.innerHTML = b.innerHTML;
        ol.appendChild(li);
        b.remove();
      });
      headingBibliografia.insertAdjacentElement('afterend', ol);
      nextEl = ol;
    }
  }

  if (nextEl.tagName === 'OL' || nextEl.tagName === 'UL') {
    nextEl.classList.add('lectura-bibliografia-lista');
    Array.from(nextEl.children).forEach(li => {
      if (li.tagName === 'LI') li.classList.add('lectura-bibliografia-item');
      li.querySelectorAll?.('a[href]').forEach(a => a.classList.add('lectura-bibliografia-link'));
    });
  }
}

function normalizarEstructuraLecturaHTML(html = '', { titulo = '' } = {}) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';

  const tituloLimpio = String(titulo || '').trim();
  let h2 = tmp.querySelector('h2');
  if (!h2 && tituloLimpio) {
    h2 = document.createElement('h2');
    h2.textContent = tituloLimpio;
    tmp.insertBefore(h2, tmp.firstChild);
  }
  if (h2) {
    if (tituloLimpio) h2.textContent = tituloLimpio;
    h2.classList.add('lectura-main-title');
  }

  const headingSinonimos = normalizarHeadingSeccion(tmp, /^tabla de sin[oó]nimos\b/i, 'Tabla de Sinónimos', {
    classes: ['lectura-section-title', 'is-sinonimos']
  });
  if (headingSinonimos) {
    let sib = headingSinonimos.nextElementSibling;
    while (sib) {
      if (esHeadingDeSeccion(sib)) break;
      if (sib.tagName === 'TABLE') {
        sib.classList.add('lectura-tabla-sinonimos');
        break;
      }
      sib = sib.nextElementSibling;
    }
  }

  const headingBiblio = normalizarHeadingSeccion(tmp, /^bibliograf[ií]a\b/i, 'Bibliografía', {
    classes: ['lectura-section-title', 'is-bibliografia']
  });
  if (headingBiblio) {
    marcarBibliografiaEstructurada(tmp, headingBiblio);
  }

  return tmp.innerHTML;
}

function reemplazarSeccionBibliografiaEnHTML(htmlOriginal = '', referencias = []) {
  if (!referencias.length) return { html: htmlOriginal, reemplazada: false };
  const tmp = document.createElement('div');
  tmp.innerHTML = htmlOriginal || '';

  const candidatos = Array.from(tmp.querySelectorAll('h2,h3,h4,p,div,strong'));
  let anchor = candidatos.find(el => /^(bibliograf[ií]a)\b/i.test((el.textContent || '').trim()));
  if (!anchor) {
    // Busca nodos cuyo texto comience con "Bibliografía" aun si tienen prefijos/espacios.
    anchor = candidatos.find(el => /\bbibliograf[ií]a\b/i.test((el.textContent || '').trim()));
  }

  const ol = document.createElement('ol');
  ol.className = 'lectura-bibliografia-lista';
  referencias.forEach(ref => {
    const li = document.createElement('li');
    li.className = 'lectura-bibliografia-item';
    li.innerHTML = ref.apa;
    li.querySelectorAll('a[href]').forEach(a => a.classList.add('lectura-bibliografia-link'));
    ol.appendChild(li);
  });

  if (!anchor) {
    const h3 = document.createElement('h3');
    h3.textContent = 'Bibliografía';
    h3.className = 'lectura-section-title is-bibliografia';
    tmp.appendChild(h3);
    tmp.appendChild(ol);
    return { html: normalizarEstructuraLecturaHTML(tmp.innerHTML), reemplazada: true };
  }

  if (!esHeadingDeSeccion(anchor)) {
    anchor.textContent = 'Bibliografía';
  }

  let sib = anchor.nextSibling;
  while (sib) {
    const next = sib.nextSibling;
    if (sib.nodeType === 1 && esHeadingDeSeccion(sib)) break;
    sib.remove();
    sib = next;
  }

  anchor.insertAdjacentElement('afterend', ol);
  return { html: normalizarEstructuraLecturaHTML(tmp.innerHTML), reemplazada: true };
}

async function intentarBibliografiaVerificada(htmlOriginal, { tema = '', nivel = '', grado = '' } = {}) {
  if (!tema) return { html: htmlOriginal, aplicada: false, refs: [] };
  const refs = await obtenerFuentesBibliograficasVerificadas({ tema, nivel, grado, limite: 5 });
  if (!refs.length) return { html: htmlOriginal, aplicada: false, refs: [] };
  const reemplazo = reemplazarSeccionBibliografiaEnHTML(htmlOriginal, refs);
  return { html: reemplazo.html, aplicada: !!reemplazo.reemplazada, refs };
}

async function reforzarBibliografiaConFuentesEnlazables(htmlOriginal, {
  tema = '',
  nivel = '',
  grado = ''
} = {}) {
  const prompt = [{
    role: 'user',
    text: `
Corrige SOLO la sección "Bibliografía" del siguiente HTML.

Objetivo:
- Mantener el resto del HTML sin cambios.
- Reemplazar la bibliografía por 3 a 5 referencias reales y plausibles para el tema "${tema}" (nivel ${nivel}, grado ${grado}).
- Formato APA 7.
- Cada referencia debe incluir enlace HTTPS clicable (<a href="...">...</a>).
- Prioriza sitios institucionales o editoriales reconocidas.
- Si no puedes asegurar una referencia, no la inventes: omítela.

Devuelve solo HTML completo.

HTML:
${htmlOriginal}
`.trim()
  }];

  const reforzado = await enviarPrompt(prompt, 0, { task: 'factual' });
  return String(reforzado || '').replace(/```html\s*/gi, '').replace(/```/g, '').trim();
}

async function ajustarAObjetivoConReintentos(html, objetivo, {
  maxIntentos = 2,
  onProgress = null,
  contextoReescritura = null
} = {}) {
  let actual = html;
  let conteo = contarPalabrasCuerpoLectura(actual);

  for (let intento = 0; intento <= maxIntentos; intento++) {
    if (dentroDeRangoPalabras(conteo, objetivo)) {
      return { html: actual, conteo, intentos: intento };
    }
    if (intento === maxIntentos) break;
    onProgress?.(`Ajustando extensión (${conteo} palabras actuales)…`);
    const revisado = await ajustarAObjetivoDePalabras(actual, objetivo, conteo);
    if (!revisado) break;
    actual = revisado;
    conteo = contarPalabrasCuerpoLectura(actual);
  }

  if (!dentroDeRangoPalabras(conteo, objetivo)) {
    onProgress?.(`Recreando la misma lectura con la extensión solicitada (${conteo} palabras)…`);
    const reescalado = await recrearMismaLecturaConObjetivoDePalabras(actual, objetivo, {
      conteoActual: conteo,
      titulo: contextoReescritura?.titulo || '',
      tono: contextoReescritura?.tono || '',
      nivel: contextoReescritura?.nivel || '',
      grado: contextoReescritura?.grado || '',
      autorNombre: contextoReescritura?.autorNombre || '',
      tipoTexto: contextoReescritura?.tipoTexto || ''
    });
    if (reescalado) {
      actual = reescalado;
      conteo = contarPalabrasCuerpoLectura(actual);
    }
  }

  // Solo como emergencia extrema si sigue MUY pasado tras reescritura.
  if (!dentroDeRangoPalabras(conteo, objetivo)) {
    const max = Math.round(Number(objetivo || 0) * 1.1);
    if (conteo > Math.round(max * 1.35)) {
      onProgress?.(`Aplicando recorte final de emergencia (${conteo} palabras)…`);
      const recortado = forzarMaximoPalabrasCuerpoLectura(actual, objetivo);
      const conteoRecortado = contarPalabrasCuerpoLectura(recortado);
      if (recortado && conteoRecortado < conteo) {
        actual = recortado;
        conteo = conteoRecortado;
      }
    }
  }

  return { html: actual, conteo, intentos: maxIntentos };
}

async function postprocesarLecturaGenerada(html, contexto = {}) {
  let salida = html || '';

  if (contexto?.palabrasObjetivo) {
    const ajuste = await ajustarAObjetivoConReintentos(salida, contexto.palabrasObjetivo, {
      maxIntentos: 2,
      onProgress: contexto.setProgress,
      contextoReescritura: {
        titulo: contexto.tituloNuevo,
        tono: contexto.tono || '',
        nivel: contexto.nivel || '',
        grado: contexto.grado || '',
        autorNombre: contexto.autorData?.autor || '',
        tipoTexto: contexto.autorData?.tipoTexto || ''
      }
    });
    salida = ajuste.html || salida;
    console.debug('[lecturaNueva] Conteo cuerpo tras ajuste:', ajuste.conteo, 'objetivo:', contexto.palabrasObjetivo);
  }

  if (contexto?.autorData?.modo === 'autor' && contexto?.autorData?.ejemplo) {
    const copia = detectarCopiaDeAutor({ html: salida, ejemploAutor: contexto.autorData.ejemplo });
    console.debug('[lecturaNueva] Revisión copia autor:', copia);
    if (copia.hayCopia) {
      contexto.setProgress?.('Reescribiendo para evitar copia textual del autor…');
      const reescrito = await reescribirLecturaSinCopiarAutor(salida, {
        autorNombre: contexto.autorData.autor,
        ejemploAutor: contexto.autorData.ejemplo,
        titulo: contexto.tituloNuevo,
        palabrasObjetivo: contexto.palabrasObjetivo
      });
      if (reescrito) salida = reescrito;
    }
  }

  const biblio = analizarBibliografiaHTML(salida);
  console.debug('[lecturaNueva] Bibliografía detectada:', biblio);
  if (biblio.tieneBibliografia) {
    try {
      contexto.setProgress?.('Verificando bibliografía con fuentes reales…');
      const verificada = await intentarBibliografiaVerificada(salida, {
        tema: contexto.temaNuevo,
        nivel: contexto.nivel,
        grado: contexto.grado
      });
      if (verificada.aplicada) {
        salida = verificada.html;
        console.debug('[lecturaNueva] Bibliografía reemplazada con fuentes verificadas:', verificada.refs.length);
      }
    } catch (err) {
      console.warn('[lecturaNueva] Falló bibliografía verificada por API, se usa fallback de prompt', err);
    }

    const biblioPostApi = analizarBibliografiaHTML(salida);
    if (biblioPostApi.enlacesValidos < 2) {
      contexto.setProgress?.('Reforzando bibliografía con enlaces…');
      const reforzado = await reforzarBibliografiaConFuentesEnlazables(salida, {
        tema: contexto.temaNuevo,
        nivel: contexto.nivel,
        grado: contexto.grado
      });
      if (reforzado) salida = reforzado;
    }
  }

  if (contexto?.palabrasObjetivo) {
    const conteoFinal = contarPalabrasCuerpoLectura(salida);
    if (!dentroDeRangoPalabras(conteoFinal, contexto.palabrasObjetivo)) {
      const ajusteFinal = await ajustarAObjetivoConReintentos(salida, contexto.palabrasObjetivo, {
        maxIntentos: 1,
        onProgress: contexto.setProgress,
        contextoReescritura: {
          titulo: contexto.tituloNuevo,
          tono: contexto.tono || '',
          nivel: contexto.nivel || '',
          grado: contexto.grado || '',
          autorNombre: contexto.autorData?.autor || '',
          tipoTexto: contexto.autorData?.tipoTexto || ''
        }
      });
      salida = ajusteFinal.html || salida;
      console.debug('[lecturaNueva] Conteo final tras postproceso:', ajusteFinal.conteo);
    }
  }

  salida = normalizarEstructuraLecturaHTML(salida, { titulo: contexto?.tituloNuevo || '' });
  return salida;
}

function enforceTitleH2(html = '', titulo = '') {
  const tituloLimpio = String(titulo || '').trim();
  if (!tituloLimpio) return html;
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';

  const h2 = tmp.querySelector('h2');
  if (h2) {
    h2.textContent = tituloLimpio;
  } else {
    const nuevoH2 = document.createElement('h2');
    nuevoH2.textContent = tituloLimpio;
    tmp.insertBefore(nuevoH2, tmp.firstChild);
  }
  return tmp.innerHTML;
}

// 🎭 Estilo literario desde posibles campos del doc ASC
function getEstiloDeLectura(lectura) {
  return lectura?.tipoTexto || lectura?.estilo || lectura?.genero || lectura?.serie || '—';
}

// 🧩 Tabla resumen del análisis ASC (título / estilo / #palabras)
function buildASCResumenHTML(lecturas = []) {
  if (!lecturas.length) return `<p class="asc-empty">No se encontraron lecturas ASC relacionadas.</p>`;
  const filas = lecturas.map((l, i) => {
    const estilo = getEstiloDeLectura(l);
    const palabras = contarPalabrasDesdeHTML(l?.textoLectura || '');
    const titulo = l?.titulo || `Lectura ${i+1}`;
    return `
      <tr>
        <td>${titulo}</td>
        <td>${estilo}</td>
        <td class="is-num">${palabras}</td>
      </tr>
    `;
  }).join('');
  return `
    <table class="asc-table">
      <thead>
        <tr>
          <th>Título</th>
          <th>Estilo/Tipo de texto</th>
          <th class="is-num">Palabras</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

// 🗳️ UI de decisión: ¿usar estilo ASC o estilo del autor?
function injectASCDecisionPanel({ total, estilos, estiloMayor, tablaHTML }) {
  const cont = document.getElementById('resultadoContenido');
  if (!cont) return;

  $('#panelAnalisisASC')?.remove();
  $('#panelDecisionEstilo')?.remove();

  const wrapAnalisis = document.createElement('div');
  wrapAnalisis.id = 'panelAnalisisASC';
  wrapAnalisis.className = 'asc-panel';
  wrapAnalisis.innerHTML = `
    <details open class="asc-details">
      <summary class="asc-summary">Análisis ASC (coincidencias: ${total})</summary>
      <div class="asc-body">
        ${tablaHTML || ''}
        <p class="asc-note">Este panel es informativo y se usa como contexto para la generación.</p>
      </div>
    </details>
  `;
  cont.appendChild(wrapAnalisis);

  const wrapDecision = document.createElement('div');
  wrapDecision.id = 'panelDecisionEstilo';
  wrapDecision.className = 'asc-choice-panel';
  wrapDecision.innerHTML = `
    <div class="asc-choice-row">
      <div>
        <div class="asc-choice-title">¿Usar el mismo estilo literario detectado?</div>
        <small class="asc-choice-meta">Mayoría detectada: <strong>${estiloMayor || '—'}</strong>${estilos.size > 1 ? ` (conjunto: ${Array.from(estilos).join(', ')})` : ''}</small>
      </div>
      <div class="asc-choice-actions">
        <button id="btnUsarEstiloASC" class="result-ghost-btn is-primary">Usar estilo ASC</button>
        <button id="btnUsarEstiloAutor" class="result-ghost-btn">Usar estilo del autor</button>
      </div>
    </div>
  `;
  cont.appendChild(wrapDecision);
}

function esperarDecisionEstilo() {
  return new Promise((resolve) => {
    const onASC = () => { cleanup(); resolve('asc'); };
    const onAutor = () => { cleanup(); resolve('autor'); };
    function cleanup() {
      $('#btnUsarEstiloASC')?.removeEventListener('click', onASC);
      $('#btnUsarEstiloAutor')?.removeEventListener('click', onAutor);
    }
    $('#btnUsarEstiloASC')?.addEventListener('click', onASC);
    $('#btnUsarEstiloAutor')?.addEventListener('click', onAutor);
  });
}

// 🎯 Segundo pase para ajustar a N palabras manteniendo estructura principal
async function ajustarAObjetivoDePalabras(htmlOriginal, objetivo, conteoActual = null) {
  const mensajes = [{
    role: 'user',
    text: `
Revisa el siguiente HTML y ajusta SOLO la extensión del CUERPO a ~${objetivo} palabras (±10%)${conteoActual ? ` (actual: ~${conteoActual})` : ''}, sin eliminar:
- La estructura general del contenido (encabezados y párrafos)
- El formato HTML válido
- Las secciones que ya existan (por ejemplo, "Tabla de Sinónimos" o "Bibliografía")

No agregues comentarios externos ni bloques adicionales. Devuelve ÚNICAMENTE el HTML.

HTML a ajustar:
${htmlOriginal}
`.trim()
  }];
  const revisado = await enviarPrompt(mensajes, 0, { task: 'rewrite' });
  return (revisado || '').replace(/```html\s*/g, '').replace(/```/g, '').trim();
}

// 🔁 Pase de reescritura controlada: conserva la misma lectura y ajusta longitud sin recortar en seco.
async function recrearMismaLecturaConObjetivoDePalabras(htmlOriginal, objetivo, {
  conteoActual = null,
  titulo = '',
  tono = '',
  nivel = '',
  grado = '',
  autorNombre = '',
  tipoTexto = ''
} = {}) {
  const mensajes = [{
    role: 'user',
    text: `
Analiza el siguiente HTML y recrea LA MISMA LECTURA ajustando SOLO la longitud del CUERPO a ~${objetivo} palabras (±10%)${conteoActual ? ` (actual: ~${conteoActual})` : ''}.

Contexto que debes conservar:
- Título exacto: ${titulo || '(conservar el del HTML)'}
- Tono general: ${tono || 'mantener el tono actual'}
- Nivel/Grado: ${nivel || '—'} / ${grado || '—'}
${autorNombre ? `- Autor de referencia (solo estilo, no contenido): ${autorNombre}` : ''}
${tipoTexto ? `- Tipo de texto: ${tipoTexto}` : ''}

Reglas obligatorias:
- Mantén la misma idea central, personajes, nombres propios, lugares y secuencia narrativa.
- NO hagas truncamientos bruscos ni cortes de frases.
- Condensa o expande de forma natural, sin cambiar el contexto.
- Conserva la estructura HTML y el <h2>.
- Conserva "Tabla de Sinónimos" y "Bibliografía" si existen.
- El ajuste de palabras aplica SOLO al cuerpo de la lectura.
- Devuelve ÚNICAMENTE HTML.

HTML original:
${htmlOriginal}
`.trim()
  }];

  const reescalado = await enviarPrompt(mensajes, 0, { task: 'rewrite' });
  return (reescalado || '').replace(/```html\s*/gi, '').replace(/```/g, '').trim();
}

function inferirRasgosDesdeMuestraAutor(ejemplo = '') {
  const txt = String(ejemplo || '').replace(/\s+/g, ' ').trim();
  if (!txt) return [];

  const frases = txt.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const longProm = frases.length
    ? Math.round(frases.reduce((acc, s) => acc + s.split(/\s+/).length, 0) / frases.length)
    : 0;

  const rasgos = [];
  if (/\?/g.test(txt)) rasgos.push('usa preguntas para guiar la lectura');
  if (/["“”]|—|-/g.test(txt)) rasgos.push('puede incorporar giros dialogados o incisos');
  if (/\byo\b|\bnosotros\b/i.test(txt)) rasgos.push('marca una voz en primera persona');
  if (/\bse\b|\bes\b|\bson\b/i.test(txt)) rasgos.push('mantiene pasajes expositivos claros');
  if (longProm >= 18) rasgos.push('frases medianas a largas con desarrollo gradual');
  if (longProm > 0 && longProm < 12) rasgos.push('frases breves con ritmo ágil');
  if (/(metáfora|como si|parecía|imagin)/i.test(txt)) rasgos.push('tendencia a imágenes y recursos figurativos');

  return Array.from(new Set(rasgos)).slice(0, 6);
}

async function generarIdeasLecturaIA({
  titulo = '',
  sinopsisActual = '',
  especificacionesActuales = '',
  nivel = '',
  grado = '',
  tono = ''
} = {}) {
  const prompt = [{
    role: 'user',
    text: `
Actúa como editor pedagógico creativo. Genera ideas para una nueva lectura escolar.

Tema/sinopsis actual (puede estar vacía o débil): "${sinopsisActual}"
Título actual (puede estar vacío): "${titulo}"
Nivel: ${nivel || 'No especificado'}
Grado: ${grado || 'No especificado'}
Tono deseado: ${tono || 'Abierto'}
Especificaciones actuales: "${especificacionesActuales || 'Ninguna'}"

Devuelve JSON válido (sin markdown) con este esquema:
{
  "ideas": [
    {
      "titulo_sugerido": "string",
      "sinopsis": "string",
      "tono_sugerido": "string",
      "gancho_narrativo": "string",
      "especificaciones": ["string", "string", "string"]
    }
  ]
}

Reglas:
- Genera exactamente 4 ideas diferentes entre sí.
- Deben ser creativas pero pedagógicas y realistas para el grado.
- Las especificaciones deben ayudar a obtener mejores lecturas (fuentes reales, enfoque, recursos, restricciones, etc.).
- Evita repetir la misma estructura en todas.
`.trim()
  }];

  const raw = await enviarPrompt(prompt, 0, { task: 'creative', responseMimeType: 'application/json' });
  const data = extractJSONFromModelText(raw);
  const ideas = Array.isArray(data?.ideas) ? data.ideas : [];
  return ideas.map(normalizarIdeaLecturaIA).filter(i => i.sinopsis);
}

function normalizarIdeaLecturaIA(i = {}) {
  return {
    titulo_sugerido: String(i?.titulo_sugerido || '').trim(),
    sinopsis: String(i?.sinopsis || '').trim(),
    tono_sugerido: String(i?.tono_sugerido || '').trim(),
    gancho_narrativo: String(i?.gancho_narrativo || '').trim(),
    especificaciones: Array.isArray(i?.especificaciones)
      ? i.especificaciones.map(x => String(x || '').trim()).filter(Boolean).slice(0, 8)
      : [],
    _historialRefinamiento: Array.isArray(i?._historialRefinamiento)
      ? i._historialRefinamiento.map(x => String(x || '').trim()).filter(Boolean).slice(-8)
      : []
  };
}

function instruccionRefinamientoEsGlobal(instruccion = '') {
  const txt = String(instruccion || '').toLowerCase();
  return /\b(reescribe|reescribir|desde cero|cambia todo|cambiar todo|otra idea|totalmente distinta|completamente distinta|nuevo enfoque total|transforma por completo)\b/.test(txt);
}

function instruccionMencionaCampo(instruccion = '', campo = '') {
  const txt = String(instruccion || '').toLowerCase();
  const aliases = {
    titulo_sugerido: ['titulo', 'título', 'nombre de la lectura', 'nombre'],
    tono_sugerido: ['tono', 'más formal', 'más narrativo', 'más científico', 'más didáctico'],
    gancho_narrativo: ['gancho', 'inicio', 'apertura', 'enganche', 'hook'],
    especificaciones: ['especificaciones', 'restricciones', 'fuentes', 'requisitos', 'indicaciones']
  };
  return (aliases[campo] || [campo]).some(a => txt.includes(a));
}

function mergeIdeaPatchRefinada(ideaActual, ideaPatch, {
  instruccion = '',
  global = false
} = {}) {
  const base = normalizarIdeaLecturaIA(ideaActual || {});
  const rawPatch = (ideaPatch && typeof ideaPatch === 'object') ? ideaPatch : {};
  const merged = { ...base };

  if ('titulo_sugerido' in rawPatch) {
    merged.titulo_sugerido = String(rawPatch.titulo_sugerido || '').trim();
  }
  if ('sinopsis' in rawPatch) {
    merged.sinopsis = String(rawPatch.sinopsis || '').trim();
  }
  if ('tono_sugerido' in rawPatch) {
    merged.tono_sugerido = String(rawPatch.tono_sugerido || '').trim();
  }
  if ('gancho_narrativo' in rawPatch) {
    merged.gancho_narrativo = String(rawPatch.gancho_narrativo || '').trim();
  }
  if ('especificaciones' in rawPatch) {
    merged.especificaciones = Array.isArray(rawPatch.especificaciones)
      ? rawPatch.especificaciones.map(x => String(x || '').trim()).filter(Boolean).slice(0, 8)
      : base.especificaciones;
  }

  if (!global) {
    if (!instruccionMencionaCampo(instruccion, 'titulo_sugerido')) {
      merged.titulo_sugerido = base.titulo_sugerido;
    }
    if (!instruccionMencionaCampo(instruccion, 'tono_sugerido')) {
      merged.tono_sugerido = base.tono_sugerido;
    }
    if (!instruccionMencionaCampo(instruccion, 'gancho_narrativo')) {
      merged.gancho_narrativo = base.gancho_narrativo;
    }
    if (!instruccionMencionaCampo(instruccion, 'especificaciones')) {
      merged.especificaciones = base.especificaciones;
    }
  }

  return normalizarIdeaLecturaIA({
    ...merged,
    _historialRefinamiento: base._historialRefinamiento
  });
}

async function refinarIdeaLecturaIA({
  ideaActual = null,
  instruccion = '',
  titulo = '',
  sinopsisActual = '',
  especificacionesActuales = '',
  nivel = '',
  grado = '',
  tono = '',
  historial = []
} = {}) {
  if (!ideaActual || !String(instruccion || '').trim()) return null;
  const instruccionLimpia = String(instruccion || '').trim();
  const refinamientoGlobal = instruccionRefinamientoEsGlobal(instruccionLimpia);

  const prompt = [{
    role: 'user',
    text: `
Actúa como editor pedagógico creativo. Debes REFINAR una idea de lectura existente según la instrucción del usuario, sin perder el contexto académico.

Contexto del formulario:
- Título actual: "${titulo}"
- Sinopsis actual del formulario: "${sinopsisActual}"
- Especificaciones del formulario: "${especificacionesActuales || 'Ninguna'}"
- Nivel: ${nivel || 'No especificado'}
- Grado: ${grado || 'No especificado'}
- Tono deseado: ${tono || 'Abierto'}

Idea actual (JSON):
${JSON.stringify({
  titulo_sugerido: ideaActual?.titulo_sugerido || '',
  sinopsis: ideaActual?.sinopsis || '',
  tono_sugerido: ideaActual?.tono_sugerido || '',
  gancho_narrativo: ideaActual?.gancho_narrativo || '',
  especificaciones: Array.isArray(ideaActual?.especificaciones) ? ideaActual.especificaciones : []
}, null, 2)}

Historial de refinamientos previos (si existe):
${Array.isArray(historial) && historial.length ? historial.map((h, i) => `${i + 1}. ${h}`).join('\n') : 'Sin historial'}

Nueva instrucción del usuario para refinar la idea:
"${instruccionLimpia}"

Tarea:
- Refinamiento por defecto: INCREMENTAL (cambia lo mínimo necesario).
- Solo reescribe por completo si la instrucción lo pide explícitamente.
- Modifica, amplía o transforma la idea de acuerdo con la instrucción.
- Conserva el contexto pedagógico y la coherencia con nivel/grado.
- Conserva personajes, nombres propios, conflicto base y secuencia principal salvo que la instrucción pida cambiarlos.
- Si el usuario pide cambios fuertes, puedes reestructurar la idea, pero sin perder el tema base salvo que la instrucción lo pida.
- Mantén la salida práctica para usarse en el formulario.
- IMPORTANTE: si el usuario pide un cambio localizado (ej. lugar, nombre de pueblo, detalle cultural), NO cambies todo lo demás.

Devuelve JSON válido (sin markdown) con este esquema:
{
  "modo_refinamiento": "incremental|global",
  "campos_modificados": ["sinopsis"],
  "idea_patch": {
    "titulo_sugerido": "string (solo si cambió)",
    "sinopsis": "string (solo si cambió)",
    "tono_sugerido": "string (solo si cambió)",
    "gancho_narrativo": "string (solo si cambió)",
    "especificaciones": ["string", "string"] // solo si cambió
  },
  "resumen_cambio": "string breve"
}

Reglas de salida:
- En "idea_patch" incluye SOLO campos modificados.
- Si no cambias título/tono/gancho/especificaciones, NO los incluyas.
- Si el cambio es localizado, modifica principalmente "sinopsis" y opcionalmente "gancho_narrativo" si es indispensable.
`.trim()
  }];

  const raw = await enviarPrompt(prompt, 0, { task: 'creative', responseMimeType: 'application/json' });
  const data = extractJSONFromModelText(raw);
  const patch = (data?.idea_patch && typeof data.idea_patch === 'object')
    ? data.idea_patch
    : (data?.idea && typeof data.idea === 'object' ? data.idea : data || {});
  let ideaRefinada = mergeIdeaPatchRefinada(ideaActual, patch, {
    instruccion: instruccionLimpia,
    global: refinamientoGlobal || String(data?.modo_refinamiento || '').toLowerCase() === 'global'
  });
  const resumen = String(data?.resumen_cambio || '').trim();
  if (!ideaRefinada.sinopsis) return null;
  if (historial?.length || instruccion) {
    ideaRefinada._historialRefinamiento = [
      ...(Array.isArray(historial) ? historial : []),
      resumen ? `${instruccionLimpia} -> ${resumen}` : instruccionLimpia
    ].filter(Boolean).slice(-8);
  }
  return ideaRefinada;
}

async function refinarLecturaGeneradaIA({
  htmlActual = '',
  instruccion = '',
  titulo = '',
  tema = '',
  tono = '',
  nivel = '',
  grado = '',
  autorNombre = '',
  tipoTexto = '',
  palabrasObjetivo = null
} = {}) {
  const htmlBase = String(htmlActual || '').trim();
  const instruccionLimpia = String(instruccion || '').trim();
  if (!htmlBase || !instruccionLimpia) return null;
  const refinamientoGlobal = instruccionRefinamientoEsGlobal(instruccionLimpia);

  const mensajes = [{
    role: 'user',
    text: `
Actúa como editor literario-pedagógico. Debes REFINAR una lectura ya generada según la instrucción del usuario.

Regla principal:
- Si la instrucción es localizada, el refinamiento debe ser INCREMENTAL (cambiar lo mínimo necesario).
- Solo reescribe de forma amplia si la instrucción lo pide explícitamente.

Contexto a conservar:
- Título exacto: ${titulo || '(conservar el del HTML)'}
- Tema/sinopsis base: ${tema || 'mantener el tema actual'}
- Tono general: ${tono || 'mantener tono actual'}
- Nivel/Grado: ${nivel || '—'} / ${grado || '—'}
${autorNombre ? `- Autor de referencia (solo estilo): ${autorNombre}` : ''}
${tipoTexto ? `- Tipo de texto: ${tipoTexto}` : ''}
${palabrasObjetivo ? `- Mantener cuerpo cerca de ${palabrasObjetivo} palabras (±10%) si es posible.` : ''}

Instrucción del usuario:
"${instruccionLimpia}"

Reglas estrictas:
- Mantén la estructura HTML.
- Conserva el <h2> con el título exacto.
- Conserva personajes, nombres propios, lugares y secuencia narrativa salvo que la instrucción pida cambiarlos.
- No cambies "Tabla de Sinónimos" ni "Bibliografía" salvo que la instrucción lo pida explícitamente.
- No agregues comentarios externos.
- Devuelve SOLO HTML.
- Si el cambio es localizado (ej. país, nombre de pueblo, un detalle cultural), NO cambies todo lo demás.

Modo esperado: ${refinamientoGlobal ? 'global (permitido por instrucción)' : 'incremental (por defecto)'}

HTML actual:
${htmlBase}
`.trim()
  }];

  const raw = await enviarPrompt(mensajes, 0, { task: 'rewrite' });
  return String(raw || '').replace(/```html\s*/gi, '').replace(/```/g, '').trim();
}

// ------- Botón + lógica para generar preguntas en el modal de resultado -------
function addPreguntasUI({
  listaCriterios = 'Localizar información, Interpretar, Inferir, Reflexionar',
  nivel = 'Primaria',
  grado = '1',
  autoGenerate = false
} = {}) {

  const cont = document.getElementById('resultadoContenido');
  if (!cont) return;

  // Evita duplicar
  if (document.getElementById('btnGenerarPreguntas')) return;

  // Construcción UI
  const toolbar = document.createElement('div');
  toolbar.className = 'resultado-preguntas-toolbar';
  const btn = document.createElement('button');
  btn.id = 'btnGenerarPreguntas';
  btn.innerHTML = '<i class="fa-solid fa-list-check"></i><span>Generar preguntas</span>';
  btn.className = 'result-ghost-btn is-primary resultado-preguntas-btn';

  const contPreg = document.createElement('div');
  contPreg.id = 'preguntasComprension';
  contPreg.style.marginTop = '8px';

  toolbar.appendChild(btn);
  cont.appendChild(toolbar);
  cont.appendChild(contPreg);

  // Evento principal
  const generarPreguntas = async () => {

    const psH2 = Array.from(cont.querySelectorAll('h2 ~ p'));
    const psAll = Array.from(cont.querySelectorAll('p'));
    const ps = psH2.length ? psH2 : psAll;

    const textoLectura = ps.map(p => (p.textContent || '').trim()).join('\n');
    if (!textoLectura) return alert('No se encontró texto para generar preguntas.');

    // ❌ ya NO usamos spinnerPreguntas local
    // const spinnerPreg = document.getElementById('spinnerPreguntas');
    // const showSpin = () => { spinnerPreg.style.display = 'flex'; };
    // const hideSpinLocal = () => { spinnerPreg.style.display = 'none'; };

    // Prompt
    const promptPreg = [{
      role: 'user',
      text: `
Genera 6 preguntas de comprensión para un alumno de ${nivel}, grado ${grado}, basadas en la siguiente lectura:

${textoLectura}

Debes seguir esta estructura HTML:
<ol>
  <li>
    <p><strong>¿…texto de la pregunta…?</strong></p>
    <p><strong>Nivel PISA:</strong> Nivel 1|2|3 — <strong>Criterio:</strong> uno de: ${listaCriterios}</p>
    <p class="solucion" style="color:#c970d6;">Respuesta esperada breve y clara.</p>
  </li>
</ol>

Condiciones:
- Usa un lenguaje claro, directo y adecuado para niños.
- Evita términos abstractos o complejos.
- NO incluyas bibliografía ni tabla de sinónimos.
- Devuelve SOLO el bloque <ol>…</ol>.
`.trim()
    }];

    try {
      // 🔄 USAR SPINNER GLOBAL EN LA MISMA POSICIÓN
      showSpinner('Generando preguntas de comprensión…');

      let preguntas = await enviarPrompt(promptPreg);
      preguntas = (preguntas || '')
        .replace(/```html\s*/g, '')
        .replace(/```/g, '')
        .trim();

      contPreg.innerHTML = '';
      contPreg.appendChild(document.createRange().createContextualFragment(preguntas));
      window.__cacheUltimaLecturaGeneradaSnapshot?.();

    } catch (err) {
      alert('❌ No se pudieron generar las preguntas.');
    } finally {
      // 🔚 Ocultamos el mismo spinner usado para la lectura
      hideSpinner();
      setProgress('');
      window.__cacheUltimaLecturaGeneradaSnapshot?.();
    }

  };

  btn.addEventListener('click', generarPreguntas);

  if (autoGenerate) {
    setTimeout(() => {
      generarPreguntas();
    }, 100);
  }
}

// ---------------------- DOM principal ----------------------
document.addEventListener('DOMContentLoaded', () => {
  // LISTA
  const modalLecturasNuevas          = $('#modalLecturasNuevas');
  const cerrarModalLecturasNuevas    = $('#cerrarModalLecturasNuevas');
  const contenedorLecturasNuevas     = $('#contenedorLecturasNuevas');
  const buscadorLecturasNuevas       = $('#buscadorLecturasNuevas');
  const filtroNivelLecturasNuevas    = $('#filtroNivelLecturasNuevas');
  const filtroGradoLecturasNuevas    = $('#filtroGradoLecturasNuevas');
  const filtroTrimestreLecturasNuevas = $('#filtroTrimestreLecturasNuevas');
  const filtroUnidadLecturasNuevas   = $('#filtroUnidadLecturasNuevas');
  const btnSugerenciasLectura        = $('#btnSugerenciasLectura');
  const btnAbrirCrearLectura         = $('#btnAbrirCrearLectura');

  // CREAR
  const modalNuevaLectura            = $('#modalNuevaLectura');
  const cerrarModalNuevaLectura      = $('#cerrarModalNuevaLectura');
  const formNuevaLectura             = $('#formNuevaLectura');
  const btnAbrirUltimaLecturaGenerada = $('#btnAbrirUltimaLecturaGenerada');

  // EDITAR
  const modalEditarLectura           = $('#modalEditarLectura');
  const cerrarModalEditarLectura     = $('#cerrarModalEditarLectura');
  const formEditarLectura            = $('#formEditarLectura');
  const editarDocId                  = $('#editarDocId');
  const editarTema                   = $('#editarTema');
  const editarPreview                = $('#editarPreview');
  if (editarPreview) editarPreview.setAttribute('contenteditable', 'true');
  editarPreview?.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertHTML', false, text.replace(/\n/g, '<br>'));
  });

  // VISTA grande
  const modalRes                     = $('#modalResultadoLectura');
  const cerrarModalResultado         = $('#cerrarModalResultado');
  const resultadoContenido           = $('#resultadoContenido');
  const resultadoFooter              = $('#modalResultadoFooter');
  const preguntasVistaGuardadas      = $('#preguntasVistaGuardadas');

  // Crear – selects
  const nivelSelect = $('#nivelNuevo');
  const gradoSelect = $('#gradoNuevo');
  const autorSelect = $('#autorReferencia');

  // Estado
  let cacheLecturas = [];
  let cacheAudioSessions = [];
  let lecturasUnsub = null;
  const LAST_GENERATED_READING_CACHE_KEY = 'lecturaNueva:ultimaLecturaGenerada:v1';

  function obtenerSnapshotLecturaGeneradaActual() {
    const bloque = document.getElementById('bloqueLecturaGenerada');
    if (!bloque || !String(bloque.innerHTML || '').trim()) return null;
    const preguntasWrap = document.getElementById('preguntasComprension');
    const preguntasHTML = preguntasWrap ? String(preguntasWrap.innerHTML || '').trim() : '';
    const titulo = (bloque.querySelector('h2')?.textContent || '').trim();
    return {
      version: 1,
      savedAt: Date.now(),
      titulo,
      lecturaHTML: String(bloque.innerHTML || ''),
      preguntasHTML,
      preguntasVistaGuardadasHTML: String(preguntasVistaGuardadas?.innerHTML || '')
    };
  }

  function guardarUltimaLecturaGeneradaEnCache() {
    try {
      const snapshot = obtenerSnapshotLecturaGeneradaActual();
      if (!snapshot) return false;
      sessionStorage.setItem(LAST_GENERATED_READING_CACHE_KEY, JSON.stringify(snapshot));
      actualizarEstadoBotonUltimaLecturaGenerada();
      return true;
    } catch (err) {
      console.warn('No se pudo guardar la última lectura generada en caché', err);
      return false;
    }
  }

  function cargarUltimaLecturaGeneradaDesdeCache() {
    try {
      const raw = sessionStorage.getItem(LAST_GENERATED_READING_CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      if (!String(data.lecturaHTML || '').trim()) return null;
      return {
        version: Number(data.version || 1),
        savedAt: Number(data.savedAt || 0) || Date.now(),
        titulo: String(data.titulo || ''),
        lecturaHTML: String(data.lecturaHTML || ''),
        preguntasHTML: String(data.preguntasHTML || ''),
        preguntasVistaGuardadasHTML: String(data.preguntasVistaGuardadasHTML || '')
      };
    } catch (err) {
      console.warn('No se pudo leer la última lectura generada desde caché', err);
      return null;
    }
  }

  function hayLecturaGeneradaDisponible() {
    const bloque = document.getElementById('bloqueLecturaGenerada');
    if (bloque && String(bloque.innerHTML || '').trim()) return true;
    return !!cargarUltimaLecturaGeneradaDesdeCache();
  }

  function actualizarEstadoBotonUltimaLecturaGenerada() {
    if (!btnAbrirUltimaLecturaGenerada) return;
    const disponible = hayLecturaGeneradaDisponible();
    btnAbrirUltimaLecturaGenerada.disabled = !disponible;
    btnAbrirUltimaLecturaGenerada.innerHTML = disponible
      ? '<i class="far fa-eye"></i> Ver última lectura generada'
      : '<i class="far fa-eye"></i> Abrir lectura generada';
    btnAbrirUltimaLecturaGenerada.title = disponible
      ? 'Abrir la última lectura generada guardada en caché'
      : 'Aún no hay una lectura generada en caché';
  }

  function renderResultadoLecturaDesdeSnapshot(snapshot) {
    if (!resultadoContenido || !snapshot?.lecturaHTML) return false;
    const htmlLectura = sanitizeHTML(cleanGeneratedHTML(snapshot.lecturaHTML));
    if (!htmlLectura) return false;

    resultadoContenido.innerHTML = '';
    const wrapGenerado = document.createElement('div');
    wrapGenerado.id = 'bloqueLecturaGenerada';
    wrapGenerado.style.marginTop = '16px';
    wrapGenerado.innerHTML = htmlLectura;
    resultadoContenido.appendChild(wrapGenerado);

    const preguntasHTML = String(snapshot.preguntasHTML || '').trim();
    if (preguntasHTML) {
      const tituloPreg = document.createElement('div');
      tituloPreg.style.cssText = 'font-weight:700; font-size:13px; color:#334155; margin-top:10px;';
      tituloPreg.textContent = 'Preguntas de comprensión (última generación)';
      resultadoContenido.appendChild(tituloPreg);

      const contPreg = document.createElement('div');
      contPreg.id = 'preguntasComprension';
      contPreg.style.marginTop = '10px';
      contPreg.innerHTML = sanitizeHTML(cleanGeneratedHTML(preguntasHTML));
      resultadoContenido.appendChild(contPreg);
    }

    if (preguntasVistaGuardadas) {
      preguntasVistaGuardadas.innerHTML = sanitizeHTML(String(snapshot.preguntasVistaGuardadasHTML || ''));
    }

    if (resultadoFooter) {
      resultadoFooter.innerHTML = '';
      const nota = document.createElement('small');
      nota.style.cssText = 'margin-right:auto; color:#64748b; font-size:12px;';
      nota.textContent = 'Vista restaurada desde caché. Genera de nuevo para recuperar acciones de guardar/descargar.';
      resultadoFooter.appendChild(nota);
    }

    actualizarIndicadorMetricasLectura();
    return true;
  }

  function abrirUltimaLecturaGenerada() {
    const bloque = document.getElementById('bloqueLecturaGenerada');
    const tieneDOMActual = !!(bloque && String(bloque.innerHTML || '').trim());
    if (!tieneDOMActual) {
      const snapshot = cargarUltimaLecturaGeneradaDesdeCache();
      if (!snapshot || !renderResultadoLecturaDesdeSnapshot(snapshot)) {
        alert('No hay una lectura generada reciente para mostrar.');
        actualizarEstadoBotonUltimaLecturaGenerada();
        return;
      }
    }

    try { window.cbUnidadDock?.openSection?.('modalResultadoLectura'); } catch (_) {}
    cerrarPanelNuevaLectura(modalNuevaLectura);
    abrirPanelResultadoLectura(modalRes);
    actualizarIndicadorMetricasLectura();
  }

  window.__cacheUltimaLecturaGeneradaSnapshot = guardarUltimaLecturaGeneradaEnCache;

  // Niveles / grados
  const gradosPorNivel = {
    Preescolar: ['1','2','3'],
    Primaria:   ['1','2','3','4','5','6'],
    Secundaria: ['1','2','3']
  };
  nivelSelect?.addEventListener('change', () => {
    if (!gradoSelect) return;
    gradoSelect.innerHTML = '<option value="">Selecciona grado</option>';
    (gradosPorNivel[nivelSelect.value] || []).forEach(g => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      gradoSelect.appendChild(opt);
    });
  });

  // Autores
  async function cargarAutoresReferencia() {
    if (!autorSelect) return;
    try {
      const snap = await getDocs(collection(db, 'autoresEjemplo'));
      autorSelect.innerHTML = '<option value="">Selecciona autor</option>';
      const optLibre = document.createElement('option');
      optLibre.value = JSON.stringify({
        modo: 'libre',
        autor: 'Sin autor (lectura libre IA)',
        ejemplo: '',
        tipoTexto: 'Libre'
      });
      optLibre.textContent = 'Sin autor (lectura libre IA)';
      autorSelect.appendChild(optLibre);

      snap.forEach(docu => {
        const d = docu.data();
        const opt = document.createElement('option');
        opt.value = JSON.stringify({
          modo: 'autor',
          autor: d.autor,
          ejemplo: d.ejemplo,
          tipoTexto: d.tipoTexto,
          rasgos: d.rasgos || d.estilo || '',
          notas: d.notas || '',
          wikipediaTitle: d.wikipediaTitle || ''
        });
        opt.textContent = `${d.autor} — ${d.tipoTexto}`;
        autorSelect.appendChild(opt);
      });
    } catch (err) {
      autorSelect.innerHTML = '<option value="">Error al cargar autores</option>';
    }
  }
  cargarAutoresReferencia();

    // ---------------------- FILTRO DE AUTORES ----------------------
  const buscarAutor = document.getElementById("buscarAutor");

  if (buscarAutor && autorSelect) {
    buscarAutor.addEventListener("input", () => {
      const filtro = buscarAutor.value.toLowerCase().trim();

      // Mostrar/Ocultar autores según búsqueda
      Array.from(autorSelect.options).forEach(opt => {
        if (!opt.value) return; // Ignorar "Selecciona autor"

        const data = JSON.parse(opt.value);
        const nombre = (data.autor || "").toLowerCase();
        const tipo   = (data.tipoTexto || "").toLowerCase();
        const ejem   = (data.ejemplo || "").toLowerCase();

        const coincide =
          nombre.includes(filtro) ||
          tipo.includes(filtro) ||
          ejem.includes(filtro);

        opt.style.display = coincide ? "block" : "none";
      });
    });
  }

  // Generador de ideas (sinopsis + especificaciones) dentro del modal
  (function instalarGeneradorIdeasLectura() {
    const temaInput = $('#temaNuevo');
    const specsInput = $('#especificacionesNuevo');
    const tituloInput = $('#tituloNuevo');
    const tonoInput = $('#tonoNuevo');
    if (!temaInput || !specsInput || !temaInput.parentElement) return;
    if (document.getElementById('panelIdeasLecturaIA')) return;

    const labelSinopsis = temaInput.parentElement.querySelector('label[for="temaNuevo"]');
    const panel = document.createElement('div');
    panel.id = 'panelIdeasLecturaIA';
    panel.style.cssText = 'display:flex; align-items:center; gap:8px; margin-left:auto;';
    panel.innerHTML = `
      <button type="button" id="btnGenerarIdeasLecturaIA" class="btn-analisis" style="margin:0; padding:6px 10px; font-size:12px; line-height:1.1;">Generar ideas IA</button>
      <small style="color:#6b7280; font-size:12px; white-space:nowrap;" class="hidden sm:inline">Sinopsis + especificaciones</small>
    `;

    if (labelSinopsis) {
      const wrapLabelSinopsis = document.createElement('div');
      wrapLabelSinopsis.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:4px;';
      labelSinopsis.parentNode.insertBefore(wrapLabelSinopsis, labelSinopsis);
      wrapLabelSinopsis.appendChild(labelSinopsis);
      wrapLabelSinopsis.appendChild(panel);
    } else {
      temaInput.parentElement.insertBefore(panel, temaInput);
    }

    let ideasModal = document.getElementById('modalIdeasLecturaIA');
    if (!ideasModal) {
      ideasModal = document.createElement('div');
      ideasModal.id = 'modalIdeasLecturaIA';
      ideasModal.className = 'cb-modal-runtime-overlay';
      ideasModal.style.display = 'none';
      ideasModal.innerHTML = `
        <div role="dialog" aria-modal="true" aria-labelledby="tituloModalIdeasLecturaIA" class="cb-modal-runtime-panel">
          <div class="cb-modal-head">
            <div>
              <h4 id="tituloModalIdeasLecturaIA" class="cb-modal-title">Ideas para la lectura</h4>
              <small style="color:#6b7280;">Selecciona una idea para aplicarla al formulario.</small>
            </div>
            <button type="button" id="cerrarModalIdeasLecturaIA" class="cb-modal-close" aria-label="Cerrar modal">&times;</button>
          </div>
          <div class="cb-modal-runtime-body">
            <div id="listaIdeasLecturaIA" style="padding:12px; overflow:auto; min-height:180px;"></div>
            <div id="spinnerIdeasLecturaIA" style="display:none; position:absolute; inset:0; background:rgba(250,250,250,.9); backdrop-filter:blur(1px); align-items:center; justify-content:center;">
              <div style="display:flex; flex-direction:column; align-items:center; gap:8px; color:#374151;">
                <div style="width:22px; height:22px; border:3px solid #d1d5db; border-top-color:#6d28d9; border-radius:999px; animation: spin 1s linear infinite;"></div>
                <small>Generando ideas…</small>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(ideasModal);
    }

    const btn = panel.querySelector('#btnGenerarIdeasLecturaIA');
    const lista = ideasModal.querySelector('#listaIdeasLecturaIA');
    const btnCerrarModalIdeas = ideasModal.querySelector('#cerrarModalIdeasLecturaIA');
    const spinnerIdeas = ideasModal.querySelector('#spinnerIdeasLecturaIA');
    if (!btn || !lista) return;

    const cerrarIdeasModal = () => {
      ideasModal.style.display = 'none';
    };
    const abrirIdeasModal = () => {
      ideasModal.style.display = 'block';
    };
    const setIdeasLoading = (loading) => {
      if (!spinnerIdeas) return;
      spinnerIdeas.style.display = loading ? 'flex' : 'none';
    };
    const obtenerContextoFormularioIdeas = () => ({
      titulo: tituloInput?.value?.trim() || '',
      sinopsisActual: temaInput?.value?.trim() || '',
      especificacionesActuales: specsInput?.value?.trim() || '',
      nivel: nivelSelect?.value || '',
      grado: gradoSelect?.value || '',
      tono: tonoInput?.value || ''
    });
    const IDEAS_SESSION_KEY = 'lecturaNueva:ideasModalState:v1';
    const normCmp = (v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const contextoVacio = (ctx = {}) =>
      !normCmp(ctx.titulo) &&
      !normCmp(ctx.sinopsisActual) &&
      !normCmp(ctx.especificacionesActuales) &&
      !normCmp(ctx.nivel) &&
      !normCmp(ctx.grado) &&
      !normCmp(ctx.tono);
    const contextoCompatibleParaRestaurar = (actual = {}, guardado = {}) => {
      // Si el formulario está vacío, sí permitimos restaurar la sesión anterior.
      if (contextoVacio(actual)) return true;
      // Si el contexto actual trae valores, deben coincidir (en los campos que el usuario ya llenó).
      const campos = ['titulo', 'sinopsisActual', 'nivel', 'grado', 'tono'];
      return campos.every((campo) => {
        const a = normCmp(actual[campo]);
        const g = normCmp(guardado?.[campo]);
        if (!a) return true; // campo no capturado aún, no bloquea restauración
        return a === g;
      });
    };

    let ideasState = [];
    let refinandoIdeaIdx = null;
    const refineDrafts = new Map();
    const undoRefinamientoStacks = new Map();
    const redoRefinamientoStacks = new Map();
    const cloneIdea = (idea) => JSON.parse(JSON.stringify(idea || {}));
    const serializarMap = (map, { arrays = false } = {}) =>
      Array.from(map.entries()).map(([k, v]) => [Number(k), arrays ? (Array.isArray(v) ? v : []) : String(v || '')]);
    const deserializarMap = (entries, { arrays = false } = {}) => {
      const m = new Map();
      (Array.isArray(entries) ? entries : []).forEach(pair => {
        if (!Array.isArray(pair) || pair.length < 2) return;
        const idx = Number(pair[0]);
        if (!Number.isFinite(idx)) return;
        if (arrays) {
          m.set(idx, (Array.isArray(pair[1]) ? pair[1] : []).map(cloneIdea).slice(-5));
        } else {
          m.set(idx, String(pair[1] || ''));
        }
      });
      return m;
    };

    const guardarSesionIdeas = () => {
      try {
        const payload = {
          version: 1,
          savedAt: Date.now(),
          contextoFormulario: obtenerContextoFormularioIdeas(),
          ideasState: ideasState.map(cloneIdea),
          refineDrafts: serializarMap(refineDrafts),
          undoStacks: serializarMap(undoRefinamientoStacks, { arrays: true }),
          redoStacks: serializarMap(redoRefinamientoStacks, { arrays: true })
        };
        sessionStorage.setItem(IDEAS_SESSION_KEY, JSON.stringify(payload));
      } catch (err) {
        console.warn('No se pudo guardar sesión de ideas en sessionStorage', err);
      }
    };

    const limpiarSesionIdeas = () => {
      try { sessionStorage.removeItem(IDEAS_SESSION_KEY); } catch {}
    };

    const restaurarSesionIdeas = () => {
      try {
        const raw = sessionStorage.getItem(IDEAS_SESSION_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        const contextoActual = obtenerContextoFormularioIdeas();
        const contextoGuardado = data?.contextoFormulario || {};
        if (!contextoCompatibleParaRestaurar(contextoActual, contextoGuardado)) {
          return false;
        }
        const ideas = Array.isArray(data?.ideasState) ? data.ideasState.map(normalizarIdeaLecturaIA).filter(i => i.sinopsis) : [];
        if (!ideas.length) return false;

        ideasState = ideas;
        refinandoIdeaIdx = null;
        refineDrafts.clear();
        deserializarMap(data?.refineDrafts).forEach((v, k) => refineDrafts.set(k, v));

        undoRefinamientoStacks.clear();
        deserializarMap(data?.undoStacks, { arrays: true }).forEach((v, k) => undoRefinamientoStacks.set(k, v));

        redoRefinamientoStacks.clear();
        deserializarMap(data?.redoStacks, { arrays: true }).forEach((v, k) => redoRefinamientoStacks.set(k, v));

        return true;
      } catch (err) {
        console.warn('No se pudo restaurar sesión de ideas', err);
        return false;
      }
    };

    const renderIdeas = () => {
      if (!ideasState.length) {
        lista.innerHTML = '<em>No hay ideas cargadas.</em>';
        return;
      }

      lista.innerHTML = ideasState.map((idea, idx) => {
        const draft = refineDrafts.get(idx) || '';
        const historial = Array.isArray(idea?._historialRefinamiento) ? idea._historialRefinamiento : [];
        const refinando = refinandoIdeaIdx === idx;
        const puedeDeshacer = (undoRefinamientoStacks.get(idx)?.length || 0) > 0;
        const puedeRehacer = (redoRefinamientoStacks.get(idx)?.length || 0) > 0;
        return `
          <article data-idx="${idx}" style="border:1px solid #e5e7eb; border-radius:10px; padding:10px; background:#fff; margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start; margin-bottom:6px;">
              <strong>Idea ${idx + 1}</strong>
              <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
                <button type="button" class="deshacer-refinado-idea result-ghost-btn cb-refine-btn is-undo" data-idx="${idx}" ${(refinando || !puedeDeshacer) ? 'disabled' : ''}>Deshacer</button>
                <button type="button" class="rehacer-refinado-idea result-ghost-btn cb-refine-btn is-redo" data-idx="${idx}" ${(refinando || !puedeRehacer) ? 'disabled' : ''}>Rehacer</button>
                <button type="button" class="refinar-idea-lectura result-ghost-btn cb-refine-btn is-refine" data-idx="${idx}" ${refinando ? 'disabled' : ''}>
                  ${refinando ? 'Refinando…' : 'Refinar'}
                </button>
                <button type="button" class="aplicar-idea-lectura result-ghost-btn cb-refine-btn is-apply" data-idx="${idx}" ${refinando ? 'disabled' : ''}>Aplicar</button>
              </div>
            </div>
            ${idea.titulo_sugerido ? `<p style="margin:6px 0 4px;"><strong>Título sugerido:</strong> ${escapeHTML(idea.titulo_sugerido)}</p>` : ''}
            <p style="margin:6px 0 4px;"><strong>Sinopsis:</strong> ${escapeHTML(idea.sinopsis)}</p>
            ${idea.gancho_narrativo ? `<p style="margin:6px 0 4px;"><strong>Gancho:</strong> ${escapeHTML(idea.gancho_narrativo)}</p>` : ''}
            ${idea.tono_sugerido ? `<p style="margin:6px 0 4px;"><strong>Tono sugerido:</strong> ${escapeHTML(idea.tono_sugerido)}</p>` : ''}
            ${idea.especificaciones?.length ? `
              <ul style="margin:6px 0 8px 18px;">
                ${idea.especificaciones.map(x => `<li>${escapeHTML(x)}</li>`).join('')}
              </ul>` : ''}

            ${historial.length ? `
              <details style="margin:8px 0;">
                <summary style="cursor:pointer; color:#4b5563; font-size:12px;">Historial de refinamientos (${historial.length})</summary>
                <ul style="margin:6px 0 0 18px; font-size:12px; color:#4b5563;">
                  ${historial.map(h => `<li>${escapeHTML(h)}</li>`).join('')}
                </ul>
              </details>
            ` : ''}

            <div style="margin-top:8px; border-top:1px dashed #e5e7eb; padding-top:8px;">
              <label style="display:block; font-size:12px; font-weight:600; color:#374151; margin-bottom:4px;">
                Refinar idea (tipo chat)
              </label>
              <textarea
                class="refinar-idea-input"
                data-idx="${idx}"
                rows="2"
                style="width:100%; border:1px solid #d1d5db; border-radius:8px; padding:8px; font-size:13px; resize:vertical; background:#fff;"
                placeholder="Ejemplo: hazla más narrativa, agrega conflicto inicial y enfoque en reciclaje; mantén grado 4."
              >${escapeHTML(draft)}</textarea>
              <small style="display:block; margin-top:4px; color:#6b7280; font-size:11px;">
                Puedes refinar varias veces; la IA conserva contexto y cambios previos de esta idea.
              </small>
            </div>
          </article>
        `;
      }).join('');

      lista.querySelectorAll('.refinar-idea-input').forEach(input => {
        input.addEventListener('input', () => {
          const idx = Number(input.dataset.idx);
          refineDrafts.set(idx, input.value);
          guardarSesionIdeas();
        });
      });

      lista.querySelectorAll('.aplicar-idea-lectura').forEach(b => {
        b.addEventListener('click', () => {
          const idx = Number(b.dataset.idx);
          const idea = ideasState[idx];
          if (!idea) return;
          if (tituloInput && !tituloInput.value.trim() && idea.titulo_sugerido) {
            tituloInput.value = idea.titulo_sugerido;
          }
          if (temaInput) temaInput.value = idea.sinopsis || temaInput.value;
          if (tonoInput && !tonoInput.value && idea.tono_sugerido) {
            const opt = Array.from(tonoInput.options || []).find(o => o.value === idea.tono_sugerido || o.textContent === idea.tono_sugerido);
            if (opt) tonoInput.value = opt.value || opt.textContent;
          }
          const specsPrev = (specsInput.value || '').trim();
          const nuevos = (idea.especificaciones || []).join('\n');
          specsInput.value = [specsPrev, nuevos].filter(Boolean).join(specsPrev && nuevos ? '\n' : '');
          guardarSesionIdeas();
          cerrarIdeasModal();
        });
      });

      lista.querySelectorAll('.deshacer-refinado-idea').forEach(b => {
        b.addEventListener('click', () => {
          const idx = Number(b.dataset.idx);
          const undoStack = undoRefinamientoStacks.get(idx) || [];
          if (!undoStack.length) return;
          const actual = cloneIdea(ideasState[idx]);
          const previo = undoStack.pop();
          const redoStack = redoRefinamientoStacks.get(idx) || [];
          redoStack.push(actual);
          redoRefinamientoStacks.set(idx, redoStack.slice(-5));
          ideasState[idx] = previo;
          undoRefinamientoStacks.set(idx, undoStack);
          guardarSesionIdeas();
          renderIdeas();
        });
      });

      lista.querySelectorAll('.rehacer-refinado-idea').forEach(b => {
        b.addEventListener('click', () => {
          const idx = Number(b.dataset.idx);
          const redoStack = redoRefinamientoStacks.get(idx) || [];
          if (!redoStack.length) return;
          const actual = cloneIdea(ideasState[idx]);
          const siguiente = redoStack.pop();
          const undoStack = undoRefinamientoStacks.get(idx) || [];
          undoStack.push(actual);
          undoRefinamientoStacks.set(idx, undoStack.slice(-5));
          redoRefinamientoStacks.set(idx, redoStack);
          ideasState[idx] = siguiente;
          guardarSesionIdeas();
          renderIdeas();
        });
      });

      lista.querySelectorAll('.refinar-idea-lectura').forEach(b => {
        b.addEventListener('click', async () => {
          const idx = Number(b.dataset.idx);
          const idea = ideasState[idx];
          const instruccion = String(refineDrafts.get(idx) || '').trim();
          if (!idea) return;
          if (!instruccion) {
            alert('Escribe qué quieres cambiar en la idea antes de refinar.');
            return;
          }

          try {
            refinandoIdeaIdx = idx;
            renderIdeas();
            setIdeasLoading(true);

            const refinada = await refinarIdeaLecturaIA({
              ideaActual: idea,
              instruccion,
              historial: idea._historialRefinamiento || [],
              ...obtenerContextoFormularioIdeas()
            });

            if (!refinada) throw new Error('No se pudo refinar la idea');
            const stack = undoRefinamientoStacks.get(idx) || [];
            stack.push(cloneIdea(idea));
            undoRefinamientoStacks.set(idx, stack.slice(-5));
            redoRefinamientoStacks.set(idx, []);
            ideasState[idx] = refinada;
            refineDrafts.set(idx, '');
            guardarSesionIdeas();
            renderIdeas();
          } catch (err) {
            console.error('Refinamiento de idea falló', err);
            alert('No se pudo refinar la idea en este intento.');
          } finally {
            refinandoIdeaIdx = null;
            setIdeasLoading(false);
            renderIdeas();
          }
        });
      });
    };

    btnCerrarModalIdeas?.addEventListener('click', cerrarIdeasModal);
    ideasModal.addEventListener('click', (evt) => {
      if (evt.target === ideasModal) cerrarIdeasModal();
    });

    btn.addEventListener('click', async () => {
      if (!ideasState.length) {
        const restaurada = restaurarSesionIdeas();
        if (restaurada) {
          renderIdeas();
          abrirIdeasModal();
          return;
        }
      }
      try {
        btn.disabled = true;
        lista.innerHTML = '';
        abrirIdeasModal();
        setIdeasLoading(true);
        const ideas = await generarIdeasLecturaIA(obtenerContextoFormularioIdeas());

        if (!ideas.length) {
          lista.innerHTML = '<em>No se pudieron generar ideas en este intento.</em>';
          abrirIdeasModal();
          return;
        }

        ideasState = ideas.map(normalizarIdeaLecturaIA);
        refinandoIdeaIdx = null;
        refineDrafts.clear();
        undoRefinamientoStacks.clear();
        redoRefinamientoStacks.clear();
        guardarSesionIdeas();
        renderIdeas();
        abrirIdeasModal();
      } catch (err) {
        console.error('Generador de ideas de lectura falló', err);
        lista.innerHTML = '<em>Error al generar ideas. Intenta nuevamente.</em>';
        abrirIdeasModal();
      } finally {
        setIdeasLoading(false);
        btn.disabled = false;
      }
    });

    // Si el formulario se reinicia manualmente y no quedan datos clave, permite limpiar sesión.
    [tituloInput, temaInput, specsInput].forEach(el => {
      el?.addEventListener('change', () => {
        const sinDatos = !tituloInput?.value?.trim() && !temaInput?.value?.trim() && !specsInput?.value?.trim();
        if (sinDatos && !ideasState.length) limpiarSesionIdeas();
      });
    });

    // Si cambian título/sinopsis mientras no hay ideas cargadas en memoria, evitamos restaurar sesiones viejas por accidente.
    const invalidarSesionViejaSiContextoCambio = () => {
      if (ideasState.length) return;
      try {
        const raw = sessionStorage.getItem(IDEAS_SESSION_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        const ctxSaved = data?.contextoFormulario || {};
        const ctxActual = obtenerContextoFormularioIdeas();
        if (!contextoCompatibleParaRestaurar(ctxActual, ctxSaved)) {
          limpiarSesionIdeas();
        }
      } catch {}
    };

    [tituloInput, temaInput, nivelSelect, gradoSelect, tonoInput].forEach(el => {
      el?.addEventListener('input', invalidarSesionViejaSiContextoCambio);
      el?.addEventListener('change', invalidarSesionViejaSiContextoCambio);
    });
  })();

  // Audio transcripciones (colección de sesiones de voz)
  async function cargarTranscripcionesAudio() {
    try {
      const snap = await getDocs(
        query(collection(db, 'audioTranslate'), orderBy('createdAt', 'desc'), limit(50))
      );

      cacheAudioSessions = snap.docs.map(d => {
        const data = d.data() || {};
        const created = data.createdAt?.toDate ? data.createdAt.toDate() : null;
        return {
          id: d.id,
          title: data.title || `Sesión ${d.id.slice(-6)}`,
          userEmail: data.userEmail || data.userId || 'desconocido',
          model: data.modelUsed || 'N/D',
          segmentsCount: Array.isArray(data.segments) ? data.segments.length : (data.segmentCount || 0),
          createdAt: created ? created.toISOString() : null
        };
      });

      // Exponer para el asistente/depuración
      window.audioTranscripciones = cacheAudioSessions;
      window.obtenerColeccionesLectura = () => ({
        lecturas: cacheLecturas,
        audioTranscripciones: cacheAudioSessions
      });
    } catch (err) {
      console.error('Error cargando audioTranslate', err);
    }
  }


  // Abrir/Cerrar modales
  btnSugerenciasLectura?.addEventListener('click', async () => {
    window.cbUnidadDock?.openSection?.('modalLecturasNuevas');
    show(modalLecturasNuevas);
    await cargarLecturasNuevas({ realtime: true });
    cargarTranscripcionesAudio().catch(console.error);
  });
  cerrarModalLecturasNuevas?.addEventListener('click', () => hide(modalLecturasNuevas));
  modalLecturasNuevas?.addEventListener('click', (e) => { if (e.target === modalLecturasNuevas) hide(modalLecturasNuevas); });

  btnAbrirCrearLectura?.addEventListener('click', () => {
    actualizarEstadoBotonUltimaLecturaGenerada();
    try { window.cbUnidadDock?.showHost?.({ soloSeccion: true }); } catch (_) {}
    try { window.cbUnidadDock?.openSection?.('modalLecturasNuevas'); } catch (_) {}
    show(modalLecturasNuevas);
    try { window.cbUnidadDock?.openSection?.('modalNuevaLectura'); } catch (_) {}
    abrirPanelNuevaLectura(modalNuevaLectura);
  });
  btnAbrirUltimaLecturaGenerada?.addEventListener('click', abrirUltimaLecturaGenerada);
  cerrarModalNuevaLectura?.addEventListener('click', () => { cerrarPanelNuevaLectura(modalNuevaLectura); });
  modalNuevaLectura?.addEventListener('click', (e) => { if (e.target === modalNuevaLectura) { cerrarPanelNuevaLectura(modalNuevaLectura); } });

  cerrarModalEditarLectura?.addEventListener('click', () => hide(modalEditarLectura));
  modalEditarLectura?.addEventListener('click', (e) => { if (e.target === modalEditarLectura) hide(modalEditarLectura); });

  cerrarModalResultado?.addEventListener('click', () => { cerrarPanelResultadoLectura(modalRes); resetIndicadorMetricasLectura(); });

  // ESC
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (modalNuevaLectura?.classList?.contains('is-open')) { cerrarPanelNuevaLectura(modalNuevaLectura); }
    if (modalLecturasNuevas?.style.display === 'block') hide(modalLecturasNuevas);
    if (modalEditarLectura?.style.display === 'block') hide(modalEditarLectura);
    if (modalRes?.classList?.contains('is-open')) { cerrarPanelResultadoLectura(modalRes); resetIndicadorMetricasLectura(); }
  });

  actualizarEstadoBotonUltimaLecturaGenerada();

  // LISTA
  async function cargarLecturasNuevas(opts = { realtime: false }) {
    if (!contenedorLecturasNuevas) return;

    const qLect = query(collection(db, 'lecturasNuevas'), orderBy('timestamp', 'desc'));

    const normalizarTextoHuella = (value = '') => String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const deduplicarLecturasNuevas = (rows = []) => {
      const source = Array.isArray(rows) ? rows : [];
      const byId = new Map();
      // Paso 1: dedupe estricto por id.
      source.forEach((item) => {
        const id = String(item?.id || '').trim();
        if (!id || byId.has(id)) return;
        byId.set(id, item);
      });

      // Paso 2: dedupe por huella de contenido para ocultar clonados accidentales.
      const seenFingerprint = new Set();
      const out = [];
      for (const item of byId.values()) {
        const fp = [
          normalizarTextoHuella(item?.titulo || ''),
          normalizarTextoHuella(item?.tema || ''),
          normalizarTextoHuella(item?.nivel || ''),
          normalizarTextoHuella(item?.grado || ''),
          normalizarTextoHuella(item?.trimestre || ''),
          normalizarTextoHuella(resolverUnidadLectura(item) || ''),
          normalizarTextoHuella(String(item?.contenidoPlano || item?.contenidoHTML || '').slice(0, 240))
        ].join('|');
        if (seenFingerprint.has(fp)) continue;
        seenFingerprint.add(fp);
        out.push(item);
      }
      return out;
    };

    const handle = (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      cacheLecturas = deduplicarLecturasNuevas(docs);
      poblarFiltrosLecturasNuevas(cacheLecturas);
      renderLista(cacheLecturas);
    };

    if (opts.realtime) {
      if (lecturasUnsub) return; // ya activo
      contenedorLecturasNuevas.innerHTML = '<p>Cargando…</p>';
      lecturasUnsub = onSnapshot(qLect, handle, (err) => {
        console.error('onSnapshot lecturasNuevas', err);
        contenedorLecturasNuevas.innerHTML = '<p>Error al cargar lecturas.</p>';
      });
    } else {
      contenedorLecturasNuevas.innerHTML = '<p>Cargando…</p>';
      const snap = await getDocs(qLect);
      handle(snap);
    }
  }

  function renderLista(items) {
    if (!contenedorLecturasNuevas) return;
    const allItems = Array.isArray(items) ? items : [];

    if (!allItems.length) {
      contenedorLecturasNuevas.innerHTML = '<p class="lecturas-empty">No hay lecturas nuevas.</p>';
      return;
    }

    contenedorLecturasNuevas.classList.add('lecturas-lista-compacta');
    const filas = allItems.map((it) => {
      const tituloFull = escapeHTML(it.titulo || '(Sin título)');
      const titulo = escapeHTML(truncateText(it.titulo || '(Sin título)', 64));
      const temaFull = escapeHTML(it.tema || '(Sin tema)');
      const tema = escapeHTML(truncateText(it.tema || '(Sin tema)', 88));
      const nivel = escapeHTML(it.nivel || '—');
      const grado = escapeHTML(it.grado || '—');
      const trimestre = escapeHTML(it.trimestre || '—');
      const unidad = escapeHTML(resolverUnidadLectura(it));
      const id = escapeHTML(it.id || '');
      const published = it?.published === true;
      const publishLabel = published ? 'Despublicar lectura' : 'Publicar lectura';

      return `
        <tr data-id="${id}">
          <td title="${tituloFull}">${titulo}</td>
          <td title="${temaFull}">${tema}</td>
          <td>${nivel}</td>
          <td>${grado}</td>
          <td>${trimestre}</td>
          <td>${unidad}</td>
          <td>
            <div class="lectura-row-actions">
              <label class="lectura-publish-switch" title="${publishLabel}" aria-label="${publishLabel}">
                <input
                  type="checkbox"
                  class="lectura-publish-switch-input btn-toggle-published"
                  data-id="${id}"
                  ${published ? 'checked' : ''}
                  aria-label="${publishLabel}"
                >
                <span class="lectura-publish-switch-track" aria-hidden="true">
                  <span class="lectura-publish-switch-thumb"></span>
                </span>
              </label>
              <button class="lectura-action-btn action-ver btn-ver" data-id="${id}" title="Ver lectura" aria-label="Ver lectura">
                <i class="far fa-eye"></i>
              </button>
              <button class="lectura-action-btn action-live btn-live-read" data-id="${id}" title="Leer con Gemini Flash Live" aria-label="Leer con Gemini Flash Live" data-coleccion="lecturasNuevas">
                <i class="fas fa-volume-up"></i>
              </button>
              <button class="lectura-action-btn action-editar btn-editar" data-id="${id}" title="Editar lectura" aria-label="Editar lectura">
                <i class="fas fa-pen"></i>
              </button>
              <button class="lectura-action-btn action-eliminar btn-eliminar" data-id="${id}" title="Eliminar lectura" aria-label="Eliminar lectura">
                <i class="fas fa-trash"></i>
              </button>
              <button class="lectura-action-btn action-word btn-descargar" data-id="${id}" title="Descargar Word" aria-label="Descargar Word">
                <i class="fas fa-file-word"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    contenedorLecturasNuevas.innerHTML = `
      <div class="lecturas-table-wrap" id="lecturasNuevasTablaWrap">
        <table class="lecturas-table">
          <thead>
            <tr>
              <th>Titulo</th>
              <th>Tema</th>
              <th>Nivel</th>
              <th>Grado</th>
              <th>Trim.</th>
              <th>Unidad</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
    `;

    $$('.btn-ver').forEach(b => b.addEventListener('click', onVerLectura));
    $$('.btn-live-read').forEach(b => b.addEventListener('click', onLeerLecturaLive));
    $$('.btn-live-read').forEach(b => b.addEventListener('dblclick', onDetenerLecturaLive));
    $$('.btn-toggle-published').forEach(b => b.addEventListener('change', onTogglePublishedLectura));
    $$('.btn-editar').forEach(b => b.addEventListener('click', onEditarLectura));
    $$('.btn-eliminar').forEach(b => b.addEventListener('click', onEliminarLectura));
    $$('.btn-descargar').forEach(b => b.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      const ref = doc(db, 'lecturasNuevas', id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return alert('No se pudo descargar. Lectura no encontrada.');
      const d = snap.data();

      const htmlLectura = d.contenidoHTML || '';
      const titulo = d.titulo || d.tema || 'Lectura sin título';
      
      const preguntas = Array.isArray(d.preguntas) && d.preguntas.length
        ? `
          <ol>
            ${d.preguntas.map(p => `
              <li>
                <p><strong>${p.texto || ''}</strong></p>
                <p><strong>Nivel PISA:</strong> Nivel ${p.nivel || '?'} — <strong>Criterio:</strong> ${p.criterio || '—'}</p>
                <p class="solucion" style="color:#c970d6;">${p.respuesta || ''}</p>
              </li>
            `).join('')}
          </ol>
        `
        : '<p>(Sin preguntas guardadas)</p>';

      const fullHTML = `
        <h2 style="margin-bottom:10px;">${titulo}</h2>
        ${htmlLectura}
        <hr style="margin:30px 0;"/>
        <h2 style="margin-bottom:10px;">Preguntas de Comprensión</h2>
        ${preguntas}
      `.trim();

      const blob = window.htmlDocx.asBlob(fullHTML);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${titulo.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${id}.docx`;
      a.click();
    }));
    actualizarEstadoBotonesLecturaLive();
  }

  function resolverUnidadLectura(item = {}) {
    const candidatos = [
      item?.unidad,
      item?.unidadNumero,
      item?.unidad_numero,
      item?.numeroUnidad,
      item?.numUnidad,
      item?.rawData?.unidad,
      item?.rawData?.unidadNumero,
      item?.campos?.unidad,
      item?.campos?.unidadNumero
    ];
    for (const valor of candidatos) {
      if (valor == null) continue;
      const texto = String(valor).trim();
      if (texto) return texto;
    }
    return '—';
  }

  function poblarSelectSimple(selectEl, values = [], placeholder = '') {
    if (!selectEl) return;
    const current = String(selectEl.value || '');
    const unique = Array.from(new Set((Array.isArray(values) ? values : [])
      .map((v) => String(v ?? '').trim())
      .filter((v) => v && v !== '—')))
      .sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));
    selectEl.innerHTML = `<option value="">${placeholder}</option>${unique.map((v) => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('')}`;
    if (current && unique.includes(current)) selectEl.value = current;
  }

  function poblarFiltrosLecturasNuevas(items = []) {
    const rows = Array.isArray(items) ? items : [];
    poblarSelectSimple(filtroNivelLecturasNuevas, rows.map((it) => it?.nivel || ''), 'Nivel');
    poblarSelectSimple(filtroGradoLecturasNuevas, rows.map((it) => it?.grado || ''), 'Grado');
    poblarSelectSimple(filtroTrimestreLecturasNuevas, rows.map((it) => it?.trimestre || ''), 'Trimestre');
    poblarSelectSimple(filtroUnidadLecturasNuevas, rows.map((it) => resolverUnidadLectura(it)), 'Unidad');
  }

  function aplicarFiltrosLecturasNuevas() {
    const texto = String(buscadorLecturasNuevas?.value || '').toLowerCase().trim();
    const nivel = String(filtroNivelLecturasNuevas?.value || '').trim().toLowerCase();
    const grado = String(filtroGradoLecturasNuevas?.value || '').trim().toLowerCase();
    const trimestre = String(filtroTrimestreLecturasNuevas?.value || '').trim().toLowerCase();
    const unidad = String(filtroUnidadLecturasNuevas?.value || '').trim().toLowerCase();
    const filtradas = cacheLecturas.filter((it) => {
      const unidadTexto = resolverUnidadLectura(it).toLowerCase();
      const coincideTexto = !texto || [
        it?.tema,
        it?.titulo,
        it?.nivel,
        it?.grado,
        it?.trimestre,
        unidadTexto
      ].some((v) => String(v || '').toLowerCase().includes(texto));
      const coincideNivel = !nivel || String(it?.nivel || '').toLowerCase() === nivel;
      const coincideGrado = !grado || String(it?.grado || '').toLowerCase() === grado;
      const coincideTrimestre = !trimestre || String(it?.trimestre || '').toLowerCase() === trimestre;
      const coincideUnidad = !unidad || unidadTexto === unidad;
      return coincideTexto && coincideNivel && coincideGrado && coincideTrimestre && coincideUnidad;
    });
    renderLista(filtradas);
  }

  function actualizarEstadoBotonesLecturaLive() {
    const getter = window.cbGetLecturaGeminiLiveState;
    $$('.btn-live-read').forEach((btn) => {
      const id = btn.dataset.id;
      const coleccion = btn.dataset.coleccion || 'lecturasNuevas';
      const state = typeof getter === 'function'
        ? String(getter({ id, coleccion })?.state || 'idle')
        : 'idle';
      btn.dataset.state = state;
      btn.classList.toggle('is-starting', state === 'starting');
      btn.classList.toggle('is-playing', state === 'playing');
      btn.classList.toggle('is-paused', state === 'paused');
      if (state === 'starting') {
        btn.title = 'Iniciando lectura...';
        btn.setAttribute('aria-label', 'Iniciando lectura');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      } else if (state === 'playing') {
        btn.title = 'Pausar lectura';
        btn.setAttribute('aria-label', 'Pausar lectura');
        btn.innerHTML = '<i class="fas fa-pause"></i>';
      } else if (state === 'paused') {
        btn.title = 'Reanudar lectura';
        btn.setAttribute('aria-label', 'Reanudar lectura');
        btn.innerHTML = '<i class="fas fa-play"></i>';
      } else {
        btn.title = 'Leer con Gemini Flash Live';
        btn.setAttribute('aria-label', 'Leer con Gemini Flash Live');
        btn.innerHTML = '<i class="fas fa-volume-up"></i>';
      }
    });
  }

  buscadorLecturasNuevas?.addEventListener('input', aplicarFiltrosLecturasNuevas);
  filtroNivelLecturasNuevas?.addEventListener('change', aplicarFiltrosLecturasNuevas);
  filtroGradoLecturasNuevas?.addEventListener('change', aplicarFiltrosLecturasNuevas);
  filtroTrimestreLecturasNuevas?.addEventListener('change', aplicarFiltrosLecturasNuevas);
  filtroUnidadLecturasNuevas?.addEventListener('change', aplicarFiltrosLecturasNuevas);

  // VER
  async function onVerLectura(e) {
    const id = e.currentTarget.dataset.id;
    const ref = doc(db, 'lecturasNuevas', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return alert('No encontrada.');
    const d = snap.data();
    const music = d?.music || d?.musica || {};
    const musicAssets = {
      readingUrl: String(music?.readingUrl || music?.lecturaUrl || d?.musicReadingUrl || "").trim(),
      gameUrl: String(music?.gameUrl || music?.juegoUrl || d?.musicGameUrl || "").trim(),
      readingPath: String(music?.readingPath || music?.lecturaPath || d?.musicReadingPath || "").trim(),
      gamePath: String(music?.gamePath || music?.juegoPath || d?.musicGamePath || "").trim()
    };

    const contenidoHTML = d.contenidoHTML || '<p>(Sin contenido)</p>';
    if (typeof window.cbOpenLecturasAgentViewer === "function") {
      window.cbOpenLecturasAgentViewer({
        id,
        coleccion: 'lecturasNuevas',
        sourceCollection: 'lecturasNuevas',
        titulo: d.titulo || d.tema || 'Lectura sin título',
        htmlLectura: contenidoHTML,
        musicAssets,
        allowMusicGeneration: true,
        preguntas: Array.isArray(d.preguntas) ? d.preguntas : [],
        metadatos: {
          nivel: d.nivel || '',
          grado: d.grado || '',
          trimestre: d.trimestre || '',
          unidad: d.unidad ?? ''
        }
      });
      return;
    }

    // Agregar título antes del contenido
    resultadoContenido.innerHTML = `
      <article class="lectura-vista-completa">
        <h2 style="margin-bottom:20px; color:#333;">${d.titulo || d.tema || 'Lectura sin título'}</h2>
        <div class="lectura-vista-body">
          ${contenidoHTML}
        </div>
      </article>
    `;

    if (d.preguntas?.length) mostrarPreguntasGuardadas(d.preguntas);

    try { window.cbUnidadDock?.openSection?.('modalResultadoLectura'); } catch (_) {}
    abrirPanelResultadoLectura(modalRes);

    addPreguntasUI();

    // Si fue analizada con ASC, muestra el panel informativo (mismos tipos)
    if (d.analizadaASC && d.nivel && d.grado != null && d.trimestre != null && d.unidad != null) {
      const nivelQ = d.nivel;
      const gradoQ = typeof d.grado === 'number' ? String(d.grado) : d.grado;
      const trimQ  = typeof d.trimestre === 'string' ? Number(d.trimestre) : d.trimestre;
      const uniQ   = typeof d.unidad === 'string' ? Number(d.unidad) : d.unidad;

      const qASC = query(
        collection(db, 'lecturasASC'),
        where('nivel', '==', nivelQ),
        where('grado', '==', gradoQ),
        where('trimestre', '==', trimQ),
        where('unidad', '==', uniQ)
      );
      const ascSnap = await getDocs(qASC);
      const lecturas = ascSnap.docs.map(x => x.data());

      const tablaHTML = buildASCResumenHTML(lecturas);
      const criteriosSet = new Set();
      let contextoTextos = '';
      lecturas.forEach((l, i) => {
        contextoTextos += `Lectura ${i + 1}: ${stripHTML(l.textoLectura || '')}\n\n`;
        (l.preguntas || []).forEach(p => p?.criterio && criteriosSet.add(p.criterio));
      });

      const listaCriterios = criteriosSet.size
        ? Array.from(criteriosSet).join(', ')
        : 'Localizar información, Interpretar, Inferir, Reflexionar';

      $('#panelAnalisisASC')?.remove();
      const wrap = document.createElement('div');
      wrap.id = 'panelAnalisisASC';
      wrap.className = 'asc-panel';
      wrap.innerHTML = `
        <details open class="asc-details">
          <summary class="asc-summary">Análisis ASC (coincidencias: ${lecturas.length})</summary>
          <div class="asc-body">
            ${tablaHTML}
            <p class="asc-criteria"><strong>Criterios detectados:</strong> ${listaCriterios}</p>
            <p class="asc-note">Este panel es informativo.</p>
          </div>
        </details>
      `;
      $('#resultadoContenido')?.prepend(wrap);
    }
  }

  async function onLeerLecturaLive(e) {
    e.preventDefault();
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const controller = window.cbControlLecturaGeminiLive;
    if (typeof controller !== 'function') {
      alert('La lectura con Gemini Flash Live no está disponible en este momento.');
      return;
    }
    actualizarEstadoBotonesLecturaLive();
    const result = await controller({ id, coleccion: 'lecturasNuevas' });
    actualizarEstadoBotonesLecturaLive();
    if (!result?.ok) {
      alert('No se pudo iniciar la lectura con Gemini Flash Live.');
    }
  }

  async function onDetenerLecturaLive(e) {
    e.preventDefault();
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const controller = window.cbControlLecturaGeminiLive;
    if (typeof controller !== 'function') return;
    await controller({ id, coleccion: 'lecturasNuevas' }, { stop: true });
    actualizarEstadoBotonesLecturaLive();
  }

  window.addEventListener('cb:lectura-live-state', actualizarEstadoBotonesLecturaLive);

  function mostrarPreguntasGuardadas(preguntas = []) {
    const cont = document.getElementById("preguntasVistaGuardadas");
    if (!cont || !preguntas.length) {
      cont.innerHTML = "";
      return;
    }

    cont.innerHTML = `
      <details open class="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <summary class="font-semibold cursor-pointer text-gray-700">🧠 Preguntas de comprensión guardadas (${preguntas.length})</summary>
        <ol class="preguntas-guardadas-lista mt-3">
          ${preguntas.map(p => `
            <li class="pregunta-guardada-item">
              <div class="pregunta-guardada-num"></div>
              <div class="pregunta-guardada-body">
                <div class="pregunta-guardada-texto"><strong>${p.texto || "(Pregunta sin texto)"}</strong></div>
                <div class="text-sm text-gray-600">
                <div><strong>Nivel:</strong> ${p.nivel || "—"}</div>
                <div><strong>Criterio:</strong> ${p.criterio || "—"}</div>
                <div><strong>Respuesta esperada:</strong> <span class="text-purple-600">${p.respuesta || "—"}</span></div>
                </div>
              </div>
            </li>
          `).join('')}
        </ol>
      </details>
    `;
  }


  async function onEliminarLectura(e) {
    const id = e.currentTarget.dataset.id;
    if (!confirm('¿Eliminar esta lectura?')) return;
    await deleteDoc(doc(db, 'lecturasNuevas', id));
    await cargarLecturasNuevas();
  }

  async function onTogglePublishedLectura(e) {
    const input = e.currentTarget;
    const id = input?.dataset?.id;
    if (!id) return;
    const nextPublished = input.checked === true;
    input.disabled = true;
    try {
      await updateDoc(doc(db, 'lecturasNuevas', id), {
        published: nextPublished
      });
      const label = input.closest('.lectura-publish-switch');
      const nextLabel = nextPublished ? 'Despublicar lectura' : 'Publicar lectura';
      if (label) {
        label.setAttribute('title', nextLabel);
        label.setAttribute('aria-label', nextLabel);
      }
      input.setAttribute('aria-label', nextLabel);
      const idx = cacheLecturas.findIndex((it) => it?.id === id);
      if (idx >= 0) cacheLecturas[idx].published = nextPublished;
    } catch (err) {
      input.checked = !nextPublished;
      alert('❌ No se pudo actualizar el estado de publicación.');
    } finally {
      input.disabled = false;
    }
  }

  // EDITAR
  async function onEditarLectura(e) {
    const id = e.currentTarget.dataset.id;
    const ref = doc(db, 'lecturasNuevas', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return alert('No encontrada.');
    const d = snap.data();
    const contenidoLectura = d.contenidoHTML || d.textoLectura || d.lecturaHTML || d.htmlLectura || '';
    const contenidoPlanoLectura = d.contenidoPlano || htmlToPlainText(contenidoLectura || '');

    if (typeof window.cbOpenLecturaEditorCompartido === 'function') {
      await window.cbOpenLecturaEditorCompartido({
        id,
        mode: 'lecturas-nuevas',
        titulo: d.titulo || '',
        tema: d.tema || '',
        nivel: d.nivel || '',
        grado: d.grado || '',
        trimestre: d.trimestre || '',
        unidad: d.unidad || d.unidadNumero || d.unidad_numero || d.numeroUnidad || d.numUnidad || '',
        contenidoHTML: contenidoLectura,
        contenidoPlano: contenidoPlanoLectura,
        onSave: async (payload) => {
          const htmlSan = sanitizeHTML(cleanGeneratedHTML(payload.contenidoHTML || ''));
          await updateDoc(doc(db, 'lecturasNuevas', id), {
            titulo: payload.titulo,
            tema: payload.tema,
            nivel: payload.nivel,
            grado: payload.grado,
            trimestre: payload.trimestre,
            unidad: payload.unidad,
            contenidoHTML: htmlSan,
            contenidoPlano: htmlToPlainText(htmlSan || payload.contenidoPlano || ''),
            updatedAt: new Date()
          });
          await cargarLecturasNuevas();
        }
      });
      return;
    }

    editarDocId.value = id;
    editarTitulo.value = d.titulo || '';
    editarTema.value = d.tema || '';
    editarPreview.innerHTML = sanitizeHTML(d.contenidoHTML || '<p style="margin-bottom:20px;"><em>(Vacío)</em></p>');
    // Mostrar preguntas en #vistaPreguntasEditar si existen
    const contenedorPreguntas = document.getElementById("vistaPreguntasEditar");
    if (contenedorPreguntas) {
      contenedorPreguntas.innerHTML = ""; // Limpiar
      if (d.preguntas?.length) {
        d.preguntas.forEach((preg, i) => {
          contenedorPreguntas.appendChild(buildQuestionListItem(preg, i));
        });
      } else {
        contenedorPreguntas.innerHTML = "<em>Sin preguntas registradas.</em>";
      }
    }

    show(modalEditarLectura);
  }

  $('#btnVistaLectura')?.addEventListener('click', () => {
    const html = sanitizeHTML(cleanGeneratedHTML(editarPreview.innerHTML || ''));
    resultadoContenido.innerHTML = `
      <article class="lectura-vista-completa">
        <div class="lectura-vista-body">
          ${html || '<p>(Sin contenido)</p>'}
        </div>
      </article>
    `;
    actualizarIndicadorMetricasLectura();
    abrirPanelResultadoLectura(modalRes);
    addPreguntasUI();
  });

  formEditarLectura?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editarDocId.value;
    if (!id) return alert('ID no encontrado');
    try {
      const htmlSan = sanitizeHTML(cleanGeneratedHTML(editarPreview.innerHTML || ''));
      await updateDoc(doc(db, 'lecturasNuevas', id), {
        titulo: (editarTitulo.value || '').trim(),
        tema: (editarTema.value || '').trim(),
        contenidoHTML: htmlSan,
        contenidoPlano: htmlToPlainText(htmlSan),
        updatedAt: new Date()
      });
      alert('✅ Cambios guardados');
      hide(modalEditarLectura);
      await cargarLecturasNuevas();
    } catch (err) {
      alert('❌ No se pudo guardar.');
    }
  });

  // ---------------------- CREAR (análisis ASC previo + decisión) ----------------------
  formNuevaLectura?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const agentGenerationMode = window.__cbAgentGenerationMode === true;

    const tituloNuevo    = $('#tituloNuevo')?.value?.trim(); 
    const temaNuevo      = $('#temaNuevo')?.value?.trim();
    const autorSelectEl  = $('#autorReferencia');
    let autorData = null;
    try {
      autorData = autorSelectEl?.value
        ? JSON.parse(autorSelectEl.value)
        : { modo: 'libre', autor: 'Sin autor (lectura libre IA)', ejemplo: '', tipoTexto: 'Libre' };
    } catch {
      autorData = { modo: 'libre', autor: 'Sin autor (lectura libre IA)', ejemplo: '', tipoTexto: 'Libre' };
    }
    const especificaciones = $('#especificacionesNuevo')?.value?.trim();
    const tonoLectura = $('#tonoNuevo')?.value?.trim() || 'Neutro pedagógico';
    const nivel   = $('#nivelNuevo')?.value;          // string
    const grado   = $('#gradoNuevo')?.value;          // string
    const trimestre = parseInt($('#trimestreNuevo')?.value, 10); // number
    const unidad    = parseInt($('#unidadNuevo')?.value, 10);    // number
    const eje            = $('#ejeArticulador')?.value;
    const usarASC        = !!$('#chkAnalizarASC')?.checked;

    // Validar que ambos campos estén completos
    if (!tituloNuevo || !temaNuevo || !nivel || !grado || !trimestre || unidad === null || unidad === undefined || isNaN(unidad) || !eje) {
      if (agentGenerationMode) {
        window.__cbAgentGenerationMode = false;
        window.dispatchEvent(new CustomEvent('cb-agent-reading-error', {
          detail: { error: 'faltan_campos_requeridos' }
        }));
      }
      return alert('Por favor completa todos los campos requeridos, incluyendo el título y el tema.');
    }

    // Palabras objetivo (opcional)
    const palabrasInput = document.getElementById('palabrasNuevo');
    let palabrasObjetivo = parseInt(palabrasInput?.value, 10);
    if (palabrasInput && palabrasInput.value) {
      if (isNaN(palabrasObjetivo) || palabrasObjetivo < 50 || palabrasObjetivo > 2000) {
        if (agentGenerationMode) {
          window.__cbAgentGenerationMode = false;
          window.dispatchEvent(new CustomEvent('cb-agent-reading-error', {
            detail: { error: 'palabras_fuera_de_rango' }
          }));
        }
        alert('Indica una extensión entre 50 y 2000 palabras.');
        return;
      }
    } else {
      palabrasObjetivo = null;
    }

    // Prepara UI
    resultadoContenido.innerHTML = '';
    resetIndicadorMetricasLectura();
    if (!agentGenerationMode) {
      try { window.cbUnidadDock?.openSection?.('modalResultadoLectura'); } catch (_) {}
      abrirPanelResultadoLectura(modalRes);
    }
    else cerrarPanelResultadoLectura(modalRes);
    showSpinner(usarASC ? 'Analizando lecturas ASC…' : 'Preparando generación…');

    // Contexto ASC y panel de decisión
    let listaCriterios = 'Localizar información, Interpretar, Inferir, Reflexionar';
    let contextoTextos = '';
    let contextoPreguntas = '';
    let estiloASC_Mayoritario = null;
    const incluirSinonimos = true;
    const incluirBibliografia = true;
    const lecturaLibre = autorData?.modo === 'libre';
    const rasgosAutorInferidos = inferirRasgosDesdeMuestraAutor(autorData?.ejemplo || '');
    let regenerarConAutor = null;
    const enfoquesNarrativos = [
      'Abre con una escena breve y concreta, luego desarrolla la idea principal.',
      'Usa una progresión problema -> exploración -> aprendizaje final.',
      'Presenta dos perspectivas complementarias antes de cerrar con síntesis.',
      'Alterna explicación clara con ejemplos cotidianos del contexto escolar.',
      'Inicia con una pregunta detonadora y respóndela de forma gradual.'
    ];
    const enfoqueSeleccionado = enfoquesNarrativos[Math.floor(Math.random() * enfoquesNarrativos.length)];
    const estadoRefinarLectura = {
      committedHtml: '',
      pendingHtml: null,
      undo: [],
      redo: [],
      draft: '',
      refinando: false
    };

    function getBloqueLecturaGenerada() {
      return document.getElementById('bloqueLecturaGenerada');
    }

    function limpiarPreguntasPorCambioLectura() {
      const contPreg = document.getElementById('preguntasComprension');
      if (contPreg) contPreg.innerHTML = '';
      window.__cacheUltimaLecturaGeneradaSnapshot?.();
    }

    function renderHTMLLecturaEnBloque(html = '') {
      const bloque = getBloqueLecturaGenerada();
      if (!bloque) return;
      const estructurado = normalizarEstructuraLecturaHTML(
        enforceTitleH2(html || '', tituloNuevo),
        { titulo: tituloNuevo }
      );
      const limpio = sanitizeHTML(cleanGeneratedHTML(estructurado));
      bloque.innerHTML = limpio || '<p>(Sin contenido)</p>';
      actualizarIndicadorMetricasLectura();
      window.__cacheUltimaLecturaGeneradaSnapshot?.();
    }

    function resetEstadoRefinarLecturaDesdeBloque() {
      const bloque = getBloqueLecturaGenerada();
      estadoRefinarLectura.committedHtml = bloque?.innerHTML || '';
      estadoRefinarLectura.pendingHtml = null;
      estadoRefinarLectura.undo = [];
      estadoRefinarLectura.redo = [];
      estadoRefinarLectura.draft = '';
      estadoRefinarLectura.refinando = false;
      renderPanelRefinarLecturaGenerada();
    }

    function aplicarRefinadoPendienteLectura() {
      if (!estadoRefinarLectura.pendingHtml) return false;
      const previo = estadoRefinarLectura.committedHtml || '';
      const siguiente = estadoRefinarLectura.pendingHtml;
      if (previo && previo !== siguiente) {
        estadoRefinarLectura.undo.push(previo);
        if (estadoRefinarLectura.undo.length > 8) estadoRefinarLectura.undo = estadoRefinarLectura.undo.slice(-8);
      }
      estadoRefinarLectura.committedHtml = siguiente;
      estadoRefinarLectura.pendingHtml = null;
      estadoRefinarLectura.redo = [];
      renderHTMLLecturaEnBloque(siguiente);
      limpiarPreguntasPorCambioLectura();
      renderPanelRefinarLecturaGenerada();
      return true;
    }

    function renderPanelRefinarLecturaGenerada() {
      const cont = document.getElementById('resultadoContenido');
      const bloque = getBloqueLecturaGenerada();
      if (!cont || !bloque) return;

      let panel = document.getElementById('panelRefinarLecturaGenerada');
      if (!panel) {
        panel = document.createElement('section');
        panel.id = 'panelRefinarLecturaGenerada';
        panel.className = 'panel-refinar-lectura';
        panel.style.marginTop = '12px';
        bloque.insertAdjacentElement('afterend', panel);
      } else if (panel.previousElementSibling !== bloque) {
        bloque.insertAdjacentElement('afterend', panel);
      }

      const puedeDeshacer = !!estadoRefinarLectura.undo.length && !estadoRefinarLectura.pendingHtml && !estadoRefinarLectura.refinando;
      const puedeRehacer = !!estadoRefinarLectura.redo.length && !estadoRefinarLectura.pendingHtml && !estadoRefinarLectura.refinando;
      const puedeRefinar = !estadoRefinarLectura.refinando;
      const puedeAplicar = !!estadoRefinarLectura.pendingHtml && !estadoRefinarLectura.refinando;
      const status = estadoRefinarLectura.pendingHtml
        ? 'Vista previa de refinado lista. Revisa el texto y presiona "Aplicar" para confirmar.'
        : (estadoRefinarLectura.refinando ? 'Refinando lectura con IA…' : 'Refina la lectura con instrucciones puntuales sin regenerarla completa.');

      panel.innerHTML = `
        <div class="refine-box">
          <div class="refine-box-head">
            <div>
              <div class="refine-box-title">Refinar lectura generada</div>
              <div class="refine-box-subtitle">${escapeHTML(status)}</div>
            </div>
            <div class="refine-actions">
              <button type="button" class="refinar-lectura-deshacer result-ghost-btn cb-refine-btn is-undo" ${puedeDeshacer ? '' : 'disabled'}>Deshacer</button>
              <button type="button" class="refinar-lectura-rehacer result-ghost-btn cb-refine-btn is-redo" ${puedeRehacer ? '' : 'disabled'}>Rehacer</button>
              <button type="button" class="refinar-lectura-ia result-ghost-btn cb-refine-btn is-refine" ${puedeRefinar ? '' : 'disabled'}>
                ${estadoRefinarLectura.refinando ? 'Refinando…' : 'Refinar'}
              </button>
              <button type="button" class="aplicar-refinado-lectura result-ghost-btn cb-refine-btn is-apply" ${puedeAplicar ? '' : 'disabled'}>Aplicar</button>
            </div>
          </div>
          <label class="refine-input-label" for="inputRefinarLecturaGenerada">Instrucción de refinamiento</label>
          <textarea id="inputRefinarLecturaGenerada" rows="2" class="refine-textarea" placeholder="Ejemplo: conserva la historia de Hana, pero cambia solo el pueblo para que esté en Japón.">${escapeHTML(estadoRefinarLectura.draft || '')}</textarea>
        </div>
      `;

      const input = panel.querySelector('#inputRefinarLecturaGenerada');
      input?.addEventListener('input', () => {
        estadoRefinarLectura.draft = input.value;
      });

      panel.querySelector('.aplicar-refinado-lectura')?.addEventListener('click', () => {
        aplicarRefinadoPendienteLectura();
      });

      panel.querySelector('.refinar-lectura-deshacer')?.addEventListener('click', () => {
        if (!estadoRefinarLectura.undo.length) return;
        const actual = estadoRefinarLectura.committedHtml || getBloqueLecturaGenerada()?.innerHTML || '';
        const previo = estadoRefinarLectura.undo.pop();
        if (actual) {
          estadoRefinarLectura.redo.push(actual);
          if (estadoRefinarLectura.redo.length > 8) estadoRefinarLectura.redo = estadoRefinarLectura.redo.slice(-8);
        }
        estadoRefinarLectura.committedHtml = previo;
        estadoRefinarLectura.pendingHtml = null;
        renderHTMLLecturaEnBloque(previo);
        limpiarPreguntasPorCambioLectura();
        renderPanelRefinarLecturaGenerada();
      });

      panel.querySelector('.refinar-lectura-rehacer')?.addEventListener('click', () => {
        if (!estadoRefinarLectura.redo.length) return;
        const actual = estadoRefinarLectura.committedHtml || getBloqueLecturaGenerada()?.innerHTML || '';
        const siguiente = estadoRefinarLectura.redo.pop();
        if (actual) {
          estadoRefinarLectura.undo.push(actual);
          if (estadoRefinarLectura.undo.length > 8) estadoRefinarLectura.undo = estadoRefinarLectura.undo.slice(-8);
        }
        estadoRefinarLectura.committedHtml = siguiente;
        estadoRefinarLectura.pendingHtml = null;
        renderHTMLLecturaEnBloque(siguiente);
        limpiarPreguntasPorCambioLectura();
        renderPanelRefinarLecturaGenerada();
      });

      panel.querySelector('.refinar-lectura-ia')?.addEventListener('click', async () => {
        const instruccion = String(estadoRefinarLectura.draft || '').trim();
        if (!instruccion) {
          alert('Escribe una instrucción para refinar la lectura.');
          return;
        }
        const baseHtml = estadoRefinarLectura.pendingHtml || estadoRefinarLectura.committedHtml || getBloqueLecturaGenerada()?.innerHTML || '';
        if (!baseHtml) return;

        try {
          estadoRefinarLectura.refinando = true;
          renderPanelRefinarLecturaGenerada();
          showSpinner('Refinando lectura generada…');

          let refinada = await refinarLecturaGeneradaIA({
            htmlActual: baseHtml,
            instruccion,
            titulo: tituloNuevo,
            tema: temaNuevo,
            tono: tonoLectura,
            nivel,
            grado,
            autorNombre: autorData?.autor || '',
            tipoTexto: autorData?.tipoTexto || '',
            palabrasObjetivo
          });

          if (!refinada) throw new Error('No se pudo refinar lectura');
          refinada = enforceTitleH2(cleanGeneratedHTML(refinada), tituloNuevo);
          refinada = await postprocesarLecturaGenerada(refinada, {
            palabrasObjetivo,
            autorData,
            tituloNuevo,
            temaNuevo,
            tono: tonoLectura,
            nivel,
            grado,
            setProgress
          });
          refinada = enforceTitleH2(cleanGeneratedHTML(refinada), tituloNuevo);

          estadoRefinarLectura.pendingHtml = sanitizeHTML(refinada);
          renderHTMLLecturaEnBloque(estadoRefinarLectura.pendingHtml);
          limpiarPreguntasPorCambioLectura();
        } catch (err) {
          console.error('Error refinando lectura generada', err);
          alert('No se pudo refinar la lectura en este intento.');
        } finally {
          hideSpinner();
          estadoRefinarLectura.refinando = false;
          renderPanelRefinarLecturaGenerada();
        }
      });
    }

    async function construirContextoAutor() {
      if (lecturaLibre) {
        return {
          bloque: `
Modo de escritura:
- Lectura libre (sin imitar a un autor específico).
- Mantén una voz narrativa original, natural y coherente con el grado.
`.trim(),
          etiquetaGuardado: 'Libre (sin autor)',
          ejemploGuardado: '',
          tipoGuardado: 'Libre'
        };
      }

      const autorNombre = autorData?.autor || '';
      const tipoTexto = autorData?.tipoTexto || '';
      const ejemplo = autorData?.ejemplo || '';
      const rasgosFirebase = [autorData?.rasgos, autorData?.notas].filter(Boolean).join(' | ');
      const rasgosInferidos = inferirRasgosDesdeMuestraAutor(ejemplo);
      return {
        bloque: `
Estilo literario de referencia:
- Autor: ${autorNombre}
- Tipo de texto: ${tipoTexto}
- Muestra interna disponible: sí (úsala solo para inferir rasgos, NO para copiar frases).
${rasgosInferidos.length ? `- Rasgos inferidos de la muestra: ${rasgosInferidos.join('; ')}` : ''}
${rasgosFirebase ? `- Rasgos en Firebase: ${rasgosFirebase}` : ''}
- Contexto adicional externo: deshabilitado; usa solo la referencia interna y la muestra disponible.
- Importante: imita voz, ritmo y sintaxis del autor sin copiar frases textuales ni secuencias de 5+ palabras de la muestra.
`.trim(),
        etiquetaGuardado: autorNombre,
        ejemploGuardado: ejemplo,
        tipoGuardado: tipoTexto
      };
    }

    function buildPromptLectura({ estiloPreferido = '', incluirContextoASC = false, contextoAutorBloque = '' }) {
      const requisitos = [
        '- Texto pedagógico, claro y transversal para el grado indicado.',
        '- Devuelve solo HTML semántico válido (usa <h2>, <p>, <ul>/<ol> si aplica).',
        '- Resalta entre 4 y 10 palabras clave con <strong>Palabra</strong>.',
        '- Evita plantillas rígidas o frases repetitivas.',
        '- Debe sentirse diferente a una salida genérica: usa ejemplos, imágenes o situaciones concretas relacionadas con la sinopsis.',
        '- No repitas aperturas típicas como "En el mundo de..." ni cierres genéricos.',
        '- El primer encabezado debe ser exactamente: <h2>' + tituloNuevo + '</h2>.'
      ];
      if (incluirSinonimos) requisitos.push('- Añade una "Tabla de Sinónimos" (HTML) breve y útil.');
      if (incluirBibliografia) requisitos.push('- Añade "Bibliografía" en APA 7 con 3-5 fuentes reales, recientes y con enlace HTTPS clicable; si no puedes verificar una fuente, omítela.');

      const especificacionesLista = (especificaciones || '')
        .split(/\n|;|\./)
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 8);

      const lineasEditoriales = `
Directrices editoriales:
- Lenguaje neutro, incluyente y apropiado para edad escolar.
- Evita estereotipos, violencia gratuita y referencias discriminatorias.
- Prioriza ejemplos universales/internacionales, no solo locales.
- Promueve análisis y comprensión, no solo memorización.
- Mantén coherencia pedagógica y progresión de dificultad por grado.
`.trim();

      return [{
        role: 'user',
        text: `
Genera una lectura nueva sobre "${temaNuevo}".

TÍTULO: "${tituloNuevo}"
SINOPSIS (argumento central obligatorio): "${temaNuevo}"
TONO SOLICITADO: ${tonoLectura}
NIVEL: ${nivel}, GRADO: ${grado}, TRIMESTRE: ${trimestre}, UNIDAD: ${unidad}
EJE ARTICULADOR: ${eje}
${palabrasObjetivo ? `EXTENSIÓN OBJETIVO: ~${palabrasObjetivo} palabras (±10%).` : ''}

Jerarquía de cumplimiento (obligatoria):
1) Respeta EXACTAMENTE el título.
2) Desarrolla la lectura alrededor de la sinopsis como idea principal.
3) Cumple las especificaciones del usuario sin ignorarlas.
4) ${lecturaLibre ? 'Mantén redacción libre y original.' : 'Usa al autor de referencia para el estilo de redacción.'}

${especificacionesLista.length
  ? `ESPECIFICACIONES DEL USUARIO (obligatorias):
${especificacionesLista.map(x => `- ${x}`).join('\n')}`
  : 'ESPECIFICACIONES DEL USUARIO: Ninguna adicional.'
}
${contextoAutorBloque}
${estiloPreferido ? `- Instrucción de estilo prioritaria: ${estiloPreferido}` : ''}
- Combina el estilo anterior con un tono claramente "${tonoLectura}" durante toda la lectura.
- Si se usa autor de referencia, captura el estilo (ritmo, sintaxis, atmósfera) pero NO reutilices frases literales.

Variación narrativa para esta generación:
- ${enfoqueSeleccionado}

Requisitos técnicos:
${requisitos.join('\n')}

${lineasEditoriales}

${incluirContextoASC && contextoTextos ? `Contexto de lecturas ASC (solo referencia temática/criterial, sin copiar):
${contextoTextos}
` : ''}
${incluirContextoASC && contextoPreguntas ? `Criterios observados en preguntas ASC:
${contextoPreguntas}
` : ''}

Control de creatividad y monotonía:
- Propón un enfoque original para esta versión (escena, pregunta o contraste) distinto de plantillas comunes.
- Usa al menos 2 ejemplos concretos nuevos relacionados con la sinopsis.
- Evita repetir estructuras de párrafo idénticas.

Estructura de salida requerida:
- <h2>${tituloNuevo}</h2>
- Cuerpo de la lectura en párrafos claros.
- "Tabla de Sinónimos" (tabla HTML).
- "Bibliografía" en APA.

Devuelve únicamente HTML, sin bloques Markdown ni comentarios fuera del contenido.
`.trim()
      }];
    }

    try {
      const contextoAutor = await construirContextoAutor();
      if (usarASC) {
        const qASC = query(
          collection(db, 'lecturasASC'),
          where('nivel', '==', nivel),
          where('grado', '==', grado),
          where('trimestre', '==', trimestre),
          where('unidad', '==', unidad)
        );
        const ascSnap = await getDocs(qASC);
        const lecturasASC = ascSnap.docs.map(d => d.data());

        if (lecturasASC.length) {
          // contexto para el prompt
          contextoTextos = lecturasASC.map((l, i) =>
            `Lectura ${i + 1} (Título: ${l.titulo || '—'}):\n${stripHTML(l.textoLectura)}`
          ).join('\n\n');

          contextoPreguntas = lecturasASC.flatMap((l, i) =>
            (l.preguntas || []).map((p, j) =>
              `L${i + 1}·P${j + 1}: "${p.texto}" — Nivel:${p.nivel} — Criterio:${p.criterio}`
            )
          ).join('\n');

          const criteriosUnicos = Array.from(new Set(
            lecturasASC.flatMap(l => (l.preguntas || []).map(p => p.criterio))
          ));
          if (criteriosUnicos.length) listaCriterios = criteriosUnicos.join(', ');

          // estilos detectados y mayoría
          const estilos = new Map();
          lecturasASC.forEach(l => {
            const e = getEstiloDeLectura(l);
            estilos.set(e, (estilos.get(e) || 0) + 1);
          });
          let max = 0;
          estilos.forEach((v, k) => { if (v > max) { max = v; estiloASC_Mayoritario = k; } });

          // mostrar panel + decisión
          const tablaHTML = buildASCResumenHTML(lecturasASC);
          injectASCDecisionPanel({
            total: lecturasASC.length,
            estilos: new Set([...estilos.keys()]),
            estiloMayor: estiloASC_Mayoritario,
            tablaHTML
          });

          hideSpinner(); // leer el análisis
          const eleccion = await esperarDecisionEstilo(); // espera clic
          showSpinner(eleccion === 'asc'
            ? 'Generando lectura con el estilo ASC…'
            : (lecturaLibre ? 'Generando lectura libre…' : 'Generando lectura con el estilo del autor…'));

          const estiloAutorLinea = `
          ${lecturaLibre ? 'Redacción libre y original.' : `IMITA EL ESTILO LITERARIO DE ${autorData.autor}:`}
          ${lecturaLibre ? '' : `
          - Tipo de texto: ${autorData.tipoTexto}
          - Características distintivas del autor: tono, estructura, profundidad
          ${rasgosAutorInferidos.length ? `- Rasgos inferidos de la muestra (sin copiar): ${rasgosAutorInferidos.join('; ')}` : ''}
          - Prohibido copiar frases textuales de la muestra del autor.

          Aunque consideres las lecturas ASC como contexto, el estilo principal debe ser el de ${autorData.autor}.
          `}
            `.trim();

          const estiloLinea = eleccion === 'asc' && estiloASC_Mayoritario
            ? (lecturaLibre
              ? `Usa "${estiloASC_Mayoritario}" como referencia de organización y complejidad, manteniendo redacción libre.`
              : `Usa "${estiloASC_Mayoritario}" solo como referencia secundaria de complejidad y organización; la voz principal debe mantenerse en ${autorData.autor}.`)
            : estiloAutorLinea;


          async function generarLecturaASCConEstilo(estiloPreferido) {
            const prompt = buildPromptLectura({
              estiloPreferido,
              incluirContextoASC: true,
              contextoAutorBloque: contextoAutor.bloque
            });

            let raw = await enviarPrompt(prompt, 0, { task: 'creative' });
            let html = (raw || '').replace(/```html\s*/g, '').replace(/```/g, '').trim();
            html = cleanGeneratedHTML(html);
            html = enforceTitleH2(html, tituloNuevo);
            html = await postprocesarLecturaGenerada(html, {
              palabrasObjetivo,
              autorData,
              tituloNuevo,
              temaNuevo,
              tono: tonoLectura,
              nivel,
              grado,
              setProgress
            });
            html = enforceTitleH2(cleanGeneratedHTML(html), tituloNuevo);

            let wrapGenerado = document.getElementById('bloqueLecturaGenerada');
            if (!wrapGenerado) {
              wrapGenerado = document.createElement('div');
              wrapGenerado.id = 'bloqueLecturaGenerada';
              wrapGenerado.style.marginTop = '16px';
              $('#resultadoContenido')?.appendChild(wrapGenerado);
            }
            wrapGenerado.innerHTML = sanitizeHTML(html) || '<p>(Sin contenido)</p>';
            actualizarIndicadorMetricasLectura();
            resetEstadoRefinarLecturaDesdeBloque();
            guardarUltimaLecturaGeneradaEnCache();
          }

          await generarLecturaASCConEstilo(estiloLinea);
          regenerarConAutor = async () => {
            showSpinner(lecturaLibre ? 'Regenerando lectura libre…' : 'Regenerando lectura con estilo del autor…');
            await generarLecturaASCConEstilo(estiloAutorLinea);
            hideSpinner();
          };

        } else {
          // No hay ASC: genera normal con el autor
          setProgress('No hay lecturas ASC. Generando lectura…');
          await generarDirectoConAutor();
        }
      } else {
        // Checkbox desactivado: generar normal
        await generarDirectoConAutor();
      }

      hideSpinner();

      // Botones (preguntas + guardar)
      addPreguntasUI({ listaCriterios, nivel, grado, autoGenerate: true });
      const btnUsarEstiloAutor = document.getElementById('btnUsarEstiloAutor');
      if (btnUsarEstiloAutor && typeof regenerarConAutor === 'function') {
        btnUsarEstiloAutor.onclick = async () => {
          try {
            await regenerarConAutor();
            const contPreg = document.getElementById('preguntasComprension');
            if (contPreg) contPreg.innerHTML = '';
            const btnGenerarPreguntas = document.getElementById('btnGenerarPreguntas');
            if (btnGenerarPreguntas) btnGenerarPreguntas.click();
          } catch (err) {
            hideSpinner();
            alert('❌ No se pudo regenerar con estilo del autor.');
          }
        };
      }

      const btnGuardar = document.createElement('button');
      btnGuardar.textContent = 'Guardar lectura';
      btnGuardar.className = 'btn-analisis';
      btnGuardar.style.margin = '15px 0 0 10px';

      const btnDescargarWord = document.createElement('button');
      btnDescargarWord.innerHTML = '<i class="fas fa-file-word"></i> Descargar Word';
      btnDescargarWord.className = 'btn-analisis';
      btnDescargarWord.style.margin = '15px 0 0 10px';

      setTimeout(() => {
        const footer = $('#modalResultadoFooter');
        if (footer) {
          footer.innerHTML = '';
          footer.appendChild(btnGuardar);
          footer.appendChild(btnDescargarWord); // ✅ Se agrega correctamente
        }
      }, 60);

      btnDescargarWord.addEventListener('click', () => {
        aplicarRefinadoPendienteLectura();
        const bloqueLectura = document.getElementById('bloqueLecturaGenerada');
        const bloquePreguntas = document.getElementById('preguntasComprension');

        const htmlLectura = bloqueLectura?.innerHTML || '';
        const htmlPreguntas = bloquePreguntas?.innerHTML || '';

        const fullHTML = `
          <h2 style="margin-bottom:10px;">Lectura Generada</h2>
          ${htmlLectura}

          <hr style="margin:30px 0;"/>

          <h2 style="margin-bottom:10px;">Preguntas de Comprensión</h2>
          ${htmlPreguntas || '<p>(Sin preguntas)</p>'}
        `.trim();

        const converted = window.htmlDocx.asBlob(fullHTML);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(converted);
        a.download = 'Lectura-generada.docx';
        a.click();
      });


      // === Guardar SOLO la lectura generada (sin análisis ni botones) ===
      btnGuardar.addEventListener('click', async () => {
        try {
          aplicarRefinadoPendienteLectura();
          const user = auth.currentUser;
          const bloque = document.getElementById('bloqueLecturaGenerada');
          let htmlFinal = bloque ? bloque.innerHTML : '';

            if (!htmlFinal) {
            const clone = $('#resultadoContenido')?.cloneNode(true);
            if (clone) {
                clone.querySelector('#panelAnalisisASC')?.remove();
                clone.querySelector('#panelDecisionEstilo')?.remove();
                clone.querySelector('#btnGenerarPreguntas')?.remove();
                // clone.querySelector('#preguntasComprension')?.remove(); // si no quieres guardar preguntas
                htmlFinal = clone.innerHTML;
            }
            }

            // 1) limpia css/headers basura  2) sanitiza etiquetas
            htmlFinal = sanitizeHTML(cleanGeneratedHTML(htmlFinal || ''));


            // 🔍 EXTRAER preguntas desde el DOM
          const preguntasFinales = [];
          const ol = document.querySelector('#preguntasComprension ol');
          if (ol) {
            const lis = Array.from(ol.querySelectorAll('li'));
            for (const li of lis) {
              const texto = li.querySelector('p strong')?.textContent?.trim() || '';
              const meta = li.querySelector('p + p')?.textContent || '';
              const respuesta = li.querySelector('.solucion')?.textContent?.trim() || '';

              const nivelMatch = meta.match(/Nivel\s*PISA\s*:\s*Nivel\s*(\d)/i);
              const criterioMatch = meta.match(/Criterio\s*:\s*(.+)/i);

              preguntasFinales.push({
                texto,
                nivel: nivelMatch?.[1] || '',
                criterio: criterioMatch?.[1]?.trim() || '',
                respuesta
              });
            }
          }

        const nuevaLecturaPayload = {
          titulo: tituloNuevo,   
          tema: temaNuevo,
          autorReferencia: contextoAutor.etiquetaGuardado || autorData.autor,
          ejemploEstilo: contextoAutor.ejemploGuardado || autorData.ejemplo || '',
          tipoTexto: contextoAutor.tipoGuardado || autorData.tipoTexto || 'Libre',
          tono: tonoLectura,
          nivel, grado, trimestre, unidad,
          ejeArticulador: eje,
          contenidoHTML: htmlFinal,
          contenidoPlano: htmlToPlainText(htmlFinal),
          analizadaASC: !!usarASC,
          preguntas: preguntasFinales,  // ✅ AÑADE ESTO
          published: false,
          userId: user?.uid || 'anon',
          timestamp: new Date()
        };

        const nuevaLecturaRef = await addDoc(collection(db, 'lecturasNuevas'), nuevaLecturaPayload);

        // Mantener en sync la caché global usada por el modal de selección de lecturas.
        if (Array.isArray(window.lecturasNuevas)) {
          window.lecturasNuevas = [
            { id: nuevaLecturaRef.id, ...nuevaLecturaPayload, tipo: 'principal' },
            ...window.lecturasNuevas.filter(l => l?.id !== nuevaLecturaRef.id)
          ];
        } else {
          window.lecturasNuevas = null;
        }

        window.dispatchEvent(new CustomEvent('lecturasNuevasActualizadas'));
        window.dispatchEvent(new CustomEvent('cb-agent-reading-saved'));

          alert('✅ Lectura guardada correctamente.');
          await cargarLecturasNuevas();
        } catch (err) {
          window.dispatchEvent(new CustomEvent('cb-agent-reading-save-error', {
            detail: { error: String(err?.message || 'error_guardando_lectura') }
          }));
          alert('Ocurrió un error al guardar la lectura.');
        }
      });
      window.__cbAgentSaveLatestReading = async () => {
        return new Promise((resolve) => {
          let settled = false;
          const done = (ok) => {
            if (settled) return;
            settled = true;
            window.removeEventListener('cb-agent-reading-saved', onSaved);
            window.removeEventListener('cb-agent-reading-save-error', onError);
            resolve(ok);
          };
          const onSaved = () => done(true);
          const onError = () => done(false);
          window.addEventListener('cb-agent-reading-saved', onSaved, { once: true });
          window.addEventListener('cb-agent-reading-save-error', onError, { once: true });
          setTimeout(() => done(false), 16000);
          btnGuardar.click();
        });
      };

      // -------- función auxiliar: generación directa con autor ----------
      async function generarDirectoConAutor() {
        const prompt = buildPromptLectura({
          estiloPreferido: lecturaLibre ? 'Redacción libre y original.' : `Prioriza el estilo de ${autorData.autor}.`,
          incluirContextoASC: false,
          contextoAutorBloque: contextoAutor.bloque
        });

        let raw = await enviarPrompt(prompt, 0, { task: 'creative' });
        let html = (raw || '').replace(/```html\s*/g, '').replace(/```/g, '').trim();
        html = cleanGeneratedHTML(html);
        html = enforceTitleH2(html, tituloNuevo);
        html = await postprocesarLecturaGenerada(html, {
          palabrasObjetivo,
          autorData,
          tituloNuevo,
          temaNuevo,
          tono: tonoLectura,
          nivel,
          grado,
          setProgress
        });
        html = enforceTitleH2(cleanGeneratedHTML(html), tituloNuevo);

        const wrapGenerado = document.createElement('div');
        wrapGenerado.id = 'bloqueLecturaGenerada';
        wrapGenerado.style.marginTop = '16px';
        wrapGenerado.innerHTML = sanitizeHTML(html) || '<p>(Sin contenido)</p>';
        $('#resultadoContenido').innerHTML = '';
        $('#resultadoContenido')?.appendChild(wrapGenerado);
        actualizarIndicadorMetricasLectura();
        resetEstadoRefinarLecturaDesdeBloque();
        guardarUltimaLecturaGeneradaEnCache();

      }
      if (agentGenerationMode) {
        const bloque = document.getElementById('bloqueLecturaGenerada');
        const html = String(bloque?.innerHTML || '');
        const preview = htmlToPlainText(html).replace(/\s+/g, ' ').trim().slice(0, 6000);
        window.dispatchEvent(new CustomEvent('cb-agent-reading-ready', {
          detail: { html, preview }
        }));
        window.__cbAgentGenerationMode = false;
      }

    } catch (err) {
      if (agentGenerationMode) {
        window.dispatchEvent(new CustomEvent('cb-agent-reading-error', {
          detail: { error: String(err?.message || 'error_generando_lectura') }
        }));
        window.__cbAgentGenerationMode = false;
      }
      alert('❌ Error durante el proceso de generación');
      hideSpinner();
    }
  });

  window.cbAgentLecturaNueva = {
    openList() {
      window.cbUnidadDock?.openSection?.('modalLecturasNuevas');
      show(modalLecturasNuevas);
      cargarLecturasNuevas({ realtime: true }).catch(console.error);
      cargarTranscripcionesAudio().catch(console.error);
    },
    openModal() {
      actualizarEstadoBotonUltimaLecturaGenerada();
      try { window.cbUnidadDock?.showHost?.({ soloSeccion: true }); } catch (_) {}
      try { window.cbUnidadDock?.openSection?.('modalLecturasNuevas'); } catch (_) {}
      show(modalLecturasNuevas);
      try { window.cbUnidadDock?.openSection?.('modalNuevaLectura'); } catch (_) {}
      abrirPanelNuevaLectura(modalNuevaLectura);
    },
    startAgentGeneration() {
      const form = document.getElementById('formNuevaLectura');
      const btn = document.getElementById('btnGenerarLecturaNueva');
      if (!form || !btn) return false;
      window.__cbAgentGenerationMode = true;
      if (typeof form.requestSubmit === 'function') form.requestSubmit(btn);
      else btn.click();
      return true;
    },
    async saveGeneratedReading() {
      if (typeof window.__cbAgentSaveLatestReading === 'function') {
        return !!(await window.__cbAgentSaveLatestReading());
      }
      return false;
    },
    async generarIdeas(contexto = {}) {
      return generarIdeasLecturaIA(contexto);
    },
    async refinarIdea(payload = {}) {
      return refinarIdeaLecturaIA(payload);
    },
    extractGeneratedReadTarget(command = "") {
      const bloque = document.getElementById('bloqueLecturaGenerada');
      if (!bloque) return null;
      const normalize = (v = "") => String(v || "")
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
      const chunks = Array.from(bloque.querySelectorAll('p, li'))
        .map((n) => String(n.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((txt) => txt.length > 24);
      if (!chunks.length) return null;

      const raw = String(command || '').trim();
      const norm = normalize(raw);
      const phraseMatch = norm.match(/\b(?:donde dice|que dice)\b\s*(.+)$/i);
      if (phraseMatch?.[1]) {
        const needle = normalize(phraseMatch[1]);
        const tokens = needle.split(' ').filter((w) => w.length > 2).slice(0, 8);
        const idxByPhrase = chunks.findIndex((p) => {
          const pn = normalize(p);
          return tokens.every((t) => pn.includes(t));
        });
        if (idxByPhrase >= 0) {
          return {
            index: idxByPhrase + 1,
            text: chunks[idxByPhrase],
            label: `Leyendo el párrafo ${idxByPhrase + 1}`
          };
        }
      }

      const numberMatch = norm.match(/\b([0-9]{1,2})\b/);
      let requested = numberMatch ? Number(numberMatch[1]) : NaN;
      if (!Number.isFinite(requested)) {
        const ordinalMap = {
          primer: 1, primero: 1, primera: 1,
          segundo: 2, segunda: 2,
          tercer: 3, tercero: 3, tercera: 3,
          cuarto: 4, cuarta: 4,
          quinto: 5, quinta: 5,
          sexto: 6, sexta: 6,
          septimo: 7, septima: 7, séptimo: 7, séptima: 7,
          octavo: 8, octava: 8,
          noveno: 9, novena: 9
        };
        Object.entries(ordinalMap).some(([word, value]) => {
          if (new RegExp(`\\b${word}\\b`, 'i').test(norm)) {
            requested = value;
            return true;
          }
          return false;
        });
      }
      if (Number.isFinite(requested) && requested > 0) {
        const idx = Math.max(1, Math.min(chunks.length, requested)) - 1;
        return {
          index: idx + 1,
          text: chunks[idx],
          label: `Leyendo el párrafo ${idx + 1}`
        };
      }
      return null;
    }
  };

});
