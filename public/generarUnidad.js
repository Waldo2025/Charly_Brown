// generarUnidad.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js";
import { initializeFirestore, getFirestore, addDoc, collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, deleteDoc, limit } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-auth.js";
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-storage.js";
import { createUnidadAgentController } from "./unidadAgentController.js";
import { buildApiUrl } from "./api-client.js";
import { escapeHtml, sanitizeHtml } from "./security-utils.js";

// Configuración Firebase
const firebaseConfig = {
  apiKey: window.__CB_FIREBASE_WEB_API_KEY__ || window.__CHARLY_CONFIG__?.firebase?.apiKey || "",
  authDomain: "charly-brown.firebaseapp.com",
  projectId: "charly-brown",
  storageBucket: "charly-brown.firebasestorage.app",
  messagingSenderId: "128488238449",
  appId: "1:128488238449:web:2b99ef5c2f0272e9871ad0",
  measurementId: "G-RL0BMDZKE6"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
let db;
try {
  db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    useFetchStreams: false
  });
} catch (_) {
  db = getFirestore(app);
}
const auth = getAuth(app);
const storage = getStorage(app);

let runtimeConfigLoadPromise = null;
let geminiBackendUnavailable = false;

function markGeminiBackendUnavailable(reason = "") {
  if (geminiBackendUnavailable) return;
  geminiBackendUnavailable = true;
  logVisual(`⚠️ Backend Gemini deshabilitado en sesión (${reason || "sin detalle"}).`);
}

async function ensureRuntimeConfigLoaded() {
  if (window.__CHARLY_CONFIG__) return;
  if (runtimeConfigLoadPromise) {
    await runtimeConfigLoadPromise;
    return;
  }
  runtimeConfigLoadPromise = new Promise((resolve) => {
    (async () => {
      try {
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
  await runtimeConfigLoadPromise;
}

function getRuntimeGeminiApiKey() {
  const fromConfig = String(window.__CHARLY_CONFIG__?.geminiApiKey || "").trim();
  if (fromConfig) return fromConfig;
  const fromStorage = String(localStorage.getItem("cb_gemini_api_key") || "").trim();
  return fromStorage;
}

function hasRuntimeGeminiApiKey() {
  const key = getRuntimeGeminiApiKey();
  return !!(key && !key.includes("__GEMINI_API_KEY_LOCAL__"));
}

function isStaticLocalDev() {
  const host = String(window.location.hostname || "").toLowerCase();
  const port = String(window.location.port || "");
  const isLocalHost = host === "127.0.0.1" || host === "localhost";
  const staticPorts = new Set(["5500", "5501", "5502", "5503"]);
  return isLocalHost && staticPorts.has(port);
}

function canUseDirectGeminiLocal() {
  if (window.__CHARLY_CONFIG__?.forceDirectGemini === true) return true;
  if (window.__CHARLY_CONFIG__?.allowDirectGemini === true) return true;
  if (!isStaticLocalDev()) return false;
  const cfg = window.__CHARLY_CONFIG__ || {};
  return !!(cfg?.allowDirectGemini === true || cfg?.forceDirectGemini === true);
}

function shouldUseGeminiBackend() {
  if (window.__CHARLY_CONFIG__?.forceBackendGemini === true) return true;
  return false;
}

async function geminiGenerateDirect(model, payload, signal = null) {
  const apiKey = getRuntimeGeminiApiKey();
  if (!apiKey || apiKey.includes("__GEMINI_API_KEY_LOCAL__")) {
    throw new Error("No hay GEMINI_API_KEY válida en runtime.");
  }
  const cleanModel = normalizeGeminiModel(model || getSelectedModel());
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
    ...(signal ? { signal } : {})
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function geminiGenerateViaApi(model, payload, signal = null) {
  await ensureRuntimeConfigLoaded();
  const canUseDirect = canUseDirectGeminiLocal() && hasRuntimeGeminiApiKey();
  if (!canUseDirect) {
    throw new Error("GEMINI_API_KEY no disponible en runtime para modo directo.");
  }
  return geminiGenerateDirect(model, payload, signal);
}

async function requestGeminiLiveTokenViaApi(modelLive = "", systemInstruction = "") {
  await ensureRuntimeConfigLoaded();
  const canUseDirect = canUseDirectGeminiLocal() && hasRuntimeGeminiApiKey();
  if (!canUseDirect) {
    throw new Error("GEMINI_API_KEY no disponible en runtime para Live.");
  }
  return requestGeminiLiveTokenDirect(modelLive, systemInstruction);
}

async function requestGeminiLiveTokenDirect(modelLive = "", systemInstruction = "") {
  const apiKey = getRuntimeGeminiApiKey();
  if (!apiKey || apiKey.includes("__GEMINI_API_KEY_LOCAL__")) {
    throw new Error("No hay GEMINI_API_KEY válida en runtime para fallback live-token.");
  }
  return { token: apiKey, tokenType: "api-key-local" };
}

function logVisual(msg) {
  if (typeof window.logVisual === "function") {
    window.logVisual(msg);
  }
}

const UNIDAD_SELECTS_STORAGE_KEY = "cb_unidad_selects_v2";
const UNIDAD_SELECTS_STORAGE_LEGACY_KEY = "unidadDidactica_selects_v1";
const UNIDAD_META_STORAGE_KEY = "cb_unidad_meta_selects_v1";
const LECTURA_CACHE_STORAGE_KEY = "cb_lectura_cache_v1";
const LECTURAS_CACHE_LIST_STORAGE_KEY = "cb_lecturas_cache_list_v1";
const UNIDAD_RESULTADO_STORAGE_KEY = "cb_unidad_resultado_html_v1";
const UNIDAD_CREATIVE_SEED_STORAGE_KEY = "cb_unidad_creative_seed_v1";
const UNIDAD_META_SELECT_IDS = [
  "unidadNivel",
  "unidadGrado",
  "unidadTrimestre",
  "unidadNumero"
];
const UNIDAD_SELECT_IDS = [
  "unidadNivel",
  "unidadGrado",
  "unidadTrimestre",
  "unidadNumero",
  "unidadTema",
  "unidadTemaASC",
  "selectGeminiEndpoint"
];
const UNIDAD_TEXT_FIELD_IDS = [
  "unidadTemaTexto"
];
const UNIDAD_PERSIST_FIELD_IDS = [
  ...UNIDAD_SELECT_IDS,
  ...UNIDAD_TEXT_FIELD_IDS
];
const GEMINI_MODELOS_HABILITADOS = [
  "gemini-3.1-flash-lite-preview",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-3-pro-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite"
];
const GEMINI_MODELOS_PRIORIDAD_ESTABLE = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro"
];
const GEMINI_MODELOS_PREVIEW_SECUNDARIOS = [
  "gemini-3.1-flash-lite-preview",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-3-pro-preview"
];
const GEMINI_FALLBACK_CONFIABLE = [
  ...GEMINI_MODELOS_PRIORIDAD_ESTABLE,
  ...GEMINI_MODELOS_PREVIEW_SECUNDARIOS
];

function _selectTieneOpcion(el, valor) {
  return !!(el && Array.from(el.options || []).some(opt => opt.value === valor || opt.text === valor));
}

function guardarSelectsUnidad() {
  const selects = {};
  UNIDAD_PERSIST_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isSelect = el.tagName === "SELECT";
    const currentValue = id === "selectGeminiEndpoint"
      ? normalizeGeminiModel(el.value || "")
      : (el.value || "");
    selects[id] = {
      value: currentValue,
      text: isSelect ? (el.selectedOptions?.[0]?.textContent?.trim() || "") : ""
    };
  });
  try {
    localStorage.setItem(UNIDAD_SELECTS_STORAGE_KEY, JSON.stringify({
      version: 2,
      savedAt: Date.now(),
      selects
    }));
    // Compatibilidad con código legado que aún lee `unidad_<id>`
    Object.entries(selects).forEach(([id, data]) => {
      localStorage.setItem(`unidad_${id}`, data?.value || "");
    });
  } catch (_) {
    // noop: storage could be full or disabled
  }
}

function cargarSelectsUnidad() {
  try {
    const raw = localStorage.getItem(UNIDAD_SELECTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.selects) return parsed.selects;
    }
    // Migración desde formato legacy
    const oldRaw = localStorage.getItem(UNIDAD_SELECTS_STORAGE_LEGACY_KEY);
    if (oldRaw) {
      const oldParsed = JSON.parse(oldRaw);
      if (oldParsed && typeof oldParsed === "object") {
        const migrated = {};
        Object.entries(oldParsed).forEach(([id, value]) => {
          migrated[id] = { value: value || "", text: "" };
        });
        localStorage.setItem(UNIDAD_SELECTS_STORAGE_KEY, JSON.stringify({
          version: 2,
          savedAt: Date.now(),
          selects: migrated
        }));
        return migrated;
      }
    }
    // Fallback adicional: formato por-clave `unidad_<id>`
    const migratedFromPerKey = {};
    let foundAny = false;
    UNIDAD_PERSIST_FIELD_IDS.forEach((id) => {
      const value = localStorage.getItem(`unidad_${id}`);
      if (value != null && value !== "") {
        migratedFromPerKey[id] = { value, text: "" };
        foundAny = true;
      }
    });
    if (foundAny) {
      localStorage.setItem(UNIDAD_SELECTS_STORAGE_KEY, JSON.stringify({
        version: 2,
        savedAt: Date.now(),
        selects: migratedFromPerKey
      }));
      return migratedFromPerKey;
    }
    return {};
  } catch (_) {
    return {};
  }
}

function aplicarValorSelect(id, valorGuardado) {
  const el = document.getElementById(id);
  const rawValue = (typeof valorGuardado === "object" && valorGuardado) ? valorGuardado.value : valorGuardado;
  const v = id === "selectGeminiEndpoint"
    ? normalizeGeminiModel(rawValue)
    : rawValue;
  const text = (typeof valorGuardado === "object" && valorGuardado) ? valorGuardado.text : "";
  if (!el || v == null || v === "") return false;

  if (_selectTieneOpcion(el, v)) {
    el.value = v;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  // Para lecturas, crear opción temporal si aún no se cargó el catálogo remoto
  if (id === "unidadTema" || id === "unidadTemaASC") {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = text || "Selección restaurada";
    el.appendChild(opt);
    el.value = v;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  return false;
}

function guardarResultadoUnidadEnStorage() {
  try {
    const cont = document.getElementById("resultadoUnidadGenerada");
    if (!cont) return;
    const html = String(cont.innerHTML || "").trim();
    if (!html) return;
    localStorage.setItem(UNIDAD_RESULTADO_STORAGE_KEY, JSON.stringify({
      savedAt: Date.now(),
      html
    }));
  } catch (_) {
    // noop
  }
}

function limpiarResultadoUnidadEnStorage() {
  try {
    localStorage.removeItem(UNIDAD_RESULTADO_STORAGE_KEY);
  } catch (_) {
    // noop
  }
}

function adaptarTablasResultadoResponsive() {
  const cont = document.getElementById("resultadoUnidadGenerada");
  if (!cont) return;
  const tables = cont.querySelectorAll("table");
  tables.forEach((table) => {
    const parent = table.parentElement;
    if (parent && parent.classList.contains("unidad-table-scroll")) return;
    const wrap = document.createElement("div");
    wrap.className = "unidad-table-scroll";
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  });
}

function restaurarResultadoUnidadDesdeStorage() {
  try {
    const cont = document.getElementById("resultadoUnidadGenerada");
    if (!cont) return false;
    if (String(cont.innerHTML || "").trim()) return false;
    const raw = localStorage.getItem(UNIDAD_RESULTADO_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const html = String(parsed?.html || "").trim();
    if (!html) return false;
    cont.innerHTML = html;
    window.respuestaFinal = html;
    adaptarTablasResultadoResponsive();
    return true;
  } catch (_) {
    return false;
  }
}

function obtenerSemillaCreativa(categoria = "", subtema = "") {
  try {
    const raw = localStorage.getItem(UNIDAD_CREATIVE_SEED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const key = `${String(categoria || "").trim()}::${String(subtema || "").trim()}`;
    const current = Number(parsed?.[key] || 0) + 1;
    parsed[key] = current;
    localStorage.setItem(UNIDAD_CREATIVE_SEED_STORAGE_KEY, JSON.stringify(parsed));
    return `${current}-${Date.now().toString(36).slice(-5)}`;
  } catch (_) {
    return `${Math.floor(Math.random() * 9999)}-${Date.now().toString(36).slice(-4)}`;
  }
}

function restaurarSelectsUnidad() {
  const data = cargarSelectsUnidad();
  const pendientes = new Set(UNIDAD_SELECT_IDS.filter(id => data[id] && data[id].value));
  UNIDAD_TEXT_FIELD_IDS.forEach((id) => {
    const el = document.getElementById(id);
    const value = data?.[id]?.value;
    if (!el || value == null || value === "") return;
    el.value = value;
  });
  let intentos = 0;
  const maxIntentos = 12;

  const tick = () => {
    intentos += 1;
    Array.from(pendientes).forEach((id) => {
      if (aplicarValorSelect(id, data[id])) pendientes.delete(id);
    });
    if (pendientes.size && intentos < maxIntentos) {
      setTimeout(tick, 250);
    }
  };

  tick();
}

function observarSelectParaRestaurar(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const data = cargarSelectsUnidad();
  if (!data[id]?.value) return;
  if (aplicarValorSelect(id, data[id])) return;
  const obs = new MutationObserver(() => {
    if (aplicarValorSelect(id, data[id])) {
      obs.disconnect();
    }
  });
  obs.observe(el, { childList: true });
}

function inicializarPersistenciaSelectsUnidad() {
  const presentes = UNIDAD_SELECT_IDS.filter((id) => !!document.getElementById(id)).length;
  if (presentes < 4) {
    setTimeout(inicializarPersistenciaSelectsUnidad, 300);
    return;
  }

  UNIDAD_SELECT_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (el.dataset.boundUnidadSelect === "1") return;
      el.dataset.boundUnidadSelect = "1";
      el.addEventListener("change", guardarSelectsUnidad);
    }
    observarSelectParaRestaurar(id);
  });
  restaurarSelectsUnidad();

  // Delegado global por si los selects se actualizan sin listeners directos
  if (!window.__unidadSelectsDelegatedChangeBound) {
    window.__unidadSelectsDelegatedChangeBound = true;
    document.addEventListener("change", (e) => {
      if (e.target && UNIDAD_PERSIST_FIELD_IDS.includes(e.target.id)) {
        guardarSelectsUnidad();
      }
    });
  }
  if (!window.__unidadTextInputBound) {
    window.__unidadTextInputBound = true;
    // Delegado global: cubre campos renderizados de forma tardía.
    document.addEventListener("input", (e) => {
      const target = e?.target;
      if (!target || !UNIDAD_TEXT_FIELD_IDS.includes(target.id)) return;
      guardarSelectsUnidad();
    });
  }

  // Guardar en acciones clave
  if (!window.__unidadSelectsLifecycleBound) {
    window.__unidadSelectsLifecycleBound = true;
    document.getElementById("btnGenerarTodo")?.addEventListener("click", guardarSelectsUnidad);
    document.getElementById("cerrarModalUnidad")?.addEventListener("click", guardarSelectsUnidad);
    window.addEventListener("pagehide", guardarSelectsUnidad);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") guardarSelectsUnidad();
    });
    window.addEventListener("beforeunload", guardarSelectsUnidad);
    document.getElementById("btnAbrirResultadoUnidad")?.addEventListener("click", guardarSelectsUnidad);
    document.getElementById("btnAbrirResultadoUnidadTop")?.addEventListener("click", guardarSelectsUnidad);
  }

  // Reintentos tardíos para selects que cargan opciones de forma asíncrona
  setTimeout(restaurarSelectsUnidad, 500);
  setTimeout(restaurarSelectsUnidad, 1500);
}

function guardarSelectsMetaUnidad() {
  const data = {};
  UNIDAD_META_SELECT_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    data[id] = el.value || "";
  });
  try {
    localStorage.setItem(UNIDAD_META_STORAGE_KEY, JSON.stringify({
      savedAt: Date.now(),
      data
    }));
  } catch (_) {
    // noop
  }
}

function restaurarSelectsMetaUnidad() {
  try {
    const raw = localStorage.getItem(UNIDAD_META_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const data = parsed?.data || {};
    UNIDAD_META_SELECT_IDS.forEach((id) => {
      const el = document.getElementById(id);
      const value = data?.[id];
      if (!el || value == null || value === "") return;
      if (!_selectTieneOpcion(el, value)) return;
      el.value = value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  } catch (_) {
    // noop
  }
}

function inicializarPersistenciaSelectsMetaUnidad() {
  UNIDAD_META_SELECT_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.boundUnidadMetaSelect === "1") return;
    el.dataset.boundUnidadMetaSelect = "1";
    el.addEventListener("change", guardarSelectsMetaUnidad);
  });
  restaurarSelectsMetaUnidad();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    inicializarPersistenciaSelectsUnidad();
    inicializarPersistenciaSelectsMetaUnidad();
  });
} else {
  inicializarPersistenciaSelectsUnidad();
  inicializarPersistenciaSelectsMetaUnidad();
}

function actualizarSpinnerProceso(statusId, texto) {
  if (statusId === "spinner-categoria-Proyectos") return; // solo omitimos el global de categoría
  const el = document.getElementById(statusId);
  if (!el) return;
  el.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${texto}`;
}

function finalizarSpinnerProceso(statusId, ok = true, textoFinal = "") {
  if (statusId === "spinner-categoria-Proyectos") {
    document.getElementById(statusId)?.remove();
    return;
  }
  const el = document.getElementById(statusId);
  if (el) {
    const icono = ok ? "fa-circle-check" : "fa-triangle-exclamation";
    const color = ok ? "#16a34a" : "#dc2626";
    el.innerHTML = `<i class="fas ${icono}" style="color:${color};"></i> ${textoFinal || (ok ? "Completado" : "Error")}`;
  }
}

function _htmlAPlainText(html = "") {
  const tmp = document.createElement("div");
  tmp.innerHTML = String(html || "");
  return (tmp.textContent || tmp.innerText || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function _formatearLecturaTextoBase(texto = "") {
  return String(texto || "")
    .replace(/\r/g, "")
    // Separa fin de oración cuando el siguiente carácter viene pegado.
    .replace(/([.!?…])([A-ZÁÉÍÓÚÑ¿¡"])/g, "$1 $2")
    // Asegura espacio tras comas y dos puntos.
    .replace(/([,:;])([A-ZÁÉÍÓÚÑa-záéíóúñ])/g, "$1 $2")
    // Corrige guiones de diálogo pegados.
    .replace(/([.!?])—/g, "$1 —")
    // Limpieza general de espacios.
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function _limpiarSeccionesLecturaNoNarrables(texto = "") {
  let limpio = String(texto || "");
  const cortes = [
    /(?:^|\n{2,})(tabla de sinonimos|tabla de sinónimos|sinonimos|sinónimos|glosario|vocabulario)\b[\s\S]*$/i,
    /(?:^|\n{2,})(bibliografia|bibliografía|fuentes consultadas|referencias bibliograficas|referencias bibliográficas)\b[\s\S]*$/i,
    /(?:^|\n{2,})(preguntas de comprension|preguntas de comprensión|preguntas de reflexion|preguntas de reflexión|cuestionario|actividades de comprension|actividades de comprensión)\b[\s\S]*$/i
  ];
  cortes.forEach((rx) => {
    limpio = limpio.replace(rx, "");
  });
  return limpio.trim();
}

function _obtenerTextoCompletoLectura(lectura = {}) {
  const coleccion = String(
    lectura?.sourceCollection
    || lectura?.coleccion
    || lectura?.rawData?.sourceCollection
    || lectura?.rawData?.coleccion
    || lectura?.campos?.sourceCollection
    || lectura?.campos?.coleccion
    || (String(lectura?.tipo || "").toLowerCase() === "asc" ? "lecturasASC" : "lecturasNuevas")
  ).trim();
  const esAsc = coleccion === "lecturasASC";
  const raw = esAsc
    ? (
      lectura?.textoLectura
      || lectura?.rawData?.textoLectura
      || lectura?.campos?.textoLectura
      || lectura?.contenidoPlano
      || lectura?.rawData?.contenidoPlano
      || lectura?.campos?.contenidoPlano
      || lectura?.lectura
      || lectura?.texto
      || lectura?.contenido
      || lectura?.rawData?.lectura
      || lectura?.rawData?.texto
      || lectura?.rawData?.contenido
      || lectura?.campos?.lectura
      || lectura?.campos?.texto
      || lectura?.campos?.contenido
      || ""
    )
    : (
      lectura?.contenidoPlano
      || lectura?.rawData?.contenidoPlano
      || lectura?.campos?.contenidoPlano
      || lectura?.contenidoHTML
      || lectura?.rawData?.contenidoHTML
      || lectura?.campos?.contenidoHTML
      || lectura?.textoLectura
      || lectura?.rawData?.textoLectura
      || lectura?.campos?.textoLectura
      || lectura?.lectura
      || lectura?.texto
      || lectura?.contenido
      || lectura?.rawData?.lectura
      || lectura?.rawData?.texto
      || lectura?.rawData?.contenido
      || lectura?.campos?.lectura
      || lectura?.campos?.texto
      || lectura?.campos?.contenido
      || ""
    );
  const plano = _htmlAPlainText(String(raw || ""));
  const limpio = _formatearLecturaTextoBase(_limpiarSeccionesLecturaNoNarrables(plano));
  if (limpio && limpio.length >= 80) return limpio;
  return _formatearLecturaTextoBase(plano);
}

function _serializarValorFirestore(valor) {
  if (valor == null) return null;
  if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") return valor;
  if (valor instanceof Date) return valor.toISOString();
  if (Array.isArray(valor)) return valor.map((v) => _serializarValorFirestore(v));
  if (typeof valor?.toDate === "function") {
    try { return valor.toDate().toISOString(); } catch (_) { return null; }
  }
  if (typeof valor === "object") {
    const out = {};
    Object.entries(valor).forEach(([k, v]) => {
      out[k] = _serializarValorFirestore(v);
    });
    return out;
  }
  return String(valor);
}

function _normalizarPreguntasLectura(doc = {}) {
  const arr = doc?.preguntas
    || doc?.preguntasComprension
    || doc?.preguntas_comprension
    || [];
  if (!Array.isArray(arr)) return [];
  return arr
    .map((p) => {
      if (typeof p === "string") {
        const tx = String(p || "").trim();
        if (!tx) return null;
        return { texto: tx, nivel: "", criterio: "", respuesta: "" };
      }
      const texto = String(p?.texto || p?.pregunta || "").trim();
      if (!texto) return null;
      return {
        texto,
        nivel: String(p?.nivel || "").trim(),
        criterio: String(p?.criterio || "").trim(),
        respuesta: String(p?.respuesta || "").trim()
      };
    })
    .filter(Boolean);
}

function _mapearLecturaParaGemini(doc = {}) {
  const tituloCampo = String(doc?.titulo || "").trim();
  const temaCampo = String(doc?.tema || "").trim();
  const titulo = tituloCampo || temaCampo || "Sin título";
  const sinopsis = tituloCampo ? temaCampo : "";
  const contenidoCompleto = _obtenerTextoCompletoLectura(doc);
  const preguntas = _normalizarPreguntasLectura(doc);
  const coleccion = String(
    doc?.sourceCollection
    || doc?.coleccion
    || (String(doc?.tipo || "").toLowerCase() === "asc" ? "lecturasASC" : "lecturasNuevas")
  ).trim();
  const esLecturaHistoricaASC = coleccion === "lecturasASC";
  return {
    id: String(doc?.id || "").trim(),
    tipo: String(doc?.tipo || "").trim(),
    titulo,
    sinopsis,
    tema: temaCampo,
    autor: String(doc?.autorReferencia || "").trim(),
    tipoTexto: String(doc?.tipoTexto || "").trim(),
    tono: String(doc?.tono || "").trim(),
    ejemploEstilo: String(doc?.ejemploEstilo || "").trim(),
    ejeArticulador: String(doc?.ejeArticulador || "").trim(),
    nivel: String(doc?.nivel || "").trim(),
    grado: String(doc?.grado || "").trim(),
    trimestre: String(doc?.trimestre ?? "").trim(),
    unidad: String(doc?.unidad ?? "").trim(),
    serie: String(doc?.serie || "").trim(),
    userId: String(doc?.userId || "").trim(),
    analizadaASC: !!doc?.analizadaASC,
    coleccion,
    esLecturaHistoricaASC,
    categoriaLectura: esLecturaHistoricaASC ? "historicaASC" : "nuevaPlataforma",
    notaRespeto: esLecturaHistoricaASC
      ? "Lectura histórica de la colección lecturasASC. Tratar con especial respeto."
      : "Lectura de la colección lecturasNuevas.",
    contenidoCompleto,
    preguntas,
    bibliografia: _serializarValorFirestore(doc?.bibliografia || null),
    timestamp: _serializarValorFirestore(doc?.timestamp || null),
    campos: _serializarValorFirestore(doc || {})
  };
}

function _mapearLecturaResumenParaBusqueda(doc = {}) {
  const tituloCampo = String(doc?.titulo || "").trim();
  const temaCampo = String(doc?.tema || "").trim();
  const titulo = tituloCampo || temaCampo || "Sin título";
  const sinopsis = tituloCampo ? temaCampo : "";
  const coleccion = String(
    doc?.sourceCollection
    || doc?.coleccion
    || (String(doc?.tipo || "").toLowerCase() === "asc" ? "lecturasASC" : "lecturasNuevas")
  ).trim();
  const esLecturaHistoricaASC = coleccion === "lecturasASC";
  return {
    id: String(doc?.id || "").trim(),
    tipo: String(doc?.tipo || "").trim(),
    titulo,
    sinopsis,
    tema: temaCampo,
    autor: String(doc?.autorReferencia || "").trim(),
    tipoTexto: String(doc?.tipoTexto || "").trim(),
    ejeArticulador: String(doc?.ejeArticulador || "").trim(),
    nivel: String(doc?.nivel || "").trim(),
    grado: String(doc?.grado || "").trim(),
    trimestre: String(doc?.trimestre ?? "").trim(),
    unidad: String(doc?.unidad ?? "").trim(),
    coleccion,
    esLecturaHistoricaASC
  };
}

function _construirLecturaCache(lectura = {}) {
  if (!lectura || !lectura.id) return null;
  const mapped = _mapearLecturaParaGemini(lectura);
  return {
    id: mapped.id,
    titulo: mapped.titulo,
    sinopsis: mapped.sinopsis,
    tema: mapped.tema,
    nivel: mapped.nivel,
    grado: mapped.grado,
    trimestre: mapped.trimestre,
    unidad: mapped.unidad,
    tipo: mapped.tipo,
    coleccion: mapped.coleccion,
    esLecturaHistoricaASC: mapped.esLecturaHistoricaASC,
    autor: mapped.autor,
    tipoTexto: mapped.tipoTexto,
    ejeArticulador: mapped.ejeArticulador,
    contenidoCompleto: mapped.contenidoCompleto,
    preguntas: mapped.preguntas,
    campos: mapped.campos,
    rawData: { ...lectura },
    updatedAt: Date.now()
  };
}

function _guardarLecturaCache(lectura = {}) {
  try {
    const payload = _construirLecturaCache(lectura);
    if (!payload?.id) return;
    localStorage.setItem(LECTURA_CACHE_STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem("lecturaSeleccionadaDesdeModal", "true");
    localStorage.setItem("ultimaLecturaSeleccionada", payload.id);
    _guardarLecturaEnListaCache(payload);
  } catch (_) {
    // noop
  }
}

function _leerLecturaCache() {
  try {
    const raw = localStorage.getItem(LECTURA_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.id) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function _leerLecturasCacheLista() {
  try {
    const raw = localStorage.getItem(LECTURAS_CACHE_LIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((it) => it && typeof it === "object" && it.id && it.contenidoCompleto)
      .slice(0, 12);
  } catch (_) {
    return [];
  }
}

function _guardarLecturaEnListaCache(lecturaCache = {}) {
  try {
    if (!lecturaCache?.id) return;
    const current = _leerLecturasCacheLista();
    const updated = [
      {
        ...lecturaCache,
        updatedAt: Date.now()
      },
      ...current.filter((it) => String(it?.id || "") !== String(lecturaCache.id || ""))
    ].slice(0, 12);
    localStorage.setItem(LECTURAS_CACHE_LIST_STORAGE_KEY, JSON.stringify(updated));
  } catch (_) {
    // noop
  }
}

async function renderContenidoEnTiempoReal(targetEl, htmlFinal = "", shouldStop = null) {
  if (!targetEl) return;
  const texto = _htmlAPlainText(htmlFinal);
  if (!texto) {
    targetEl.innerHTML = htmlFinal || "";
    return;
  }

  targetEl.style.whiteSpace = "pre-wrap";
  targetEl.style.wordBreak = "break-word";
  targetEl.textContent = "";

  // Typewriter real: letra por letra.
  // Velocidad adaptativa para no tardar excesivamente en textos muy largos.
  const total = texto.length;
  const delay = total > 12000 ? 1 : total > 7000 ? 2 : 4; // ms por carácter aprox.
  const mustStop = () => (typeof shouldStop === "function" && shouldStop()) || window.cancelarProyectos;

  for (let i = 0; i < total; i++) {
    if (mustStop()) {
      throw new Error("CANCELADO_PROYECTOS");
    }
    targetEl.textContent += texto[i];
    if (i % 8 === 0) {
      targetEl.scrollTop = targetEl.scrollHeight;
      await sleep(delay);
    }
  }

  targetEl.style.whiteSpace = "";
  targetEl.style.wordBreak = "";
  targetEl.innerHTML = htmlFinal || "";
}

function getSelectedModel() {
  const raw = document.getElementById("selectGeminiEndpoint")?.value || "gemini-2.5-flash-lite";
  return normalizeGeminiModel(raw);
}

function buildGenerationConfig(modelo) {
  if (!modelo) return null;
  if (modelo.startsWith("gemini-3")) {
    // Gemini 3 usa thinking high por defecto; LOW reduce latencia para este flujo.
    return {
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingLevel: "LOW" }
    };
  }
  return null;
}

function getGeminiEndpoint(modeloOverride) {
  return buildApiUrl("/api/gemini/generate");
}


// 🟢 Control de cola para peticiones a Gemini
let colaPrompts = Promise.resolve();

// 🟢 Retraso configurable para no saturar
const DELAY_ENTRE_PETICIONES = 250; // menor latencia percibida sin saturar
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 60000;
const MAX_RETRIES_PER_MODEL = 2;
const DEMANDA_DEFAULT_COOLDOWN_MS = 8 * 60 * 1000;
const DEMANDA_TIMEOUT_COOLDOWN_MS = 6 * 60 * 1000;
const DEMANDA_PRO_COOLDOWN_MS = 15 * 60 * 1000;

// 🛑 Cancelación manual y control de abort controllers
window.abortControllersGemini = window.abortControllersGemini || new Set();
window.cancelarProyectos = false;
window.onGeminiStatus = null;
window.geminiModelDemand = window.geminiModelDemand || {};
window.previewCooldown = window.previewCooldown || window.geminiModelDemand; // compat legado
window.cancelTokenProyectos = window.cancelTokenProyectos || 0;
window.stopRequestedUnidad = window.stopRequestedUnidad || false;
window.geminiModelOptionBaseLabels = window.geminiModelOptionBaseLabels || {};
window.categoriaEnProceso = window.categoriaEnProceso || "";
window.ultimaCategoriaIntentada = window.ultimaCategoriaIntentada || "";
window.ultimaCategoriaFallida = window.ultimaCategoriaFallida || "";
window.ultimaCategoriaExitosa = window.ultimaCategoriaExitosa || "";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeGeminiModel(modelo) {
  // Permisivo: respeta el valor elegido en el select (como Moodle).
  // Solo normaliza el sufijo de endpoint si viene incluido.
  const clean = String(modelo || "")
    .replace(":generateContent", "")
    .replace(":streamGenerateContent", "")
    .trim();
  return clean || "gemini-2.5-flash-lite";
}

function normalizarCategoriaId(categoria = "") {
  return String(categoria || "").replace(/\s+/g, "-");
}

function limpiarResultadoCategoria(categoria = "") {
  if (!categoria) return;
  const idCat = normalizarCategoriaId(categoria);
  document.getElementById(`spinner-categoria-${idCat}`)?.remove();
  document.getElementById(`contenedor-${idCat}`)?.remove();
}

function getGeminiRequestTimeoutMs(modelo = "") {
  const clean = normalizeGeminiModel(modelo);
  // Generar unidad usa prompts/respuestas largas; tiempos bajos provocaban aborts falsos.
  if (clean.includes("3.1-pro-preview") || clean.includes("3-pro-preview")) return 120000;
  if (clean.includes("2.5-pro")) return 110000;
  if (clean.includes("2.5-flash")) return 100000;
  if (clean.includes("3-flash-preview")) return 100000;
  return 90000; // flash-lite
}

function getGeminiCooldownMs(modelo = "", motivo = "", status = 0) {
  const clean = normalizeGeminiModel(modelo);
  const msg = String(motivo || "").toLowerCase();
  // Cooldowns cortos para no "secuestrar" la selección del usuario por minutos.
  if (status === 404) return 90 * 1000;
  if (msg.includes("timeout")) return 75 * 1000;
  if (status === 503 || msg.includes("high demand")) return 60 * 1000;
  if (status === 429) return 45 * 1000;
  return 45 * 1000;
}

function getGeminiSelectEndpointEl() {
  return document.getElementById("selectGeminiEndpoint");
}

function formatearRestanteCooldown(until = 0) {
  const rest = Math.max(0, Math.ceil((Number(until) - Date.now()) / 1000));
  if (rest <= 0) return "";
  const min = Math.floor(rest / 60);
  const seg = rest % 60;
  return min > 0 ? `${min}m` : `${seg}s`;
}

function actualizarEtiquetasGeminiEndpoint() {
  const select = getGeminiSelectEndpointEl();
  if (!select) return;

  if (!window.__geminiBaseLabelsLoaded) {
    window.__geminiBaseLabelsLoaded = true;
    Array.from(select.options || []).forEach((opt) => {
      window.geminiModelOptionBaseLabels[opt.value] = opt.textContent || opt.value;
    });
  }

  Array.from(select.options || []).forEach((opt) => {
    const model = normalizeGeminiModel(opt.value);
    const baseLabel = window.geminiModelOptionBaseLabels[opt.value] || opt.textContent || model;
    const demand = window.geminiModelDemand?.[model];
    const enCooldown = demand?.until && demand.until > Date.now();
    const sufijo = enCooldown
      ? ` [alta demanda${formatearRestanteCooldown(demand.until) ? ` ${formatearRestanteCooldown(demand.until)}` : ""}]`
      : "";
    opt.textContent = `${baseLabel}${sufijo}`;
  });
}

function marcarModeloEnAltaDemanda(modelo = "", motivo = "", status = 0) {
  const clean = normalizeGeminiModel(modelo);
  const cooldownMs = getGeminiCooldownMs(clean, motivo, status);
  const until = Date.now() + cooldownMs;
  const prev = window.geminiModelDemand?.[clean] || {};
  window.geminiModelDemand[clean] = {
    until,
    reason: motivo || prev.reason || "",
    status: status || prev.status || 0,
    hits: Number(prev.hits || 0) + 1
  };
  actualizarEtiquetasGeminiEndpoint();
}

function limpiarMarcaAltaDemanda(modelo = "") {
  const clean = normalizeGeminiModel(modelo);
  if (window.geminiModelDemand?.[clean]) {
    delete window.geminiModelDemand[clean];
    actualizarEtiquetasGeminiEndpoint();
  }
}

function modeloEnCooldown(modelo = "") {
  const clean = normalizeGeminiModel(modelo);
  const mark = window.geminiModelDemand?.[clean];
  return !!(mark?.until && mark.until > Date.now());
}

function iniciarEtiquetasModelosGemini() {
  actualizarEtiquetasGeminiEndpoint();
  if (!window.__geminiDemandTicker) {
    window.__geminiDemandTicker = setInterval(() => {
      actualizarEtiquetasGeminiEndpoint();
    }, 30000);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciarEtiquetasModelosGemini);
} else {
  iniciarEtiquetasModelosGemini();
}

function verificarCancelacionProyectos() {
  if (window.cancelarProyectos) {
    throw new Error("CANCELADO_PROYECTOS");
  }
}

function assertProyectosActivo(token) {
  if (window.cancelarProyectos || token !== window.cancelTokenProyectos) {
    throw new Error("CANCELADO_PROYECTOS");
  }
}

function cancelarGeneracionProyectos() {
  window.cancelarProyectos = true;
  window.cancelTokenProyectos += 1;
  window.abortControllersGemini.forEach(ctrl => {
    try { ctrl.abort(); } catch (_) { }
  });
  window.abortControllersGemini.clear();
  colaPrompts = Promise.resolve();
  const status = document.getElementById("spinner-Proyectos-Proyectos");
  if (status) status.innerHTML = '<i class="fas fa-stop"></i> Cancelando...';
  logVisual("⏹ Generación de Proyectos cancelada por el usuario.");
}



let lecturasASC = [];
let secuenciaActual = {};
let unidadAnterior = null;
let claveFichaActualGlobal = "";
let modeloAnterior = null;





window.lecturasNuevas = [];

const frecuenciaSemanalPorCategoria = {
  "Artes": 1,
  "Lenguaje y comunicación": 5,
  "Ciencias experimentales": 2,
  "Ciencias sociales": 2,
  "Formación socioemocional": 1,
  "Mi localidad": 1,
  "Matemáticas": 5,
  "Proyectos": 1 // ✅ Agregar Proyectos si es necesario
};




// ✅ VERIFICACIÓN MEJORADA al cambiar de unidad o modelo

function verificarUnidadActual() {
  const unidadActual = selectUnidad.value;
  const modeloActual = document.getElementById("selectGeminiEndpoint")?.value;

  if (unidadActual) {
    // ✅ SOLO crear contadores si no existen, NUNCA resetear
    if (!window.contadoresPorUnidad) {
      window.contadoresPorUnidad = {};
    }

    if (!window.contadoresPorUnidad[unidadActual]) {
      window.contadoresPorUnidad[unidadActual] = {
        fichas: 0,
        recortables: 0,
        anexos: 0,
        videos: 0
      };
    } else {
    }
  }

  // No reiniciar nunca los contadores durante la sesión de generación
  unidadAnterior = unidadActual;
  modeloAnterior = modeloActual;
}



// ✅ CORRECCIÓN: Resetear contadores solo cuando sea necesario
function resetearContadoresUnidad(unidad) {
  if (unidad && window.contadoresPorUnidad[unidad]) {
    window.contadoresPorUnidad[unidad] = {
      fichas: 0,
      recortables: 0,
      anexos: 0,
      videos: 0
    };
  }
}

// Llamar verificarUnidadActual al inicio y cuando cambie la unidad
document.addEventListener('DOMContentLoaded', function () {
  verificarUnidadActual();
});







// Mapa de grados (texto -> número)
const gradoMap = {
  "Primero": "1",
  "Segundo": "2",
  "Tercero": "3",
  "Cuarto": "4",
  "Quinto": "5",
  "Sexto": "6"
};

function _normalizarGradoComparable(valor = "") {
  const raw = String(valor || "").trim();
  const key = raw.toLowerCase();
  const mapa = {
    "primero": "1",
    "segundo": "2",
    "tercero": "3",
    "cuarto": "4",
    "quinto": "5",
    "sexto": "6",
    "1": "1",
    "2": "2",
    "3": "3",
    "4": "4",
    "5": "5",
    "6": "6"
  };
  return mapa[key] || raw;
}

function _lecturaCoincideConContexto(lectura = null, ctx = {}) {
  if (!lectura || typeof lectura !== "object") return false;
  const nivelLectura = String(lectura.nivel || "").trim().toLowerCase();
  const nivelCtx = String(ctx.nivel || "").trim().toLowerCase();
  const gradoLectura = _normalizarGradoComparable(lectura.grado);
  const gradoCtx = _normalizarGradoComparable(ctx.grado);
  const trimestreLectura = String(parseInt(lectura.trimestre || "", 10) || "");
  const trimestreCtx = String(parseInt(ctx.trimestre || "", 10) || "");
  const unidadLectura = String(parseInt(lectura.unidad || "", 10) || "");
  const unidadCtx = String(parseInt(ctx.unidad || "", 10) || "");

  return (
    !!nivelLectura &&
    !!nivelCtx &&
    nivelLectura === nivelCtx &&
    !!gradoLectura &&
    !!gradoCtx &&
    gradoLectura === gradoCtx &&
    !!trimestreLectura &&
    !!trimestreCtx &&
    trimestreLectura === trimestreCtx &&
    !!unidadLectura &&
    !!unidadCtx &&
    unidadLectura === unidadCtx
  );
}




// DOM
const selectNivel = document.getElementById("unidadNivel");
const selectGrado = document.getElementById("unidadGrado");

const selectTrimestre = document.getElementById("unidadTrimestre");
const selectTema = document.getElementById("unidadTema");
const inputTemaTexto = document.getElementById("unidadTemaTexto");
const selectTemaASC = document.getElementById("unidadTemaASC");
const selectUnidad = document.getElementById('unidadNumero');

const contenedorCamposSecuencia = document.getElementById("camposSecuencia");
const outputResultado = document.getElementById("resultadoUnidadGenerada");
// Luego los event listeners
selectTema.addEventListener("change", () => {
  if (selectTema.value) selectTemaASC.value = "";
  _sincronizarInputTemaConSelect();
});

selectTemaASC.addEventListener("change", () => {
  if (selectTemaASC.value) selectTema.value = "";
  _sincronizarInputTemaConSelect();
});

if (inputTemaTexto) {
  inputTemaTexto.addEventListener("change", () => {
    const val = String(inputTemaTexto.value || "").trim();
    if (!val) return;
    const lecturas = _poolLecturasBusqueda();
    const lectura = lecturas.find((l) => String(l?.id || "") === val) || null;
    if (lectura) {
      _aplicarLecturaPrincipalSeleccionada(lectura);
    } else {
      _aplicarBusquedaManualTema(val).catch(() => { });
    }
  });
  inputTemaTexto.addEventListener("click", async () => {
    if (!_poolLecturasBusqueda().length) {
      try { await cargarTodasLasLecturas({ forceRefresh: true }); } catch (_) { }
    }
    _refrescarOpcionesInputTema("");
  });
}

// Y AHORA SÍ los event listeners que usan selectUnidad
selectUnidad?.addEventListener('change', function () {
  verificarUnidadActual();
  verificarSecuencia();
});

selectNivel?.addEventListener('change', function () {
  verificarUnidadActual();
  verificarSecuencia();
});

selectGrado?.addEventListener('change', function () {
  verificarUnidadActual();
  verificarSecuencia();
});

selectTrimestre?.addEventListener('change', function () {
  verificarUnidadActual();
  verificarSecuencia();
});

// 🔎 Reúne T/AE/C/P del MISMO grado y trimestre (ya filtrados por tu query) desde secuenciaActual (objeto con claves ..._T, ..._AE, etc.)
function getResumenCurricularDelGradoTrimestre() {
  const T_global = [], AE_global = [], C_global = [], P_global = [];

  Object.entries(categoriaPorSubtema).forEach(([subtema, categoria]) => {
    const clave = subtema.replace(/\s+/g, "_");
    if (secuenciaActual?.[`${clave}_T`]) T_global.push(secuenciaActual[`${clave}_T`]);
    if (secuenciaActual?.[`${clave}_AE`]) AE_global.push(secuenciaActual[`${clave}_AE`]);
    if (secuenciaActual?.[`${clave}_C`]) C_global.push(secuenciaActual[`${clave}_C`]);
    if (secuenciaActual?.[`${clave}_P`]) P_global.push(secuenciaActual[`${clave}_P`]);
  });

  return { T_global, AE_global, C_global, P_global };
}





const descripcionesPorDefecto = {
  Proyectos: {
    T: "Proyecto integrador trimestral basado en contexto real del alumno.",
    AE: "Desarrolla habilidades para investigar, diseñar, crear y evaluar productos significativos.",
    C: "Secuencia metodológica por fases, con productos intermedios y socialización.",
    P: "Trabajo colaborativo, roles, uso de recursos y reflexión metacognitiva."
  },
  Artes: {
    T: "Exploración de diversas formas de expresión artística como dibujo, música, teatro y danza.",
    AE: "Desarrollar la capacidad de apreciar, interpretar y crear manifestaciones artísticas.",
    C: "Técnicas básicas de expresión visual, musical y corporal.",
    P: "Experimentación de medios y herramientas para crear obras personales."
  },
  "Lenguaje y comunicación": {
    T: "Desarrollo de habilidades comunicativas integrales.",
    AE: "Comprender, analizar y producir textos orales y escritos en diversos contextos.",
    C: "Elementos lingüísticos, estrategias comunicativas y convenciones del lenguaje.",
    P: "Práctica guiada, producción creativa y aplicación en situaciones reales."
  },
  "Ciencias experimentales": {
    T: "Investigación y comprensión de fenómenos naturales y científicos.",
    AE: "Desarrollar pensamiento científico mediante observación, experimentación y análisis.",
    C: "Conceptos científicos, métodos de investigación y relación con el entorno.",
    P: "Indagación, experimentación práctica y aplicación del método científico."
  },
  "Ciencias sociales": {
    T: "Estudio de la sociedad, cultura, historia y organización humana.",
    AE: "Analizar contextos sociales e históricos para comprender la realidad actual.",
    C: "Procesos históricos, organizaciones sociales y dinámicas culturales.",
    P: "Investigación documental, análisis crítico y reflexión sobre problemáticas sociales."
  },
  "Formación socioemocional": {
    T: "Desarrollo de habilidades emocionales, sociales y éticas.",
    AE: "Gestionar emociones, establecer relaciones sanas y tomar decisiones éticas.",
    C: "Autoconocimiento, regulación emocional, empatía y valores cívicos.",
    P: "Reflexión personal, trabajo colaborativo y práctica de habilidades socioemocionales."
  },
  "Matemáticas": {
    T: "Resolución de problemas mediante el pensamiento lógico-matemático.",
    AE: "Aplicar conceptos y procedimientos matemáticos en diversos contextos.",
    C: "Números, operaciones, geometría, medición y análisis de datos.",
    P: "Resolución de problemas, razonamiento lógico y aplicación práctica."
  },
  // Subtemas específicos de Lenguaje y comunicación
  "Ortografía": {
    T: "Normas y convenciones de la escritura correcta.",
    AE: "Escribir textos aplicando las reglas ortográficas adecuadas.",
    C: "Uso de letras, acentuación, puntuación y mayúsculas.",
    P: "Práctica constante, corrección y aplicación en producciones escritas."
  },
  "Gramatica": {
    T: "Estructura y funcionamiento del lenguaje.",
    AE: "Reconocer y utilizar correctamente las categorías gramaticales.",
    C: "Sustantivos, verbos, adjetivos, sintaxis y morfología.",
    P: "Análisis de textos, ejercicios estructurales y producción guiada."
  },
  "ExpresionEscrita": {
    T: "Producción de textos escritos con diversos propósitos.",
    AE: "Redactar textos coherentes, cohesionados y adecuados al contexto.",
    C: "Planificación, redacción, revisión y edición de textos.",
    P: "Escritura guiada, procesos de composición y publicación."
  },
  "ExpresionOral": {
    T: "Comunicación verbal efectiva en diferentes situaciones.",
    AE: "Expresarse con claridad, fluidez y adecuación al contexto.",
    C: "Dicción, vocabulario, estructura discursiva y comunicación no verbal.",
    P: "Práctica oral, dramatizaciones, debates y exposiciones."
  },
  // Subtemas específicos de Ciencias experimentales
  "Naturales": {
    T: "Estudio de los seres vivos y su interacción con el medio.",
    AE: "Comprender los procesos biológicos y ecológicos fundamentales.",
    C: "Seres vivos, ecosistemas, salud y cuidado del ambiente.",
    P: "Observación, experimentación y análisis de fenómenos naturales."
  },
  "ConocimientoDelMedio": {
    T: "Relación entre el ser humano y su entorno natural y social.",
    AE: "Reconocer las interacciones en el medio ambiente y la sociedad.",
    C: "Entorno natural, recursos, comunidad y relaciones sociales.",
    P: "Exploración del entorno, investigación local y proyectos comunitarios."
  },
  "MiLocalidad": {
    T: "Reconocimiento del entorno inmediato donde viven los estudiantes.",
    AE: "Identificar características físicas, culturales y sociales de la localidad.",
    C: "Elementos del barrio o colonia, servicios, tradiciones, lugares importantes y actores de la comunidad.",
    P: "Exploración directa, entrevistas, registro de observaciones y elaboración de mapas o reportes sobre la localidad."
  },
  // Subtemas específicos de Ciencias sociales
  "Historia": {
    T: "Estudio del pasado para comprender el presente.",
    AE: "Analizar procesos históricos y su influencia en la actualidad.",
    C: "Linea del tiempo, civilizaciones, cambios sociales y culturales.",
    P: "Investigación histórica, análisis de fuentes y construcción de narrativas."
  },
  "Geografia": {
    T: "Organización del espacio geográfico y relaciones humanas.",
    AE: "Interpretar mapas y comprender la organización territorial.",
    C: "Espacio geográfico, cartografía, regiones y recursos naturales.",
    P: "Análisis espacial, interpretación cartográfica y estudios de caso."
  },
  // Subtemas específicos de Formación socioemocional
  "Socioemocional": {
    T: "Desarrollo de competencias emocionales y sociales.",
    AE: "Identificar y gestionar emociones para una convivencia armónica.",
    C: "Emociones, autoestima, relaciones interpersonales y resiliencia.",
    P: "Reflexión grupal, role-playing y actividades vivenciales."
  },
  "CivicaEtica": {
    T: "Formación en valores democráticos y ciudadanía responsable.",
    AE: "Actuar con base en principios éticos y de convivencia democrática.",
    C: "Derechos humanos, valores cívicos, justicia y participación social.",
    P: "Debates éticos, análisis de casos y proyectos de participación ciudadana."
  },
  // Subtema específico de Matemáticas
  "Matematicas": {
    T: "Pensamiento lógico-matemático y resolución de problemas.",
    AE: "Aplicar operaciones y conceptos matemáticos en situaciones diversas.",
    C: "Números, operaciones, geometría, medición y probabilidad.",
    P: "Resolución de problemas, razonamiento deductivo y aplicación práctica."
  },
  "Habilidades": {
    T: "Habilidades blandas esenciales para la vida escolar y personal.",
    AE: "Fomentar la comunicación efectiva, trabajo colaborativo y toma de decisiones.",
    C: "Desarrollo de pensamiento crítico, empatía y autorregulación.",
    P: "Aplicación de habilidades socioemocionales en actividades diarias."
  }

  /*   "Finanzas": {
       T: "Fundamentos de la educación financiera desde edad temprana.",
       AE: "Reconocer el valor del dinero, ahorro, gasto responsable y planificación financiera.",
       C: "Conceptos básicos como presupuesto, ahorro y necesidades vs. deseos.",
       P: "Resolución de problemas financieros en contextos reales o simulados."
     },
   */
};

const categoriaPorSubtema = {
  Proyectos: "Proyectos",
  Artes: "Lenguaje y comunicación",
  Ortografía: "Lenguaje y comunicación",
  Gramatica: "Lenguaje y comunicación",
  ExpresionEscrita: "Lenguaje y comunicación",
  ExpresionOral: "Lenguaje y comunicación",
  Habilidades: "Lenguaje y comunicación",
  Naturales: "Ciencias experimentales", // ✅ Este debe apuntar a Ciencias experimentales
  ConocimientoDelMedio: "Ciencias experimentales", // ✅ Este debe apuntar a Ciencias experimentales
  Socioemocional: "Formación socioemocional",
  MiLocalidad: "Ciencias experimentales",
  CivicaEtica: "Formación socioemocional",
  Historia: "Ciencias sociales",
  Geografia: "Ciencias sociales",
  Matematicas: "Matemáticas",
  // Finanzas: "Finanzas",
  // Tecnologia: "Tecnología",
};


const btnAbrirModal = document.getElementById("btnAbrirModalUnidad");
const modalUnidad = document.getElementById("modalGenerarUnidad");
const cerrarModal = document.getElementById("cerrarModalUnidad");
const modalResultadoUnidad = document.getElementById("modalResultadoUnidad");
const cerrarModalResultadoUnidad = document.getElementById("cerrarModalResultadoUnidad");
const btnAbrirResultadoUnidad = document.getElementById("btnAbrirResultadoUnidad");
const btnAbrirResultadoUnidadTop = document.getElementById("btnAbrirResultadoUnidadTop");
const btnDetenerGeneracionUnidad = document.getElementById("btnDetenerGeneracionUnidad");
const btnRegenerarResultadoUnidad = document.getElementById("btnRegenerarResultadoUnidad");
const btnVozUnidad = document.getElementById("btnVozUnidad");
const studioWorkspaceUnidad = document.querySelector(".panel-analisis.studio-workspace");
const unidadDockHost = document.getElementById("unidadDockHost");
const SECTION_STATE_STORAGE_KEY = "cb.studio.active.section.v1";
const UNIDAD_SIDE_COLLAPSE_KEY = "cb.unidad.side.collapsed.v1";
const MODALES_ACOPLADOS_UNIDAD = [
  "modalUnidadesGuardadas",
  "modalLecturasNuevas",
  "modalNuevaLectura",
  "modalResultadoLectura",
  "unidadAgentStageModal",
  "modalListaSecuencias",
  "modalListaCampos",
  "modalEstilosLiterarios",
  "ascModal",
  "modalListaTemasMetodologicos"
];
const MODALES_ACOPLADOS_CLASE_HIDDEN = new Set([
  "modalListaSecuencias",
  "modalListaCampos",
  "modalEstilosLiterarios",
  "ascModal",
  "modalListaTemasMetodologicos"
]);
const MODALES_ACOPLADOS_DISPLAY = new Set([
  "modalUnidadesGuardadas",
  "modalLecturasNuevas",
  "modalNuevaLectura",
  "modalResultadoLectura"
]);
const BACKDROPS_ACOPLADOS_UNIDAD = [
  "backdropListaSecuencias",
  "backdropListaCampos",
  "backdropListaTemasMetodologicos",
  "ascBackdrop"
];

function prepararModalUnidadAcoplado() {
  if (!modalUnidad) return;
  if (unidadDockHost && modalUnidad.parentElement !== unidadDockHost) {
    unidadDockHost.appendChild(modalUnidad);
  }
  modalUnidad.classList.add("unidad-docked");
}

function forzarVisibilidadChatStudio(visible = false) {
  window.dispatchEvent(new CustomEvent("cb-chat-visibility-force", {
    detail: { visible: !!visible }
  }));
}

function mostrarHostUnidad({ soloSeccion = false } = {}) {
  prepararModalUnidadAcoplado();
  forzarVisibilidadChatStudio(false);
  setUnidadWorkspaceMode(true);
  if (modalUnidad && modalUnidad.style.display !== "block") {
    modalUnidad.style.display = "block";
  }
  const panel = modalUnidad?.querySelector(".unidad-editor-panel, .unidad-panel");
  if (panel) panel.classList.toggle("solo-seccion-activa", !!soloSeccion);
}

function setUnidadSideCollapsed(collapsed = false) {
  const panel = modalUnidad?.querySelector(".unidad-editor-panel, .unidad-panel");
  if (!panel) return;
  panel.classList.toggle("side-collapsed", !!collapsed);
  try {
    localStorage.setItem(UNIDAD_SIDE_COLLAPSE_KEY, collapsed ? "1" : "0");
  } catch (_) {
    // noop
  }
}

function initUnidadSideToggle() {
  const btn = document.getElementById("btnToggleUnidadSide");
  if (!btn || btn.dataset.bound === "1") return;
  const icon = btn.querySelector("i");
  const apply = (collapsed) => {
    setUnidadSideCollapsed(collapsed);
    btn.setAttribute("aria-pressed", collapsed ? "true" : "false");
    btn.setAttribute("title", collapsed ? "Expandir panel derecho" : "Colapsar panel derecho");
    if (icon) {
      icon.classList.toggle("fa-angles-left", !collapsed);
      icon.classList.toggle("fa-angles-right", collapsed);
    }
  };
  let saved = false;
  try {
    saved = localStorage.getItem(UNIDAD_SIDE_COLLAPSE_KEY) === "1";
  } catch (_) {
    saved = false;
  }
  apply(saved);
  btn.addEventListener("click", () => {
    const panel = modalUnidad?.querySelector(".unidad-editor-panel, .unidad-panel");
    const collapsed = !!panel?.classList?.contains("side-collapsed");
    apply(!collapsed);
  });
  btn.dataset.bound = "1";
}

function guardarSeccionActiva(valor = "") {
  try {
    if (!valor) {
      localStorage.removeItem(SECTION_STATE_STORAGE_KEY);
      return;
    }
    localStorage.setItem(SECTION_STATE_STORAGE_KEY, valor);
  } catch (_) {
    // noop
  }
}

function mostrarModalAcopladoById(id = "") {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("hidden");
  if (id === "unidadAgentStageModal") {
    el.classList.add("is-open");
    el.setAttribute("aria-hidden", "false");
  }
  if (MODALES_ACOPLADOS_DISPLAY.has(id)) {
    el.style.display = "block";
  }
}

function ocultarModalAcopladoById(id = "") {
  const el = document.getElementById(id);
  if (!el) return;
  if (id === "unidadAgentStageModal") {
    el.classList.remove("is-open");
    el.setAttribute("aria-hidden", "true");
  }
  if (MODALES_ACOPLADOS_CLASE_HIDDEN.has(id)) {
    el.classList.add("hidden");
  }
  if (MODALES_ACOPLADOS_DISPLAY.has(id)) {
    el.style.display = "none";
  }
}

function setUnidadWorkspaceMode(isOpen = false) {
  if (!studioWorkspaceUnidad) return;
  studioWorkspaceUnidad.classList.toggle("unidad-mode", !!isOpen);
}

function cerrarModalesAcopladosUnidad(exceptId = "") {
  const splitReadingGroup = new Set([
    "modalLecturasNuevas",
    "modalNuevaLectura",
    "modalResultadoLectura"
  ]);
  MODALES_ACOPLADOS_UNIDAD.forEach((id) => {
    if (!id || id === exceptId) return;
    if (splitReadingGroup.has(exceptId) && splitReadingGroup.has(id)) return;
    ocultarModalAcopladoById(id);
  });
}

function modalAcopladoVisible(el) {
  if (!el) return false;
  if (el.classList?.contains("hidden")) return false;
  const display = window.getComputedStyle(el).display;
  if (display === "none") return false;
  if (el.style?.display === "none") return false;
  return true;
}

function setupSeccionExclusivaAcopladaUnidad() {
  let lock = false;
  MODALES_ACOPLADOS_UNIDAD.forEach((id) => {
    const modal = document.getElementById(id);
    if (!modal) return;
    const obs = new MutationObserver(() => {
      if (lock) return;
      if (!modalAcopladoVisible(modal)) return;
      lock = true;
      guardarSeccionActiva(id);
      cerrarModalesAcopladosUnidad(id);
      setTimeout(() => {
        lock = false;
      }, 0);
    });
    obs.observe(modal, { attributes: true, attributeFilter: ["class", "style"] });
  });
}

function acoplarModalesSeccionEnUnidad() {
  const unidadPanel = modalUnidad?.querySelector(".unidad-editor-panel, .unidad-panel");
  if (!unidadPanel) return;

  MODALES_ACOPLADOS_UNIDAD.forEach((id) => {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (modal.parentElement !== unidadPanel) {
      unidadPanel.appendChild(modal);
    }
    modal.classList.add("unidad-internal-overlay");
  });

  BACKDROPS_ACOPLADOS_UNIDAD.forEach((id) => {
    const backdrop = document.getElementById(id);
    if (!backdrop) return;
    backdrop.classList.add("unidad-internal-backdrop");
  });
}

function bindAbrirSeccionesAcopladasUnidad() {
  const targetByButton = {
    btnListaUnidadesGuardadas: "modalUnidadesGuardadas",
    btnSugerenciasLectura: "modalLecturasNuevas",
    btnSecuenciaAlcance: "modalListaSecuencias",
    btnCamposFormativos: "modalListaCampos",
    btnAgregarEstilo: "modalEstilosLiterarios",
    btnLecturasAsc: "ascModal",
    btnAbrirModalMetodologia: "modalListaTemasMetodologicos"
  };

  Object.entries(targetByButton).forEach(([buttonId, targetModalId]) => {
    const btn = document.getElementById(buttonId);
    if (!btn || btn.dataset.boundUnidadDock === "1") return;
    btn.addEventListener("click", () => {
      abrirSeccionAcopladaUnidad(targetModalId);
    });
    btn.dataset.boundUnidadDock = "1";
  });
}

function abrirSeccionAcopladaUnidad(targetModalId = "") {
  if (!targetModalId) return false;
  const target = document.getElementById(targetModalId);
  if (!target) return false;
  mostrarHostUnidad({ soloSeccion: true });
  cerrarModalesAcopladosUnidad(targetModalId);
  acoplarModalesSeccionEnUnidad();
  mostrarModalAcopladoById(targetModalId);
  guardarSeccionActiva(targetModalId);
  return true;
}

function restaurarSeccionAcoplada() {
  // Requisito UX: al abrir generarLectura, iniciar siempre con Generar Unidad Didáctica.
  const saved = "modalGenerarUnidad";

  const buttonBySection = {
    modalUnidadesGuardadas: "btnListaUnidadesGuardadas",
    modalLecturasNuevas: "btnSugerenciasLectura",
    modalListaSecuencias: "btnSecuenciaAlcance",
    modalListaCampos: "btnCamposFormativos",
    modalEstilosLiterarios: "btnAgregarEstilo",
    ascModal: "btnLecturasAsc",
    modalListaTemasMetodologicos: "btnAbrirModalMetodologia",
    modalGenerarUnidad: "btnAbrirModalUnidad"
  };

  const btnId = buttonBySection[saved];
  if (!btnId) return;

  setTimeout(() => {
    const btn = document.getElementById(btnId);
    if (btn && typeof btn.click === "function") btn.click();
  }, 220);
}

function ocultarSeccionesParaAbrirChat() {
  cerrarModalesAcopladosUnidad();
  const panel = modalUnidad?.querySelector(".unidad-editor-panel, .unidad-panel");
  if (panel) panel.classList.remove("solo-seccion-activa");
  if (modalUnidad) modalUnidad.style.display = "none";
  setUnidadWorkspaceMode(false);
  guardarSeccionActiva("");
}

prepararModalUnidadAcoplado();
acoplarModalesSeccionEnUnidad();
bindAbrirSeccionesAcopladasUnidad();
setupSeccionExclusivaAcopladaUnidad();
initUnidadSideToggle();
restaurarSeccionAcoplada();
window.addEventListener("cb-studio-chat-opened", () => {
  ocultarSeccionesParaAbrirChat();
});

window.cbUnidadDock = {
  openSection: abrirSeccionAcopladaUnidad,
  closeSections: cerrarModalesAcopladosUnidad,
  showHost: mostrarHostUnidad,
  hideForChat: ocultarSeccionesParaAbrirChat
};

const NO_PARAMETRO_MSG = "No se ha encontrado tal parámetro, pero puedes elegirlo manualemente";
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
const GEMINI_LIVE_MODEL_DEFAULT = "gemini-2.5-flash-native-audio-preview-12-2025";
const GEMINI_TTS_MODEL_DEFAULT = "gemini-2.5-pro-preview-tts";
const THEME_SETTINGS_STORAGE_KEY = "cb_theme_settings_v1";
const VOICE_COMMANDS_STORAGE_KEY = "cb_voice_command_settings_v1";
const VOICE_COMMANDS_DEFAULT_STORAGE_KEY = "cb_voice_command_defaults_v1";
const VOICE_HARDCODED_COMMANDS_ENABLED = true;
const CHARLY_TTS_VOICE_NAME_DEFAULT = "Charon";
const CHARLY_TTS_MALE_FALLBACKS = [
  "Achird", "Algenib", "Algieba", "Alnilam", "Charon", "Enceladus", "Fenrir",
  "Iapetus", "Orus", "Puck", "Rasalgethi", "Sadachbia", "Sadaltager",
  "Schedar", "Umbriel", "Zubenelgenubi"
];
const CHARLY_TTS_FEMALE_VOICES = [
  "Achernar", "Aoede", "Autonoe", "Callirrhoe", "Despina", "Erinome",
  "Gacrux", "Kore", "Laomedeia", "Leda", "Pulcherrima", "Sulafat",
  "Vindemiatrix", "Zephyr"
];
const AGENT_PROFILES_STORAGE_KEY = "cb_unidad_agent_profiles_v1";
const AGENT_MASTER_ENABLED_STORAGE_KEY = "cb_unidad_agent_enabled_v1";
const AGENT_PROFILES_USER_FIELD = "agentProfiles";
const CHARLY_VOICE_SPEED_DEFAULT = 1.0;
const CHARLY_VOICE_PITCH_DEFAULT = 0.95;
const CHARLY_VOICE_MOOD_DEFAULT = "profesional";
const CHARLY_VOICE_LOCALE_DEFAULT = "es-MX";
const AGENT_PROFILE_DEFAULTS = {
  1: { id: "agente_1", nombre: "Sofia", genero: "female", portrait: "agentePrimero.png", voiceName: "Aoede", mood: "entusiasta", locale: "es-MX", speed: 0.92, pitch: 1.08, descripcion: "Amable, práctica y creativa para guiar actividades didácticas." },
  2: { id: "agente_2", nombre: "Valeria", genero: "female", portrait: "agenteSegundo.png", voiceName: "Kore", mood: "profesional", locale: "es-MX", speed: 1.0, pitch: 1.0, descripcion: "Ordenada y clara para organizar pasos y decisiones pedagógicas." },
  3: { id: "agente_3", nombre: "Mateo", genero: "male", portrait: "agenteTercero.png", voiceName: "Orus", mood: "analitico", locale: "es-MX", speed: 0.98, pitch: 0.92, descripcion: "Analítico y preciso para explicar criterios y estructura académica." },
  4: { id: "agente_4", nombre: "Elena", genero: "female", portrait: "agenteCuarto.png", voiceName: "Leda", mood: "empatico", locale: "es-MX", speed: 0.99, pitch: 1.06, descripcion: "Empática y motivadora para acompañar el proceso con cercanía." },
  5: { id: "agente_5", nombre: "Bruno", genero: "male", portrait: "agenteQuinto.png", voiceName: "Puck", mood: "sereno", locale: "es-MX", speed: 0.97, pitch: 0.88, descripcion: "Sereno y metódico para mantener foco y claridad en los objetivos." },
  6: { id: "agente_6", nombre: "Camila", genero: "female", portrait: "agentesexto.png", voiceName: "Zephyr", mood: "entusiasta", locale: "es-MX", speed: 1.03, pitch: 1.12, descripcion: "Energética y resolutiva para impulsar avance y creatividad." }
};
let unidadAgentProfilesCache = null;
let unidadAgentProfilesCacheUid = "";
let unidadAgentProfilesSyncState = { uid: "", loaded: false, loadingPromise: null };
let unidadAgentProfilesAuthWatcherReady = false;
let unidadVoiceRecognition = null;
let unidadVoiceShouldRun = false;
let unidadVoiceIsListening = false;
let unidadVoiceRestartTimer = null;
let unidadVoiceStartRetryMs = 650;
let unidadVoiceAwaitingUserGestureRetry = false;
let agentExclusiveVoiceMode = false;
let unidadAgentMasterEnabled = true;
let unidadAgentController = null;
let nombreUsuarioUnidadCache = "";
let unidadUserPersonaCache = { ts: 0, uid: "", name: "", gender: "neutral" };
let googleGenAiLiveModule = null;
let geminiLiveSessionUnidad = null;
let geminiLiveIsOpen = false;
let geminiLiveAudioCtx = null;
let geminiLivePlayAt = 0;
let geminiLiveActivePcmSources = new Set();
let geminiLivePendingStageCompletion = false;
let geminiLiveStageCompletionTimer = null;
let geminiLiveMicStream = null;
let geminiLiveInputCtx = null;
let geminiLiveSourceNode = null;
let geminiLiveProcessorNode = null;
let geminiLiveWorkletUrl = "";
let geminiLiveAllowOutputUntil = 0;
let geminiLiveMicUploadPaused = false;
let vozUnidadPreferida = null;
let ultimaTranscripcionComando = "";
let ultimaTranscripcionAt = 0;
const ultimoAnuncioGeneracionPorCategoria = {};
let voiceCopilotoPendiente = false;
let voiceCopilotoActivo = false;
let voiceRespuestaContinuaActiva = false;
let charlyDbContextCache = { ts: 0, key: "", text: "" };
let charlyDbContextBlockedUntil = 0;
let charlyAwake = true;
const charlyWakeWordAlwaysOn = true;
const GEMINI_LIVE_VOICE_ONLY = true;
const CHARLY_BREVITY_POLICY = "Responde en español con máximo 1 frase corta (ideal 6-16 palabras). Evita relleno y explicaciones largas. Solo amplía si el usuario pide detalle explícitamente.";
const CHARLY_EMOTION_TAGS = ["[angry]", "[excited]", "[worried]", "[sarcastic]", "[hysterical]", "[confident]", "[scornful]", "[empathetic]"];
const CHARLY_STYLE_TAGS = ["[shouting]", "[whispering]", "[laughing]", "[sighing]", "[clears throat]", "[speaking slowly]", "[short pause]", "[newscast-formal]"];
let ultimaFraseHabladaUnidad = "";
let ultimaFraseHabladaAt = 0;
let ultimaFraseHabladaGuardUntil = 0;
let unidadModalGreetingCount = 0;
let ultimoSaludoUnidad = "";
let ultimoSaludoUnidadAt = 0;
let charlySpeakingIndicatorEl = null;
let charlySpeakingHideTimer = null;
let charlySpeakingVisibleUntil = 0;
let liveTranscriptPending = "";
let liveTranscriptTimer = null;
let lastLiveInputAt = 0;
let lastLiveTranscriptCanon = "";
let lastLiveTranscriptAt = 0;
let geminiTtsAiClientUnidad = null;
let geminiTtsAudioElUnidad = null;
let geminiTtsLastRequestUnidad = 0;
let geminiTtsRequestInFlight = false;
let geminiTtsLastRequestAt = 0;
let geminiTtsCooldownUntil = 0;
let geminiTts429Streak = 0;
let geminiTtsLastQuotaLogAt = 0;
let charlyTtsVoiceName = CHARLY_TTS_VOICE_NAME_DEFAULT;
let charlyVoiceSpeed = CHARLY_VOICE_SPEED_DEFAULT;
let charlyVoicePitch = CHARLY_VOICE_PITCH_DEFAULT;
let charlyVoiceMood = CHARLY_VOICE_MOOD_DEFAULT;
let charlyVoiceLocale = CHARLY_VOICE_LOCALE_DEFAULT;
let activeUnidadAgentPersona = null;
let ultimaSalidaVozTexto = "";
let ultimaSalidaVozAt = 0;
const voiceActionLastAt = {};
let charlyCommandInFlight = false;
let charlyPendingCommand = "";
let charlyInFlightCanon = "";
let charlyPendingCommandCanon = "";
let charlyLastHandledCanon = "";
let charlyLastHandledAt = 0;
let charlyLastWakeCanon = "";
let charlyLastWakeAt = 0;
let charlyLastGreetingAt = 0;
let voiceCommandConfigCache = null;
let voiceCommandMetaCache = null;
let geminiLiveReconfigTimer = null;
let geminiLiveReconnectTimer = null;
let geminiLiveReconnectInFlight = false;
let geminiLiveActiveSessionEpoch = 0;
let geminiLiveInputCircuitOpenUntil = 0;
let geminiLiveLastRealtimeSendAt = 0;
let geminiLiveSessionClosing = false;
let geminiLivePendingSpeechQueue = [];
let geminiLiveSessionConfigKey = "";
let geminiLiveConnectPromise = null;
let geminiLiveDisableEphemeralToken = false;
let agentSpeechPlaybackToken = 0;
let agentSpeechPlaybackOnEnd = null;
let agentSpeechPlaybackOnError = null;
let geminiLiveLastPcmChunkAt = 0;
let voicePendingInputCapture = null;
let charlyLecturaEnCurso = false;
let charlyLecturaPlan = null;
let charlyLecturaPlanPausada = null;
let charlyLecturaNextChunkTimer = null;
let charlyLecturaLastAdvanceAt = 0;
let charlyLecturaDisambiguacionPendiente = null;
let charlyLecturaBusquedaPendiente = null;
let charlyLecturaSeleccionPendiente = null;
let charlyLecturaRefActual = null;
let charlyColeccionActiva = "";
let charlyLecturaAccionPendiente = null;
let charlyLecturaConfirmacionRecienteUntil = 0;
let charlyLecturasPreviewCache = Object.create(null);
let charlyLecturaWorkflowCommandKey = "buscar_lecturas_charly";
let charlyLecturaContextoConversacion = null;
let charlyLecturaAnalisisState = null;
let charlyLecturaPreguntasPendientes = null;
let charlyLecturaVoiceRestoreState = null;
let charlyLecturaReconnectTimer = null;
let charlyLecturaStartPromise = null;
const CHARLY_LECTURA_LIVE_STATE_EVENT = "cb:lectura-live-state";
let charlyConversationMemory = [];
let workflowPlayIsolationMode = false;
let workflowPlayPendingResponse = null;
let workflowPlayLastResponseCanon = "";
let workflowPlayLastResponseAt = 0;
let workflowPlaySessionToken = 0;
const LEGACY_VOICE_SHORTCUTS_ENABLED = false;
const VOICE_COMMANDS_ALWAYS_ON = false;
const GEMINI_TTS_MIN_INTERVAL_MS = 1800;
const GEMINI_TTS_COOLDOWN_BASE_MS = 12000;
const GEMINI_TTS_COOLDOWN_MAX_MS = 90000;
const GEMINI_LIVE_REALTIME_MIN_INTERVAL_MS = 120;

const SALUDOS_UNIDAD_PRIMERA = [
  "Hola {nombre}, listo para ayudarte. ¿Qué deseas hacer primero?",
  "Bienvenido {nombre}. ¿En qué parte de la unidad te apoyo hoy?",
  "Hola {nombre}. Podemos ajustar subtemas, lecturas o instrucciones. ¿Qué hacemos?"
];

const SALUDOS_UNIDAD_CONTINUACION = [
  "Aquí estoy {nombre}. ¿Qué ajustamos ahora?",
  "Seguimos, {nombre}. Dime qué cambio necesitas.",
  "Perfecto {nombre}, continuamos. ¿Qué deseas modificar?"
];

function _descripcionLocaleCharly(locale = "") {
  const v = String(locale || "").trim().toLowerCase();
  if (v === "es-mx") return "español de México";
  if (v === "es-419") return "español latinoamericano";
  if (v === "es-es") return "español de España";
  if (v === "en-us") return "inglés de Estados Unidos";
  return "español latinoamericano";
}

function _descripcionMoodCharly(mood = "") {
  const m = _normalizarTexto(mood);
  if (m === "rebelde") return "estilo joven rebelde, urbano, directo, seguro y fresco, sin groserías";
  if (m === "payaso") return "estilo muy carismático, alegre y juguetón, con risas cortas ocasionales tipo 'ja, ja'";
  if (m === "chilango") return "estilo chilango de la Ciudad de México, cercano, natural y expresivo";
  if (m === "formal") return "estilo formal, preciso y sobrio";
  if (m === "sereno") return "estilo calmado, pausado y paciente";
  if (m === "entusiasta") return "estilo enérgico, motivador y dinámico";
  if (m === "amigable") return "estilo cálido, cercano y amable";
  if (m === "narrativo") return "estilo narrativo, claro, envolvente y expresivo";
  if (m === "calido") return "estilo cálido, humano, cercano y reconfortante";
  if (m === "empatico") return "estilo empático, sensible, amable y cuidadoso";
  if (m === "alegre") return "estilo alegre, luminoso, optimista y sonriente";
  if (m === "curioso") return "estilo curioso, observador, vivo y explorador";
  if (m === "misterioso") return "estilo misterioso, sugerente, suave y expectante";
  if (m === "suspenso") return "estilo de suspenso, contenido, atento y tenso";
  if (m === "epico") return "estilo épico, firme, amplio y emocionante";
  if (m === "dramatico") return "estilo dramático, intenso y emocional";
  if (m === "tierno") return "estilo tierno, dulce, suave y protector";
  return "estilo profesional, claro y natural";
}

function _descripcionVelocidadCharly(speed = 1) {
  const v = Number(speed || 1);
  if (v <= 0.86) return "ritmo lento y muy pausado";
  if (v <= 0.95) return "ritmo calmado y pausado";
  if (v >= 1.14) return "ritmo ágil y dinámico";
  if (v >= 1.05) return "ritmo ligeramente rápido";
  return "ritmo natural";
}

function _descripcionTonoCharly(pitch = 1) {
  const v = Number(pitch || 1);
  if (v <= 0.86) return "tono de voz grave";
  if (v <= 0.95) return "tono de voz medio grave";
  if (v >= 1.1) return "tono de voz más agudo y brillante";
  if (v >= 1.02) return "tono de voz ligeramente agudo";
  return "tono de voz medio";
}

function _estiloVozCharlyActual() {
  const localeDesc = _descripcionLocaleCharly(charlyVoiceLocale);
  const moodDesc = _descripcionMoodCharly(charlyVoiceMood);
  const speedDesc = _descripcionVelocidadCharly(charlyVoiceSpeed);
  const pitchDesc = _descripcionTonoCharly(charlyVoicePitch);
  return `voz masculina joven, natural, ${localeDesc}, ${moodDesc}, ${speedDesc}, ${pitchDesc}`;
}

function _descripcionPersonaVozActual() {
  const localeDesc = _descripcionLocaleCharly(charlyVoiceLocale);
  const moodDesc = _descripcionMoodCharly(charlyVoiceMood);
  const speedDesc = _descripcionVelocidadCharly(charlyVoiceSpeed);
  const pitchDesc = _descripcionTonoCharly(charlyVoicePitch);
  const persona = activeUnidadAgentPersona;
  if (persona?.genero === "female") {
    return `voz femenina natural, ${localeDesc}, ${moodDesc}, ${speedDesc}, ${pitchDesc}`;
  }
  if (persona?.genero === "male") {
    return `voz masculina natural, ${localeDesc}, ${moodDesc}, ${speedDesc}, ${pitchDesc}`;
  }
  return _estiloVozCharlyActual();
}

function _buildLiveSystemInstructionActual() {
  if (activeUnidadAgentPersona) {
    return `${activeUnidadAgentPersona.identidad} Habla en ${_descripcionLocaleCharly(charlyVoiceLocale)} con ${_descripcionPersonaVozActual()}. Mantén una identidad consistente y responde como ${activeUnidadAgentPersona.nombre}. ${CHARLY_BREVITY_POLICY} ${_guiaEtiquetasLiveCharly()}`;
  }
  return `Eres Charly, asistente pedagógico. Voz: ${_estiloVozCharlyActual()}. Habla en ${_descripcionLocaleCharly(charlyVoiceLocale)}. Mood ${charlyVoiceMood}. Usa ${_descripcionVelocidadCharly(charlyVoiceSpeed)} y ${_descripcionTonoCharly(charlyVoicePitch)}. ${CHARLY_BREVITY_POLICY} ${_guiaEtiquetasLiveCharly()}`;
}

function _guiaEtiquetasLiveCharly() {
  return `Etiquetas válidas de emoción: ${CHARLY_EMOTION_TAGS.join(", ")}. ` +
    `Etiquetas válidas de estilo: ${CHARLY_STYLE_TAGS.join(", ")}. ` +
    `Usa máximo 1 etiqueta de emoción al inicio de la respuesta y, opcionalmente, 1 de estilo.`;
}

function _base64ToUint8(base64 = "") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function _leerVozCharlyDesdeThemeSettings() {
  try {
    const raw = localStorage.getItem(THEME_SETTINGS_STORAGE_KEY);
    if (!raw) return CHARLY_TTS_VOICE_NAME_DEFAULT;
    const parsed = JSON.parse(raw);
    const nombre = String(parsed?.charlyVoiceName || "").trim();
    return nombre || CHARLY_TTS_VOICE_NAME_DEFAULT;
  } catch (_) {
    return CHARLY_TTS_VOICE_NAME_DEFAULT;
  }
}

function _leerAjustesVozCharlyDesdeThemeSettings() {
  try {
    const raw = localStorage.getItem(THEME_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {
        speed: CHARLY_VOICE_SPEED_DEFAULT,
        pitch: CHARLY_VOICE_PITCH_DEFAULT,
        mood: CHARLY_VOICE_MOOD_DEFAULT,
        locale: CHARLY_VOICE_LOCALE_DEFAULT
      };
    }
    const parsed = JSON.parse(raw);
    return {
      speed: Math.max(0.75, Math.min(1.35, Number(parsed?.charlyVoiceSpeed) || CHARLY_VOICE_SPEED_DEFAULT)),
      pitch: Math.max(0.75, Math.min(1.2, Number(parsed?.charlyVoicePitch) || CHARLY_VOICE_PITCH_DEFAULT)),
      mood: String(parsed?.charlyVoiceMood || CHARLY_VOICE_MOOD_DEFAULT).trim() || CHARLY_VOICE_MOOD_DEFAULT,
      locale: String(parsed?.charlyVoiceLocale || CHARLY_VOICE_LOCALE_DEFAULT).trim() || CHARLY_VOICE_LOCALE_DEFAULT
    };
  } catch (_) {
    return {
      speed: CHARLY_VOICE_SPEED_DEFAULT,
      pitch: CHARLY_VOICE_PITCH_DEFAULT,
      mood: CHARLY_VOICE_MOOD_DEFAULT,
      locale: CHARLY_VOICE_LOCALE_DEFAULT
    };
  }
}

function _leerAjustesVozLecturaDesdeThemeSettings() {
  try {
    const raw = localStorage.getItem(THEME_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {
        useCharlyVoice: true,
        voiceName: _leerVozCharlyDesdeThemeSettings(),
        speed: CHARLY_VOICE_SPEED_DEFAULT,
        pitch: CHARLY_VOICE_PITCH_DEFAULT,
        mood: "narrativo",
        locale: CHARLY_VOICE_LOCALE_DEFAULT
      };
    }
    const parsed = JSON.parse(raw);
    return {
      useCharlyVoice: parsed?.lecturaUseCharlyVoice !== false,
      voiceName: String(parsed?.lecturaVoiceName || parsed?.charlyVoiceName || _leerVozCharlyDesdeThemeSettings()).trim() || _leerVozCharlyDesdeThemeSettings(),
      speed: Math.max(0.75, Math.min(1.35, Number(parsed?.lecturaVoiceSpeed) || 0.94)),
      pitch: Math.max(0.75, Math.min(1.2, Number(parsed?.lecturaVoicePitch) || 0.92)),
      mood: String(parsed?.lecturaVoiceMood || "narrativo").trim() || "narrativo",
      locale: String(parsed?.lecturaVoiceLocale || parsed?.charlyVoiceLocale || CHARLY_VOICE_LOCALE_DEFAULT).trim() || CHARLY_VOICE_LOCALE_DEFAULT
    };
  } catch (_) {
    return {
      useCharlyVoice: true,
      voiceName: _leerVozCharlyDesdeThemeSettings(),
      speed: CHARLY_VOICE_SPEED_DEFAULT,
      pitch: CHARLY_VOICE_PITCH_DEFAULT,
      mood: "narrativo",
      locale: CHARLY_VOICE_LOCALE_DEFAULT
    };
  }
}

function _leerConfigComandosVoz() {
  if (voiceCommandConfigCache && voiceCommandMetaCache) return voiceCommandConfigCache;
  const _depurarComandosObsoletos = (commands = {}) => {
    const src = { ...(commands && typeof commands === "object" ? commands : {}) };
    const out = {};
    Object.entries(src).forEach(([key, row]) => {
      const keyNorm = String(key || "").trim().toLowerCase();
      if (keyNorm.startsWith("wf_")) return;
      if (keyNorm === "buscar_lecturas_asc_charly" || keyNorm === "buscar_lecturas_nuevas_charly") return;
      if (!row || typeof row !== "object") {
        out[key] = row;
        return;
      }
      const fnNorm = _normalizarFnComandoVoz(String(row.fn || "").trim());
      if (
        fnNorm === "_wfBuscarLecturaIniciar"
        || fnNorm === "_wfBuscarLecturaIdentificarColeccion"
        || fnNorm === "_wfBuscarLecturaConfirmarLectura"
        || fnNorm === "_wfBuscarLecturaDecidirAccion"
        || fnNorm === "_wfBuscarLecturaCerrarFlujo"
      ) return;
      const cleanRow = { ...row };
      delete cleanRow.next_step_1;
      delete cleanRow.next_step_2;
      delete cleanRow.next_step_3;
      delete cleanRow.next_step_4;
      delete cleanRow.next_step_5;
      delete cleanRow.workflow_graph;
      if (typeof cleanRow.next === "string" && /cmd:wf_/i.test(cleanRow.next)) {
        cleanRow.next = "";
      }
      out[key] = cleanRow;
    });
    return out;
  };
  const _asegurarComandosBusquedaColeccion = (commands = {}) => {
    const out = { ...(commands && typeof commands === "object" ? commands : {}) };
    delete out.buscar_lecturas_asc_charly;
    delete out.buscar_lecturas_nuevas_charly;
    return out;
  };
  const _asegurarComandosCriticosNavegacion = (commands = {}) => {
    const out = { ...(commands && typeof commands === "object" ? commands : {}) };
    const regexOpenUnidad = [
      "generar unidad nueva",
      "generar una unidad nueva",
      "genera unidad nueva",
      "genera una unidad nueva",
      "crear una unidad nueva",
      "crea unidad nueva",
      "crea una unidad nueva",
      "abre unidad nueva",
      "abre una unidad nueva",
      "abrir unidad nueva",
      "abrir una unidad nueva",
      "crear unidad nueva",
      "abrir modal unidad",
      "abre generar unidad nueva",
      "vamos a crear una unidad nueva",
      "vamos a crear unidad nueva",
      "hagamos una unidad"
    ].join(", ");
    const prev = (out.open_generar_unidad && typeof out.open_generar_unidad === "object")
      ? out.open_generar_unidad
      : {};
    out.open_generar_unidad = {
      ...prev,
      section: "Boton",
      fn: "_clickButtonById",
      target: "btnAbrirModalUnidad",
      name: String(prev.name || "Abrir Generar Unidad Nueva"),
      regex: regexOpenUnidad,
      enabled: true,
      deleted: false
    };
    return out;
  };
  const _asegurarFuncionesWorkflowLecturas = (commands = {}) => {
    const out = { ...(commands && typeof commands === "object" ? commands : {}) };
    return out;
  };
  const _leerDefaultsPersistidos = () => {
    try {
      const raw = localStorage.getItem(VOICE_COMMANDS_DEFAULT_STORAGE_KEY);
      if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
      const rawCommands = _depurarComandosObsoletos((parsed.commands && typeof parsed.commands === "object") ? parsed.commands : {});
      const cleanCommands = Object.fromEntries(
        Object.entries(rawCommands || {}).filter(([, row]) => !(row && typeof row === "object" && row.deleted === true))
      );
      const commands = _asegurarFuncionesWorkflowLecturas(cleanCommands);
      const meta = (parsed.meta && typeof parsed.meta === "object")
        ? parsed.meta
        : { agentEnabled: true, customFunctions: [] };
      return { commands, meta };
    } catch (_) {
      return null;
    }
  };
  const _guardarDefaultsPersistidos = (commands = {}, meta = {}) => {
    try {
      const cleanCommands = Object.fromEntries(
        Object.entries(commands && typeof commands === "object" ? commands : {})
          .filter(([, row]) => !(row && typeof row === "object" && row.deleted === true))
      );
      localStorage.setItem(VOICE_COMMANDS_DEFAULT_STORAGE_KEY, JSON.stringify({
        savedAt: Date.now(),
        commands: cleanCommands,
        meta
      }));
    } catch (_) {
      // noop
    }
  };

  const defaultsPersistidos = _leerDefaultsPersistidos();
  const defaults = (defaultsPersistidos?.commands && typeof defaultsPersistidos.commands === "object")
    ? defaultsPersistidos.commands
    : {};
  const defaultsMeta = (defaultsPersistidos?.meta && typeof defaultsPersistidos.meta === "object")
    ? defaultsPersistidos.meta
    : { agentEnabled: true, customFunctions: [] };
  voiceCommandMetaCache = defaultsMeta;
  try {
    const raw = localStorage.getItem(VOICE_COMMANDS_STORAGE_KEY);
    if (!raw) {
      voiceCommandConfigCache = _asegurarFuncionesWorkflowLecturas(
        _asegurarComandosCriticosNavegacion(
          _asegurarComandosBusquedaColeccion({ ...defaults })
        )
      );
      return voiceCommandConfigCache;
    }
    const parsed = JSON.parse(raw);
    const hasPayload = parsed && typeof parsed === "object" && (Object.prototype.hasOwnProperty.call(parsed, "commands") || Object.prototype.hasOwnProperty.call(parsed, "meta"));
    const commands = hasPayload
      ? _depurarComandosObsoletos(parsed.commands && typeof parsed.commands === "object" ? parsed.commands : {})
      : _depurarComandosObsoletos(parsed && typeof parsed === "object" ? parsed : {});
    const metaRaw = hasPayload ? (parsed.meta || {}) : {};
    const customFunctions = Array.isArray(metaRaw.customFunctions)
      ? metaRaw.customFunctions
        .map((fn) => ({
          id: String(fn?.id || "").trim(),
          label: String(fn?.label || "").trim(),
          baseFn: String(fn?.baseFn || "").trim()
        }))
        .filter((fn) => !!fn.id && !!fn.label && !!fn.baseFn)
      : [];
    voiceCommandMetaCache = {
      agentEnabled: (typeof metaRaw.agentEnabled === "boolean" ? metaRaw.agentEnabled : defaultsMeta.agentEnabled) !== false,
      customFunctions
    };
    voiceCommandConfigCache = _asegurarFuncionesWorkflowLecturas(
      _asegurarComandosCriticosNavegacion(
        _asegurarComandosBusquedaColeccion(_depurarComandosObsoletos({ ...defaults, ...commands }))
      )
    );

    // Si aún no había defaults persistidos, promover la configuración actual (editada por usuario) como base por defecto.
    if (!defaultsPersistidos && Object.keys(commands || {}).length > 0) {
      _guardarDefaultsPersistidos(voiceCommandConfigCache, voiceCommandMetaCache);
    }
    return voiceCommandConfigCache;
  } catch (_) {
    voiceCommandConfigCache = _asegurarFuncionesWorkflowLecturas(
      _asegurarComandosCriticosNavegacion(
        _asegurarComandosBusquedaColeccion({ ...defaults })
      )
    );
    voiceCommandMetaCache = defaultsMeta;
  }
  return voiceCommandConfigCache;
}

function _leerMetaComandosVoz() {
  if (!voiceCommandMetaCache) _leerConfigComandosVoz();
  return voiceCommandMetaCache || { agentEnabled: true, customFunctions: [] };
}

function _vozGlobalHabilitadaPorConfiguracion() {
  const meta = _leerMetaComandosVoz();
  return meta?.agentEnabled !== false;
}

function _agenteComandosVozActivo() {
  if (_agenteUnidadEnModoExclusivo()) return true;
  return _vozGlobalHabilitadaPorConfiguracion();
}

function _obtenerRegexComando(key = "", defaultRegex = "") {
  const cfg = _leerConfigComandosVoz();
  const row = cfg?.[key];
  if (row && row.enabled === false) return null;
  const fallbackSrc = String(defaultRegex || "").trim();
  const src = String(row?.regex || "").trim() || fallbackSrc;
  if (!src) return null;
  const _compilarDesdeListaFrases = (raw = "") => {
    const frases = String(raw || "")
      .split(/[\n,;]+/g)
      .map((s) => _normalizarTexto(s).trim())
      .filter(Boolean);
    if (!frases.length) return null;
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const body = frases.map((f) => esc(f)).join("|");
    if (!body) return null;
    try { return new RegExp(`(?:${body})`, "i"); } catch (_) { return null; }
  };

  const _pareceListaSimple = (raw = "") => {
    const t = String(raw || "").trim();
    if (!t) return false;
    const tieneSeparadores = /[,;\n]/.test(t);
    const metacaracteres = /[()[\]{}+*^$|\\]/.test(t);
    return tieneSeparadores && !metacaracteres;
  };

  if (_pareceListaSimple(src)) {
    const compiledList = _compilarDesdeListaFrases(src);
    if (compiledList) return compiledList;
  }

  try {
    return new RegExp(src, "i");
  } catch (_) {
    const compiledList = _compilarDesdeListaFrases(src);
    if (compiledList) return compiledList;
    return null;
  }
}

function _compilarRegexFlexible(raw = "", fallback = "") {
  const src = String(raw || "").trim();
  const fb = String(fallback || "").trim();
  if (!src && !fb) return null;
  const _compilarDesdeListaFrases = (v = "") => {
    const frases = String(v || "")
      .split(/[\n,;]+/g)
      .map((s) => _normalizarTexto(s).trim())
      .filter(Boolean);
    if (!frases.length) return null;
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const body = frases.map((f) => esc(f)).join("|");
    if (!body) return null;
    try { return new RegExp(`(?:${body})`, "i"); } catch (_) { return null; }
  };
  const _pareceListaSimple = (v = "") => {
    const t = String(v || "").trim();
    if (!t) return false;
    const tieneSeparadores = /[,;\n]/.test(t);
    const metacaracteres = /[()[\]{}+*^$|\\]/.test(t);
    return tieneSeparadores && !metacaracteres;
  };

  if (_pareceListaSimple(src)) {
    const listRx = _compilarDesdeListaFrases(src);
    if (listRx) return listRx;
  }
  try {
    return src ? new RegExp(src, "i") : null;
  } catch (_) {
    const listRx = _compilarDesdeListaFrases(src);
    if (listRx) return listRx;
    if (!fb) return null;
    try { return new RegExp(fb, "i"); } catch (_) { return null; }
  }
}

function _matchComando(key = "", texto = "", defaultRegex = "") {
  const rx = _obtenerRegexComando(key, defaultRegex);
  if (!rx) return null;
  return String(texto || "").match(rx);
}

function _listarComandosConfigurados(predicate = () => true) {
  const cfg = _leerConfigComandosVoz();
  return Object.entries(cfg || {})
    .map(([key, row]) => ({ key, row: row || {} }))
    .filter(({ row }) => row && typeof row === "object" && row.enabled !== false && row.deleted !== true)
    .filter(predicate);
}

function _matchComandoPorTarget(fnName = "", target = "", texto = "") {
  const entries = _listarComandosConfigurados(({ row }) =>
    _normalizarFnComandoVoz(String(row.fn || "").trim()) === fnName && String(row.target || "").trim() === target
  );
  for (const { key, row } of entries) {
    const src = String(row.regex || "").trim();
    if (!src) continue;
    const rx = _compilarRegexFlexible(src);
    if (!rx) continue;
    const m = String(texto || "").match(rx);
    if (m) return m;
  }
  return null;
}

function _hayComandosVozActivos() {
  return _listarComandosConfigurados(({ row }) => String(row.regex || "").trim()).length > 0;
}

function _tieneComandoActivo(key = "") {
  const cfg = _leerConfigComandosVoz();
  const row = cfg?.[key];
  if (!row || typeof row !== "object") return false;
  if (row.deleted === true || row.enabled === false) return false;
  return !!String(row.regex || "").trim();
}

function _requiereWakeWord() {
  return _tieneComandoActivo("wake_charly");
}

function _targetComando(key = "", fallback = "") {
  const cfg = _leerConfigComandosVoz();
  const t = String(cfg?.[key]?.target || "").trim();
  return t || fallback;
}

function _nombreComando(key = "", fallback = "") {
  const cfg = _leerConfigComandosVoz();
  const n = String(cfg?.[key]?.name || "").trim();
  return n || fallback;
}

function _debeResponderComando(key = "", fallback = false) {
  const cfg = _leerConfigComandosVoz();
  const row = cfg?.[key];
  if (row && typeof row.speak === "boolean") return row.speak;
  return fallback;
}

function _leerCampoSiguienteComando(row = {}, field = "next") {
  const aliases = {
    next: ["next", "next_ok", "nextOk"],
    next_yes: ["next_yes", "nextYes", "next_si", "nextSi"],
    next_no: ["next_no", "nextNo"],
    next_cancel: ["next_cancel", "nextCancel", "next_cancelar", "nextCancelar"],
    next_error: ["next_error", "nextError"]
  };
  const keys = Array.isArray(aliases[field]) ? aliases[field] : [field];
  for (const key of keys) {
    const value = String(row?.[key] || "").trim();
    if (value) return value;
  }
  return "";
}

function _resolverSiguienteComandoPorResultado(row = {}, resultado = "ok", options = {}) {
  const fallbackToNext = options?.fallbackToNext !== false;
  const norm = _normalizarTexto(String(resultado || "ok"));
  const fallback = () => (fallbackToNext ? _leerCampoSiguienteComando(row, "next") : "");
  if (norm === "si" || norm === "sí" || norm === "yes" || norm.startsWith("afirm")) {
    return _leerCampoSiguienteComando(row, "next_yes") || fallback();
  }
  if (norm === "no" || norm.startsWith("neg")) {
    return _leerCampoSiguienteComando(row, "next_no") || fallback();
  }
  if (norm.startsWith("cancel") || norm.startsWith("abort") || norm.startsWith("stop")) {
    return _leerCampoSiguienteComando(row, "next_cancel") || fallback();
  }
  if (norm.startsWith("error") || norm.startsWith("fail") || norm.startsWith("falla") || norm.startsWith("fallo")) {
    return _leerCampoSiguienteComando(row, "next_error") || fallback();
  }
  return _leerCampoSiguienteComando(row, "next");
}

async function _ejecutarSiguienteComandoPorResultado(commandKey = "", row = {}, resultado = "ok", textoNorm = "", visitedSeed = null, options = {}) {
  const spec = _resolverSiguienteComandoPorResultado(row, resultado, options);
  if (!spec) return false;
  const visited = visitedSeed instanceof Set ? new Set(visitedSeed) : new Set();
  if (commandKey) visited.add(`cmd:${commandKey}`);
  await _ejecutarCadenaPostComando(spec, textoNorm, visited, resultado);
  return true;
}

function _debeResponderPorFuncion(fnName = "", fallback = false) {
  const wanted = _normalizarFnComandoVoz(String(fnName || "").trim());
  if (!wanted) return fallback;
  const entries = _listarComandosConfigurados(({ row }) =>
    _normalizarFnComandoVoz(String(row.fn || "").trim()) === wanted
  );
  if (!entries.length) return fallback;
  // Si existe al menos un comando activo para esta función con speak=true, responder.
  // Si todos están en false, permanecer en silencio.
  return entries.some(({ row }) => row?.speak === true);
}

function _valorComandoDesdeMatch(textoNorm = "", matchObj = null) {
  if (matchObj?.[1]) return String(matchObj[1]).trim();
  if (!matchObj || typeof matchObj.index !== "number") return "";
  const idxEnd = Number(matchObj.index) + String(matchObj[0] || "").length;
  const rest = String(textoNorm || "").slice(idxEnd).trim();
  if (!rest) return "";
  return rest.split(/\b(?:y|ademas|además|luego|despues|después)\b|[,;]+/i)[0].trim();
}

function _normalizarFnComandoVoz(fn = "") {
  const raw = String(fn || "").trim();
  if (raw.startsWith("custom:")) {
    const id = raw.slice("custom:".length).trim();
    const meta = _leerMetaComandosVoz();
    const found = Array.isArray(meta?.customFunctions)
      ? meta.customFunctions.find((it) => String(it?.id || "").trim() === id)
      : null;
    if (found?.baseFn) return _normalizarFnComandoVoz(found.baseFn);
    return raw;
  }
  const low = _normalizarTexto(raw);
  const map = {
    "_clickbuttonbyid": "_clickButtonById",
    "click boton": "_clickButtonById",
    "_manejarparametrosunidadporvoz": "_manejarParametrosUnidadPorVoz",
    "cambiar campo": "_manejarParametrosUnidadPorVoz",
    "_setinputbyvoice": "_setInputByVoice",
    "escribir/dictar campo": "_setInputByVoice",
    "escribir/dictado campo": "_setInputByVoice",
    "escribir dictar campo": "_setInputByVoice",
    "escribir dictado campo": "_setInputByVoice",
    "_setselectbyvoice": "_setSelectByVoice",
    "seleccionar opcion": "_setSelectByVoice",
    "_togglecheckboxbyvoice": "_toggleCheckboxByVoice",
    "marcar/desmarcar checkbox": "_toggleCheckboxByVoice",
    "_settablasecuenciacheckboxbyvoice": "_setTablaSecuenciaCheckboxByVoice",
    "seleccionar checkbox tabla secuencia": "_setTablaSecuenciaCheckboxByVoice",
    "_settablasecuencianumeroactividadesbyvoice": "_setTablaSecuenciaNumeroActividadesByVoice",
    "cambiar # actividades tabla secuencia": "_setTablaSecuenciaNumeroActividadesByVoice",
    "_selectlecturatablabytext": "_selectLecturaTablaByText",
    "seleccionar lectura en tabla": "_selectLecturaTablaByText",
    "_opengeminiinstruccionesbycategoria": "_openGeminiInstruccionesByCategoria",
    "abrir instrucciones gemini (categoria)": "_openGeminiInstruccionesByCategoria",
    "_generarcategoriabyvoice": "_generarCategoriaByVoice",
    "generar seccion/categoria": "_generarCategoriaByVoice",
    "_openmodalbyid": "_openModalById",
    "abrir modal": "_openModalById",
    "_closemodalbyid": "_closeModalById",
    "cerrar modal": "_closeModalById",
    "_continuarrespondiendo": "_continuarRespondiendo",
    "continuar respondiendo": "_continuarRespondiendo",
    "_buscarlecturaporvoz": "_buscarLecturaPorVoz",
    "buscar lectura": "_buscarLecturaPorVoz",
    "_leerlecturaporvoz": "_leerLecturaPorVoz",
    "leer lectura": "_leerLecturaPorVoz",
    "buscar y leer lectura": "_leerLecturaPorVoz",
    "buscar lectura y leer": "_leerLecturaPorVoz",
    "leer lectura asc": "_leerLecturaPorVoz",
    "leer lectura nueva": "_leerLecturaPorVoz",
    "_verlecturaporvoz": "_verLecturaPorVoz",
    "ver lectura": "_verLecturaPorVoz",
    "abrir lectura": "_verLecturaPorVoz",
    "mostrar lectura": "_verLecturaPorVoz",
    "_editarlecturaporvoz": "_editarLecturaPorVoz",
    "editar lectura": "_editarLecturaPorVoz",
    "edita lectura": "_editarLecturaPorVoz",
    "_exportarlecturawordporvoz": "_exportarLecturaWordPorVoz",
    "exportar lectura word": "_exportarLecturaWordPorVoz",
    "descargar lectura word": "_exportarLecturaWordPorVoz",
    "exportar word lectura": "_exportarLecturaWordPorVoz",
    "descargar word lectura": "_exportarLecturaWordPorVoz",
    "_noopcomandovoz": "_noopComandoVoz"
  };
  return map[low] || raw;
}

function _esComandoFinalizarPlatica(norm = "") {
  const t = _normalizarTexto(norm);
  if (!t) return false;
  return /\b(finaliza|finalizar|termina|terminar|acaba|acabar|cerrar)\s+(?:la\s+)?(?:platica|plática|conversacion|conversación|charla)\b/.test(t)
    || /\b(deja\s+de\s+responder|ya\s+no\s+respondas|no\s+respondas)\b/.test(t);
}

function _setRespuestaContinuaActiva(activa = false) {
  voiceRespuestaContinuaActiva = !!activa;
  if (!voiceRespuestaContinuaActiva) {
    voicePendingInputCapture = null;
    charlyLecturaContextoConversacion = null;
    charlyLecturaAnalisisState = null;
    _detenerLecturaCompletaCharly();
  }
}

function _esComandoDetenerLectura(texto = "") {
  const t = _normalizarTexto(texto);
  if (!t) return false;
  return /\b(detente|deten(te)?|detener|para|parar|alto|stop)\b/.test(t)
    && /\b(lectura|leer|leyendo|charly)?\b/.test(t);
}

function _esComandoContinuarLectura(texto = "") {
  const t = _normalizarTexto(texto);
  if (!t) return false;
  return /\b(continua|continúa|continuar|sigue|seguir|prosigue|reanuda)\b/.test(t)
    && /\b(lectura|leer|leyendo|charly)?\b/.test(t);
}

function _detenerLecturaCompletaCharly(options = {}) {
  const clearResume = options?.clearResume === true;
  const lecturaFinalizada = options?.completed === true;
  const restoreVoice = options?.restoreVoice !== false;
  if (!clearResume && charlyLecturaPlan && Array.isArray(charlyLecturaPlan.chunks)) {
    const idx = Number(charlyLecturaPlan.index || 0);
    if (idx >= 0 && idx < charlyLecturaPlan.chunks.length) {
      charlyLecturaPlanPausada = {
        ...charlyLecturaPlan,
        index: idx,
        pausedAt: Date.now()
      };
    }
  } else if (clearResume) {
    charlyLecturaPlanPausada = null;
  }
  charlyLecturaEnCurso = false;
  geminiLiveMicUploadPaused = false;
  charlyLecturaPlan = null;
  charlyLecturaLastAdvanceAt = 0;
  if (charlyLecturaNextChunkTimer) {
    clearTimeout(charlyLecturaNextChunkTimer);
    charlyLecturaNextChunkTimer = null;
  }
  if (charlyLecturaReconnectTimer) {
    clearTimeout(charlyLecturaReconnectTimer);
    charlyLecturaReconnectTimer = null;
  }
  geminiLiveAllowOutputUntil = 0;
  try { _limpiarAudioGeminiProgramado(); } catch (_) { }
  try {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch (_) {
    // noop
  }
  const restauro = restoreVoice ? _restaurarAjustesVozLecturaTemporales() : false;
  if (restauro && unidadVoiceShouldRun) {
    _programarReinicioLivePorCambioVoz();
  }
  if (lecturaFinalizada) {
    _preguntarContinuacionPreguntasLectura();
  }
  _emitirEstadoLecturaLive();
}

async function _reanudarLecturaCompletaCharly() {
  const plan = charlyLecturaPlanPausada;
  if (!plan || !Array.isArray(plan.chunks) || !plan.chunks.length) return false;
  const idx = Number(plan.index || 0);
  if (idx < 0 || idx >= plan.chunks.length) return false;
  _aplicarAjustesVozLecturaTemporales();
  if (!geminiLiveSessionUnidad || !geminiLiveIsOpen) {
    try { await iniciarGeminiLiveUnidad({ withMic: false, forceRestart: true }); } catch (_) { }
  }
  if (!geminiLiveSessionUnidad || !geminiLiveIsOpen) return false;
  charlyLecturaPlan = {
    ...plan,
    index: idx,
    token: Number(plan.token || 0)
  };
  charlyLecturaPlanPausada = null;
  charlyLecturaEnCurso = true;
  charlyLecturaLastAdvanceAt = 0;
  geminiLiveMicUploadPaused = true;
  _emitirEstadoLecturaLive();
  return _enviarBloqueLecturaActual();
}

function _normalizarTextoLecturaParaVoz(texto = "") {
  return _formatearLecturaTextoBase(String(texto || ""))
    .replace(/\n{2,}/g, "\n\n");
}

function _inferirEmocionLectura(texto = "") {
  const ajustes = _leerAjustesVozLecturaDesdeThemeSettings();
  if (ajustes?.mood && ajustes.mood !== "narrativo") return ajustes.mood;
  const t = _normalizarTexto(texto);
  if (/\b(triste|llor|miedo|oscuro|perdio|perdió)\b/i.test(t)) return "tierno y empático";
  if (/\b(aventura|descubr|sorpresa|emocion|emoción)\b/i.test(t)) return "entusiasta y narrativo";
  if (/\b(enoj|conflict|peligro)\b/i.test(t)) return "tenso pero claro";
  return "cálido y expresivo";
}

function _etiquetasLecturaParaLive(emocion = "") {
  const e = _normalizarTexto(emocion);
  if (e.includes("narrativo")) return "[newscast-formal] [short pause]";
  if (e.includes("calido") || e.includes("cálido")) return "[empathetic]";
  if (e.includes("alegre")) return "[excited] [laughing]";
  if (e.includes("curioso")) return "[excited] [short pause]";
  if (e.includes("misterioso")) return "[whispering] [speaking slowly]";
  if (e.includes("suspenso")) return "[worried] [speaking slowly]";
  if (e.includes("epico") || e.includes("épico")) return "[confident] [newscast-formal]";
  if (e.includes("dramatico") || e.includes("dramático")) return "[worried] [short pause]";
  if (e.includes("tierno")) return "[empathetic] [speaking slowly]";
  if (e.includes("empatic") || e.includes("tierno")) return "[empathetic] [speaking slowly]";
  if (e.includes("entusiasta") || e.includes("narrativo")) return "[excited]";
  if (e.includes("tenso") || e.includes("peligro")) return "[worried]";
  return "[empathetic]";
}

function _instruccionProsodiaLecturaActual() {
  return `${_descripcionMoodCharly(charlyVoiceMood)}, ${_descripcionVelocidadCharly(charlyVoiceSpeed)}, ${_descripcionTonoCharly(charlyVoicePitch)}`;
}

function _trocearLecturaParaLive(texto = "", maxLen = 1100) {
  const raw = String(texto || "").trim();
  if (!raw) return [];
  const paragraphs = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  paragraphs.forEach((p) => {
    if (p.length <= maxLen) {
      chunks.push(p);
      return;
    }
    const sentences = p.split(/(?<=[.!?…])\s+/).filter(Boolean);
    let current = "";
    sentences.forEach((s) => {
      if (!current) {
        current = s;
        return;
      }
      if ((current.length + 1 + s.length) <= maxLen) {
        current += ` ${s}`;
      } else {
        chunks.push(current.trim());
        current = s;
      }
    });
    if (current.trim()) chunks.push(current.trim());
  });
  return chunks.filter(Boolean);
}

function _acelerarPrimerBloqueLectura(chunks = []) {
  const items = Array.isArray(chunks) ? chunks.filter(Boolean) : [];
  if (!items.length) return [];
  const first = String(items[0] || "").trim();
  if (!first || first.length <= 420) return items;
  const sentences = first.split(/(?<=[.!?…])\s+/).filter(Boolean);
  if (sentences.length < 2) return items;
  let primerBloque = "";
  let idxCorte = 0;
  for (let i = 0; i < sentences.length; i += 1) {
    const next = primerBloque ? `${primerBloque} ${sentences[i]}` : sentences[i];
    if (next.length > 420 && primerBloque) break;
    primerBloque = next;
    idxCorte = i + 1;
    if (primerBloque.length >= 280) break;
  }
  const resto = sentences.slice(idxCorte).join(" ").trim();
  if (!primerBloque || !resto) return items;
  return [primerBloque.trim(), resto, ...items.slice(1)].filter(Boolean);
}

function _estadoLecturaLiveActual(ref = null) {
  const actual = ref?.id ? ref : _leerReferenciaLecturaActual();
  const sameRef = !!(
    actual?.id
    && actual?.coleccion
    && charlyLecturaRefActual?.id === actual.id
    && charlyLecturaRefActual?.coleccion === actual.coleccion
  );
  if (sameRef && charlyLecturaStartPromise) return "starting";
  if (sameRef && charlyLecturaEnCurso) return "playing";
  if (sameRef && charlyLecturaPlanPausada) return "paused";
  return "idle";
}

function _emitirEstadoLecturaLive(ref = null) {
  try {
    const lectura = ref?.id ? ref : _leerReferenciaLecturaActual();
    window.dispatchEvent(new CustomEvent(CHARLY_LECTURA_LIVE_STATE_EVENT, {
      detail: {
        ref: lectura ? { ...lectura } : null,
        state: _estadoLecturaLiveActual(lectura)
      }
    }));
  } catch (_) {
    // noop
  }
}

function _programarAvanceLectura(ms = 12000, token = 0) {
  if (charlyLecturaNextChunkTimer) clearTimeout(charlyLecturaNextChunkTimer);
  charlyLecturaNextChunkTimer = setTimeout(() => {
    charlyLecturaNextChunkTimer = null;
    if (!charlyLecturaEnCurso || !charlyLecturaPlan) return;
    if (Number(charlyLecturaPlan.token || 0) !== Number(token || 0)) return;
    _avanzarLecturaCompletaCharly("timer");
  }, Math.max(3000, Number(ms) || 12000));
}

function _aplicarAjustesVozLecturaTemporales() {
  const ajustes = _leerAjustesVozLecturaDesdeThemeSettings();
  if (!ajustes || ajustes.useCharlyVoice) return false;
  if (!charlyLecturaVoiceRestoreState) {
    charlyLecturaVoiceRestoreState = {
      voiceName: charlyTtsVoiceName,
      speed: charlyVoiceSpeed,
      pitch: charlyVoicePitch,
      mood: charlyVoiceMood,
      locale: charlyVoiceLocale
    };
  }
  charlyTtsVoiceName = ajustes.voiceName || charlyTtsVoiceName;
  charlyVoiceSpeed = ajustes.speed;
  charlyVoicePitch = ajustes.pitch;
  charlyVoiceMood = ajustes.mood || charlyVoiceMood;
  charlyVoiceLocale = ajustes.locale || charlyVoiceLocale;
  return true;
}

function _restaurarAjustesVozLecturaTemporales() {
  if (!charlyLecturaVoiceRestoreState) return false;
  charlyTtsVoiceName = charlyLecturaVoiceRestoreState.voiceName || charlyTtsVoiceName;
  charlyVoiceSpeed = charlyLecturaVoiceRestoreState.speed;
  charlyVoicePitch = charlyLecturaVoiceRestoreState.pitch;
  charlyVoiceMood = charlyLecturaVoiceRestoreState.mood || charlyVoiceMood;
  charlyVoiceLocale = charlyLecturaVoiceRestoreState.locale || charlyVoiceLocale;
  charlyLecturaVoiceRestoreState = null;
  return true;
}

function _construirTextoPreguntasComprension(preguntas = [], titulo = "") {
  const items = Array.isArray(preguntas) ? preguntas : [];
  if (!items.length) return "";
  const encabezado = `Ahora leeré las preguntas de comprensión de ${titulo || "la lectura"}.`;
  const cuerpo = items.map((p, idx) => {
    const texto = String(p?.texto || p?.pregunta || p || "").trim();
    if (!texto) return "";
    return `Pregunta ${idx + 1}. ${texto}`;
  }).filter(Boolean).join("\n\n");
  return `${encabezado}\n\n${cuerpo}`.trim();
}

function _preguntarContinuacionPreguntasLectura() {
  if (!charlyLecturaPreguntasPendientes?.texto) return;
  charlyLecturaPreguntasPendientes.awaitingConfirm = true;
  charlyLecturaPreguntasPendientes.expiresAt = Date.now() + 45000;
  hablarUnidad("Terminé la lectura. ¿Deseas que continúe con las preguntas de comprensión?", {
    cancelarPrevio: true,
    preferLive: true
  });
}

function _programarReconectarLecturaLive(_motivo = "") {
  if (!charlyLecturaEnCurso || charlyLecturaReconnectTimer) return;
  _emitirEstadoLecturaLive();
  charlyLecturaReconnectTimer = setTimeout(() => {
    charlyLecturaReconnectTimer = null;
    if (!charlyLecturaEnCurso) return;
    iniciarGeminiLiveUnidad({ withMic: false, forceRestart: true })
      .then(() => {
        if (charlyLecturaEnCurso) _enviarBloqueLecturaActual();
      })
      .catch((err) => {
        logVisual(`⚠️ No se pudo reconectar Live para la lectura: ${err?.message || "sin detalle"}`);
        _programarReconectarLecturaLive("retry");
      });
  }, 700);
}

function _enviarBloqueLecturaActual() {
  if (!charlyLecturaEnCurso || !charlyLecturaPlan || !geminiLiveSessionUnidad || !geminiLiveIsOpen) {
    _programarReconectarLecturaLive("sin_sesion");
    return true;
  }
  const plan = charlyLecturaPlan;
  if (plan.index >= plan.chunks.length) {
    _detenerLecturaCompletaCharly();
    return true;
  }
  const chunk = String(plan.chunks[plan.index] || "").trim();
  if (!chunk) {
    plan.index += 1;
    return _enviarBloqueLecturaActual();
  }
  const bloqueNum = plan.index + 1;
  const total = plan.chunks.length;
  const words = chunk.split(/\s+/).filter(Boolean).length;
  plan.chunkHadOutput = false;
  plan.lastChunkSentAt = Date.now();
  const esPrimerBloque = bloqueNum === 1;
  const ventanaMs = esPrimerBloque
    ? Math.max(6000, Math.min(16000, words * 185 + 1800))
    : Math.max(12000, Math.min(32000, words * 260 + 3200));
  plan.token = (Number(plan.token || 0) + 1);
  geminiLiveAllowOutputUntil = Date.now() + ventanaMs + 2500;
  _programarAvanceLectura(ventanaMs + 1200, plan.token);
  const sent = _safeSendClientContent({
    turns: [{
      role: "user",
      parts: [{
        text:
          `Lee en voz alta este bloque ${bloqueNum} de ${total} de forma literal.\n` +
          `No resumas, no omitas frases y no cambies palabras.\n` +
          `Usa ${_instruccionProsodiaLecturaActual()}.\n` +
          `Mantén emoción ${plan.emocion}, ritmo narrativo y pausas cortas entre párrafos.\n` +
          `${_guiaEtiquetasLiveCharly()}\n` +
          `Prefija este bloque con: ${_etiquetasLecturaParaLive(plan.emocion)}.\n` +
          `Respeta puntuación, puntos y seguido, puntos y aparte, y signos sin cortar ideas.\n` +
          `Cuando termines este bloque, detente sin comentarios extra.\n` +
          `No agregues comentarios extra.\n` +
          `Título de la lectura: ${plan.title || "Lectura"}.\n` +
          `Bloque:\n${chunk}`
      }]
    }],
    turnComplete: true
  }, "ws_closed_lectura");
  if (!sent) {
    _programarReconectarLecturaLive("send_failed");
    return true;
  }
  return true;
}

function _avanzarLecturaCompletaCharly(source = "") {
  if (!charlyLecturaEnCurso || !charlyLecturaPlan) return;
  const now = Date.now();
  if ((now - charlyLecturaLastAdvanceAt) < 700) return;
  charlyLecturaLastAdvanceAt = now;
  if (charlyLecturaNextChunkTimer) {
    clearTimeout(charlyLecturaNextChunkTimer);
    charlyLecturaNextChunkTimer = null;
  }
  charlyLecturaPlan.index += 1;
  if (charlyLecturaPlan.index >= charlyLecturaPlan.chunks.length) {
    _detenerLecturaCompletaCharly({ completed: true });
    return;
  }
  setTimeout(() => {
    if (!charlyLecturaEnCurso) return;
    _enviarBloqueLecturaActual();
  }, source === "turnComplete" ? 120 : 260);
}

function _iniciarLecturaCompletaCharly(texto = "", titulo = "", confirmacion = "") {
  if (!geminiLiveSessionUnidad) return false;
  const limpio = _normalizarTextoLecturaParaVoz(texto);
  if (!limpio) return false;
  const chunks = _acelerarPrimerBloqueLectura(_trocearLecturaParaLive(limpio, 1100));
  if (!chunks.length) return false;
  _detenerLecturaCompletaCharly({ clearResume: true, restoreVoice: false });
  geminiLiveMicUploadPaused = true;
  charlyLecturaPlan = {
    title: String(titulo || "Lectura").trim() || "Lectura",
    confirmacion: String(confirmacion || "").trim(),
    emocion: _inferirEmocionLectura(limpio),
    chunks,
    index: 0,
    token: 0
  };
  charlyLecturaEnCurso = true;
  charlyLecturaLastAdvanceAt = 0;
  charlyLecturaPlanPausada = null;
  if (charlyLecturaReconnectTimer) {
    clearTimeout(charlyLecturaReconnectTimer);
    charlyLecturaReconnectTimer = null;
  }
  _emitirEstadoLecturaLive();
  return _enviarBloqueLecturaActual();
}

function _continuarRespondiendoByVoiceTarget(target = "", valor = "", textoNorm = "") {
  const t = _normalizarTexto(`${target} ${valor} ${textoNorm}`);
  const off = /\b(off|desactivar|desactiva|detener|deten|apaga|finaliza|finalizar|termina|terminar|cancelar)\b/.test(t);
  const activar = !off;
  _setRespuestaContinuaActiva(activar);
  if (activar) {
    if (!unidadVoiceShouldRun) {
      unidadVoiceShouldRun = true;
      actualizarEstadoBotonVozUnidad();
      iniciarEscuchaVozUnidad();
    }
  }
  if (activar && !geminiLiveSessionUnidad) {
    iniciarGeminiLiveUnidad().catch((err) => {
      logVisual(`⚠️ No se pudo iniciar Live para conversación continua: ${err?.message || "sin detalle"}`);
    });
  }
  return true;
}

function _preferenciaColeccionLecturaDesdeTexto(texto = "") {
  const t = _normalizarTexto(texto);
  if (!t) return "";
  const tokenized = t.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const compact = tokenized.replace(/\s+/g, "");
  const ascAlias = /\b(asc|ask|asq|a\s+s\s+[ckq]|a\s+ese\s+(?:ce|c|que|q|ka|k)|miticas|míticas|vieja|viejas|historica|histórica|historicas|históricas|primeras)\b/;
  if (ascAlias.test(tokenized) || /\ba\W*s\W*[ckq]\b/.test(String(texto || "").toLowerCase()) || compact.includes("lecturaasc") || compact.includes("lecturasasc")) return "lecturasASC";
  if (/\b(nueva|nuevas|reciente|recientes|charly[-\s]?brown)\b/.test(tokenized)) return "lecturasNuevas";
  return "";
}

function _coleccionLecturaVisibleActiva() {
  const ascModalEl = document.getElementById("ascModal");
  const nuevasModalEl = document.getElementById("modalLecturasNuevas");
  const ascVisible = typeof modalAcopladoVisible === "function"
    ? modalAcopladoVisible(ascModalEl)
    : !!(ascModalEl && !ascModalEl.classList.contains("hidden") && window.getComputedStyle(ascModalEl).display !== "none");
  const nuevasVisible = typeof modalAcopladoVisible === "function"
    ? modalAcopladoVisible(nuevasModalEl)
    : !!(nuevasModalEl && nuevasModalEl.style.display !== "none" && window.getComputedStyle(nuevasModalEl).display !== "none");
  if (ascVisible && !nuevasVisible) return "lecturasASC";
  if (nuevasVisible && !ascVisible) return "lecturasNuevas";
  return "";
}

function _etiquetaColeccionLecturas(coleccion = "") {
  return String(coleccion || "").trim() === "lecturasASC"
    ? "lecturas ASC"
    : "lecturas nuevas de Charly";
}

function _resolverAccionSobreLectura(texto = "") {
  const t = _normalizarTexto(texto);
  if (!t) return "";
  if (/\b(leer|lee|lectura completa|leer completa|leer la lectura completa)\b/.test(t)) return "leer";
  if (/\b(ver|abre|abrir|mostrar|muestrame|muéstrame)\b/.test(t)) return "ver";
  if (/\b(editar|edita|modificar|modifica)\b/.test(t)) return "editar";
  if (/\b(exportar|exporta|descargar|descarga)\b/.test(t) && /\b(word|docx)\b/.test(t)) return "word";
  if (/\b(resumen|resumir|resume)\b/.test(t)) return "resumen";
  if (/\b(profundizar|profundiza|profundo)\b/.test(t)) return "profundizar";
  if (/\b(analiza|analizar|analisis|análisis)\b/.test(t)) return "analiza";
  if (/\b(crear|crea|generar|genera|haz|hacer)\b/.test(t) && /\bunidad\b/.test(t)) return "crear_unidad";
  return "";
}

function _resumenLocalLectura(texto = "", maxOraciones = 3) {
  const clean = _formatearLecturaTextoBase(String(texto || ""));
  if (!clean) return "";
  const parts = clean.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
  return parts.slice(0, Math.max(1, Number(maxOraciones) || 3)).join(" ").trim();
}

function _resumenExtractivoLectura(texto = "", maxOraciones = 4) {
  const clean = _formatearLecturaTextoBase(_limpiarSeccionesLecturaNoNarrables(String(texto || "")));
  if (!clean) return "";
  const limit = Math.max(2, Math.min(6, Number(maxOraciones) || 4));
  const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const sentenceSplit = (chunk = "") => String(chunk || "")
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 18);
  const allSentences = sentenceSplit(clean);
  if (!allSentences.length) {
    return clean.split(/\n+/).map((s) => s.trim()).filter(Boolean).slice(0, limit).join(" ").trim();
  }
  const selected = [];
  const pushUnique = (value = "") => {
    const v = String(value || "").trim();
    if (!v) return;
    const norm = _normalizarTexto(v).slice(0, 140);
    if (!norm) return;
    if (selected.some((it) => _normalizarTexto(it).slice(0, 140) === norm)) return;
    selected.push(v);
  };

  if (paragraphs.length >= 3) {
    const first = sentenceSplit(paragraphs[0])[0] || "";
    const middle = sentenceSplit(paragraphs[Math.floor(paragraphs.length / 2)])[0] || "";
    const lastChunk = sentenceSplit(paragraphs[paragraphs.length - 1]);
    const last = lastChunk[lastChunk.length - 1] || lastChunk[0] || "";
    pushUnique(first);
    pushUnique(middle);
    pushUnique(last);
  } else {
    pushUnique(allSentences[0]);
    if (allSentences.length > 2) pushUnique(allSentences[Math.floor(allSentences.length / 2)]);
    if (allSentences.length > 1) pushUnique(allSentences[allSentences.length - 1]);
  }

  for (const sentence of allSentences) {
    if (selected.length >= limit) break;
    pushUnique(sentence);
  }

  return selected.slice(0, limit).join(" ").trim();
}

function _normalizarResumenSalida(texto = "") {
  return String(texto || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[-*•]\s*/gm, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function _resumenLecturaConGemini(texto = "", titulo = "") {
  const clean = _formatearLecturaTextoBase(_limpiarSeccionesLecturaNoNarrables(String(texto || "")));
  if (!clean || clean.length < 260) return "";
  const safeText = clean.slice(0, 14000);
  const safeTitle = String(titulo || "Lectura").trim() || "Lectura";
  const prompt = [
    "Resume la lectura en español de forma clara y fiel al contenido.",
    "Escribe entre 4 y 6 oraciones en un solo párrafo.",
    "Incluye tema central, 2 ideas clave y cierre.",
    "No uses viñetas, títulos ni prefijos como 'Resumen:'.",
    `Título: ${safeTitle}.`,
    "Lectura:",
    safeText
  ].join("\n");
  try {
    const raw = await enviarPrompt([{ role: "user", text: prompt }]);
    const normalized = _normalizarResumenSalida(raw);
    if (!normalized || normalized.length < 60) return "";
    const canonSummary = _normalizarTexto(normalized).slice(0, 120);
    const canonSourceStart = _normalizarTexto(safeText).slice(0, 120);
    if (canonSummary && canonSummary === canonSourceStart) return "";
    return normalized;
  } catch (_) {
    return "";
  }
}

async function _obtenerResumenLectura(texto = "", titulo = "") {
  const clean = _formatearLecturaTextoBase(_limpiarSeccionesLecturaNoNarrables(String(texto || "")));
  if (!clean) return "";
  const geminiSummary = await _resumenLecturaConGemini(clean, titulo);
  if (geminiSummary) return geminiSummary;
  const local = _resumenExtractivoLectura(clean, 4) || _resumenLocalLectura(clean, 4);
  return local;
}

async function _iniciarLecturaDesdeRef(ref = null) {
  const docLectura = await _cargarLecturaParaLive(ref);
  if (!docLectura) return false;
  _guardarLecturaCache(docLectura);
  return _iniciarLecturaDesdeCache(_construirLecturaCache(docLectura));
}

window.cbLeerLecturaConGeminiLive = async function cbLeerLecturaConGeminiLive(ref = {}) {
  const id = String(ref?.id || "").trim();
  const coleccion = String(ref?.coleccion || "").trim();
  if (!id || !coleccion) return false;
  if (charlyLecturaStartPromise) return charlyLecturaStartPromise;
  unidadVoiceShouldRun = true;
  charlyAwake = true;
  _guardarReferenciaLecturaActual({ id, coleccion });
  charlyColeccionActiva = coleccion;
  logVisual(`📖 Iniciando lectura Live de ${_etiquetaColeccionLecturas(coleccion)}...`);
  _emitirEstadoLecturaLive({ id, coleccion });
  charlyLecturaStartPromise = (async () => {
    let docLectura = null;
    try {
      docLectura = await _cargarLecturaParaLive({ id, coleccion });
      if (!docLectura) {
        logVisual("⚠️ No encontré la lectura para iniciar Live.");
        return false;
      }
      _guardarLecturaCache(docLectura);
      const started = await _iniciarLecturaDesdeCache(_construirLecturaCache(docLectura));
      if (started) {
        logVisual(`📚 Lectura Live iniciada con voz ${charlyTtsVoiceName || "predeterminada"}.`);
        _emitirEstadoLecturaLive({ id, coleccion });
        return true;
      }
      logVisual("⚠️ La sesión Live no respondió al primer intento. Reintentando una vez...");
      await iniciarGeminiLiveUnidad({ withMic: false, forceRestart: true });
      const retried = await _iniciarLecturaDesdeCache(_construirLecturaCache(docLectura));
      if (retried) {
        logVisual(`📚 Lectura Live reanudada con voz ${charlyTtsVoiceName || "predeterminada"}.`);
        _emitirEstadoLecturaLive({ id, coleccion });
        return true;
      }
      return false;
    } catch (err) {
      logVisual(`⚠️ No se pudo iniciar la lectura Live: ${err?.message || "sin detalle"}`);
      return false;
    } finally {
      charlyLecturaStartPromise = null;
      _emitirEstadoLecturaLive({ id, coleccion });
    }
  })();
  return charlyLecturaStartPromise;
};

window.cbGetLecturaGeminiLiveState = function cbGetLecturaGeminiLiveState(ref = {}) {
  const id = String(ref?.id || "").trim();
  const coleccion = String(ref?.coleccion || "").trim();
  if (!id || !coleccion) {
    return {
      ref: _leerReferenciaLecturaActual(),
      state: _estadoLecturaLiveActual()
    };
  }
  return {
    ref: { id, coleccion },
    state: _estadoLecturaLiveActual({ id, coleccion })
  };
};

window.cbControlLecturaGeminiLive = async function cbControlLecturaGeminiLive(ref = {}, options = {}) {
  const id = String(ref?.id || "").trim();
  const coleccion = String(ref?.coleccion || "").trim();
  if (!id || !coleccion) return { ok: false, state: "idle" };
  _guardarReferenciaLecturaActual({ id, coleccion });
  const state = _estadoLecturaLiveActual({ id, coleccion });
  const stopOnly = options?.stop === true;
  if (stopOnly) {
    _detenerLecturaCompletaCharly({ clearResume: true });
    _emitirEstadoLecturaLive({ id, coleccion });
    return { ok: true, state: "idle" };
  }
  if (state === "starting") return { ok: true, state };
  if (state === "playing") {
    _detenerLecturaCompletaCharly({ restoreVoice: false });
    _emitirEstadoLecturaLive({ id, coleccion });
    return { ok: true, state: "paused" };
  }
  if (state === "paused") {
    const ok = await _reanudarLecturaCompletaCharly();
    _emitirEstadoLecturaLive({ id, coleccion });
    return { ok, state: ok ? "playing" : "idle" };
  }
  const ok = await window.cbLeerLecturaConGeminiLive({ id, coleccion });
  return { ok, state: ok ? "playing" : "idle" };
};

function _activarConversacionSobreLectura(lectura = null, modo = "profundizar") {
  if (!lectura?.id) return false;
  const modoNorm = String(modo || "profundizar").trim() || "profundizar";
  charlyLecturaContextoConversacion = {
    id: String(lectura.id || "").trim(),
    coleccion: String(lectura.coleccion || lectura.sourceCollection || "").trim(),
    titulo: String(lectura.titulo || lectura.tema || "").trim(),
    contenidoCompleto: String(lectura.contenidoCompleto || "").trim(),
    modo: modoNorm
  };
  if (modoNorm !== "analiza") charlyLecturaAnalisisState = null;
  _setRespuestaContinuaActiva(true);
  return true;
}

function _preguntasAnaliticasBaseLectura(_titulo = "") {
  return [
    "¿Cuál es la idea central y qué parte del texto la sustenta mejor?",
    "¿Qué parte te parece poco clara, incoherente o contradictoria?",
    "¿Desde qué punto de vista está escrita la lectura y qué sesgo notas?",
    "¿Qué evidencia o ejemplos faltan para que el mensaje sea más sólido?",
    "¿Qué cambio concreto propones para mejorar claridad, orden o impacto?"
  ];
}

function _etiquetaPreguntaAnalisisLectura(state = null, idx = null) {
  const preguntas = Array.isArray(state?.preguntas) ? state.preguntas : [];
  if (!preguntas.length) return "";
  const total = preguntas.length;
  const safeIdx = Math.max(0, Math.min(Number(idx ?? state?.preguntaIndex ?? 0), total - 1));
  const pregunta = String(preguntas[safeIdx] || "").trim();
  if (!pregunta) return "";
  return `Pregunta ${safeIdx + 1} de ${total}: ${pregunta}`;
}

function _crearEstadoAnalisisLectura(lectura = null) {
  if (!lectura?.id) return null;
  const titulo = String(lectura.titulo || lectura.tema || "la lectura").trim() || "la lectura";
  const textoBase = _formatearLecturaTextoBase(
    _limpiarSeccionesLecturaNoNarrables(String(lectura.contenidoCompleto || ""))
  );
  const resumenBase = _resumenExtractivoLectura(textoBase, 4) || _resumenLocalLectura(textoBase, 3);
  return {
    lecturaId: String(lectura.id || "").trim(),
    coleccion: String(lectura.coleccion || lectura.sourceCollection || "").trim(),
    titulo,
    preguntas: _preguntasAnaliticasBaseLectura(titulo),
    preguntaIndex: 0,
    respuestas: [],
    resumenBase: String(resumenBase || "").trim().slice(0, 1400),
    extractoBase: String(textoBase || "").trim().slice(0, 2600),
    finalizada: false,
    startedAt: Date.now()
  };
}

function _iniciarAnalisisGuiadoLectura(lectura = null) {
  const ok = _activarConversacionSobreLectura(lectura, "analiza");
  if (!ok) return "";
  const state = _crearEstadoAnalisisLectura(lectura);
  if (!state) return "";
  charlyLecturaAnalisisState = state;
  const primera = _etiquetaPreguntaAnalisisLectura(state, 0);
  const total = Array.isArray(state.preguntas) ? state.preguntas.length : 5;
  return `Perfecto. Haré ${total} preguntas breves para revisar coherencia, incoherencias, punto de vista y mejoras. ${primera}`;
}

function _esSolicitudRepetirPreguntaAnalisis(textoNorm = "") {
  const t = _normalizarTexto(textoNorm);
  if (!t) return false;
  return /\b(repite|repetir|otra vez|de nuevo|cual era la pregunta|cu[aá]l era la pregunta|no entendi|no entend[ií]|no escuche|no escuch[eé])\b/.test(t);
}

function _esSolicitudReiniciarAnalisis(textoNorm = "") {
  const t = _normalizarTexto(textoNorm);
  if (!t) return false;
  return /\b(reinicia|reiniciar|empezar de nuevo|volver a empezar|otra ronda|nuevo analisis|nuevo análisis)\b/.test(t);
}

function _resumenRespuestasAnalisisLectura(state = null, maxItems = 5) {
  const respuestas = Array.isArray(state?.respuestas) ? state.respuestas : [];
  if (!respuestas.length) return "sin respuestas";
  return respuestas.slice(0, Math.max(1, Number(maxItems) || 5)).map((item, idx) => {
    const pregunta = String(item?.pregunta || "").replace(/\s+/g, " ").trim();
    const respuesta = String(item?.respuesta || "").replace(/\s+/g, " ").trim();
    return `${idx + 1}. ${pregunta}\nRespuesta: ${respuesta}`;
  }).join("\n\n");
}

function _cierreAnalisisLectura(state = null) {
  const respuestas = Array.isArray(state?.respuestas) ? state.respuestas : [];
  const pick = (idx, fallback = "sin dato claro") => {
    const value = String(respuestas[idx]?.respuesta || "").replace(/\s+/g, " ").trim();
    if (!value) return fallback;
    return value.slice(0, 180);
  };
  const coherencia = pick(0);
  const incoherencia = pick(1);
  const puntoVista = pick(2);
  const evidencia = pick(3);
  const mejora = pick(4);
  return `Cierre del análisis: coherencia, ${coherencia}; incoherencias, ${incoherencia}; punto de vista, ${puntoVista}; evidencia, ${evidencia}; mejora clave, ${mejora}. Si quieres, profundizamos en cualquiera de estos puntos.`;
}

function _enviarSeguimientoAnalisisLecturaGemini(pregunta = "", state = null) {
  if (!geminiLiveSessionUnidad || !geminiLiveIsOpen) return false;
  const q = String(pregunta || "").trim();
  if (!q) return false;
  const lectura = String(state?.titulo || "la lectura").trim() || "la lectura";
  const resumenBase = String(state?.resumenBase || "").trim().slice(0, 1200);
  const extractoBase = String(state?.extractoBase || "").trim().slice(0, 1800);
  const respuestas = _resumenRespuestasAnalisisLectura(state, 5);
  const memoria = _resumenMemoriaConversacion(900);
  geminiLiveAllowOutputUntil = Date.now() + 15000;
  return _safeSendClientContent({
    turns: [{
      role: "user",
      parts: [{
        text:
          `Actúa como analista de lectura en conversación por voz.\n` +
          `Responde en español, claro y directo, máximo 2 frases cortas.\n` +
          `Si detectas una mejora concreta, propón 1 acción puntual.\n` +
          `Lectura: ${lectura}.\n` +
          `Resumen base:\n${resumenBase || "sin resumen"}\n\n` +
          `Extracto base:\n${extractoBase || "sin extracto"}\n\n` +
          `Respuestas previas del usuario:\n${respuestas}\n\n` +
          `Historial reciente:\n${memoria || "sin historial"}\n\n` +
          `Mensaje del usuario:\n${q}`
      }]
    }],
    turnComplete: true
  }, "ws_closed_analisis_followup");
}

async function _manejarConversacionAnaliticaLectura(texto = "") {
  const q = String(texto || "").trim();
  const norm = _normalizarTexto(q);
  if (!q || !norm) return false;

  let state = charlyLecturaAnalisisState;
  if (!state && charlyLecturaContextoConversacion?.id) {
    state = _crearEstadoAnalisisLectura(charlyLecturaContextoConversacion);
    charlyLecturaAnalisisState = state;
  }
  if (!state) return false;

  if (_esRespuestaCancelarVoz(norm) || /\b(terminar|termina|cerrar|cierra)\s+(?:el\s+)?analisis\b/.test(norm)) {
    _setRespuestaContinuaActiva(false);
    hablarUnidad("Listo, cerré el análisis de lectura.", { cancelarPrevio: true, preferLive: true });
    return true;
  }

  if (_esSolicitudReiniciarAnalisis(norm)) {
    state.preguntaIndex = 0;
    state.respuestas = [];
    state.finalizada = false;
    const pregunta = _etiquetaPreguntaAnalisisLectura(state, 0) || "Empecemos con la idea central de la lectura.";
    hablarUnidad(`Reiniciamos el análisis. ${pregunta}`, { cancelarPrevio: true, preferLive: true });
    return true;
  }

  if (_esSolicitudRepetirPreguntaAnalisis(norm)) {
    const idx = state.finalizada
      ? Math.max(0, (Array.isArray(state.preguntas) ? state.preguntas.length : 1) - 1)
      : Number(state.preguntaIndex || 0);
    const pregunta = _etiquetaPreguntaAnalisisLectura(state, idx) || "Dime tu observación sobre la lectura.";
    hablarUnidad(pregunta, { cancelarPrevio: true, preferLive: true });
    return true;
  }

  if (!state.finalizada) {
    const total = Array.isArray(state.preguntas) ? state.preguntas.length : 0;
    if (!total) return false;
    if ((_esRespuestaAfirmativaVoz(norm) || _esRespuestaNegativaVoz(norm)) && norm.split(/\s+/).filter(Boolean).length <= 3) {
      const preguntaActual = _etiquetaPreguntaAnalisisLectura(state, state.preguntaIndex) || "Dime tu análisis de la lectura.";
      hablarUnidad(`Necesito una respuesta breve a la pregunta actual. ${preguntaActual}`, { cancelarPrevio: true, preferLive: true });
      return true;
    }
    const idx = Math.max(0, Math.min(Number(state.preguntaIndex || 0), total - 1));
    const preguntaActual = String(state.preguntas[idx] || "").trim();
    state.respuestas.push({
      index: idx,
      pregunta: preguntaActual,
      respuesta: q.replace(/\s+/g, " ").trim(),
      ts: Date.now()
    });
    state.preguntaIndex = idx + 1;
    if (state.preguntaIndex < total) {
      const siguiente = _etiquetaPreguntaAnalisisLectura(state, state.preguntaIndex) || "Seguimos con la siguiente pregunta.";
      const prefijo = state.respuestas.length <= 1 ? "Bien." : "Entendido.";
      hablarUnidad(`${prefijo} ${siguiente}`, { cancelarPrevio: true, preferLive: true });
      return true;
    }
    state.finalizada = true;
    hablarUnidad(_cierreAnalisisLectura(state), { cancelarPrevio: true, preferLive: true });
    return true;
  }

  const sent = _enviarSeguimientoAnalisisLecturaGemini(q, state);
  if (!sent) {
    hablarUnidad("Ya tenemos el análisis base. Dime qué punto quieres profundizar.", { cancelarPrevio: true, preferLive: true });
  }
  return true;
}

function _anunciarEstadoConversacionContinua(cmdKey = "") {
  const speak = cmdKey
    ? _debeResponderComando(cmdKey, false)
    : _debeResponderPorFuncion("_continuarRespondiendo", false);
  if (!speak) return;
  hablarUnidad(
    voiceRespuestaContinuaActiva
      ? "Conversación activa. Te escucho."
      : "Conversación desactivada.",
    { cancelarPrevio: true, preferLive: true }
  );
}

function _hablarSiFuncionaRespuestaVoz(fnName = "", texto = "", opciones = {}) {
  const t = String(texto || "").trim();
  if (!t) return;
  // En modo agente exclusivo (stage), siempre debe haber feedback hablado
  // para evitar que los botones parezcan "muertos" por configuración speak=false.
  if (_agenteUnidadEnModoExclusivo()) {
    hablarUnidad(t, opciones);
    return;
  }
  if (!_debeResponderPorFuncion(fnName, false)) return;
  hablarUnidad(t, opciones);
}

function _debeOmitirPorCooldownComando(key = "", ms = 1400) {
  const k = String(key || "").trim();
  if (!k) return false;
  const now = Date.now();
  const last = Number(voiceActionLastAt[k] || 0);
  if ((now - last) < Number(ms || 1400)) return true;
  voiceActionLastAt[k] = now;
  return false;
}

function _limpiarConsultaLectura(raw = "") {
  const source = String(raw || "");
  const hadCommandScaffold = /\b(lee|leer|leeme|léeme|buscar|busca|encuentra|localiza|ver|vera|verla|abre|abrir|mostrar|muestrame|muéstrame|editar|edita|exportar|exporta|descargar|descarga|lectura|asc|ask|asq|nuevas?)\b/i.test(source);
  let cleaned = source
    .replace(/\b(lee|leer|leeme|léeme|buscar|busca|encuentra|localiza|ver|vera|verla|abre|abrir|mostrar|muestrame|muéstrame|editar|edita|exportar|exporta|descargar|descarga)\b/gi, " ")
    .replace(/\b(la|el|una|un)\s+lectura\b/gi, " ")
    .replace(/\b(completa|entera|por favor|porfa|charly|ahora|word|docx)\b/gi, " ")
    .replace(/\b(asc|ask|asq|lecturas?\s+(?:asc|ask|asq|a\s*s\s*[ckq]|a\W*s\W*[ckq])|nuevas?|lecturas?\s+nuevas?|con\s+charly)\b/gi, " ")
    .replace(/\b(?:nivel)\s+(?:preescolar|primaria|secundaria|bachillerato|media\s+superior)\b/gi, " ")
    .replace(/\b(?:de\s+)?(?:[1-9]|10|11|12|primero|segundo|tercero|cuarto|quinto|sexto|septimo|séptimo|octavo|noveno|decimo|décimo|once|doce)\s+grado\b/gi, " ")
    .replace(/\b(?:grado)\s+(?:[1-9]|10|11|12|primero|segundo|tercero|cuarto|quinto|sexto|septimo|séptimo|octavo|noveno|decimo|décimo|once|doce)\b/gi, " ")
    .replace(/\b(?:trimestre|bloque)\s+(?:[1-4]|primero|segundo|tercero|cuarto)\b/gi, " ")
    .replace(/\b(?:unidad)\s+(?:[1-9]|10|11|12|primera|segunda|tercera|cuarta|quinta|sexta|septima|séptima|octava|novena|decima|décima)\b/gi, " ")
    .replace(/\b(?:de|del)\s+(?:preescolar|primaria|secundaria|bachillerato|media\s+superior)\b/gi, " ")
    .replace(/^[:\-.,\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (hadCommandScaffold) {
    cleaned = cleaned
      .replace(/^(?:(?:y|e|o|u)\b\s*)+/i, "")
      .replace(/\s+(?:y|e|o|u)$/i, "")
      .trim();
  }
  if (/^(?:y|e|o|u)$/i.test(cleaned)) return "";
  return cleaned;
}

function _normalizarNumeroOrdinarioTexto(raw = "") {
  const norm = _normalizarTexto(String(raw || "")).replace(/[º°]/g, "").trim();
  if (!norm) return "";
  const mapa = {
    uno: "1", una: "1", primero: "1", primer: "1", primera: "1",
    dos: "2", segundo: "2", segunda: "2",
    tres: "3", tercero: "3", tercera: "3",
    cuatro: "4", cuarto: "4", cuarta: "4",
    cinco: "5", quinto: "5", quinta: "5",
    seis: "6", sexto: "6", sexta: "6",
    siete: "7", septimo: "7", septima: "7", setimo: "7", setima: "7",
    ocho: "8", octavo: "8", octava: "8",
    nueve: "9", noveno: "9", novena: "9",
    diez: "10", decimo: "10", decima: "10",
    once: "11",
    doce: "12"
  };
  if (mapa[norm]) return mapa[norm];
  const m = norm.match(/\b(1[0-2]|[1-9])\b/);
  return m?.[1] ? String(Number(m[1])) : "";
}

function _extraerFiltrosLecturaDesdeTexto(texto = "") {
  const raw = String(texto || "").trim();
  const norm = _normalizarTexto(raw);
  if (!norm) return {};
  const out = {};
  const mNivel = norm.match(/\b(preescolar|primaria|secundaria|bachillerato|media\s+superior)\b/);
  if (mNivel?.[1]) out.nivel = String(mNivel[1]).trim();

  const mGradoDirecto = norm.match(/\b(?:grado)\s+([a-z0-9º°]+)\b/i);
  const mGradoConNivel = norm.match(/\b([a-z0-9º°]+)\s+grado\b/i);
  const gradoNum = _normalizarNumeroOrdinarioTexto((mGradoDirecto?.[1] || mGradoConNivel?.[1] || "").trim());
  if (gradoNum) out.grado = gradoNum;

  const mTrimestre = norm.match(/\b(?:trimestre|bloque)\s+([a-z0-9º°]+)\b/i);
  const triNum = _normalizarNumeroOrdinarioTexto((mTrimestre?.[1] || "").trim());
  if (triNum) out.trimestre = triNum;

  const mUnidad = norm.match(/\b(?:unidad)\s+([a-z0-9º°]+)\b/i);
  const unidadNum = _normalizarNumeroOrdinarioTexto((mUnidad?.[1] || "").trim());
  if (unidadNum) out.unidad = unidadNum;

  return out;
}

function _coincideFiltroLectura(docValor = "", filtroValor = "", campo = "") {
  const filtro = String(filtroValor || "").trim();
  if (!filtro) return true;
  const docNorm = _normalizarTexto(String(docValor || "")).replace(/[º°]/g, "").trim();
  if (!docNorm) return false;
  if (campo === "grado" || campo === "trimestre" || campo === "unidad") {
    const nDoc = _normalizarNumeroOrdinarioTexto(docNorm);
    const nFiltro = _normalizarNumeroOrdinarioTexto(filtro);
    if (nDoc && nFiltro) return nDoc === nFiltro;
  }
  return docNorm.includes(_normalizarTexto(filtro));
}

function _esRespuestaAfirmativaVoz(textoNorm = "") {
  const t = _normalizarTexto(textoNorm);
  return /\b(si|sí|confirmo|confirmar|correcto|exacto|es esa|esa|ese|acepto|ok|vale|de acuerdo|continuar|continua|continúa|sigue|adelante)\b/.test(t);
}

function _esRespuestaNegativaVoz(textoNorm = "") {
  const t = _normalizarTexto(textoNorm);
  return /\b(no|negativo|incorrecto|esa no|ese no|siguiente|otra)\b/.test(t);
}

function _esRespuestaCancelarVoz(textoNorm = "") {
  const t = _normalizarTexto(textoNorm);
  return /\b(cancela|cancelar|deten|detener|parar|alto|olvida)\b/.test(t);
}

function _descripcionLecturaParaConfirmacion(lectura = {}) {
  const titulo = String(lectura?.titulo || lectura?.tema || "Sin título").trim();
  const coleccion = String(lectura?.sourceCollection || lectura?.coleccion || "").trim();
  const etiquetaColeccion = coleccion === "lecturasASC" ? "lecturas ASC" : "lecturas nuevas con Charly";
  const nivel = String(lectura?.nivel || "sin nivel").trim() || "sin nivel";
  const grado = String(lectura?.grado || "sin grado").trim() || "sin grado";
  const trimestre = String(lectura?.trimestre || "sin trimestre").trim() || "sin trimestre";
  const unidad = String(lectura?.unidad || "sin unidad").trim() || "sin unidad";
  return `"${titulo}" en ${etiquetaColeccion}, nivel ${nivel}, grado ${grado}, trimestre ${trimestre}, unidad ${unidad}`;
}

function _extraerTituloLecturaDesdeComando(texto = "", valor = "") {
  const rawValor = String(valor || "").trim();
  const hasCommandScaffoldInValor = /\b(lee|leer|leeme|léeme|buscar|busca|encuentra|localiza|ver|vera|verla|abre|abrir|mostrar|muestrame|muéstrame|editar|edita|exportar|exporta|descargar|descarga|lectura|asc|ask|asq|nuevas?)\b/i.test(rawValor);
  if (rawValor && !hasCommandScaffoldInValor) {
    // Si el usuario dicta solo el título, no lo limpiamos agresivamente para no
    // recortar el inicio (ej: "Lalo y el caracol brillante").
    return rawValor.replace(/^["“'`]+|["”'`]+$/g, "").trim();
  }
  const fromValor = _limpiarConsultaLectura(valor);
  if (fromValor) return fromValor;
  const raw = String(texto || "").trim();
  const patterns = [
    /(?:buscar|busca|encuentra|localiza)\s+(?:la\s+)?lectura\s+(.+)$/i,
    /(?:ver|abrir|abre|mostrar|muestrame|muéstrame)\s+(?:la\s+)?lectura\s+(.+)$/i,
    /(?:lee|leer|leeme|léeme)\s+(?:la\s+)?lectura\s+(.+)$/i,
    /(?:editar|edita)\s+(?:la\s+)?lectura\s+(.+)$/i,
    /(?:(?:exportar|exporta|descargar|descarga)\s+(?:word|docx)\s+(?:de\s+)?(?:la\s+)?lectura)\s+(.+)$/i,
    /(?:(?:exportar|exporta|descargar|descarga)\s+(?:la\s+)?lectura\s+(?:en\s+)?(?:word|docx))\s+(.+)$/i,
    /(?:la\s+)?lectura\s+(.+)$/i
  ];
  for (const rx of patterns) {
    const m = raw.match(rx);
    if (m?.[1]) {
      const limpio = _limpiarConsultaLectura(m[1]);
      if (limpio) return limpio;
    }
  }
  return "";
}

function _preguntaSeleccionLecturasCache(items = []) {
  const top = (Array.isArray(items) ? items : []).slice(0, 3);
  if (!top.length) return "¿Cuál lectura deseas leer?";
  const lista = top.map((it, idx) => `${idx + 1}: ${it.titulo || "sin título"}`).join(", ");
  return `Tengo varias lecturas en caché. Dime el número o título. ${lista}.`;
}

async function _obtenerLecturaCompletaDesdeRef(lecturaRef = null) {
  if (!lecturaRef?.id) return null;
  if (lecturaRef?.contenidoCompleto) return lecturaRef;
  const full = await _resolverLecturaPorId(String(lecturaRef.id || "").trim());
  if (!full) return lecturaRef;
  const mapped = _mapearLecturaParaGemini(full);
  return {
    ...lecturaRef,
    ...mapped,
    contenidoCompleto: String(mapped?.contenidoCompleto || lecturaRef?.contenidoCompleto || "")
  };
}

async function _buscarLecturaEnContextoYCachear(titulo = "", preferCollection = "") {
  const tituloLimpio = _limpiarConsultaLectura(titulo);
  if (!tituloLimpio) return { ok: false, reason: "missing_title" };
  const pref = String(preferCollection || "").trim();
  if (!pref) return { ok: false, reason: "needs_collection", question: "¿ASC o nuevas?" };
  const found = await _buscarLecturaSimpleEnColeccion(tituloLimpio, pref);
  if (!found?.id) return { ok: false, reason: "not_found" };
  _guardarReferenciaLecturaActual({ id: found.id, coleccion: pref });
  return {
    ok: true,
    lectura: {
      id: String(found.id || "").trim(),
      coleccion: pref,
      titulo: String(found?.titulo || found?.tema || "").trim()
    }
  };
}

async function _iniciarLecturaDesdeCache(lecturaCache = null) {
  const lectura = lecturaCache?.id ? lecturaCache : _leerLecturaCache();
  if (!lectura?.id || !String(lectura?.contenidoCompleto || "").trim()) return false;
  const cambioVozLectura = _aplicarAjustesVozLecturaTemporales();
  if (cambioVozLectura) {
    logVisual(`🎙️ Voz de lectura aplicada: ${charlyTtsVoiceName || "predeterminada"} | mood ${charlyVoiceMood || "normal"} | velocidad ${Number(charlyVoiceSpeed || 1).toFixed(2)} | tono ${Number(charlyVoicePitch || 1).toFixed(2)} | ${charlyVoiceLocale || "es-US"}`);
  }
  if (cambioVozLectura && geminiLiveSessionUnidad && geminiLiveIsOpen) {
    try { await iniciarGeminiLiveUnidad({ withMic: false, forceRestart: true }); } catch (_) { }
  }
  if (!geminiLiveSessionUnidad || !geminiLiveIsOpen) {
    try { await iniciarGeminiLiveUnidad({ withMic: false }); } catch (_) { }
  }
  if (!geminiLiveSessionUnidad || !geminiLiveIsOpen) return false;
  const coleccionTxt = lectura?.esLecturaHistoricaASC
    ? "de las míticas lecturas ASC"
    : (String(lectura?.coleccion || "") === "lecturasNuevas" ? "de lecturas nuevas con Charly" : "");
  const confirmacion = `Leeré ${lectura?.titulo || "la lectura"} ${coleccionTxt}`.trim() + ".";
  const preguntasTexto = _construirTextoPreguntasComprension(lectura?.preguntas || [], lectura?.titulo || lectura?.tema || "la lectura");
  charlyLecturaPreguntasPendientes = preguntasTexto
    ? { texto: preguntasTexto, awaitingConfirm: false, expiresAt: 0 }
    : null;
  return _iniciarLecturaCompletaCharly(
    String(lectura?.contenidoCompleto || ""),
    String(lectura?.titulo || lectura?.tema || "Lectura"),
    confirmacion
  );
}

function _resolverLecturaCachePorTexto(texto = "", lista = []) {
  const items = Array.isArray(lista) ? lista : [];
  if (!items.length) return null;
  const norm = _normalizarTexto(texto);
  if (!norm) return null;
  const num = norm.match(/\b([1-9]|10)\b/);
  if (num?.[1]) {
    const idx = Number(num[1]) - 1;
    if (idx >= 0 && idx < items.length) return items[idx];
  }
  let best = null;
  let bestScore = 0;
  items.forEach((it) => {
    const tt = _normalizarTexto(it?.titulo || it?.tema || "");
    if (!tt) return;
    let score = 0;
    if (tt === norm) score += 20;
    if (tt.includes(norm) || norm.includes(tt)) score += 12;
    norm.split(/\s+/).filter((tk) => tk.length > 2).forEach((tk) => {
      if (tt.includes(tk)) score += 2;
    });
    if (score > bestScore) {
      best = it;
      bestScore = score;
    }
  });
  return bestScore >= 4 ? best : null;
}

function _guardarReferenciaLecturaActual(ref = {}) {
  const id = String(ref?.id || "").trim();
  const coleccion = String(ref?.coleccion || "").trim();
  if (!id || !coleccion) return;
  charlyLecturaRefActual = { id, coleccion, updatedAt: Date.now() };
}

function _leerReferenciaLecturaActual() {
  if (!charlyLecturaRefActual?.id || !charlyLecturaRefActual?.coleccion) return null;
  return { ...charlyLecturaRefActual };
}

async function _buscarLecturasCandidatasEnColeccion(titulo = "", coleccion = "", opciones = {}) {
  const q = _normalizarTexto(_limpiarConsultaLectura(titulo));
  const col = String(coleccion || "").trim();
  const filtros = (opciones?.filtros && typeof opciones.filtros === "object") ? opciones.filtros : {};
  const maxCandidatos = Math.max(1, Math.min(5, Number(opciones?.maxCandidatos || 3)));
  const maxDocs = Math.max(80, Math.min(500, Number(opciones?.maxDocs || 320)));
  if (!q || !col) return [];

  const snap = await getDocs(query(collection(db, col), limit(maxDocs)));
  const docs = snap.docs.map((d) => ({ id: d.id, sourceCollection: col, ...d.data() }));
  if (!docs.length) return [];

  const tokens = q.split(/\s+/).filter((tk) => tk.length > 2);
  const puntuar = (d = {}) => {
    const tituloNorm = _normalizarTexto(d?.titulo || "");
    const temaNorm = _normalizarTexto(d?.tema || "");
    const autorNorm = _normalizarTexto(d?.autorReferencia || "");
    let score = 0;

    if (tituloNorm === q || temaNorm === q) score += 260;
    if (tituloNorm.startsWith(q) || temaNorm.startsWith(q)) score += 170;
    if (tituloNorm.includes(q) || temaNorm.includes(q)) score += 130;
    if ((q.includes(tituloNorm) && tituloNorm.length > 8) || (q.includes(temaNorm) && temaNorm.length > 8)) score += 85;

    let overlap = 0;
    tokens.forEach((tk) => {
      if (tituloNorm.includes(tk) || temaNorm.includes(tk)) {
        score += 14;
        overlap += 1;
      } else if (autorNorm.includes(tk)) {
        score += 2;
      }
    });
    const minOverlap = Math.max(1, Math.ceil(tokens.length * 0.6));
    if (tokens.length && overlap < minOverlap && !tituloNorm.includes(q) && !temaNorm.includes(q)) {
      score -= 120;
    }

    const filtrosActivos = Object.entries(filtros).filter(([, val]) => String(val || "").trim());
    filtrosActivos.forEach(([campo, valor]) => {
      const ok = _coincideFiltroLectura(d?.[campo], valor, campo);
      score += ok ? 70 : -90;
    });

    return score;
  };

  const ranked = docs
    .map((d) => ({ ...d, _score: puntuar(d) }))
    .filter((d) => Number(d._score || 0) > 0)
    .sort((a, b) => Number(b._score || 0) - Number(a._score || 0));

  if (!ranked.length) return [];
  const mejor = ranked[0];
  if (Number(mejor?._score || 0) < 110) return [];
  return ranked.slice(0, maxCandidatos);
}

async function _buscarLecturaSimpleEnColeccion(titulo = "", coleccion = "", opciones = {}) {
  const candidatos = await _buscarLecturasCandidatasEnColeccion(titulo, coleccion, { ...opciones, maxCandidatos: 1 });
  return candidatos[0] || null;
}

function _crearPendienteSeleccionLectura(candidatos = [], preferCollection = "") {
  const list = Array.isArray(candidatos) ? candidatos.filter((it) => it?.id) : [];
  if (!list.length) return null;
  return {
    candidates: list.map((it) => ({
      id: String(it.id || "").trim(),
      sourceCollection: String(it.sourceCollection || it.coleccion || preferCollection || "").trim(),
      titulo: String(it.titulo || it.tema || "").trim(),
      nivel: String(it.nivel || "").trim(),
      grado: String(it.grado || "").trim(),
      trimestre: String(it.trimestre || "").trim(),
      unidad: String(it.unidad || "").trim(),
      _score: Number(it._score || 0)
    })),
    preferCollection: String(preferCollection || "").trim(),
    index: 0,
    expiresAt: Date.now() + 45000
  };
}

function _mapearLecturaCandidataVisual(item = {}, coleccionFallback = "", idx = 0) {
  const coleccion = String(item?.sourceCollection || item?.coleccion || coleccionFallback || "").trim();
  const titulo = String(item?.titulo || item?.tema || "").trim();
  if (!titulo) return null;
  const visualIndex = Number(idx) + 1;
  return {
    id: String(item?.id || "").trim(),
    sourceCollection: coleccion,
    coleccion,
    titulo,
    nivel: String(item?.nivel || "").trim(),
    grado: String(item?.grado || "").trim(),
    trimestre: String(item?.trimestre || "").trim(),
    unidad: String(item?.unidad || "").trim(),
    visualIndex,
    voiceNumberPrompt: `lectura ${visualIndex}`,
    voiceTitlePrompt: titulo
  };
}

function _extraerLecturasPreviewDesdePool(coleccion = "", maxItems = 6) {
  const col = String(coleccion || "").trim();
  if (!col) return [];
  const safeMax = Math.max(1, Math.min(10, Number(maxItems || 6)));
  const pool = [
    ...(Array.isArray(window.todasLasLecturas) ? window.todasLasLecturas : []),
    ...(Array.isArray(window.lecturasNuevas) ? window.lecturasNuevas : []),
    ...(Array.isArray(window.lecturasASC) ? window.lecturasASC : []),
    ...(Array.isArray(window.lecturasFiltradas) ? window.lecturasFiltradas : [])
  ];
  const seen = new Set();
  const out = [];
  for (const row of pool) {
    if (!row) continue;
    const itemCol = String(
      row?.sourceCollection
      || row?.coleccion
      || (String(row?.tipo || "").toLowerCase() === "asc" ? "lecturasASC" : "lecturasNuevas")
    ).trim();
    if (itemCol !== col) continue;
    const id = String(row?.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const mapped = _mapearLecturaCandidataVisual(row, col, out.length);
    if (!mapped) continue;
    out.push(mapped);
    if (out.length >= safeMax) break;
  }
  return out;
}

async function _obtenerLecturasPreviewPorColeccion(coleccion = "", opciones = {}) {
  const col = String(coleccion || "").trim();
  if (!col) return [];
  const maxItems = Math.max(1, Math.min(10, Number(opciones?.maxItems || 6)));
  const forceRefresh = opciones?.forceRefresh === true;
  const now = Date.now();
  const cacheEntry = charlyLecturasPreviewCache[col];
  if (!forceRefresh && cacheEntry && now <= Number(cacheEntry.expiresAt || 0) && Array.isArray(cacheEntry.items)) {
    return cacheEntry.items.slice(0, maxItems);
  }

  const local = _extraerLecturasPreviewDesdePool(col, maxItems);
  if (local.length >= maxItems) {
    charlyLecturasPreviewCache[col] = { items: local, expiresAt: now + 120000 };
    return local;
  }

  try {
    const needed = Math.max(maxItems, 12);
    const snap = await getDocs(query(collection(db, col), limit(needed)));
    const remote = [];
    snap.docs.forEach((d) => {
      const mapped = _mapearLecturaCandidataVisual({ id: d.id, sourceCollection: col, ...d.data() }, col, remote.length);
      if (mapped) remote.push(mapped);
    });
    const mergedMap = new Map();
    [...local, ...remote].forEach((it) => {
      const id = String(it?.id || "").trim();
      if (!id || mergedMap.has(id)) return;
      mergedMap.set(id, it);
    });
    const merged = Array.from(mergedMap.values())
      .slice(0, maxItems)
      .map((it, idx) => ({ ...it, visualIndex: idx + 1, voiceNumberPrompt: `lectura ${idx + 1}` }));
    charlyLecturasPreviewCache[col] = { items: merged, expiresAt: now + 120000 };
    return merged;
  } catch (_) {
    if (local.length) return local;
    return [];
  }
}

function _resolverLecturaCandidataPorEntrada(raw = "", lista = []) {
  const items = Array.isArray(lista) ? lista.filter(Boolean) : [];
  if (!items.length) return null;
  const norm = _normalizarTexto(raw);
  if (!norm) return null;
  const ordinal = _normalizarNumeroOrdinarioTexto(norm);
  const regexNum = norm.match(/\b(?:lectura|opcion|opción|numero|número)\s+([a-z0-9º°]+)\b/i);
  const explicitToken = _normalizarNumeroOrdinarioTexto(String(regexNum?.[1] || "").trim());
  const plainNum = norm.match(/\b([1-9]|10)\b/);
  const selectedNumber = Number(explicitToken || ordinal || plainNum?.[1] || 0);
  if (Number.isFinite(selectedNumber) && selectedNumber >= 1 && selectedNumber <= items.length) {
    return items[selectedNumber - 1];
  }
  return _resolverLecturaCachePorTexto(raw, items);
}

function _anunciarCandidataPendienteLectura(cmdFn = "_buscarLecturaPorVoz") {
  const pending = charlyLecturaSeleccionPendiente;
  if (!pending?.candidates?.length) return false;
  const idx = Math.max(0, Math.min(Number(pending.index || 0), pending.candidates.length - 1));
  const cand = pending.candidates[idx];
  if (!cand?.id) return false;
  const titulo = String(cand?.titulo || cand?.tema || "").trim();
  const texto = titulo
    ? `Encontré "${titulo}". ¿Deseas continuar con esta lectura?`
    : "Encontré una lectura. ¿Deseas continuar con esta lectura?";
  _hablarSiFuncionaRespuestaVoz(cmdFn, texto, { cancelarPrevio: true, preferLive: true });
  return true;
}

async function _cargarLecturaDesdeFirebasePorRef(ref = null) {
  const id = String(ref?.id || "").trim();
  const coleccion = String(ref?.coleccion || "").trim();
  if (!id || !coleccion) return null;
  try {
    const snap = await getDoc(doc(db, coleccion, id));
    if (!snap.exists()) return null;
    return { id: snap.id, sourceCollection: coleccion, ...snap.data() };
  } catch (_) {
    return null;
  }
}

async function _cargarLecturaParaLive(ref = null) {
  const id = String(ref?.id || "").trim();
  const coleccion = String(ref?.coleccion || "").trim();
  if (!id || !coleccion) return null;

  const lecturaCache = _leerLecturaCache();
  if (lecturaCache?.id === id && String(lecturaCache?.contenidoCompleto || "").trim()) {
    return {
      id,
      sourceCollection: coleccion,
      ...((lecturaCache.rawData && typeof lecturaCache.rawData === "object") ? lecturaCache.rawData : {}),
      contenidoPlano: lecturaCache.contenidoCompleto,
      preguntas: Array.isArray(lecturaCache.preguntas) ? lecturaCache.preguntas : []
    };
  }

  const pool = [
    ...(Array.isArray(window.todasLasLecturas) ? window.todasLasLecturas : []),
    ...(Array.isArray(window.lecturasNuevas) ? window.lecturasNuevas : []),
    ...(Array.isArray(window.lecturasASC) ? window.lecturasASC : []),
    ...(Array.isArray(window.lecturasFiltradas) ? window.lecturasFiltradas : [])
  ];
  const lecturaLocal = pool.find((it) => String(it?.id || "").trim() === id) || null;
  if (lecturaLocal) {
    return {
      ...lecturaLocal,
      id,
      sourceCollection: String(
        lecturaLocal?.sourceCollection
        || lecturaLocal?.coleccion
        || coleccion
      ).trim() || coleccion
    };
  }

  const resolved = await _resolverLecturaPorId(id);
  if (resolved?.id) {
    return {
      ...resolved,
      id,
      sourceCollection: String(
        resolved?.sourceCollection
        || resolved?.coleccion
        || (String(resolved?.tipo || "").toLowerCase() === "asc" ? "lecturasASC" : coleccion)
      ).trim() || coleccion
    };
  }

  return _cargarLecturaDesdeFirebasePorRef({ id, coleccion });
}

async function _resolverPendientesLecturaPorVoz(transcripcion = "") {
  const raw = String(transcripcion || "").trim();
  const norm = _normalizarTexto(raw);
  if (!norm) return false;
  const cfgLectura = _leerConfigComandosVoz();
  const activeWorkflowKey = String(charlyLecturaWorkflowCommandKey || "buscar_lecturas_charly").trim() || "buscar_lecturas_charly";
  const rowBuscarLectura = cfgLectura?.[activeWorkflowKey]
    || cfgLectura?.buscar_lecturas_charly
    || {};
  const hasLecturaPending = !!(
    charlyLecturaBusquedaPendiente ||
    charlyLecturaSeleccionPendiente ||
    charlyLecturaDisambiguacionPendiente ||
    charlyLecturaAccionPendiente
  );
  if (hasLecturaPending && _esRespuestaCancelarVoz(norm)) {
    charlyLecturaBusquedaPendiente = null;
    charlyLecturaSeleccionPendiente = null;
    charlyLecturaDisambiguacionPendiente = null;
    charlyLecturaAccionPendiente = null;
    charlyLecturaConfirmacionRecienteUntil = 0;
    _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "Listo, cancelé el flujo de lecturas.", { cancelarPrevio: true, preferLive: true });
    await _ejecutarSiguienteComandoPorResultado(activeWorkflowKey, rowBuscarLectura, "cancel", norm);
    return true;
  }

  const pref = _preferenciaColeccionLecturaDesdeTexto(raw);
  if (pref) charlyColeccionActiva = pref;
  const filtrosDetectados = _extraerFiltrosLecturaDesdeTexto(raw);

  const pendingSearch = charlyLecturaBusquedaPendiente;
  if (pendingSearch && Date.now() <= Number(pendingSearch.expiresAt || 0)) {
    if (pendingSearch.step === "collection") {
      const prefCol = pref || _resolverColeccionWorkflowLectura("", "", "");
      if (!prefCol) {
        _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "¿La buscas en lecturas ASC o en lecturas nuevas con Charly?", { cancelarPrevio: true, preferLive: true });
        return true;
      }
      const suggestedCandidates = await _obtenerLecturasPreviewPorColeccion(prefCol, { maxItems: 6 });
      charlyLecturaBusquedaPendiente = {
        ...pendingSearch,
        step: pendingSearch.titulo ? "done" : "title",
        preferCollection: prefCol,
        suggestedCandidates,
        filtros: { ...(pendingSearch.filtros || {}), ...filtrosDetectados },
        expiresAt: Date.now() + 20000
      };
      if (!pendingSearch.titulo) {
        _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", `Listo, usaré ${_etiquetaColeccionLecturas(prefCol)}. Ahora dime el título, o elige una lectura por número o por título.`, { cancelarPrevio: true, preferLive: true });
        return true;
      }
      const candidates = await _buscarLecturasCandidatasEnColeccion(pendingSearch.titulo, prefCol, {
        filtros: { ...(pendingSearch.filtros || {}), ...filtrosDetectados },
        maxCandidatos: 3
      });
      charlyLecturaBusquedaPendiente = null;
      if (candidates.length) {
        charlyLecturaSeleccionPendiente = _crearPendienteSeleccionLectura(candidates, prefCol);
        _anunciarCandidataPendienteLectura("_buscarLecturaPorVoz");
      } else {
        _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "No encontré una coincidencia confiable con esos datos. Dime otro título o más detalle.", { cancelarPrevio: true, preferLive: true });
        await _ejecutarSiguienteComandoPorResultado(activeWorkflowKey, rowBuscarLectura, "error", norm, null, { fallbackToNext: false });
      }
      return true;
    }
    if (pendingSearch.step === "title") {
      const suggested = Array.isArray(pendingSearch?.suggestedCandidates) ? pendingSearch.suggestedCandidates : [];
      const selectedSuggested = _resolverLecturaCandidataPorEntrada(raw, suggested);
      if (selectedSuggested?.titulo) {
        const selectedTitle = String(selectedSuggested.titulo || "").trim();
        charlyLecturaBusquedaPendiente = {
          ...pendingSearch,
          step: "title_confirm",
          titulo: selectedTitle,
          expiresAt: Date.now() + 25000
        };
        _hablarSiFuncionaRespuestaVoz(
          "_buscarLecturaPorVoz",
          `Seleccioné "${selectedTitle}". Di continuar para buscar, o dicta otro título.`,
          { cancelarPrevio: true, preferLive: true }
        );
        return true;
      }
      const title = _extraerTituloLecturaDesdeComando(raw, raw);
      if (!title) {
        _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "No capté el título. Dímelo otra vez, o elige una lectura por número.", { cancelarPrevio: true, preferLive: true });
        return true;
      }
      charlyLecturaBusquedaPendiente = {
        ...pendingSearch,
        step: "title_confirm",
        titulo: title,
        filtros: { ...(pendingSearch.filtros || {}), ...filtrosDetectados },
        expiresAt: Date.now() + 25000
      };
      _hablarSiFuncionaRespuestaVoz(
        "_buscarLecturaPorVoz",
        `Anoté: "${title}". Di continuar para buscar, o dicta el título completo de nuevo.`,
        { cancelarPrevio: true, preferLive: true }
      );
      return true;
    }
    if (pendingSearch.step === "title_confirm") {
      const confirmContinue = /\b(continuar|continua|continúa|siguiente|listo|listos|ok|vale|buscar)\b/.test(norm)
        || _esRespuestaAfirmativaVoz(norm);
      if (!confirmContinue) {
        if (_esRespuestaNegativaVoz(norm)) {
          charlyLecturaBusquedaPendiente = {
            ...pendingSearch,
            step: "title",
            titulo: "",
            expiresAt: Date.now() + 22000
          };
          _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "Perfecto, dime nuevamente el título.", { cancelarPrevio: true, preferLive: true });
          return true;
        }
        const replacementByList = _resolverLecturaCandidataPorEntrada(raw, pendingSearch?.suggestedCandidates || []);
        const replacementTitle = String(replacementByList?.titulo || "").trim() || _extraerTituloLecturaDesdeComando(raw, raw);
        if (!replacementTitle) {
          _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "Di continuar para buscar o dicta el título completo de nuevo.", { cancelarPrevio: true, preferLive: true });
          return true;
        }
        charlyLecturaBusquedaPendiente = {
          ...pendingSearch,
          step: "title_confirm",
          titulo: replacementTitle,
          filtros: { ...(pendingSearch.filtros || {}), ...filtrosDetectados },
          expiresAt: Date.now() + 25000
        };
        _hablarSiFuncionaRespuestaVoz(
          "_buscarLecturaPorVoz",
          `Actualicé el título a "${replacementTitle}". Di continuar para buscar.`,
          { cancelarPrevio: true, preferLive: true }
        );
        return true;
      }
      const title = String(pendingSearch.titulo || "").trim();
      if (!title) {
        charlyLecturaBusquedaPendiente = {
          ...pendingSearch,
          step: "title",
          titulo: "",
          expiresAt: Date.now() + 22000
        };
        _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "Aún no tengo título. Dímelo y luego di continuar.", { cancelarPrevio: true, preferLive: true });
        return true;
      }
      const pref = String(pendingSearch.preferCollection || "").trim();
      const filtrosBusqueda = { ...(pendingSearch.filtros || {}), ...filtrosDetectados };
      const candidates = await _buscarLecturasCandidatasEnColeccion(title, pref, {
        filtros: filtrosBusqueda,
        maxCandidatos: 3
      });
      charlyLecturaBusquedaPendiente = null;
      if (candidates.length) {
        charlyLecturaSeleccionPendiente = _crearPendienteSeleccionLectura(candidates, pref);
        _anunciarCandidataPendienteLectura("_buscarLecturaPorVoz");
      } else {
        _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "No encontré una coincidencia confiable con ese título. Dímelo de nuevo.", { cancelarPrevio: true, preferLive: true });
        await _ejecutarSiguienteComandoPorResultado(activeWorkflowKey, rowBuscarLectura, "error", norm, null, { fallbackToNext: false });
      }
      return true;
    }
  } else if (pendingSearch) {
    charlyLecturaBusquedaPendiente = null;
  }

  const pendingSelection = charlyLecturaSeleccionPendiente;
  if (pendingSelection && Date.now() <= Number(pendingSelection.expiresAt || 0)) {
    const total = Array.isArray(pendingSelection.candidates) ? pendingSelection.candidates.length : 0;
    if (!total) {
      charlyLecturaSeleccionPendiente = null;
    } else {
      const idxActual = Math.max(0, Math.min(Number(pendingSelection.index || 0), total - 1));
      const byIndex = _resolverLecturaCandidataPorEntrada(raw, pendingSelection.candidates || []);
      if (byIndex?.id) {
        const idxManual = pendingSelection.candidates.findIndex((it) => String(it?.id || "") === String(byIndex.id || ""));
        if (idxManual >= 0 && idxManual < total) {
          pendingSelection.index = idxManual;
          pendingSelection.expiresAt = Date.now() + 45000;
          _anunciarCandidataPendienteLectura("_buscarLecturaPorVoz");
          return true;
        }
      }

      if (_esRespuestaAfirmativaVoz(norm)) {
        const chosen = pendingSelection.candidates[idxActual];
        charlyLecturaSeleccionPendiente = null;
        if (!chosen?.id) return true;
        const coleccion = String(chosen.sourceCollection || pendingSelection.preferCollection || "").trim();
        charlyLecturaConfirmacionRecienteUntil = Date.now() + 2600;
        if (coleccion) charlyColeccionActiva = coleccion;
        _guardarReferenciaLecturaActual({ id: chosen.id, coleccion });
        charlyLecturaAccionPendiente = {
          id: chosen.id,
          coleccion,
          titulo: String(chosen.titulo || "la lectura"),
          nivel: String(chosen.nivel || "").trim(),
          grado: String(chosen.grado || "").trim(),
          trimestre: String(chosen.trimestre || "").trim(),
          unidad: String(chosen.unidad || "").trim(),
          expiresAt: Date.now() + 45000
        };
        _hablarSiFuncionaRespuestaVoz(
          "_buscarLecturaPorVoz",
          "Confirmado. ¿Qué deseas hacer?",
          { cancelarPrevio: true, preferLive: true }
        );
        await _ejecutarSiguienteComandoPorResultado(activeWorkflowKey, rowBuscarLectura, "yes", norm);
        return true;
      }

      if (_esRespuestaNegativaVoz(norm)) {
        if ((idxActual + 1) < total) {
          pendingSelection.index = idxActual + 1;
          pendingSelection.expiresAt = Date.now() + 45000;
          _anunciarCandidataPendienteLectura("_buscarLecturaPorVoz");
          await _ejecutarSiguienteComandoPorResultado(activeWorkflowKey, rowBuscarLectura, "no", norm);
          return true;
        }
        charlyLecturaSeleccionPendiente = null;
        const prefPend = String(pendingSelection.preferCollection || charlyColeccionActiva || "").trim();
        if (prefPend) {
          const suggestedCandidates = await _obtenerLecturasPreviewPorColeccion(prefPend, { maxItems: 6 });
          charlyLecturaBusquedaPendiente = {
            step: "title",
            titulo: "",
            preferCollection: prefPend,
            suggestedCandidates,
            filtros: { ...filtrosDetectados },
            expiresAt: Date.now() + 22000
          };
        }
        _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "No tengo más opciones seguras. Dime el título exacto o agrega más detalle.", { cancelarPrevio: true, preferLive: true });
        await _ejecutarSiguienteComandoPorResultado(activeWorkflowKey, rowBuscarLectura, "no", norm);
        return true;
      }

      const byTitle = _resolverLecturaCachePorTexto(raw, pendingSelection.candidates);
      if (byTitle?.id) {
        const idxTitle = pendingSelection.candidates.findIndex((it) => String(it?.id || "") === String(byTitle.id || ""));
        if (idxTitle >= 0) {
          pendingSelection.index = idxTitle;
          pendingSelection.expiresAt = Date.now() + 45000;
          _anunciarCandidataPendienteLectura("_buscarLecturaPorVoz");
          return true;
        }
      }

      if (pref) {
        const idxPref = pendingSelection.candidates.findIndex((it) => String(it?.sourceCollection || "") === pref);
        if (idxPref >= 0 && idxPref !== idxActual) {
          pendingSelection.index = idxPref;
          pendingSelection.expiresAt = Date.now() + 45000;
          _anunciarCandidataPendienteLectura("_buscarLecturaPorVoz");
          return true;
        }
      }
    }
  } else if (pendingSelection) {
    charlyLecturaSeleccionPendiente = null;
  }

  const pendingAction = charlyLecturaAccionPendiente;
  if (pendingAction && Date.now() <= Number(pendingAction.expiresAt || 0)) {
    let accion = _resolverAccionSobreLectura(raw);
    if (!accion && _esRespuestaAfirmativaVoz(norm)) accion = "leer";
    if (!accion) {
      if (Date.now() <= Number(charlyLecturaConfirmacionRecienteUntil || 0) && /\b(es\s+esa|esa\s+lectura|ese\s+texto|esa|ese|lectura)\b/.test(norm)) {
        return true;
      }
      if (_esRespuestaNegativaVoz(norm) || _esRespuestaCancelarVoz(norm)) {
        charlyLecturaAccionPendiente = null;
        _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "Entendido, no ejecuto ninguna acción sobre la lectura.", { cancelarPrevio: true, preferLive: true });
        const resultado = _esRespuestaCancelarVoz(norm) ? "cancel" : "no";
        await _ejecutarSiguienteComandoPorResultado(activeWorkflowKey, rowBuscarLectura, resultado, norm);
        return true;
      }
      return false;
    }
    charlyLecturaAccionPendiente = null;
    const ref = { id: pendingAction.id, coleccion: pendingAction.coleccion };
    if (accion === "leer") {
      const started = await _iniciarLecturaDesdeRef(ref);
      if (!started) {
        _hablarSiFuncionaRespuestaVoz("_leerLecturaPorVoz", "No pude iniciar la lectura ahora mismo.", { cancelarPrevio: true, preferLive: true });
        await _ejecutarSiguienteComandoPorResultado(activeWorkflowKey, rowBuscarLectura, "error", norm, null, { fallbackToNext: false });
      }
      return true;
    }
    if (accion === "crear_unidad") {
      const linked = await _crearUnidadDesdeLecturaActualParaAgente();
      if (!linked) {
        _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "No pude vincular esa lectura para crear la unidad.", { cancelarPrevio: true, preferLive: true });
        await _ejecutarSiguienteComandoPorResultado(activeWorkflowKey, rowBuscarLectura, "error", norm, null, { fallbackToNext: false });
        return true;
      }
      _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "Listo. Ya tomé esta lectura para crear la unidad nueva.", { cancelarPrevio: true, preferLive: true });
      await _ejecutarSiguienteComandoPorResultado(activeWorkflowKey, rowBuscarLectura, "ok", norm);
      return true;
    }
    if (accion === "ver" || accion === "editar" || accion === "word") {
      const ok = await _accionLecturaTablaPorVozTarget(ref.coleccion, pendingAction.titulo || "", norm, accion);
      if (!ok) {
        _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "No pude ejecutar esa acción en la tabla de lecturas.", { cancelarPrevio: true, preferLive: true });
      }
      return true;
    }
    const docLectura = await _cargarLecturaDesdeFirebasePorRef(ref);
    if (!docLectura) {
      _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "No pude cargar la lectura desde Firebase.", { cancelarPrevio: true, preferLive: true });
      await _ejecutarSiguienteComandoPorResultado(activeWorkflowKey, rowBuscarLectura, "error", norm, null, { fallbackToNext: false });
      return true;
    }
    const mapped = _mapearLecturaParaGemini(docLectura);
    if (accion === "resumen") {
      const resumen = await _obtenerResumenLectura(
        mapped?.contenidoCompleto || "",
        mapped?.titulo || pendingAction.titulo || "la lectura"
      );
      _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", resumen || "No pude generar resumen en este momento.", { cancelarPrevio: true, preferLive: true });
      return true;
    }
    if (accion === "analiza") {
      const intro = _iniciarAnalisisGuiadoLectura(mapped);
      _hablarSiFuncionaRespuestaVoz(
        "_buscarLecturaPorVoz",
        intro || `Perfecto. Iniciamos análisis de ${mapped.titulo || "la lectura"}.`,
        { cancelarPrevio: true, preferLive: true }
      );
      return true;
    }
    if (accion === "profundizar") {
      _activarConversacionSobreLectura(mapped, accion);
      _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", `Perfecto. Iniciamos profundización de ${mapped.titulo || "la lectura"}.`, { cancelarPrevio: true, preferLive: true });
      return true;
    }
  } else if (pendingAction) {
    charlyLecturaAccionPendiente = null;
  }

  // Permite ejecutar acciones directas sobre la lectura actual, aunque ya no exista
  // un "pendingAction" abierto (caso típico: ya empezó la lectura y el agente sigue en ese flujo).
  const accionDirecta = _resolverAccionSobreLectura(raw);
  if (accionDirecta) {
    const refActual = _leerReferenciaLecturaActual();
    if (!refActual?.id || !refActual?.coleccion) return false;
    if (accionDirecta === "leer") {
      const started = await _iniciarLecturaDesdeRef(refActual);
      if (!started) {
        _hablarSiFuncionaRespuestaVoz("_leerLecturaPorVoz", "No pude continuar la lectura ahora mismo.", { cancelarPrevio: true, preferLive: true });
      }
      return true;
    }
    if (accionDirecta === "ver" || accionDirecta === "editar" || accionDirecta === "word") {
      const ok = await _accionLecturaTablaPorVozTarget(refActual.coleccion, "", raw, accionDirecta);
      if (!ok) {
        _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "No pude ejecutar esa acción sobre la lectura actual.", { cancelarPrevio: true, preferLive: true });
      }
      return true;
    }
    if (accionDirecta === "crear_unidad") {
      const linked = await _crearUnidadDesdeLecturaActualParaAgente();
      if (!linked) {
        _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "No pude usar la lectura actual para crear la unidad.", { cancelarPrevio: true, preferLive: true });
        return true;
      }
      _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "Perfecto. Ya pasé esta lectura al formulario de unidad.", { cancelarPrevio: true, preferLive: true });
      return true;
    }
    const docLectura = await _cargarLecturaDesdeFirebasePorRef(refActual);
    if (!docLectura) {
      _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "No pude cargar la lectura actual desde Firebase.", { cancelarPrevio: true, preferLive: true });
      return true;
    }
    const mapped = _mapearLecturaParaGemini(docLectura);
    if (accionDirecta === "resumen") {
      const resumen = await _obtenerResumenLectura(
        mapped?.contenidoCompleto || "",
        mapped?.titulo || "la lectura"
      );
      _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", resumen || "No pude generar resumen en este momento.", { cancelarPrevio: true, preferLive: true });
      return true;
    }
    if (accionDirecta === "analiza") {
      const intro = _iniciarAnalisisGuiadoLectura(mapped);
      _hablarSiFuncionaRespuestaVoz(
        "_buscarLecturaPorVoz",
        intro || `Perfecto. Iniciamos análisis de ${mapped.titulo || "la lectura"}.`,
        { cancelarPrevio: true, preferLive: true }
      );
      return true;
    }
    if (accionDirecta === "profundizar") {
      _activarConversacionSobreLectura(mapped, accionDirecta);
      _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", `Perfecto. Iniciamos profundización de ${mapped.titulo || "la lectura"}.`, { cancelarPrevio: true, preferLive: true });
      return true;
    }
  }

  return false;
}

function _coleccionLecturaDesdeCommandKey(commandKey = "") {
  const key = String(commandKey || "").trim();
  if (!key) return "";
  const cfg = _leerConfigComandosVoz();
  const row = cfg?.[key];
  const t = _normalizarTexto(String(row?.target || "").trim());
  if (t === "lecturasasc" || /\b(asc|ask|asq)\b/.test(t)) return "lecturasASC";
  if (t === "lecturasnuevas" || /\b(nuevas?|charly)\b/.test(t)) return "lecturasNuevas";
  return "";
}

function _resolverColeccionWorkflowLectura(target = "", valor = "", textoNorm = "") {
  const visibleCollection = _coleccionLecturaVisibleActiva();
  if (visibleCollection) return visibleCollection;
  const fixedByActiveCommand = _coleccionLecturaDesdeCommandKey(charlyLecturaWorkflowCommandKey);
  if (fixedByActiveCommand) return fixedByActiveCommand;
  const targetNorm = _normalizarTexto(String(target || ""));
  if (targetNorm === "lecturasasc" || /\b(asc|ask|asq)\b/.test(targetNorm)) return "lecturasASC";
  if (targetNorm === "lecturasnuevas" || /\b(nuevas?|charly)\b/.test(targetNorm)) return "lecturasNuevas";
  return _preferenciaColeccionLecturaDesdeTexto(`${textoNorm} ${valor} ${target}`);
}

function _hablarPasoWorkflowLectura(texto = "") {
  const t = String(texto || "").trim();
  if (!t) return;
  hablarUnidad(t, { cancelarPrevio: true, preferLive: true });
}

function _hayPendienteLecturaWorkflow() {
  return !!(
    charlyLecturaBusquedaPendiente
    || charlyLecturaSeleccionPendiente
    || charlyLecturaDisambiguacionPendiente
    || charlyLecturaAccionPendiente
  );
}

function _limpiarPendientesLecturaParaAgente() {
  charlyLecturaBusquedaPendiente = null;
  charlyLecturaSeleccionPendiente = null;
  charlyLecturaDisambiguacionPendiente = null;
  charlyLecturaAccionPendiente = null;
  charlyLecturaConfirmacionRecienteUntil = 0;
  return true;
}

function _estadoPendientesLecturaParaAgente() {
  const now = Date.now();
  const hasPendingSearch = !!(charlyLecturaBusquedaPendiente && now <= Number(charlyLecturaBusquedaPendiente.expiresAt || 0));
  const hasPendingSelection = !!(charlyLecturaSeleccionPendiente && now <= Number(charlyLecturaSeleccionPendiente.expiresAt || 0));
  const hasPendingAction = !!(charlyLecturaAccionPendiente && now <= Number(charlyLecturaAccionPendiente.expiresAt || 0));
  const ref = _leerReferenciaLecturaActual();
  const pendingSearch = hasPendingSearch ? charlyLecturaBusquedaPendiente : null;
  const pendingSelection = hasPendingSelection ? charlyLecturaSeleccionPendiente : null;
  const rawCandidates = pendingSelection?.candidates?.length
    ? pendingSelection.candidates
    : (Array.isArray(pendingSearch?.suggestedCandidates) ? pendingSearch.suggestedCandidates : []);
  const candidates = (Array.isArray(rawCandidates) ? rawCandidates : [])
    .slice(0, 6)
    .map((it, idx) => _mapearLecturaCandidataVisual(it, it?.sourceCollection || pendingSearch?.preferCollection || "", idx))
    .filter(Boolean);
  return {
    hasPendingSearch,
    hasPendingSelection,
    hasPendingAction,
    pendingSearchStep: hasPendingSearch ? String(pendingSearch?.step || "").trim() : "",
    pendingSearchCollection: hasPendingSearch ? String(pendingSearch?.preferCollection || "").trim() : "",
    selectedCandidateIndex: hasPendingSelection ? Math.max(0, Number(pendingSelection?.index || 0)) : 0,
    candidates,
    ref: ref ? { ...ref } : null
  };
}

async function _crearUnidadDesdeLecturaActualParaAgente() {
  const pendingAction = (charlyLecturaAccionPendiente && Date.now() <= Number(charlyLecturaAccionPendiente.expiresAt || 0))
    ? charlyLecturaAccionPendiente
    : null;
  const refBase = pendingAction?.id
    ? { id: String(pendingAction.id || "").trim(), coleccion: String(pendingAction.coleccion || "").trim() }
    : _leerReferenciaLecturaActual();
  if (!refBase?.id || !refBase?.coleccion) return false;

  const doc = await _cargarLecturaDesdeFirebasePorRef(refBase);
  if (!doc) return false;
  const lecturaCompleta = {
    ...doc,
    id: refBase.id,
    sourceCollection: refBase.coleccion,
    coleccion: refBase.coleccion
  };
  const titulo = String(doc?.titulo || doc?.tema || pendingAction?.titulo || "").trim();

  let linked = false;
  if (refBase.coleccion === "lecturasASC") {
    const selAsc = document.getElementById("unidadTemaASC");
    if (selAsc) {
      if (!Array.from(selAsc.options || []).some((o) => String(o.value || "") === String(refBase.id || ""))) {
        const opt = document.createElement("option");
        opt.value = String(refBase.id || "");
        opt.textContent = _labelLecturaPrincipal(lecturaCompleta);
        selAsc.appendChild(opt);
      }
      selAsc.value = String(refBase.id || "");
      selAsc.dispatchEvent(new Event("change", { bubbles: true }));
      linked = true;
    }
  } else {
    linked = _aplicarLecturaPrincipalSeleccionada(lecturaCompleta);
  }

  if (!linked && titulo) {
    linked = _seleccionarLecturaParaUnidadDesdeColeccion(refBase.coleccion, titulo);
  }
  if (!linked) return false;

  const temaTextoEl = document.getElementById("unidadTemaTexto");
  if (temaTextoEl && titulo) {
    if (String(temaTextoEl.tagName || "").toUpperCase() === "SELECT") {
      const idLectura = String(refBase.id || "").trim();
      const hasOpt = Array.from(temaTextoEl.options || []).some((o) => String(o.value || "") === idLectura);
      if (!hasOpt) {
        const opt = document.createElement("option");
        opt.value = idLectura;
        opt.textContent = titulo;
        temaTextoEl.appendChild(opt);
      }
      temaTextoEl.value = idLectura;
    } else {
      temaTextoEl.value = titulo;
    }
    temaTextoEl.dispatchEvent(new Event("input", { bubbles: true }));
    temaTextoEl.dispatchEvent(new Event("change", { bubbles: true }));
  }

  abrirGenerarUnidadNuevaSeccion();
  guardarSelectsUnidad();
  return true;
}

function _resultadoWorkflowAwaitLectura(message = "Esperando respuesta del usuario.") {
  return {
    ok: true,
    code: "await_user",
    message: String(message || "Esperando respuesta del usuario.")
  };
}

async function _wfBuscarLecturaIniciarTarget(target = "", valor = "", textoNorm = "") {
  const raw = String(textoNorm || "").trim();
  const titulo = _extraerTituloLecturaDesdeComando(raw, valor);
  const filtros = _extraerFiltrosLecturaDesdeTexto(`${raw} ${valor}`);
  const preferCollection = _resolverColeccionWorkflowLectura(target, valor, raw)
    || String(charlyColeccionActiva || "").trim();

  // Reinicia ramas pendientes para arrancar un nuevo flujo limpio.
  charlyLecturaSeleccionPendiente = null;
  charlyLecturaDisambiguacionPendiente = null;
  charlyLecturaAccionPendiente = null;

  if (preferCollection && titulo) {
    const ok = await _buscarLecturaPorVozTarget(preferCollection, titulo, raw);
    if (_hayPendienteLecturaWorkflow() || !ok) {
      return _resultadoWorkflowAwaitLectura("Esperando colección, título o confirmación de lectura.");
    }
    return { ok: true, code: "executed", message: "Búsqueda inicial completada." };
  }
  if (!preferCollection) {
    charlyLecturaBusquedaPendiente = {
      step: "collection",
      titulo,
      preferCollection: "",
      filtros,
      expiresAt: Date.now() + 22000
    };
    _hablarPasoWorkflowLectura("Vamos a buscar una lectura. ¿La quieres de ASC o de nuevas con Charly?");
    return _resultadoWorkflowAwaitLectura("Esperando confirmación de colección.");
  }
  const suggestedCandidates = await _obtenerLecturasPreviewPorColeccion(preferCollection, { maxItems: 6 });
  charlyColeccionActiva = preferCollection;
  charlyLecturaBusquedaPendiente = {
    step: "title",
    titulo: "",
    preferCollection,
    suggestedCandidates,
    filtros,
    expiresAt: Date.now() + 22000
  };
  _hablarPasoWorkflowLectura(`Perfecto. Buscaré en ${_etiquetaColeccionLecturas(preferCollection)}. Dime el título o elige por número.`);
  return _resultadoWorkflowAwaitLectura("Esperando título de lectura.");
}

async function _wfBuscarLecturaIdentificarColeccionTarget(target = "", valor = "", textoNorm = "") {
  const raw = String(textoNorm || "").trim();
  const pendingSearch = charlyLecturaBusquedaPendiente;
  const filtros = {
    ...(pendingSearch?.filtros && typeof pendingSearch.filtros === "object" ? pendingSearch.filtros : {}),
    ..._extraerFiltrosLecturaDesdeTexto(`${raw} ${valor}`)
  };
  const preferCollection = _resolverColeccionWorkflowLectura(target, valor, raw);
  const titulo = _extraerTituloLecturaDesdeComando(raw, valor) || String(pendingSearch?.titulo || "").trim();

  if (!preferCollection) {
    charlyLecturaBusquedaPendiente = {
      step: "collection",
      titulo,
      preferCollection: "",
      filtros,
      expiresAt: Date.now() + 22000
    };
    _hablarPasoWorkflowLectura("Necesito la colección para continuar. ¿ASC o nuevas con Charly?");
    return _resultadoWorkflowAwaitLectura("Esperando colección.");
  }

  charlyColeccionActiva = preferCollection;
  if (titulo) {
    charlyLecturaBusquedaPendiente = null;
    const ok = await _buscarLecturaPorVozTarget(preferCollection, titulo, raw);
    if (_hayPendienteLecturaWorkflow() || !ok) {
      return _resultadoWorkflowAwaitLectura("Esperando confirmación o nuevo título.");
    }
    return { ok: true, code: "executed", message: "Colección identificada." };
  }

  const suggestedCandidates = await _obtenerLecturasPreviewPorColeccion(preferCollection, { maxItems: 6 });
  charlyLecturaBusquedaPendiente = {
    step: "title",
    titulo: "",
    preferCollection,
    suggestedCandidates,
    filtros,
    expiresAt: Date.now() + 22000
  };
  _hablarPasoWorkflowLectura(`Listo, usaré ${_etiquetaColeccionLecturas(preferCollection)}. Dime el título o elige una lectura por número.`);
  return _resultadoWorkflowAwaitLectura("Esperando título.");
}

async function _wfBuscarLecturaConfirmarLecturaTarget(target = "", valor = "", textoNorm = "") {
  const raw = String(textoNorm || "").trim();
  const entrada = raw || String(valor || "").trim();
  if (entrada) {
    const resolved = await _resolverPendientesLecturaPorVoz(entrada);
    if (resolved) {
      if (_hayPendienteLecturaWorkflow()) {
        return _resultadoWorkflowAwaitLectura("Esperando respuesta adicional del usuario.");
      }
      return { ok: true, code: "executed", message: "Confirmación procesada." };
    }
  }

  if (charlyLecturaSeleccionPendiente?.candidates?.length) {
    _anunciarCandidataPendienteLectura("_buscarLecturaPorVoz");
    return _resultadoWorkflowAwaitLectura("Esperando confirmación sí/no/cancelar.");
  }

  const pendingSearch = charlyLecturaBusquedaPendiente;
  const preferCollection = _resolverColeccionWorkflowLectura(target, valor, raw)
    || String(pendingSearch?.preferCollection || charlyColeccionActiva || "").trim();
  const titulo = _extraerTituloLecturaDesdeComando(raw, valor) || String(pendingSearch?.titulo || "").trim();
  const filtros = {
    ...(pendingSearch?.filtros && typeof pendingSearch.filtros === "object" ? pendingSearch.filtros : {}),
    ..._extraerFiltrosLecturaDesdeTexto(`${raw} ${valor}`)
  };

  if (!preferCollection) {
    charlyLecturaBusquedaPendiente = {
      step: "collection",
      titulo,
      preferCollection: "",
      filtros,
      expiresAt: Date.now() + 22000
    };
    _hablarPasoWorkflowLectura("Para confirmar una lectura primero dime la colección: ASC o nuevas con Charly.");
    return _resultadoWorkflowAwaitLectura("Esperando colección.");
  }
  if (!titulo) {
    const suggestedCandidates = await _obtenerLecturasPreviewPorColeccion(preferCollection, { maxItems: 6 });
    charlyLecturaBusquedaPendiente = {
      step: "title",
      titulo: "",
      preferCollection,
      suggestedCandidates,
      filtros,
      expiresAt: Date.now() + 22000
    };
    _hablarPasoWorkflowLectura(`Estoy en ${_etiquetaColeccionLecturas(preferCollection)}. Dime el título o elige por número.`);
    return _resultadoWorkflowAwaitLectura("Esperando título de lectura.");
  }

  charlyColeccionActiva = preferCollection;
  charlyLecturaBusquedaPendiente = null;
  const ok = await _buscarLecturaPorVozTarget(preferCollection, titulo, raw);
  if (_hayPendienteLecturaWorkflow() || !ok) {
    return _resultadoWorkflowAwaitLectura("Esperando confirmación de lectura.");
  }
  return { ok: true, code: "executed", message: "Lectura confirmada." };
}

async function _wfBuscarLecturaDecidirAccionTarget(_target = "", valor = "", textoNorm = "") {
  const raw = String(textoNorm || "").trim();
  const entrada = raw || String(valor || "").trim();
  if (entrada) {
    const resolved = await _resolverPendientesLecturaPorVoz(entrada);
    if (resolved) {
      if (_hayPendienteLecturaWorkflow()) {
        return _resultadoWorkflowAwaitLectura("Esperando respuesta para decidir acción.");
      }
      return { ok: true, code: "executed", message: "Acción sobre lectura procesada." };
    }
  }

  if (charlyLecturaAccionPendiente && Date.now() <= Number(charlyLecturaAccionPendiente.expiresAt || 0)) {
    _hablarPasoWorkflowLectura("Confirmado. ¿Qué deseas hacer?");
    return _resultadoWorkflowAwaitLectura("Esperando decisión de acción.");
  }

  if (charlyLecturaSeleccionPendiente?.candidates?.length) {
    _hablarPasoWorkflowLectura("Primero confirma la lectura con sí, no o cancelar.");
    _anunciarCandidataPendienteLectura("_buscarLecturaPorVoz");
    return _resultadoWorkflowAwaitLectura("Esperando confirmación de lectura.");
  }

  const ref = _leerReferenciaLecturaActual();
  if (!ref?.id || !ref?.coleccion) {
    _hablarPasoWorkflowLectura("Aún no tengo una lectura confirmada. Primero usa buscar lecturas.");
    return _resultadoWorkflowAwaitLectura("Esperando lectura confirmada.");
  }

  const docLectura = await _cargarLecturaDesdeFirebasePorRef(ref);
  charlyLecturaAccionPendiente = {
    id: ref.id,
    coleccion: ref.coleccion,
    titulo: String(docLectura?.titulo || docLectura?.tema || "la lectura").trim(),
    nivel: String(docLectura?.nivel || "").trim(),
    grado: String(docLectura?.grado || "").trim(),
    trimestre: String(docLectura?.trimestre || "").trim(),
    unidad: String(docLectura?.unidad || "").trim(),
    expiresAt: Date.now() + 45000
  };
  _hablarPasoWorkflowLectura("Confirmado. ¿Qué deseas hacer?");
  return _resultadoWorkflowAwaitLectura("Esperando acción del usuario.");
}

function _wfBuscarLecturaCerrarFlujoTarget(_target = "", _valor = "", _textoNorm = "") {
  const hadPending = !!(
    charlyLecturaBusquedaPendiente
    || charlyLecturaSeleccionPendiente
    || charlyLecturaDisambiguacionPendiente
    || charlyLecturaAccionPendiente
  );
  charlyLecturaBusquedaPendiente = null;
  charlyLecturaSeleccionPendiente = null;
  charlyLecturaDisambiguacionPendiente = null;
  charlyLecturaAccionPendiente = null;
  if (hadPending) {
    _hablarPasoWorkflowLectura("Listo, cerré el flujo de búsqueda de lecturas.");
  }
  return true;
}

async function _buscarLecturaPorVozTarget(_target = "", valor = "", textoNorm = "") {
  if (_debeOmitirPorCooldownComando("cmd_buscar_lectura", 1800)) return true;
  const raw = String(textoNorm || "").trim();
  const titulo = _extraerTituloLecturaDesdeComando(raw, valor);
  const filtros = _extraerFiltrosLecturaDesdeTexto(`${raw} ${valor}`);
  const preferCollectionFixed = _resolverColeccionWorkflowLectura("", "", "");
  const targetNorm = _normalizarTexto(String(_target || ""));
  const preferCollectionFromTarget = targetNorm === "lecturasasc"
    ? "lecturasASC"
    : (targetNorm === "lecturasnuevas" ? "lecturasNuevas" : "");
  const preferCollectionFromSpeech = _preferenciaColeccionLecturaDesdeTexto(`${raw} ${valor}`);
  const preferCollection = preferCollectionFixed
    || preferCollectionFromSpeech
    || preferCollectionFromTarget
    || String(charlyColeccionActiva || "").trim();
  if (!preferCollection) {
    charlyLecturaBusquedaPendiente = {
      step: "collection",
      titulo,
      preferCollection: "",
      filtros,
      expiresAt: Date.now() + 22000
    };
    _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "¿Qué lecturas buscas: ASC o nuevas con Charly?", { cancelarPrevio: true, preferLive: true });
    return true;
  }
  if (!titulo) {
    const suggestedCandidates = await _obtenerLecturasPreviewPorColeccion(preferCollection, { maxItems: 6 });
    charlyLecturaBusquedaPendiente = {
      step: "title",
      titulo: "",
      preferCollection,
      suggestedCandidates,
      filtros,
      expiresAt: Date.now() + 22000
    };
    _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", `Estoy en ${_etiquetaColeccionLecturas(preferCollection)}. Dime el título de la lectura o elige una por número.`, { cancelarPrevio: true, preferLive: true });
    return true;
  }
  charlyColeccionActiva = preferCollection;
  _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", "Buscando lectura.", { cancelarPrevio: true, preferLive: true });
  const candidates = await _buscarLecturasCandidatasEnColeccion(titulo, preferCollection, {
    filtros,
    maxCandidatos: 3
  });
  if (!candidates.length) {
    _hablarSiFuncionaRespuestaVoz("_buscarLecturaPorVoz", `No encontré una coincidencia confiable para ${titulo}. Dime otro título.`, { cancelarPrevio: true, preferLive: true });
    return false;
  }
  charlyLecturaSeleccionPendiente = _crearPendienteSeleccionLectura(candidates, preferCollection);
  _anunciarCandidataPendienteLectura("_buscarLecturaPorVoz");
  return true;
}

async function _leerLecturaPorVozTarget(_target = "", valor = "", textoNorm = "") {
  if (_debeOmitirPorCooldownComando("cmd_leer_lectura", 1800)) return true;
  const raw = String(textoNorm || "").trim();
  const tituloSolicitado = _extraerTituloLecturaDesdeComando(raw, valor);
  const filtros = _extraerFiltrosLecturaDesdeTexto(`${raw} ${valor}`);
  const preferCollectionFixed = _resolverColeccionWorkflowLectura("", "", "");
  const targetNorm = _normalizarTexto(String(_target || ""));
  const preferCollectionFromTarget = targetNorm === "lecturasasc"
    ? "lecturasASC"
    : (targetNorm === "lecturasnuevas" ? "lecturasNuevas" : "");
  const preferCollectionFromSpeech = _preferenciaColeccionLecturaDesdeTexto(`${raw} ${valor}`);
  const preferCollection = preferCollectionFixed
    || preferCollectionFromSpeech
    || preferCollectionFromTarget
    || String(charlyColeccionActiva || "").trim();
  if (tituloSolicitado) {
    if (!preferCollection) {
      _hablarSiFuncionaRespuestaVoz("_leerLecturaPorVoz", "Para leer por título, dime si es ASC o nuevas.", { cancelarPrevio: true, preferLive: true });
      return false;
    }
    charlyColeccionActiva = preferCollection;
    const encontrada = await _buscarLecturaSimpleEnColeccion(tituloSolicitado, preferCollection, { filtros });
    if (!encontrada?.id) {
      _hablarSiFuncionaRespuestaVoz(
        "_leerLecturaPorVoz",
        `No encontré una coincidencia confiable para ${tituloSolicitado} en ${preferCollection === "lecturasASC" ? "ASC" : "nuevas"}.`,
        { cancelarPrevio: true, preferLive: true }
      );
      return false;
    }
    _guardarReferenciaLecturaActual({ id: encontrada.id, coleccion: preferCollection });
    const started = await _iniciarLecturaDesdeRef({ id: encontrada.id, coleccion: preferCollection });
    if (!started) {
      _hablarSiFuncionaRespuestaVoz("_leerLecturaPorVoz", "No pude iniciar la lectura ahora mismo.", { cancelarPrevio: true, preferLive: true });
      return false;
    }
    return true;
  }

  const ref = _leerReferenciaLecturaActual();
  if (!ref?.id || !ref?.coleccion) {
    _hablarSiFuncionaRespuestaVoz("_leerLecturaPorVoz", "Primero usa buscar lectura para seleccionar una lectura.", { cancelarPrevio: true, preferLive: true });
    return false;
  }
  charlyColeccionActiva = String(ref.coleccion || "").trim() || charlyColeccionActiva;
  const started = await _iniciarLecturaDesdeRef(ref);
  if (!started) {
    _hablarSiFuncionaRespuestaVoz("_leerLecturaPorVoz", "No encontré esa lectura en Firebase. Busca nuevamente.", { cancelarPrevio: true, preferLive: true });
    return false;
  }
  return true;
}

function _selectorBotonAccionLecturaTabla(accion = "", coleccion = "") {
  const col = String(coleccion || "").trim();
  const act = String(accion || "").trim();
  if (col === "lecturasASC") {
    if (act === "ver") return ".ascView";
    if (act === "leer") return ".ascReadLive";
    if (act === "editar") return ".ascEdit";
    if (act === "word") return ".ascWord";
    return "";
  }
  if (act === "ver") return ".btn-ver";
  if (act === "leer") return ".btn-live-read";
  if (act === "editar") return ".btn-editar";
  if (act === "word") return ".btn-descargar";
  return "";
}

async function _abrirTablaLecturasPorColeccion(coleccion = "") {
  const col = String(coleccion || "").trim();
  if (!col) return false;
  const targetModalId = col === "lecturasASC" ? "ascModal" : "modalLecturasNuevas";
  const targetModal = document.getElementById(targetModalId);
  let openedByDock = false;
  try {
    openedByDock = window.cbUnidadDock?.openSection?.(targetModalId) === true;
  } catch (_) {}
  if (!modalAcopladoVisible(targetModal) && !openedByDock) {
    mostrarModalAcopladoById(targetModalId);
  }
  const btnId = col === "lecturasASC" ? "btnLecturasAsc" : "btnSugerenciasLectura";
  const btn = document.getElementById(btnId);
  // ASC debe abrirse siempre desde el botón para disparar openAscModal() + boot().
  if (col === "lecturasASC" && btn && typeof btn.click === "function") {
    btn.click();
  } else if (!modalAcopladoVisible(targetModal) && btn && typeof btn.click === "function") {
    btn.click();
  }
  const waitForId = col === "lecturasASC" ? "ascTbody" : "contenedorLecturasNuevas";
  for (let i = 0; i < 34; i++) {
    await sleep(120);
    const el = document.getElementById(waitForId);
    if (!el || !modalAcopladoVisible(targetModal)) continue;
    if (col !== "lecturasASC") {
      if (String(el.innerHTML || "").trim()) return true;
      continue;
    }
    const rows = el.querySelectorAll("tr[data-id]");
    if (rows.length > 0) return true;
    const html = String(el.innerHTML || "").trim();
    const stillLoading = /cargando lecturas/i.test(html);
    if (!stillLoading) {
      const ascVacio = document.getElementById("ascVacio");
      const ascVacioVisible = !!(ascVacio && !ascVacio.classList.contains("hidden"));
      if (ascVacioVisible || html.length > 0) return true;
    }
  }
  return !!document.getElementById(waitForId) && modalAcopladoVisible(targetModal);
}

async function _aplicarFiltroBusquedaLecturaTabla(coleccion = "", textoBusqueda = "", options = {}) {
  const col = String(coleccion || "").trim();
  const value = String(textoBusqueda || "").trim();
  if (!col || !value) return false;
  const inputId = col === "lecturasASC" ? "ascBuscador" : "buscadorLecturasNuevas";
  const input = document.getElementById(inputId);
  if (!input || !("value" in input)) return false;
  const expectedId = String(options?.expectedId || "").trim();
  const expectedTitle = String(options?.expectedTitle || "").trim();
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  if (col === "lecturasASC" && typeof window.aplicarFiltrosAsc === "function") {
    try { window.aplicarFiltrosAsc(); } catch (_) {}
  }
  const safeExpectedId = expectedId
    ? ((typeof CSS !== "undefined" && typeof CSS.escape === "function")
      ? CSS.escape(expectedId)
      : expectedId.replace(/["\\]/g, "\\$&"))
    : "";
  const rootId = col === "lecturasASC" ? "ascTbody" : "contenedorLecturasNuevas";
  for (let i = 0; i < 32; i++) {
    const root = document.getElementById(rootId);
    if (root) {
      if (safeExpectedId && root.querySelector(`tr[data-id="${safeExpectedId}"]`)) return true;
      if (expectedTitle && _encontrarFilaLecturaPorTituloEnTabla(col, expectedTitle)) return true;
      if (!safeExpectedId && !expectedTitle && String(root.innerHTML || "").trim()) return true;
    }
    await sleep(90);
  }
  if (safeExpectedId || expectedTitle) return false;
  return true;
}

function _encontrarFilaLecturaPorTituloEnTabla(coleccion = "", titulo = "") {
  const col = String(coleccion || "").trim();
  const titleNorm = _normalizarTexto(String(titulo || "").trim());
  if (!col || !titleNorm) return null;
  const root = document.getElementById(col === "lecturasASC" ? "ascTbody" : "contenedorLecturasNuevas");
  if (!root) return null;
  const rows = Array.from(root.querySelectorAll("tr[data-id]"));
  if (!rows.length) return null;
  let best = null;
  let bestScore = 0;
  const titleTokens = titleNorm.split(/\s+/).filter((t) => t.length > 1);
  for (const row of rows) {
    const firstCell = row.querySelector("td");
    const rowTitleNorm = _normalizarTexto(String(firstCell?.textContent || row?.textContent || "").trim());
    if (!rowTitleNorm) continue;
    let score = 0;
    if (rowTitleNorm === titleNorm) score += 1000;
    if (rowTitleNorm.includes(titleNorm) || titleNorm.includes(rowTitleNorm)) score += 300;
    for (const tk of titleTokens) {
      if (rowTitleNorm.includes(tk)) score += 30;
    }
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

async function _resolverTituloLecturaParaFiltro(ref = {}) {
  const id = String(ref?.id || "").trim();
  const coleccion = String(ref?.coleccion || "").trim();
  const directTitle = String(ref?.titulo || ref?.tema || "").trim();
  if (directTitle) return directTitle;
  if (!id || !coleccion) return "";

  if (coleccion === "lecturasASC") {
    const safeId = (typeof CSS !== "undefined" && typeof CSS.escape === "function")
      ? CSS.escape(id)
      : id.replace(/["\\]/g, "\\$&");
    const row = document.querySelector(`#ascTbody tr[data-id="${safeId}"]`);
    const rowTitle = String(row?.querySelector("td")?.textContent || "").trim();
    if (rowTitle) return rowTitle;
  }

  const cacheLectura = typeof _leerLecturaCache === "function" ? _leerLecturaCache() : null;
  if (String(cacheLectura?.id || "").trim() === id) {
    const cacheTitle = String(cacheLectura?.titulo || cacheLectura?.tema || "").trim();
    if (cacheTitle) return cacheTitle;
  }

  const pools = [
    ...(Array.isArray(window.lecturasASC) ? window.lecturasASC : []),
    ...(Array.isArray(window.lecturasNuevas) ? window.lecturasNuevas : []),
    ...(Array.isArray(window.todasLasLecturas) ? window.todasLasLecturas : []),
    ...(Array.isArray(window.lecturasFiltradas) ? window.lecturasFiltradas : [])
  ];
  const foundLocal = pools.find((it) => String(it?.id || "").trim() === id);
  const localTitle = String(foundLocal?.titulo || foundLocal?.tema || "").trim();
  if (localTitle) return localTitle;

  const remote = await _cargarLecturaDesdeFirebasePorRef({ id, coleccion });
  const remoteTitle = String(remote?.titulo || remote?.tema || "").trim();
  if (remoteTitle) return remoteTitle;
  return "";
}

async function _buscarBotonAccionLecturaEnTabla(ref = {}, accion = "") {
  const id = String(ref?.id || "").trim();
  const coleccion = String(ref?.coleccion || "").trim();
  let titulo = String(ref?.titulo || ref?.tema || "").trim();
  if (!id || !coleccion) return null;
  const opened = await _abrirTablaLecturasPorColeccion(coleccion);
  if (!opened) return null;
  if (!titulo) {
    titulo = await _resolverTituloLecturaParaFiltro({ id, coleccion });
    if (titulo) {
      ref.titulo = titulo;
    }
  }
  if (titulo) {
    await _aplicarFiltroBusquedaLecturaTabla(coleccion, titulo, { expectedId: id, expectedTitle: titulo });
  }
  const safeId = (typeof CSS !== "undefined" && typeof CSS.escape === "function")
    ? CSS.escape(id)
    : id.replace(/["\\]/g, "\\$&");
  const rowSelector = coleccion === "lecturasASC"
    ? `#ascTbody tr[data-id="${safeId}"]`
    : `#contenedorLecturasNuevas tr[data-id="${safeId}"]`;
  const btnSelector = _selectorBotonAccionLecturaTabla(accion, coleccion);
  if (!btnSelector) return null;
  for (let i = 0; i < 80; i++) {
    const row = document.querySelector(rowSelector);
    let btn = row?.querySelector(btnSelector) || null;
    if (!btn && titulo) {
      const fallbackRow = _encontrarFilaLecturaPorTituloEnTabla(coleccion, titulo);
      btn = fallbackRow?.querySelector(btnSelector) || null;
    }
    if (btn && coleccion === "lecturasASC" && accion === "ver") {
      const validAscViewBtn = btn.classList.contains("lectura-action-btn")
        && btn.classList.contains("action-ver")
        && btn.classList.contains("ascView");
      if (!validAscViewBtn) btn = null;
    }
    if (btn) return btn;
    // Reintenta el filtrado por título durante la espera para cubrir
    // cargas lentas del listado ASC y evitar clicks fuera de contexto.
    if (titulo && (i === 20 || i === 45)) {
      await _aplicarFiltroBusquedaLecturaTabla(coleccion, titulo);
    }
    await sleep(120);
  }
  return null;
}

function _payloadViewerLecturaDesdeDoc(docLectura = {}, fallbackRef = {}) {
  const sourceCollection = String(
    docLectura?.sourceCollection
    || docLectura?.coleccion
    || fallbackRef?.coleccion
    || ""
  ).trim();
  return {
    id: String(docLectura?.id || fallbackRef?.id || "").trim(),
    coleccion: sourceCollection,
    sourceCollection,
    titulo: String(docLectura?.titulo || docLectura?.tema || fallbackRef?.titulo || "Lectura sin título").trim(),
    htmlLectura: String(
      docLectura?.textoLectura
      || docLectura?.contenidoHTML
      || docLectura?.contenido
      || docLectura?.texto
      || ""
    ).trim() || "<p>(Sin contenido)</p>",
    preguntas: Array.isArray(docLectura?.preguntas) ? docLectura.preguntas : [],
    metadatos: {
      nivel: String(docLectura?.nivel || "").trim(),
      grado: String(docLectura?.grado || "").trim(),
      trimestre: String(docLectura?.trimestre || "").trim(),
      unidad: String(docLectura?.unidad || "").trim()
    }
  };
}

async function _resolverLecturaParaVerExclusivo(_target = "", valor = "", textoNorm = "") {
  const raw = String(textoNorm || "").trim();
  const tituloSolicitado = _extraerTituloLecturaDesdeComando(raw, valor);
  const filtros = _extraerFiltrosLecturaDesdeTexto(`${raw} ${valor}`);
  const preferCollectionFixed = _resolverColeccionWorkflowLectura("", "", "");
  const targetNorm = _normalizarTexto(String(_target || ""));
  const preferCollectionFromTarget = targetNorm === "lecturasasc"
    ? "lecturasASC"
    : (targetNorm === "lecturasnuevas" ? "lecturasNuevas" : "");
  const preferCollectionFromSpeech = _preferenciaColeccionLecturaDesdeTexto(`${raw} ${valor}`);
  const preferCollection = preferCollectionFromTarget
    || preferCollectionFromSpeech
    || preferCollectionFixed
    || String(charlyColeccionActiva || "").trim();

  let ref = _leerReferenciaLecturaActual();
  if (tituloSolicitado) {
    if (!preferCollection) {
      _hablarPasoWorkflowLectura("Necesito saber si la lectura es de ASC o de nuevas con Charly.");
      return null;
    }
    const encontrada = await _buscarLecturaSimpleEnColeccion(tituloSolicitado, preferCollection, { filtros });
    if (!encontrada?.id) {
      _hablarPasoWorkflowLectura(`No encontré una coincidencia confiable para ${tituloSolicitado} en ${preferCollection === "lecturasASC" ? "ASC" : "lecturas nuevas"}.`);
      return null;
    }
    ref = {
      id: encontrada.id,
      coleccion: preferCollection,
      titulo: encontrada.titulo || encontrada.tema || tituloSolicitado
    };
    _guardarReferenciaLecturaActual(ref);
    charlyColeccionActiva = preferCollection;
  }

  if (!ref?.id || !ref?.coleccion) {
    _hablarPasoWorkflowLectura("Primero busca o dime el título de la lectura.");
    return null;
  }

  const docLectura = await _cargarLecturaDesdeFirebasePorRef(ref);
  if (!docLectura?.id) {
    _hablarPasoWorkflowLectura("No encontré esa lectura en Firebase. Busca nuevamente.");
    return null;
  }

  const titulo = String(docLectura?.titulo || docLectura?.tema || ref?.titulo || "").trim();
  _guardarReferenciaLecturaActual({ id: docLectura.id, coleccion: ref.coleccion, titulo });
  if (String(ref.coleccion || "").trim()) {
    charlyColeccionActiva = String(ref.coleccion || "").trim();
  }
  return { ref, docLectura };
}

async function _accionLecturaTablaPorVozTarget(_target = "", valor = "", textoNorm = "", accion = "") {
  const action = String(accion || "").trim();
  if (!action) return false;
  const cooldownKey = `cmd_accion_lectura_${action}`;
  if (_debeOmitirPorCooldownComando(cooldownKey, 1400)) return true;
  const raw = String(textoNorm || "").trim();
  const tituloSolicitado = _extraerTituloLecturaDesdeComando(raw, valor);
  const filtros = _extraerFiltrosLecturaDesdeTexto(`${raw} ${valor}`);
  const preferCollectionFixed = _resolverColeccionWorkflowLectura("", "", "");
  const targetNorm = _normalizarTexto(String(_target || ""));
  const preferCollectionFromTarget = targetNorm === "lecturasasc"
    ? "lecturasASC"
    : (targetNorm === "lecturasnuevas" ? "lecturasNuevas" : "");
  const preferCollectionFromSpeech = _preferenciaColeccionLecturaDesdeTexto(`${raw} ${valor}`);
  // Priorizar colección explícita del flujo/contexto (target) para evitar
  // desvíos cuando el modal visible o el comando activo apunta a otra colección.
  const preferCollection = preferCollectionFromTarget
    || preferCollectionFromSpeech
    || preferCollectionFixed
    || String(charlyColeccionActiva || "").trim();

  let ref = _leerReferenciaLecturaActual();
  if (tituloSolicitado) {
    if (!preferCollection) {
      _hablarPasoWorkflowLectura("Necesito saber si la lectura es de ASC o de nuevas con Charly.");
      return false;
    }
    const encontrada = await _buscarLecturaSimpleEnColeccion(tituloSolicitado, preferCollection, { filtros });
    if (!encontrada?.id) {
      _hablarPasoWorkflowLectura(`No encontré una coincidencia confiable para ${tituloSolicitado} en ${preferCollection === "lecturasASC" ? "ASC" : "lecturas nuevas"}.`);
      return false;
    }
    ref = { id: encontrada.id, coleccion: preferCollection, titulo: encontrada.titulo || encontrada.tema || tituloSolicitado };
    _guardarReferenciaLecturaActual(ref);
    charlyColeccionActiva = preferCollection;
  }

  if (!ref?.id || !ref?.coleccion) {
    _hablarPasoWorkflowLectura("Primero busca o dime el título de la lectura.");
    return false;
  }

  if (!String(ref.titulo || ref.tema || "").trim()) {
    const recoveredTitle = await _resolverTituloLecturaParaFiltro(ref);
    if (recoveredTitle) ref.titulo = recoveredTitle;
  }

  const btn = await _buscarBotonAccionLecturaEnTabla(ref, action);
  if (!btn) {
    _hablarPasoWorkflowLectura("No pude encontrar ese botón de acción en la tabla.");
    return false;
  }
  btn.click();
  return true;
}

async function _verLecturaPorVozTarget(target = "", valor = "", textoNorm = "") {
  if (_agenteUnidadEnModoExclusivo()) {
    const cooldownKey = "cmd_accion_lectura_ver_exclusive";
    if (_debeOmitirPorCooldownComando(cooldownKey, 1400)) return true;
    const resolved = await _resolverLecturaParaVerExclusivo(target, valor, textoNorm);
    if (!resolved?.docLectura?.id) return false;
    if (typeof window.cbOpenLecturasAgentViewer === "function") {
      window.cbOpenLecturasAgentViewer(_payloadViewerLecturaDesdeDoc(resolved.docLectura, resolved.ref));
      return true;
    }
    _hablarPasoWorkflowLectura("El visor del agente no está disponible ahora mismo.");
    return false;
  }
  // Prioridad explícita: "ver lectura" debe accionar vista previa (ascView / btn-ver).
  const openedView = await _accionLecturaTablaPorVozTarget(target, valor, textoNorm, "ver");
  if (openedView) {
    // En modo agente exclusivo el visor dedicado se abre sobre el stage y no debe
    // forzar el modal tradicional de resultado.
    if (!_agenteUnidadEnModoExclusivo()) {
      try { window.cbUnidadDock?.openSection?.("modalResultadoLectura"); } catch (_) {}
    }
    return true;
  }
  // Fallback de compatibilidad: si no existe vista, intenta editor.
  return _accionLecturaTablaPorVozTarget(target, valor, textoNorm, "editar");
}

async function _editarLecturaPorVozTarget(target = "", valor = "", textoNorm = "") {
  return _accionLecturaTablaPorVozTarget(target, valor, textoNorm, "editar");
}

async function _exportarLecturaWordPorVozTarget(target = "", valor = "", textoNorm = "") {
  return _accionLecturaTablaPorVozTarget(target, valor, textoNorm, "word");
}

async function _manejarAccionLecturaTablaPorVozDirecta(transcripcion = "") {
  const raw = String(transcripcion || "").trim();
  const norm = _normalizarTexto(raw);
  if (!norm || !/\blectura\b/.test(norm)) return false;
  const accion = _resolverAccionSobreLectura(raw);
  if (!accion || !["leer", "ver", "editar", "word"].includes(accion)) return false;
  const titulo = _extraerTituloLecturaDesdeComando(raw, "");
  if (!titulo) return false;
  if (accion === "leer") return _leerLecturaPorVozTarget("", titulo, raw);
  if (accion === "ver") return _verLecturaPorVozTarget("", titulo, raw);
  if (accion === "editar") return _editarLecturaPorVozTarget("", titulo, raw);
  if (accion === "word") return _exportarLecturaWordPorVozTarget("", titulo, raw);
  return false;
}

function _valorInputDesdeMatch(textoNorm = "", matchObj = null) {
  const t = String(textoNorm || "");
  const quoted = t.match(/["“](.+?)["”]/);
  if (quoted?.[1]) return String(quoted[1]).trim();
  const _limpiarPrefijoBusqueda = (s = "") => String(s || "")
    .replace(/^(?:buscar|busca|buscar por|busca por)\s+/i, "")
    .replace(/^(?:el\s+)?(?:titulo|título|nombre|lectura)\s*(?:se\s+llama|es|de)?\s*/i, "")
    .replace(/^[:\-.,\s]+/, "")
    .trim();
  if (!matchObj || typeof matchObj.index !== "number") {
    const byKeyword = t.match(/(?:buscar|busca)(?:\s+por)?\s+(?:el\s+)?(?:titulo|título|nombre)\s+(.+)$/i);
    if (byKeyword?.[1]) return _limpiarPrefijoBusqueda(byKeyword[1]);
    return _limpiarPrefijoBusqueda(t);
  }
  const idxEnd = Number(matchObj.index) + String(matchObj[0] || "").length;
  const rest = t.slice(idxEnd).trim().replace(/^[:\-.,\s]+/, "");
  if (!rest) {
    const byKeyword = t.match(/(?:buscar|busca)(?:\s+por)?\s+(?:el\s+)?(?:titulo|título|nombre)\s+(.+)$/i);
    if (byKeyword?.[1]) return _limpiarPrefijoBusqueda(byKeyword[1]);
    return _limpiarPrefijoBusqueda(t);
  }
  return rest.trim();
}

function _armarCapturaPendienteInput(targetId = "", textoNorm = "") {
  const t = String(targetId || "").trim();
  if (!t) return;
  const norm = _normalizarTexto(textoNorm);
  if (!norm) return;
  if (t !== "filtroBusquedaLectura" && t !== "unidadTemaTexto" && t !== "textareaInstruccionesGemini") return;
  voicePendingInputCapture = {
    target: t,
    createdAt: Date.now(),
    expiresAt: Date.now() + 16000
  };
  const speakPrompt = _debeResponderPorFuncion("_setInputByVoice", false);
  if (!speakPrompt) return;
  if (t === "unidadTemaTexto") {
    hablarUnidad("Dime el título de la lectura.", { cancelarPrevio: true });
  } else if (t === "filtroBusquedaLectura") {
    hablarUnidad("Dime el texto a buscar.", { cancelarPrevio: true });
  } else if (t === "textareaInstruccionesGemini") {
    hablarUnidad("Dicta las instrucciones para Gemini.", { cancelarPrevio: true });
  }
}

async function _intentarConsumirCapturaPendiente(transcripcion = "") {
  const pending = voicePendingInputCapture;
  if (!pending) return false;
  const now = Date.now();
  if (now > Number(pending.expiresAt || 0)) {
    voicePendingInputCapture = null;
    return false;
  }
  const raw = String(transcripcion || "").trim();
  const norm = _normalizarTexto(raw);
  if (!norm || norm.length < 2) return false;
  const esTextareaInstrucciones = String(pending.target || "") === "textareaInstruccionesGemini";
  // No secuestrar comandos reales del sistema/selects mientras hay captura pendiente.
  if (!esTextareaInstrucciones && (_esSolicitudAccionExplicita(norm) || /\b(nivel|grado|trimestre|unidad|tema|lectura principal)\b/i.test(norm))) {
    return false;
  }
  // Evita consumir con frases de control.
  if (/\b(cancela|cancelar|olvida|deten|parar|alto|charly|abre|abrir|cierra|cerrar)\b/i.test(norm)) return false;
  const ok = await _setInputByVoiceTarget(String(pending.target || ""), raw, norm);
  if (!ok) return false;
  if (esTextareaInstrucciones) {
    // Mantener captura viva para dictado continuo en múltiples fragmentos.
    voicePendingInputCapture = {
      ...pending,
      createdAt: now,
      expiresAt: Date.now() + 12000
    };
  } else {
    voicePendingInputCapture = null;
  }
  return !!ok;
}

async function _setInputByVoiceTarget(target = "", valor = "", textoNorm = "") {
  const targetId = String(target || "").trim();
  let openedLecturasModal = false;
  let el = document.getElementById(targetId);
  // Caso especial: campo de búsqueda en modal de lecturas.
  if (targetId === "filtroBusquedaLectura") {
    const modal = document.getElementById("modalSeleccionarLectura");
    const modalAbierto = !!(modal && modal.style.display === "flex");
    const abrirBtn = document.getElementById("btnAbrirModalLectura");
    if (!modalAbierto && abrirBtn && typeof abrirBtn.click === "function") {
      abrirBtn.click();
      openedLecturasModal = true;
    }
    // Esperar a que la apertura/carga del modal termine para evitar que el reset interno borre lo dictado.
    for (let i = 0; i < 24; i++) {
      await sleep(110);
      el = document.getElementById(targetId);
      const modalNow = document.getElementById("modalSeleccionarLectura");
      const body = document.getElementById("cuerpoTablaLecturas");
      const modalReady = !!(modalNow && modalNow.style.display === "flex");
      const tablaReady = !!(body && body.querySelectorAll("tr").length);
      if (el && modalReady && (tablaReady || i >= 10)) break;
    }
  }
  if (!el || !("value" in el)) return false;
  const value = String(valor || "").trim();
  if (!value) {
    // Permite comando "buscar título" sin payload: abre/enfoca el filtro.
    if (targetId === "filtroBusquedaLectura" || targetId === "unidadTemaTexto" || targetId === "textareaInstruccionesGemini") {
      try { el.focus(); } catch (_) { }
      _armarCapturaPendienteInput(targetId, textoNorm);
      return true;
    }
    return false;
  }
  const appendMode = /\b(agrega|anade|añade|dicta|continua|continúa)\b/i.test(String(textoNorm || ""));
  const appendDictadoContinuo =
    targetId === "textareaInstruccionesGemini" &&
    !!voicePendingInputCapture &&
    voicePendingInputCapture.target === "textareaInstruccionesGemini";
  if ((appendMode || appendDictadoContinuo) && String(el.value || "").trim()) {
    el.value = `${String(el.value || "").trim()}\n${value}`;
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  // Evita submit/reload accidental en inputs dentro de formularios (ej. unidadTemaTexto).
  const isTextInput = String(el.tagName || "").toUpperCase() === "INPUT"
    && /^(text|search|email|url|tel|number|password)?$/i.test(String(el.type || "text"));
  if (!(isTextInput && targetId === "unidadTemaTexto")) {
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));
  }
  if (targetId === "filtroBusquedaLectura" && typeof window.aplicarFiltrosModal === "function") {
    try { window.aplicarFiltrosModal(); } catch (_) { }
  }
  if (targetId === "unidadTemaTexto") {
    setTimeout(() => {
      _aplicarBusquedaManualTema(value).catch(() => { });
    }, 80);
  }
  if (targetId === "filtroBusquedaLectura") {
    // Tras filtrar, intenta seleccionar automáticamente la mejor coincidencia en la tabla.
    setTimeout(() => {
      _selectLecturaTablaByText("cuerpoTablaLecturas", value, `selecciona lectura ${value}`).catch(() => { });
    }, 220);
  }
  // Reafirma valor tras la apertura/carga del modal para evitar que lo pise un reset asíncrono.
  if (openedLecturasModal && targetId === "filtroBusquedaLectura") {
    // Reafirma múltiples veces porque abrirModalLecturas hace resets asíncronos.
    [220, 520, 950, 1450, 2100, 2900].forEach((ms) => {
      setTimeout(() => {
        const inp = document.getElementById("filtroBusquedaLectura");
        if (!inp || !("value" in inp)) return;
        if (String(inp.value || "").trim() !== value) {
          inp.value = value;
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (typeof window.aplicarFiltrosModal === "function") {
          try { window.aplicarFiltrosModal(); } catch (_) { }
        }
        if (String(inp.value || "").trim()) {
          _selectLecturaTablaByText("cuerpoTablaLecturas", String(inp.value || "").trim(), `selecciona lectura ${String(inp.value || "").trim()}`).catch(() => { });
        }
      }, ms);
    });
  }
  return true;
}

async function _setSelectByVoiceTarget(target = "", valor = "") {
  const el = document.getElementById(String(target || "").trim());
  if (!el) return false;
  // Compatibilidad defensiva: algunas configuraciones antiguas guardaron `unidadTemaTexto` como select.
  if (el.tagName !== "SELECT") {
    const t = String(target || "").trim();
    if (t === "unidadTemaTexto" || t === "filtroBusquedaLectura") {
      return _setInputByVoiceTarget(t, valor, `selecciona lectura ${String(valor || "").trim()}`);
    }
    return false;
  }
  return aplicarValorSelectPorVoz(el, String(valor || "").trim(), {});
}

function _toggleCheckboxByVoiceTarget(target = "", textoNorm = "") {
  const el = document.getElementById(String(target || "").trim());
  if (!el || el.type !== "checkbox") return false;
  const t = _normalizarTexto(textoNorm);
  if (/\b(desmarcar|quita|quitar|apaga|desactivar|desactiva|off)\b/.test(t)) {
    el.checked = false;
  } else if (/\b(marcar|marca|activar|activa|enciende|on)\b/.test(t)) {
    el.checked = true;
  } else {
    el.checked = !el.checked;
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function _normalizarCategoriaTablaSecuencia(texto = "") {
  const t = _normalizarTexto(texto);
  if (!t) return "";
  if (t.includes("proyecto")) return "Proyectos";
  if (t.includes("lenguaje")) return "Lenguaje y comunicación";
  if (t.includes("comunicacion")) return "Lenguaje y comunicación";
  if (t.includes("matematic")) return "Matemáticas";
  if (t.includes("ciencias experimentales")) return "Ciencias experimentales";
  if (t.includes("ciencia experimental")) return "Ciencias experimentales";
  if (t.includes("ciencias sociales")) return "Ciencias sociales";
  if (t.includes("sociales")) return "Ciencias sociales";
  if (t.includes("socioemocional")) return "Formación socioemocional";
  if (t.includes("formacion socioemocional")) return "Formación socioemocional";
  return "";
}

function _obtenerFilasTablaSecuencia() {
  const rows = Array.from(document.querySelectorAll(".tabla-secuencia tbody tr"));
  return rows.map((row) => {
    const tds = row.querySelectorAll("td");
    const categoria = String(tds?.[1]?.textContent || "").trim();
    const subtema = String(tds?.[2]?.textContent || "").trim();
    const subtemaInterno =
      row.querySelector('input[name^="generar_"]')?.dataset?.subtema ||
      row.querySelector('input[name^="generar_subtema_"]')?.dataset?.subtema ||
      "";
    return { row, categoria, subtema, subtemaInterno };
  }).filter((it) => it.row && (it.categoria || it.subtema));
}

function _resolverFilaTablaSecuencia(query = "", categoriaPreferida = "") {
  const filas = _obtenerFilasTablaSecuencia();
  if (!filas.length) return null;
  const categoriaNorm = _normalizarCategoriaTablaSecuencia(categoriaPreferida || query);
  let candidatas = filas;
  if (categoriaNorm) {
    candidatas = filas.filter((f) => _normalizarTexto(f.categoria) === _normalizarTexto(categoriaNorm));
    if (!candidatas.length) candidatas = filas;
  }
  const q = _normalizarTexto(query);
  if (!q) return candidatas[0] || null;
  let best = null;
  let bestScore = 0;
  candidatas.forEach((f) => {
    const s1 = _scoreMatchTexto(f.subtema, q);
    const s1b = _scoreMatchTexto(f.subtemaInterno, q);
    const s2 = _scoreMatchTexto(f.categoria, q);
    const score = Math.max(s1 + 1, s1b + 2, s2);
    if (score > bestScore) {
      best = f;
      bestScore = score;
    }
  });
  return bestScore >= 2 ? best : (candidatas[0] || null);
}

function _resolverCategoriaDesdeTextoOSubtema(query = "") {
  const q = String(query || "").trim();
  const fromCategoria = _normalizarCategoriaTablaSecuencia(q);
  if (fromCategoria) return fromCategoria;
  const fila = _resolverFilaTablaSecuencia(_limpiarConsultaTablaSecuencia(q) || q, "");
  if (fila?.categoria) return fila.categoria;
  return "";
}

function _resolverNombreColumnaSecuencia(target = "", textoNorm = "") {
  const t = _normalizarTexto(`${target} ${textoNorm}`);
  if (/\b(generar|activar subtema)\b/.test(t)) return "generar";
  if (/\b(relacion|relacionar|lectura)\b/.test(t)) return "relacion";
  if (/\b(recortable|recortables)\b/.test(t)) return "recortable";
  if (/\b(ficha|fichas)\b/.test(t)) return "ficha";
  if (/\b(anexo|anexos)\b/.test(t)) return "anexo";
  if (/\b(video|videos)\b/.test(t)) return "video";
  return "";
}

function _resolverColumnasSecuenciaDesdeTexto(textoNorm = "", target = "") {
  const t = _normalizarTexto(`${target} ${textoNorm}`);
  const columnas = [];
  if (/\b(generar|activar subtema)\b/.test(t)) columnas.push("generar");
  if (/\b(relacion|relacionar|lectura)\b/.test(t)) columnas.push("relacion");
  if (/\b(recortable|recortables)\b/.test(t)) columnas.push("recortable");
  if (/\b(ficha|fichas)\b/.test(t)) columnas.push("ficha");
  if (/\b(anexo|anexos)\b/.test(t)) columnas.push("anexo");
  if (/\b(video|videos)\b/.test(t)) columnas.push("video");
  return columnas;
}

function _resolverEstadoCheckbox(textoNorm = "") {
  const t = _normalizarTexto(textoNorm);
  if (/\b(desmarcar|desactiva|desactivar|quitar|quita|off|no)\b/.test(t)) return false;
  if (/\b(marcar|activa|activar|poner|pon|on|si)\b/.test(t)) return true;
  return true;
}

function _limpiarConsultaTablaSecuencia(query = "") {
  return _normalizarTexto(String(query || ""))
    .replace(/[()]/g, " ")
    .replace(/\b(agrega|anade|añade|pon|poner|activa|activar|marca|marcar|quita|quitar|desactiva|desactivar|desmarca|desmarcar)\b/g, " ")
    .replace(/\b(anexo|anexos|ficha|fichas|recortable|recortables|video|videos|relacion|relacionar|lectura|generar|categoria|categoría|subtema|actividad|actividades)\b/g, " ")
    .replace(/\b(a|en|de|del|la|el|los|las|para)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function _obtenerCheckboxFilaPorColumna(row, columna = "") {
  if (!row || !columna) return null;
  const nameByColumn = {
    generar: "generar_",
    relacion: "relacion_",
    recortable: "recortable_",
    ficha: "ficha_",
    anexo: "anexo_",
    video: "video_"
  };
  const prefix = nameByColumn[columna];
  if (!prefix) return null;
  return row.querySelector(`input[type='checkbox'][name^='${prefix}']`);
}

function _setTablaSecuenciaCheckboxByVoiceTarget(target = "", valor = "", textoNorm = "") {
  const columna = _resolverNombreColumnaSecuencia(target, textoNorm);
  if (!columna) return false;
  const query = String(valor || "").trim() || String(textoNorm || "").trim();
  const categoria = _normalizarCategoriaTablaSecuencia(query);
  const subtemaQuery = _limpiarConsultaTablaSecuencia(query);
  const activar = _resolverEstadoCheckbox(textoNorm || valor);
  const textoCompletoNorm = _normalizarTexto(textoNorm || query);
  const solicitudCategoriaCompleta =
    /\b(categoria|categoría)\b/.test(textoCompletoNorm) &&
    !!_normalizarCategoriaTablaSecuencia(textoCompletoNorm);

  const filas = _obtenerFilasTablaSecuencia();
  if (!filas.length) return false;

  if ((categoria && !subtemaQuery) || solicitudCategoriaCompleta) {
    const categoriaObjetivo = categoria || _normalizarCategoriaTablaSecuencia(textoCompletoNorm);
    let cambios = 0;
    filas
      .filter((f) => _normalizarTexto(f.categoria) === _normalizarTexto(categoriaObjetivo))
      .forEach((f) => {
        const chk = _obtenerCheckboxFilaPorColumna(f.row, columna);
        if (!chk) return;
        if (chk.checked !== activar) {
          chk.checked = activar;
          chk.dispatchEvent(new Event("change", { bubbles: true }));
        }
        cambios += 1;
      });
    return cambios > 0;
  }

  const fila = _resolverFilaTablaSecuencia(subtemaQuery || query, categoria);
  if (!fila?.row) return false;
  const checkbox = _obtenerCheckboxFilaPorColumna(fila.row, columna);
  if (!checkbox) return false;
  if (checkbox.checked !== activar) {
    checkbox.checked = activar;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return true;
}

function _setTablaSecuenciaCheckboxCategoriaCompleta(textoNorm = "") {
  const textoCompletoNorm = _normalizarTexto(textoNorm);
  if (!textoCompletoNorm || !/\b(categoria|categoría)\b/.test(textoCompletoNorm)) return false;
  const columnas = _resolverColumnasSecuenciaDesdeTexto(textoCompletoNorm, "");
  const categoriaObjetivo = _normalizarCategoriaTablaSecuencia(textoCompletoNorm);
  if (!columnas.length || !categoriaObjetivo) return false;

  const activar = _resolverEstadoCheckbox(textoCompletoNorm);
  const filas = _obtenerFilasTablaSecuencia().filter(
    (f) => _normalizarTexto(f.categoria) === _normalizarTexto(categoriaObjetivo)
  );
  if (!filas.length) return false;

  let cambios = 0;
  filas.forEach((f) => {
    columnas.forEach((columna) => {
      const chk = _obtenerCheckboxFilaPorColumna(f.row, columna);
      if (!chk) return;
      if (chk.checked !== activar) {
        chk.checked = activar;
        chk.dispatchEvent(new Event("change", { bubbles: true }));
      }
      cambios += 1;
    });
  });
  return cambios > 0;
}

function _setTablaSecuenciaNumeroActividadesByVoiceTarget(target = "", valor = "", textoNorm = "") {
  const fromValue = String(valor || "");
  const fromText = String(textoNorm || "");
  const nMatch = fromValue.match(/\b(\d{1,2})\b/) || fromText.match(/\b(\d{1,2})\b/);
  const n = Number(nMatch?.[1] || 0);
  if (!Number.isFinite(n) || n < 1) return false;
  const query = (fromValue || fromText).replace(/\b\d{1,2}\b/g, " ").trim();
  const categoria = _normalizarCategoriaTablaSecuencia(query);
  const fila = _resolverFilaTablaSecuencia(query, categoria);
  if (!fila?.row) return false;
  const input = fila.row.querySelector("input[type='number'][name^='num_']");
  if (!input) return false;
  const min = Number(input.min || 1);
  const max = Number(input.max || 10);
  const clamped = Math.max(min, Math.min(max, n));
  input.value = String(clamped);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function _openGeminiInstruccionesByCategoriaTarget(target = "", valor = "", textoNorm = "") {
  const q = String(valor || "").trim() || String(target || "").trim() || String(textoNorm || "").trim();
  const categoria = _resolverCategoriaDesdeTextoOSubtema(q);
  if (!categoria) return false;
  const btn = document.querySelector(`.btn-icono-categoria.instrucciones[data-categoria="${categoria}"]`);
  if (!btn || typeof btn.click !== "function") return false;
  btn.click();
  // Al abrir por comando de voz, prepara captura del siguiente dictado al textarea.
  // Esto evita perder texto cuando el flujo legacy está desactivado o no entra.
  setTimeout(() => {
    const ta = document.getElementById("textareaInstruccionesGemini");
    if (ta) {
      try { ta.focus(); } catch (_) { }
      _armarCapturaPendienteInput("textareaInstruccionesGemini", textoNorm);
    }
  }, 120);
  return true;
}

function _generarCategoriaByVoiceTarget(target = "", valor = "", textoNorm = "") {
  const q = String(valor || "").trim() || String(target || "").trim() || String(textoNorm || "").trim();
  const categoria = _resolverCategoriaDesdeTextoOSubtema(q);
  if (!categoria) return false;
  const btn = document.querySelector(`.btn-icono-categoria.generar[data-categoria="${categoria}"]`);
  if (!btn || typeof btn.click !== "function") return false;
  btn.click();
  return true;
}

function _openModalByTarget(target = "") {
  const id = String(target || "").trim();
  if (!id) return false;
  const btn = document.getElementById(id);
  if (btn && typeof btn.click === "function") {
    btn.click();
    return true;
  }
  const modal = document.getElementById(id);
  if (!modal) return false;
  if (id === "modalGenerarUnidad") {
    mostrarHostUnidad({ soloSeccion: false });
    cerrarModalesAcopladosUnidad();
    acoplarModalesSeccionEnUnidad();
  }
  modal.style.display = "block";
  return true;
}

function _closeModalByTarget(target = "") {
  const id = String(target || "").trim();
  if (!id) return false;
  const el = document.getElementById(id);
  if (!el) return false;
  if (el.tagName === "BUTTON" && typeof el.click === "function") {
    el.click();
    return true;
  }
  if (_esElementoVisible(el)) {
    const closeBtn = el.querySelector("button[id*='cerrar'], button[id*='Cancelar'], .close, .btn-cerrar");
    if (closeBtn && typeof closeBtn.click === "function") {
      closeBtn.click();
      return true;
    }
    if (id === "modalGenerarUnidad") setUnidadWorkspaceMode(false);
    el.style.display = "none";
    return true;
  }
  return false;
}

async function _ejecutarFnComandoPersonalizado(fn = "", target = "", valor = "", textoNorm = "") {
  const normFn = _normalizarFnComandoVoz(String(fn || "").trim());
  if (!normFn) return false;
  if (normFn === "_manejarParametrosUnidadPorVoz") return _manejarParametrosUnidadPorVoz(textoNorm || valor || "");
  if (normFn === "_setInputByVoice") return _setInputByVoiceTarget(target, valor, textoNorm);
  if (normFn === "_setSelectByVoice") return _setSelectByVoiceTarget(target, valor);
  if (normFn === "_toggleCheckboxByVoice") return _toggleCheckboxByVoiceTarget(target, textoNorm);
  if (normFn === "_setTablaSecuenciaCheckboxByVoice") return _setTablaSecuenciaCheckboxByVoiceTarget(target, valor, textoNorm);
  if (normFn === "_setTablaSecuenciaNumeroActividadesByVoice") return _setTablaSecuenciaNumeroActividadesByVoiceTarget(target, valor, textoNorm);
  if (normFn === "_selectLecturaTablaByText") return _selectLecturaTablaByText(target, valor, textoNorm);
  if (normFn === "_openGeminiInstruccionesByCategoria") return _openGeminiInstruccionesByCategoriaTarget(target, valor, textoNorm);
  if (normFn === "_generarCategoriaByVoice") return _generarCategoriaByVoiceTarget(target, valor, textoNorm);
  if (normFn === "_openModalById") return _openModalByTarget(target);
  if (normFn === "_closeModalById") return _closeModalByTarget(target);
  if (normFn === "_continuarRespondiendo") return _continuarRespondiendoByVoiceTarget(target, valor, textoNorm);
  if (normFn === "_buscarLecturaPorVoz") return _buscarLecturaPorVozTarget(target, valor, textoNorm);
  if (normFn === "_leerLecturaPorVoz") return _leerLecturaPorVozTarget(target, valor, textoNorm);
  if (normFn === "_verLecturaPorVoz") return _verLecturaPorVozTarget(target, valor, textoNorm);
  if (normFn === "_editarLecturaPorVoz") return _editarLecturaPorVozTarget(target, valor, textoNorm);
  if (normFn === "_exportarLecturaWordPorVoz") return _exportarLecturaWordPorVozTarget(target, valor, textoNorm);
  if (normFn === "_noopComandoVoz") return true;
  if (normFn === "_clickButtonById") return _clickButtonById(target);
  return false;
}

function _resolverAccionDesdeSpecWorkflow(rawSpec = "", resultado = "ok") {
  const rawInput = String(rawSpec || "").trim();
  if (!rawInput) return null;
  if (/^ask:/i.test(rawInput)) {
    const question = rawInput.replace(/^ask:/i, "").trim();
    if (!question) return null;
    return {
      type: "ask",
      raw: rawInput,
      question
    };
  }
  if (/^workflow:(lectura_guiada|lectura_confirmacion)$/i.test(rawInput)) {
    return { type: "workflow", raw: rawInput };
  }
  if (/^(any|cualquiera|esperar(?:\s+instruccion|\s+instrucción)?)$/i.test(rawInput)) {
    return { type: "wait", raw: rawInput };
  }
  const lower = rawInput.toLowerCase();
  const aliasMap = {
    "dictar instrucciones gemini": "_setInputByVoice|textareaInstruccionesGemini|",
    "escribir instrucciones gemini": "_setInputByVoice|textareaInstruccionesGemini|",
    "dictar en instrucciones gemini": "_setInputByVoice|textareaInstruccionesGemini|",
    "dictar instrucciones": "_setInputByVoice|textareaInstruccionesGemini|",
    "abrir unidad nueva": "cmd:open_generar_unidad",
    "abrir selector lectura": "cmd:open_selector_lectura_modal"
  };
  const raw = String(aliasMap[lower] || rawInput).trim();
  if (!raw) return null;

  const cfg = _leerConfigComandosVoz();
  const _resolverKeyComandoDesdeAlias = (alias = "") => {
    const rawAlias = String(alias || "").trim();
    if (!rawAlias) return "";
    if (cfg?.[rawAlias] && typeof cfg[rawAlias] === "object") return rawAlias;
    const normAlias = _normalizarTexto(rawAlias);
    if (!normAlias) return "";
    const byName = Object.entries(cfg || {}).find(([key, row]) => {
      if (!row || typeof row !== "object") return false;
      if (row.deleted === true || row.enabled === false) return false;
      const n = _normalizarTexto(String(row.name || "").trim());
      return !!n && n === normAlias;
    });
    if (byName?.[0]) return String(byName[0]).trim();
    const byKeyNorm = Object.keys(cfg || {}).find((k) => _normalizarTexto(String(k || "").trim()) === normAlias);
    return String(byKeyNorm || "").trim();
  };
  let fn = "";
  let target = "";
  let valor = "";
  let commandKey = "";
  let nestedNextOnSuccess = "";
  let nestedNextOnError = "";
  const outcome = _normalizarTexto(String(resultado || "ok")) || "ok";

  if (/^cmd:/i.test(raw)) {
    const keyRaw = raw.replace(/^cmd:/i, "").trim();
    const key = _resolverKeyComandoDesdeAlias(keyRaw);
    const row = cfg?.[key];
    if (!row || row.deleted === true || row.enabled === false) return null;
    commandKey = key;
    fn = String(row.fn || "").trim();
    target = String(row.target || "").trim();
    valor = String(row.value || "").trim();
    nestedNextOnSuccess = _resolverSiguienteComandoPorResultado(row, outcome);
    nestedNextOnError = _resolverSiguienteComandoPorResultado(row, "error", { fallbackToNext: false });
  } else if (cfg?.[raw] && typeof cfg[raw] === "object") {
    const row = cfg[raw];
    if (row.deleted === true || row.enabled === false) return null;
    commandKey = raw;
    fn = String(row.fn || "").trim();
    target = String(row.target || "").trim();
    valor = String(row.value || "").trim();
    nestedNextOnSuccess = _resolverSiguienteComandoPorResultado(row, outcome);
    nestedNextOnError = _resolverSiguienteComandoPorResultado(row, "error", { fallbackToNext: false });
  } else if (raw.includes("|")) {
    const [fnPart, targetPart, ...rest] = raw.split("|");
    fn = String(fnPart || "").trim();
    target = String(targetPart || "").trim();
    valor = rest.join("|").trim();
  } else {
    fn = "_clickButtonById";
    target = raw;
  }

  return {
    type: "action",
    raw,
    fn,
    target,
    valor,
    commandKey,
    nestedNextOnSuccess,
    nestedNextOnError
  };
}

function _normalizarResultadoEjecucionComando(output = null) {
  if (output && typeof output === "object" && !Array.isArray(output)) {
    const ok = output.ok !== false;
    const codeRaw = String(output.code || "").trim();
    const code = codeRaw || (ok ? "executed" : "execution_failed");
    const message = String(output.message || "").trim();
    const awaitUser = output.awaitUser === true || code === "await_user";
    return { ok, code, message, awaitUser };
  }
  const ok = !!output;
  return {
    ok,
    code: ok ? "executed" : "execution_failed",
    message: "",
    awaitUser: false
  };
}

function _resolverWorkflowLecturaCommandKey(options = {}) {
  const directKey = String(options?.workflowCommandKey || "").trim();
  if (_coleccionLecturaDesdeCommandKey(directKey)) return directKey;
  const visited = options?.visited instanceof Set ? options.visited : null;
  if (!visited || !visited.size) return "";
  const cfg = _leerConfigComandosVoz();
  const candidates = [];
  visited.forEach((item) => {
    const raw = String(item || "").trim();
    const m = raw.match(/^cmd:(.+)$/i);
    if (!m?.[1]) return;
    const key = String(m[1]).trim();
    if (!key) return;
    const row = cfg?.[key];
    if (!row || row.deleted === true || row.enabled === false) return;
    const fnNorm = _normalizarFnComandoVoz(String(row.fn || "").trim());
    if (
      fnNorm !== "_buscarLecturaPorVoz"
      && fnNorm !== "_leerLecturaPorVoz"
      && fnNorm !== "_verLecturaPorVoz"
      && fnNorm !== "_editarLecturaPorVoz"
      && fnNorm !== "_exportarLecturaWordPorVoz"
    ) return;
    if (!_coleccionLecturaDesdeCommandKey(key)) return;
    candidates.push(key);
  });
  return candidates.length ? candidates[candidates.length - 1] : "";
}

async function _ejecutarPasoWorkflowVisual(spec = "", options = {}) {
  const textoNorm = String(options?.textoNorm || "").trim();
  const resultado = String(options?.resultado || "ok").trim() || "ok";
  const followNext = options?.followNext === true;
  const visited = options?.visited instanceof Set ? options.visited : new Set();
  const resolved = _resolverAccionDesdeSpecWorkflow(spec, resultado);
  if (!resolved) {
    return {
      ok: false,
      code: "invalid_spec",
      message: "No se pudo resolver la acción del paso."
    };
  }
  if (resolved.type === "ask") {
    hablarUnidad(resolved.question, { cancelarPrevio: true, preferLive: true });
    return {
      ok: true,
      code: "ask",
      message: "Pregunta emitida por voz."
    };
  }
  if (resolved.type === "workflow") {
    return {
      ok: true,
      code: "workflow_ref",
      message: "Subflujo reconocido."
    };
  }
  if (resolved.type === "wait") {
    return {
      ok: true,
      code: "wait",
      message: "Paso de espera."
    };
  }
  const raw = String(resolved.raw || "").trim();
  if (raw && visited.has(raw)) {
    return {
      ok: false,
      code: "already_visited",
      message: "Paso omitido por ciclo detectado."
    };
  }
  if (raw) visited.add(raw);

  const resolvedFnNorm = _normalizarFnComandoVoz(String(resolved.fn || "").trim());
  const resolvedCommandKey = String(resolved.commandKey || "").trim();
  const wfContextKey = _resolverWorkflowLecturaCommandKey({
    workflowCommandKey: String(options?.workflowCommandKey || "").trim(),
    visited
  });
  if (
    resolvedCommandKey
    && (
      resolvedFnNorm === "_buscarLecturaPorVoz"
      || resolvedFnNorm === "_leerLecturaPorVoz"
    )
  ) {
    charlyLecturaWorkflowCommandKey = resolvedCommandKey;
  }
  if (
    !resolvedCommandKey
    && wfContextKey
    && (
      resolvedFnNorm === "_wfBuscarLecturaIniciar"
      || resolvedFnNorm === "_wfBuscarLecturaIdentificarColeccion"
      || resolvedFnNorm === "_wfBuscarLecturaConfirmarLectura"
      || resolvedFnNorm === "_wfBuscarLecturaDecidirAccion"
      || resolvedFnNorm === "_wfBuscarLecturaCerrarFlujo"
    )
  ) {
    charlyLecturaWorkflowCommandKey = wfContextKey;
  }

  const execution = _normalizarResultadoEjecucionComando(await _ejecutarFnComandoPersonalizado(
    resolved.fn,
    resolved.target,
    resolved.valor,
    textoNorm
  ));
  if (followNext && !execution.awaitUser) {
    const nestedNext = execution.ok ? resolved.nestedNextOnSuccess : resolved.nestedNextOnError;
    if (nestedNext && !visited.has(nestedNext)) {
      await _ejecutarCadenaPostComando(
        nestedNext,
        textoNorm,
        visited,
        execution.ok ? "ok" : "error"
      );
    }
  }
  return {
    ok: execution.ok,
    code: execution.code,
    message: execution.message || (execution.ok ? "Acción ejecutada." : "La acción no se pudo ejecutar."),
    awaitUser: execution.awaitUser
  };
}

async function _ejecutarCadenaPostComando(spec = "", textoNorm = "", visited = new Set(), resultado = "ok") {
  const rawInput = String(spec || "").trim();
  const workflowCommandKey = _resolverWorkflowLecturaCommandKey({ visited });
  if (rawInput.includes(">>")) {
    const parts = rawInput.split(">>").map((p) => String(p || "").trim()).filter(Boolean);
    let okAny = false;
    for (const part of parts) {
      const stepResult = await _ejecutarPasoWorkflowVisual(part, {
        textoNorm,
        resultado,
        visited,
        followNext: true,
        workflowCommandKey
      });
      okAny = okAny || !!stepResult?.ok;
      if (stepResult?.awaitUser === true || stepResult?.code === "await_user") {
        return true;
      }
    }
    return okAny;
  }
  const stepResult = await _ejecutarPasoWorkflowVisual(rawInput, {
    textoNorm,
    resultado,
    visited,
    followNext: true,
    workflowCommandKey
  });
  return !!stepResult?.ok;
}

async function _selectLecturaTablaByText(target = "", valor = "", textoNorm = "") {
  const tbodyId = String(target || "").trim() || "cuerpoTablaLecturas";
  const modal = document.getElementById("modalSeleccionarLectura");
  const abrirBtn = document.getElementById("btnAbrirModalLectura");

  if ((!modal || modal.style.display !== "flex") && abrirBtn && typeof abrirBtn.click === "function") {
    abrirBtn.click();
    for (let i = 0; i < 18; i++) {
      await sleep(120);
      const m = document.getElementById("modalSeleccionarLectura");
      const body = document.getElementById(tbodyId);
      if (m && m.style.display === "flex" && body && body.querySelectorAll("tr[data-id]").length) break;
    }
  }

  const tbody = document.getElementById(tbodyId);
  if (!tbody) return false;
  const rows = Array.from(tbody.querySelectorAll("tr[data-id]"));
  if (!rows.length) return false;

  let queryRaw = String(valor || "").trim() || String(textoNorm || "").trim();
  if (!queryRaw && textoNorm) {
    queryRaw = String(textoNorm || "").trim();
  }
  if (textoNorm) {
    const extra = String(textoNorm || "").match(/(?:selecciona|seleccionar|elige|escoge|usar|usa)\s+(?:la\s+)?lectura(?:\s+principal)?\s+(.+)$/i);
    if (extra?.[1]) queryRaw = String(extra[1]).trim();
  }
  const query = _normalizarTexto(queryRaw)
    .replace(/\b(selecciona|seleccionar|elige|buscar|busca|lectura|principal|asc|de|la|el|en)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!query) return false;

  const qTokens = query.split(/\s+/).filter((t) => t.length > 1);
  const scoreRow = (row) => {
    const title = _normalizarTexto(row.children?.[1]?.textContent || "");
    const synopsis = _normalizarTexto(row.children?.[2]?.textContent || "");
    const author = _normalizarTexto(row.children?.[3]?.textContent || "");
    const all = `${title} ${synopsis} ${author}`.trim();
    let score = 0;
    if (title.includes(query) || query.includes(title)) score += 8;
    if (all.includes(query)) score += 6;
    qTokens.forEach((tk) => {
      if (title.includes(tk)) score += 3;
      if (synopsis.includes(tk)) score += 2;
      if (author.includes(tk)) score += 1;
    });
    return score;
  };

  let best = null;
  let bestScore = 0;
  rows.forEach((row) => {
    const s = scoreRow(row);
    if (s > bestScore) {
      best = row;
      bestScore = s;
    }
  });
  if (!best || bestScore < 3) return false;

  // No manipular radio/checkbox directamente; la selección oficial la hace el click en la fila.
  if (typeof best.click === "function") best.click();
  const btnConfirm = document.getElementById("btnConfirmarSeleccion");
  if (btnConfirm) btnConfirm.disabled = false;
  return true;
}

async function _manejarComandosPersonalizadosGenerales(textoNorm = "") {
  const norm = _normalizarTexto(textoNorm);
  if (!norm) return false;
  const manejoCategoriaCompleta = _setTablaSecuenciaCheckboxCategoriaCompleta(norm);
  if (manejoCategoriaCompleta) return true;
  const supportedFns = new Set([
    "_manejarParametrosUnidadPorVoz",
    "_setInputByVoice",
    "_setSelectByVoice",
    "_toggleCheckboxByVoice",
    "_setTablaSecuenciaCheckboxByVoice",
    "_setTablaSecuenciaNumeroActividadesByVoice",
    "_selectLecturaTablaByText",
    "_openGeminiInstruccionesByCategoria",
    "_generarCategoriaByVoice",
    "_openModalById",
    "_closeModalById",
    "_continuarRespondiendo",
    "_buscarLecturaPorVoz",
    "_leerLecturaPorVoz",
    "_verLecturaPorVoz",
    "_editarLecturaPorVoz",
    "_exportarLecturaWordPorVoz",
    "_noopComandoVoz"
  ]);

  const entries = _listarComandosConfigurados(({ row }) => supportedFns.has(_normalizarFnComandoVoz(String(row.fn || "").trim())));
  for (const { key, row } of entries) {
    const src = String(row.regex || "").trim();
    const rx = _compilarRegexFlexible(src);
    if (!rx) continue;
    const m = norm.match(rx);
    if (!m) continue;
    const fn = _normalizarFnComandoVoz(String(row.fn || "").trim());
    if (
      fn === "_buscarLecturaPorVoz"
      || fn === "_leerLecturaPorVoz"
      || fn === "_verLecturaPorVoz"
      || fn === "_editarLecturaPorVoz"
      || fn === "_exportarLecturaWordPorVoz"
    ) {
      charlyLecturaWorkflowCommandKey = key;
    }
    let target = String(row.target || "").trim();
    if (fn === "_selectLecturaTablaByText") {
      const targetEl = target ? document.getElementById(target) : null;
      const targetInvalido = !target || !targetEl || !/^(tbody|table)$/i.test(String(targetEl.tagName || ""));
      if (targetInvalido || target === "unidadTema" || target === "unidadTemaASC") {
        target = "cuerpoTablaLecturas";
      }
    }
    const valor = (fn === "_setInputByVoice")
      ? _valorInputDesdeMatch(norm, m)
      : _valorComandoDesdeMatch(norm, m);
    logVisual(`🧪 Cmd custom match: ${key} fn=${fn} target=${target} valor="${valor}"`);
    let ok = false;
    if (fn === "_manejarParametrosUnidadPorVoz") ok = await _manejarParametrosUnidadPorVoz(norm);
    else if (fn === "_setInputByVoice") ok = await _setInputByVoiceTarget(target, valor, norm);
    else if (fn === "_setSelectByVoice") ok = await _setSelectByVoiceTarget(target, valor);
    else if (fn === "_toggleCheckboxByVoice") ok = _toggleCheckboxByVoiceTarget(target, norm);
    else if (fn === "_setTablaSecuenciaCheckboxByVoice") ok = _setTablaSecuenciaCheckboxByVoiceTarget(target, valor, norm);
    else if (fn === "_setTablaSecuenciaNumeroActividadesByVoice") ok = _setTablaSecuenciaNumeroActividadesByVoiceTarget(target, valor, norm);
    else if (fn === "_selectLecturaTablaByText") ok = await _selectLecturaTablaByText(target, valor, norm);
    else if (fn === "_openGeminiInstruccionesByCategoria") ok = _openGeminiInstruccionesByCategoriaTarget(target, valor, norm);
    else if (fn === "_generarCategoriaByVoice") ok = _generarCategoriaByVoiceTarget(target, valor, norm);
    else if (fn === "_openModalById") ok = _openModalByTarget(target);
    else if (fn === "_closeModalById") ok = _closeModalByTarget(target);
    else if (fn === "_continuarRespondiendo") ok = _continuarRespondiendoByVoiceTarget(target, valor, norm);
    else if (fn === "_buscarLecturaPorVoz") ok = await _buscarLecturaPorVozTarget(target, valor, textoNorm);
    else if (fn === "_leerLecturaPorVoz") ok = await _leerLecturaPorVozTarget(target, valor, textoNorm);
    else if (fn === "_verLecturaPorVoz") ok = await _verLecturaPorVozTarget(target, valor, textoNorm);
    else if (fn === "_editarLecturaPorVoz") ok = await _editarLecturaPorVozTarget(target, valor, textoNorm);
    else if (fn === "_exportarLecturaWordPorVoz") ok = await _exportarLecturaWordPorVozTarget(target, valor, textoNorm);

    if (ok) {
      await _ejecutarSiguienteComandoPorResultado(key, row, "ok", norm);
      logVisual(`🧭 Comando personalizado ejecutado: ${_nombreComando(key, key)}`);
      if (fn === "_continuarRespondiendo") {
        _anunciarEstadoConversacionContinua(key);
      } else if (
        fn === "_buscarLecturaPorVoz"
        || fn === "_leerLecturaPorVoz"
        || fn === "_verLecturaPorVoz"
        || fn === "_editarLecturaPorVoz"
        || fn === "_exportarLecturaWordPorVoz"
      ) {
        // Estas funciones ya controlan su salida de voz contextual.
      } else if (_debeResponderComando(key, false)) {
        hablarUnidadComandoRapido(`${_nombreComando(key, "Comando ejecutado")}.`);
      }
      return true;
    }
    const ejecutoError = await _ejecutarSiguienteComandoPorResultado(
      key,
      row,
      "error",
      norm,
      null,
      { fallbackToNext: false }
    );
    if (ejecutoError) {
      logVisual(`🧭 Comando personalizado con fallback de error: ${_nombreComando(key, key)}`);
      return true;
    }
  }
  return false;
}

async function _manejarBusquedaLecturaDirecta(texto = "") {
  const raw = String(texto || "").trim();
  if (!raw) return false;
  const norm = _normalizarTexto(raw);
  if (!norm) return false;
  const modalLecturas = document.getElementById("modalSeleccionarLectura");
  const modalAbierto = !!(modalLecturas && (modalLecturas.style.display === "flex" || modalLecturas.style.display === "block"));
  // Este handler es legado para el modal de lecturas; fuera de ese contexto no debe capturar comandos globales.
  if (!modalAbierto) return false;
  const cfg = _leerConfigComandosVoz();
  const row = cfg?.modal_lecturas_buscar_texto;
  const fnRow = _normalizarFnComandoVoz(String(row?.fn || "").trim() || "_setInputByVoice");
  if (fnRow !== "_setInputByVoice") return false;

  const m = _matchComando("modal_lecturas_buscar_texto", norm);
  if (!m) return false;

  const valor = String(m?.[1] || _valorInputDesdeMatch(raw, m) || "")
    .replace(/^[:\-.,\s]+/, "")
    .trim();
  const cmdKey = "modal_lecturas_buscar_texto";
  // Regla fija: la búsqueda de lectura siempre pasa por `unidadTemaTexto`.
  // Si el modal está abierto, el input ya sincroniza y filtra la tabla automáticamente.
  const targetPreferido = "unidadTemaTexto";
  const ok = await _setInputByVoiceTarget(targetPreferido, valor, norm);
  if (ok && _debeResponderComando(cmdKey, false)) {
    hablarUnidadComandoRapido(valor ? `Buscando ${valor}.` : "¿Qué lectura deseas buscar?", { cancelarPrevio: true });
  }
  return ok;
}

function _actualizarVozCharlyDesdeThemeSettings() {
  if (activeUnidadAgentPersona) {
    charlyTtsVoiceName = activeUnidadAgentPersona.voiceName || CHARLY_TTS_VOICE_NAME_DEFAULT;
    charlyVoiceSpeed = Number(activeUnidadAgentPersona.speed) || CHARLY_VOICE_SPEED_DEFAULT;
    charlyVoicePitch = Number(activeUnidadAgentPersona.pitch) || CHARLY_VOICE_PITCH_DEFAULT;
    charlyVoiceMood = String(activeUnidadAgentPersona.mood || CHARLY_VOICE_MOOD_DEFAULT).trim() || CHARLY_VOICE_MOOD_DEFAULT;
    charlyVoiceLocale = String(activeUnidadAgentPersona.locale || CHARLY_VOICE_LOCALE_DEFAULT).trim() || CHARLY_VOICE_LOCALE_DEFAULT;
    return charlyTtsVoiceName;
  }
  const usandoVozLecturaTemporal = !!charlyLecturaVoiceRestoreState;
  if (usandoVozLecturaTemporal) {
    const lecturaSettings = _leerAjustesVozLecturaDesdeThemeSettings();
    if (lecturaSettings?.useCharlyVoice === false) {
      charlyTtsVoiceName = lecturaSettings.voiceName || _leerVozCharlyDesdeThemeSettings();
      charlyVoiceSpeed = lecturaSettings.speed;
      charlyVoicePitch = lecturaSettings.pitch;
      charlyVoiceMood = lecturaSettings.mood || CHARLY_VOICE_MOOD_DEFAULT;
      charlyVoiceLocale = lecturaSettings.locale || CHARLY_VOICE_LOCALE_DEFAULT;
      return charlyTtsVoiceName;
    }
  }
  charlyTtsVoiceName = _leerVozCharlyDesdeThemeSettings();
  const settings = _leerAjustesVozCharlyDesdeThemeSettings();
  charlyVoiceSpeed = settings.speed;
  charlyVoicePitch = settings.pitch;
  charlyVoiceMood = settings.mood;
  charlyVoiceLocale = settings.locale || CHARLY_VOICE_LOCALE_DEFAULT;
  return charlyTtsVoiceName;
}

function _programarReinicioLivePorCambioVoz() {
  if (geminiLiveReconfigTimer) clearTimeout(geminiLiveReconfigTimer);
  geminiLiveReconfigTimer = setTimeout(() => {
    geminiLiveReconfigTimer = null;
    if (!geminiLiveSessionUnidad || !unidadVoiceShouldRun) return;
    iniciarGeminiLiveUnidad({ withMic: !_agenteUnidadEnModoExclusivo() }).catch((err) => {
      logVisual(`⚠️ No se pudo reconfigurar voz Live: ${err?.message || "sin detalle"}`);
    });
  }, 220);
}

function _programarReconectarLive(motivo = "") {
  if (geminiLiveReconnectTimer) return;
  if (geminiLiveReconnectInFlight) return;
  if (!unidadVoiceShouldRun) return;
  geminiLiveReconnectTimer = setTimeout(() => {
    geminiLiveReconnectTimer = null;
    if (!unidadVoiceShouldRun) return;
    geminiLiveReconnectInFlight = true;
    iniciarGeminiLiveUnidad({ withMic: !_agenteUnidadEnModoExclusivo() }).catch((err) => {
      logVisual(`⚠️ No se pudo reconectar Live (${motivo || "sin motivo"}): ${err?.message || "sin detalle"}`);
    }).finally(() => {
      geminiLiveReconnectInFlight = false;
    });
  }, 1200);
}

function _agregarMemoriaConversacion(role = "user", text = "") {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return;
  const r = role === "assistant" ? "assistant" : "user";
  const last = charlyConversationMemory[charlyConversationMemory.length - 1];
  if (last && last.role === r && last.text === t) return;
  charlyConversationMemory.push({ role: r, text: t, ts: Date.now() });
  if (charlyConversationMemory.length > 24) {
    charlyConversationMemory = charlyConversationMemory.slice(-24);
  }
}

function _resumenMemoriaConversacion(maxChars = 2200) {
  if (!Array.isArray(charlyConversationMemory) || !charlyConversationMemory.length) return "";
  const parts = [];
  for (let i = charlyConversationMemory.length - 1; i >= 0; i--) {
    const item = charlyConversationMemory[i];
    const line = `${item.role === "assistant" ? "Charly" : "Usuario"}: ${item.text}`;
    parts.unshift(line);
    const joined = parts.join("\n");
    if (joined.length > maxChars) {
      parts.shift();
      break;
    }
  }
  return parts.join("\n");
}

_actualizarVozCharlyDesdeThemeSettings();
window.addEventListener("cb-theme-settings-updated", (event) => {
  const vozAnterior = charlyTtsVoiceName;
  const moodAnterior = charlyVoiceMood;
  const localeAnterior = charlyVoiceLocale;
  const lecturaActiva = !!(charlyLecturaEnCurso || charlyLecturaPlanPausada || charlyLecturaVoiceRestoreState);
  const lecturaSettings = _leerAjustesVozLecturaDesdeThemeSettings();
  if (lecturaActiva && lecturaSettings?.useCharlyVoice === false) {
    charlyTtsVoiceName = lecturaSettings.voiceName || _leerVozCharlyDesdeThemeSettings();
    charlyVoiceSpeed = lecturaSettings.speed;
    charlyVoicePitch = lecturaSettings.pitch;
    charlyVoiceMood = lecturaSettings.mood || CHARLY_VOICE_MOOD_DEFAULT;
    charlyVoiceLocale = lecturaSettings.locale || CHARLY_VOICE_LOCALE_DEFAULT;
    if (charlyLecturaVoiceRestoreState) {
      charlyLecturaVoiceRestoreState.voiceName = _leerVozCharlyDesdeThemeSettings();
      const baseSettings = _leerAjustesVozCharlyDesdeThemeSettings();
      charlyLecturaVoiceRestoreState.speed = baseSettings.speed;
      charlyLecturaVoiceRestoreState.pitch = baseSettings.pitch;
      charlyLecturaVoiceRestoreState.mood = baseSettings.mood;
      charlyLecturaVoiceRestoreState.locale = baseSettings.locale || CHARLY_VOICE_LOCALE_DEFAULT;
    }
  } else {
    const nombre = String(event?.detail?.charlyVoiceName || "").trim();
    charlyTtsVoiceName = nombre || _leerVozCharlyDesdeThemeSettings();
    const speed = Number(event?.detail?.charlyVoiceSpeed);
    const pitch = Number(event?.detail?.charlyVoicePitch);
    const mood = String(event?.detail?.charlyVoiceMood || "").trim();
    const locale = String(event?.detail?.charlyVoiceLocale || "").trim();
    charlyVoiceSpeed = Number.isFinite(speed) ? Math.max(0.75, Math.min(1.35, speed)) : _leerAjustesVozCharlyDesdeThemeSettings().speed;
    charlyVoicePitch = Number.isFinite(pitch) ? Math.max(0.75, Math.min(1.2, pitch)) : _leerAjustesVozCharlyDesdeThemeSettings().pitch;
    charlyVoiceMood = mood || _leerAjustesVozCharlyDesdeThemeSettings().mood;
    charlyVoiceLocale = locale || _leerAjustesVozCharlyDesdeThemeSettings().locale || CHARLY_VOICE_LOCALE_DEFAULT;
  }
  if (charlyTtsVoiceName !== vozAnterior || charlyVoiceMood !== moodAnterior || charlyVoiceLocale !== localeAnterior) {
    _programarReinicioLivePorCambioVoz();
  }
});
window.addEventListener("storage", (event) => {
  if (event.key === THEME_SETTINGS_STORAGE_KEY) {
    const vozAnterior = charlyTtsVoiceName;
    const moodAnterior = charlyVoiceMood;
    const localeAnterior = charlyVoiceLocale;
    _actualizarVozCharlyDesdeThemeSettings();
    if (charlyTtsVoiceName !== vozAnterior || charlyVoiceMood !== moodAnterior || charlyVoiceLocale !== localeAnterior) {
      _programarReinicioLivePorCambioVoz();
    }
    return;
  }
  if (event.key === VOICE_COMMANDS_STORAGE_KEY) {
    voiceCommandConfigCache = null;
    voiceCommandMetaCache = null;
  }
});
window.addEventListener("cb-voice-commands-updated", () => {
  voiceCommandConfigCache = null;
  voiceCommandMetaCache = null;
  if (_agenteUnidadEnModoExclusivo()) return;
  if (!_vozGlobalHabilitadaPorConfiguracion()) {
    detenerEscuchaVozUnidad();
    return;
  }
  // Si se vuelve a habilitar desde configuración, reactivar escucha global.
  if (!unidadVoiceShouldRun) {
    unidadVoiceShouldRun = true;
    if (typeof charlyAwake !== "undefined") {
      charlyAwake = true;
    }
  }
  actualizarEstadoBotonVozUnidad();
  if (!unidadVoiceIsListening) {
    setTimeout(() => {
      if (!agentExclusiveVoiceMode && unidadVoiceShouldRun && !unidadVoiceIsListening) {
        iniciarEscuchaVozUnidad();
      }
    }, 120);
  }
});

function _pcm16Base64ToFloat32(base64 = "") {
  const bytes = _base64ToUint8(base64);
  const dataView = new DataView(bytes.buffer);
  const out = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < out.length; i++) {
    const s = dataView.getInt16(i * 2, true);
    out[i] = Math.max(-1, Math.min(1, s / 32768));
  }
  return out;
}

function _float32ToPcm16Base64(float32Array = new Float32Array(0)) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function _downsampleFloat32(input = new Float32Array(0), inputRate = 48000, targetRate = 16000) {
  if (!input.length || inputRate <= targetRate) return input;
  const ratio = inputRate / targetRate;
  const newLen = Math.round(input.length / ratio);
  const result = new Float32Array(newLen);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < input.length; i++) {
      accum += input[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function _debeIntentarTokenEfimeroUnidad() {
  try {
    const host = String(window.location?.hostname || "").toLowerCase();
    const ua = String(window.navigator?.userAgent || "").toLowerCase();
    const isElectronShell = ua.includes(" electron/");
    if (geminiLiveDisableEphemeralToken) return false;
    if (sessionStorage.getItem("cb_disable_gemini_ephemeral_token") === "1") return false;
    // En navegador local simple no hay backend Express confiable para este endpoint.
    if (!isElectronShell && (host === "127.0.0.1" || host === "localhost") && isStaticLocalDev()) return false;
  } catch (_) {
    // noop
  }
  return true;
}

async function _crearNodoCapturaMicUnidad(audioCtx) {
  if (audioCtx?.audioWorklet && typeof AudioWorkletNode !== "undefined") {
    if (!geminiLiveWorkletUrl) {
      const workletCode = `
        class CharlyMicCaptureProcessor extends AudioWorkletProcessor {
          process(inputs) {
            const input = inputs && inputs[0] && inputs[0][0];
            if (input && input.length) {
              this.port.postMessage(input.slice(0));
            }
            return true;
          }
        }
        registerProcessor('charly-mic-capture-processor', CharlyMicCaptureProcessor);
      `;
      const blob = new Blob([workletCode], { type: "application/javascript" });
      geminiLiveWorkletUrl = URL.createObjectURL(blob);
    }
    await audioCtx.audioWorklet.addModule(geminiLiveWorkletUrl);
    const workletNode = new AudioWorkletNode(audioCtx, "charly-mic-capture-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1
    });
    return workletNode;
  }

  logVisual("⚠️ AudioWorklet no disponible; usando ScriptProcessor temporalmente.");
  const fallbackNode = audioCtx.createScriptProcessor(4096, 1, 1);
  return fallbackNode;
}

function _asegurarIndicadorHablandoCharly() {
  if (charlySpeakingIndicatorEl) return charlySpeakingIndicatorEl;
  if (typeof document === "undefined") return null;

  if (!document.getElementById("charlySpeakingIndicatorStyles")) {
    const style = document.createElement("style");
    style.id = "charlySpeakingIndicatorStyles";
    style.textContent = `
      #charlySpeakingIndicator {
        position: fixed;
        top: 12px;
        right: 14px;
        z-index: 2147483000;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 14px;
        border-radius: 999px;
        background: rgba(5, 14, 31, 0.95);
        border: 1px solid rgba(115, 221, 255, 0.78);
        color: #f2fbff;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.01em;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(115, 221, 255, 0.2) inset;
        backdrop-filter: blur(5px);
        opacity: 0;
        transform: translateY(-8px) scale(0.97);
        pointer-events: none;
        transition: opacity 220ms ease, transform 220ms ease;
      }
      #charlySpeakingIndicator.is-active {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      #charlySpeakingIndicator .charly-voice-orb {
        width: 13px;
        height: 13px;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 35%, #a5eeff 0%, #4ec1ff 58%, #1884ff 100%);
        box-shadow: 0 0 0 0 rgba(78, 193, 255, 0.55);
      }
      #charlySpeakingIndicator.is-active .charly-voice-orb {
        animation: charlyVoicePulse 1.2s ease-out infinite;
      }
      @keyframes charlyVoicePulse {
        0% { box-shadow: 0 0 0 0 rgba(78, 193, 255, 0.55); }
        70% { box-shadow: 0 0 0 11px rgba(78, 193, 255, 0); }
        100% { box-shadow: 0 0 0 0 rgba(78, 193, 255, 0); }
      }
    `;
    document.head.appendChild(style);
  }

  const el = document.createElement("div");
  el.id = "charlySpeakingIndicator";
  el.setAttribute("aria-live", "polite");
  el.innerHTML = `
    <span class="charly-voice-orb" aria-hidden="true"></span>
    <span>Charly está hablando</span>
  `;
  document.body.appendChild(el);
  charlySpeakingIndicatorEl = el;
  return el;
}

function _setIndicadorHablandoCharly(activo = false) {
  const el = _asegurarIndicadorHablandoCharly();
  if (!el) return;
  if (charlySpeakingHideTimer) {
    clearTimeout(charlySpeakingHideTimer);
    charlySpeakingHideTimer = null;
  }
  if (activo) {
    el.classList.add("is-active");
    return;
  }
  const ahora = Date.now();
  if (ahora < charlySpeakingVisibleUntil) {
    charlySpeakingHideTimer = setTimeout(() => {
      _setIndicadorHablandoCharly(false);
    }, Math.max(120, charlySpeakingVisibleUntil - ahora));
    return;
  }
  el.classList.remove("is-active");
}

function _marcarActividadVozCharly(ms = 900) {
  const minimoVisibleMs = 2200;
  charlySpeakingVisibleUntil = Math.max(charlySpeakingVisibleUntil, Date.now() + Math.max(minimoVisibleMs, Number(ms) || 900));
  _setIndicadorHablandoCharly(true);
  if (_agenteUnidadEnModoExclusivo()) {
    _asegurarControladorAgenteUnidad().syncSpeakingActivity(ms);
  }
  if (charlySpeakingHideTimer) clearTimeout(charlySpeakingHideTimer);
  charlySpeakingHideTimer = setTimeout(() => {
    _setIndicadorHablandoCharly(false);
  }, Math.max(350, Math.max(minimoVisibleMs, Number(ms) || 900)));
}

function _geminiLivePendingPlaybackMs() {
  if (!geminiLiveAudioCtx) return 0;
  const playAt = Number(geminiLivePlayAt || 0);
  const now = Number(geminiLiveAudioCtx.currentTime || 0);
  return Math.max(0, (playAt - now) * 1000);
}

function _limpiarTimerCierreStageLive() {
  if (geminiLiveStageCompletionTimer) clearTimeout(geminiLiveStageCompletionTimer);
  geminiLiveStageCompletionTimer = null;
}

function _cerrarHablaAgenteSiListo(source = "") {
  if (!geminiLivePendingStageCompletion || !_agenteUnidadEnModoExclusivo()) return false;
  const pendingMs = _geminiLivePendingPlaybackMs();
  const hasActiveSources = (geminiLiveActivePcmSources?.size || 0) > 0;
  const sinceLastChunkMs = Date.now() - Number(geminiLiveLastPcmChunkAt || 0);
  const chunkGraceMs = 720;
  if (pendingMs > 220 || hasActiveSources || sinceLastChunkMs < chunkGraceMs) return false;
  geminiLivePendingStageCompletion = false;
  _limpiarTimerCierreStageLive();
  // En lectura por bloques, cada turnComplete no significa fin de locución total.
  // Si cerramos aquí, la boca cae a "Escuchando" entre bloques y se percibe congelada.
  if (charlyLecturaEnCurso) {
    _asegurarControladorAgenteUnidad().syncSpeakingActivity?.(1400);
    return true;
  }
  _notifyAgentSpeechPlaybackEnd(agentSpeechPlaybackToken, `live-${source || "audio-ended"}`);
  _asegurarControladorAgenteUnidad().completeSpeechPlayback?.(`live-${source || "audio-ended"}`);
  return true;
}

function _programarCierreHablaAgenteLive(source = "") {
  if (!_agenteUnidadEnModoExclusivo()) return;
  geminiLivePendingStageCompletion = true;
  if (_cerrarHablaAgenteSiListo(source)) return;
  _limpiarTimerCierreStageLive();
  const pendingMs = _geminiLivePendingPlaybackMs();
  const waitMs = Math.max(520, Math.min(7000, pendingMs + 520));
  geminiLiveStageCompletionTimer = setTimeout(() => {
    if (_cerrarHablaAgenteSiListo(`${source || "turn-complete"}-timer`)) return;
    // Fallback para no dejar el stage trabado en "Hablando" si Live no entrega más audio.
    if (geminiLivePendingStageCompletion && _agenteUnidadEnModoExclusivo()) {
      const sinceLastChunkMs = Date.now() - Number(geminiLiveLastPcmChunkAt || 0);
      if (sinceLastChunkMs < 720) {
        _programarCierreHablaAgenteLive(`${source || "turn-complete"}-grace`);
        return;
      }
      geminiLivePendingStageCompletion = false;
      _notifyAgentSpeechPlaybackEnd(agentSpeechPlaybackToken, "live-turn-complete-fallback");
      _asegurarControladorAgenteUnidad().completeSpeechPlayback?.("live-turn-complete-fallback");
    }
    _limpiarTimerCierreStageLive();
  }, waitMs);
}

function _reproducirPcmGemini(base64Chunk = "") {
  if (!base64Chunk) return;
  if (!geminiLiveAudioCtx) geminiLiveAudioCtx = new AudioContext({ sampleRate: 24000 });
  const samples = _pcm16Base64ToFloat32(base64Chunk);
  if (!samples.length) return;

  const buffer = geminiLiveAudioCtx.createBuffer(1, samples.length, 24000);
  buffer.copyToChannel(samples, 0);
  const source = geminiLiveAudioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(geminiLiveAudioCtx.destination);
  geminiLiveActivePcmSources.add(source);
  geminiLiveLastPcmChunkAt = Date.now();
  source.onended = () => {
    geminiLiveActivePcmSources.delete(source);
    _cerrarHablaAgenteSiListo("pcm-ended");
  };

  geminiLivePlayAt = Math.max(geminiLivePlayAt || geminiLiveAudioCtx.currentTime, geminiLiveAudioCtx.currentTime + 0.01);
  const startAt = geminiLivePlayAt;
  const endAt = startAt + buffer.duration;
  _marcarActividadVozCharly(buffer.duration * 1000 + 220);
  _asegurarControladorAgenteUnidad().onPcmSamples(samples, {
    durationMs: buffer.duration * 1000,
    startInMs: Math.max(0, (startAt - geminiLiveAudioCtx.currentTime) * 1000),
    endInMs: Math.max(0, (endAt - geminiLiveAudioCtx.currentTime) * 1000)
  });
  source.start(startAt);
  geminiLivePlayAt = endAt;
}

function _limpiarAudioGeminiProgramado() {
  geminiLivePendingStageCompletion = false;
  _limpiarTimerCierreStageLive();
  if (!geminiLiveAudioCtx) return;
  geminiLiveActivePcmSources.forEach((source) => {
    try { source.stop(0); } catch (_) { }
  });
  geminiLiveActivePcmSources.clear();
  geminiLivePlayAt = geminiLiveAudioCtx.currentTime + 0.01;
  _setIndicadorHablandoCharly(false);
}

function _debeIgnorarEntradaPorHablaAgente(norm = "") {
  if (workflowPlayPendingResponse) return false;
  const t = _normalizarTexto(norm);
  if (!t) return false;
  if (_esComandoDespertar(t) || _esComandoDescanso(t)) return false;
  if (/\b(cancela|cancelar|alto|deten|detener|parar|stop)\b/.test(t)) return false;
  return Date.now() < (Number(charlySpeakingVisibleUntil || 0) + 220);
}

function _detenerAudioWorkflowPlay() {
  try { _limpiarAudioGeminiProgramado(); } catch (_) {}
  geminiLiveAllowOutputUntil = 0;
  try {
    if (geminiTtsAudioElUnidad) {
      geminiTtsAudioElUnidad.pause();
      geminiTtsAudioElUnidad.src = "";
    }
  } catch (_) {}
  try { geminiLivePendingSpeechQueue = []; } catch (_) {}
  try {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch (_) {}
  try { _setIndicadorHablandoCharly(false); } catch (_) {}
}

function _normalizarTokenWorkflowPlay(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function _resolverValorRespuestaWorkflowPlay(texto = "", choices = []) {
  const norm = _normalizarTokenWorkflowPlay(texto);
  if (!norm) return "";
  const canonical =
    (/(^|\b)(si|yes|afirm)(\b|$)/.test(norm) && "si")
    || (/(^|\b)(no|neg)(\b|$)/.test(norm) && "no")
    || (/(^|\b)(cancel|abort|stop)(\b|$)/.test(norm) && "cancelar")
    || (/(^|\b)(error|falla|fallo|fail)(\b|$)/.test(norm) && "error")
    || (/(^|\b)(ok|exito)(\b|$)/.test(norm) && "ok")
    || "";

  const safeChoices = Array.isArray(choices)
    ? choices.map((c) => ({
      value: _normalizarTokenWorkflowPlay(c?.value || c?.label || ""),
      rawValue: String(c?.value || c?.label || "").trim()
    })).filter((c) => !!c.value)
    : [];

  if (canonical) {
    const byCanonical = safeChoices.find((c) => c.value === canonical);
    if (byCanonical?.rawValue) return byCanonical.rawValue;
    return canonical;
  }
  const exact = safeChoices.find((c) => c.value === norm);
  if (exact?.rawValue) return exact.rawValue;
  const contains = safeChoices.find((c) => norm.includes(c.value) || c.value.includes(norm));
  if (contains?.rawValue) return contains.rawValue;
  return "";
}

async function _resolverValorRespuestaWorkflowPlayConGemini(texto = "", choices = []) {
  const basic = _resolverValorRespuestaWorkflowPlay(texto, choices);
  if (basic) return basic;
  const normalizedInput = String(texto || "").trim();
  if (!normalizedInput) return "";
  const safeChoices = Array.isArray(choices)
    ? choices
      .map((c) => ({
        value: String(c?.value || c?.label || "").trim(),
        label: String(c?.label || c?.value || "").trim()
      }))
      .filter((c) => !!c.value)
    : [];
  if (!safeChoices.length) return "";
  try {
    const opcionesTexto = safeChoices.map((c, i) => `${i + 1}. value="${c.value}" label="${c.label || c.value}"`).join("\n");
    const prompt = [
      "Clasifica la respuesta del usuario a una opcion de workflow.",
      "Devuelve SOLO JSON valido: {\"value\":\"<value opcion>\",\"confidence\":0..1}",
      "Si no hay correspondencia clara, devuelve {\"value\":\"\",\"confidence\":0}.",
      "Opciones:",
      opcionesTexto,
      `Respuesta usuario: "${normalizedInput}"`
    ].join("\n");
    const raw = await enviarPrompt([{ role: "user", text: prompt }]);
    const bloque = _extraerBloqueJSON(raw) || String(raw || "").trim();
    const parsed = JSON.parse(bloque);
    const value = String(parsed?.value || "").trim();
    const confidence = Number(parsed?.confidence || 0);
    if (!value || !Number.isFinite(confidence) || confidence < 0.45) return "";
    const match = safeChoices.find((c) => c.value === value);
    return match?.value || "";
  } catch (_) {
    return "";
  }
}

async function _resolverPendienteWorkflowPlayDesdeVoz(texto = "", transcripcionRaw = "") {
  const pending = workflowPlayPendingResponse;
  if (!pending || typeof pending.resolve !== "function") return false;
  const candidate = String(texto || transcripcionRaw || "").trim();
  const canon = _canonTextoVoz(candidate);
  const now = Date.now();
  if (canon && canon === workflowPlayLastResponseCanon && (now - workflowPlayLastResponseAt) < 2800) {
    return true;
  }
  const resolvedValue = await _resolverValorRespuestaWorkflowPlayConGemini(candidate, pending.choices || []);
  if (!resolvedValue) return false;
  const payload = {
    ok: true,
    code: "voice_response",
    value: resolvedValue,
    transcript: String(transcripcionRaw || texto || "").trim()
  };
  const resolver = pending.resolve;
  workflowPlayPendingResponse = null;
  workflowPlayLastResponseCanon = canon;
  workflowPlayLastResponseAt = now;
  resolver(payload);
  return true;
}

async function _generarPromptWorkflowPlayConGemini(nodeLabel = "", options = []) {
  const safeNode = String(nodeLabel || "").trim();
  const safeChoices = Array.isArray(options)
    ? options
      .map((c) => String(c?.label || c?.value || "").trim())
      .filter(Boolean)
    : [];
  if (!safeChoices.length) return "";
  try {
    const prompt = [
      "Redacta una sola pregunta breve para voz en español.",
      "Contexto: workflow visual.",
      `Nodo: ${safeNode || "paso"}.`,
      `Opciones disponibles: ${safeChoices.join(" | ")}.`,
      "Devuelve SOLO la frase final, sin comillas."
    ].join("\n");
    const raw = await enviarPrompt([{ role: "user", text: prompt }]);
    return String(raw || "").replace(/^["'`]+|["'`]+$/g, "").trim();
  } catch (_) {
    return "";
  }
}

async function _loadGoogleGenAiLiveModule() {
  if (googleGenAiLiveModule) return googleGenAiLiveModule;
  googleGenAiLiveModule = await import("https://esm.sh/@google/genai@latest");
  return googleGenAiLiveModule;
}

function _resolverVozNaturalUnidad() {
  if (!("speechSynthesis" in window)) return null;
  const voces = window.speechSynthesis.getVoices() || [];
  if (!voces.length) return null;
  const preferidas = [
    "Jorge",
    "Raul",
    "Raúl",
    "Pablo",
    "Carlos",
    "Andres",
    "Andrés",
    "Diego",
    "Google US Spanish Male",
    "Google español",
    "Google español de Estados Unidos",
    "Google US Spanish"
  ];
  for (const nombre of preferidas) {
    const v = voces.find((voz) => (voz.name || "").toLowerCase().includes(nombre.toLowerCase()));
    if (v) return v;
  }
  const masculino = voces.find((voz) => {
    const n = (voz.name || "").toLowerCase();
    return /male|hombre|jorge|raul|ra[uú]l|pablo|carlos|andres|andr[eé]s|diego/.test(n)
      && (voz.lang || "").toLowerCase().startsWith("es");
  });
  if (masculino) return masculino;
  return voces.find((voz) => (voz.lang || "").toLowerCase().startsWith("es")) || null;
}

if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    vozUnidadPreferida = _resolverVozNaturalUnidad();
  };
  vozUnidadPreferida = _resolverVozNaturalUnidad();
}

function _clearAgentSpeechPlaybackTimer() {
  // compat: mantenemos el nombre para no tocar llamadas existentes
  // pero ya no usamos fin estimado por tiempo.
}

function _resetAgentSpeechPlaybackCallbacks() {
  agentSpeechPlaybackOnEnd = null;
  agentSpeechPlaybackOnError = null;
}

function _notifyAgentSpeechPlaybackEnd(token = 0, reason = "") {
  if (Number(token || 0) !== Number(agentSpeechPlaybackToken || 0)) return;
  const cb = agentSpeechPlaybackOnEnd;
  _resetAgentSpeechPlaybackCallbacks();
  if (typeof cb === "function") {
    try { cb(reason); } catch (_) {}
  }
}

function _notifyAgentSpeechPlaybackError(token = 0, err = null) {
  if (Number(token || 0) !== Number(agentSpeechPlaybackToken || 0)) return;
  const cb = agentSpeechPlaybackOnError;
  _resetAgentSpeechPlaybackCallbacks();
  if (typeof cb === "function") {
    try { cb(err); } catch (_) {}
  }
}

async function hablarAgenteUnidad(texto = "", opciones = {}) {
  const textoPlano = String(texto || "").trim();
  if (!textoPlano) return false;
  const {
    cancelarPrevio = true,
    onPlaybackStart = null,
    onPlaybackEnd = null,
    onPlaybackError = null
  } = opciones || {};
  const persona = activeUnidadAgentPersona;
  if (!persona) return false;
  const playbackToken = ++agentSpeechPlaybackToken;
  agentSpeechPlaybackOnEnd = typeof onPlaybackEnd === "function" ? onPlaybackEnd : null;
  agentSpeechPlaybackOnError = typeof onPlaybackError === "function" ? onPlaybackError : null;
  _clearAgentSpeechPlaybackTimer();
  _marcarFraseHabladaUnidad(textoPlano);
  _actualizarVozCharlyDesdeThemeSettings();
  unidadVoiceShouldRun = true;
  const agenteExclusivo = _agenteUnidadEnModoExclusivo();
  const modelLive = _resolverModeloGeminiFlashLive();
  const desiredConfigKey = _buildGeminiLiveSessionConfigKey(modelLive);

  // Si la sesión Live ya está abierta pero con otra voz/persona, se debe reiniciar
  // antes de enviar el texto para que respete la voz configurada del agente activo.
  if (geminiLiveSessionUnidad && geminiLiveIsOpen && geminiLiveSessionConfigKey !== desiredConfigKey) {
    try {
      await iniciarGeminiLiveUnidad({ withMic: !agenteExclusivo, forceRestart: true });
    } catch (err) {
      logVisual(`⚠️ No se pudo reconfigurar Live con la voz del agente: ${err?.message || "sin detalle"}`);
    }
  }

  if (geminiLiveSessionUnidad && geminiLiveIsOpen) {
    if (typeof onPlaybackStart === "function") {
      try { onPlaybackStart(); } catch (_) {}
    }
    _hablarCentralizadoLive(textoPlano, { cancelarPrevio });
    return true;
  }
  try {
    if (typeof onPlaybackStart === "function") {
      try { onPlaybackStart(); } catch (_) {}
    }
    _encolarHablaLive(textoPlano, { cancelarPrevio });
    iniciarGeminiLiveUnidad({
      withMic: !agenteExclusivo,
      forceRestart: !agenteExclusivo
    }).catch((err) => {
      _notifyAgentSpeechPlaybackError(playbackToken, err);
      logVisual(`⚠️ No se pudo iniciar Live para ${persona.nombre}: ${err?.message || "sin detalle"}`);
    });
    return true;
  } catch (err) {
    _notifyAgentSpeechPlaybackError(playbackToken, err);
    logVisual(`⚠️ No se pudo hablar como ${persona.nombre}: ${err?.message || "sin detalle"}`);
    return false;
  }
}

function _setAgentExclusiveVoiceMode(active = false) {
  agentExclusiveVoiceMode = active === true;
  clearTimeout(unidadVoiceRestartTimer);
  if (agentExclusiveVoiceMode) {
    // Best practice: usar un solo motor de reconocimiento para todo el flujo.
    // En modo agente exclusivo mantenemos el recognizer global y solo cambiamos
    // el enrutamiento de comandos hacia el controlador del agente.
    unidadVoiceShouldRun = true;
    if (typeof charlyAwake !== "undefined") charlyAwake = true;
    actualizarEstadoBotonVozUnidad();
    if (!unidadVoiceIsListening) {
      setTimeout(() => {
        if (agentExclusiveVoiceMode && unidadVoiceShouldRun && !unidadVoiceIsListening) iniciarEscuchaVozUnidad();
      }, 60);
    }
    return;
  }
  if (!_vozGlobalHabilitadaPorConfiguracion()) {
    unidadVoiceShouldRun = false;
    if (unidadVoiceRecognition && unidadVoiceIsListening) {
      try { unidadVoiceRecognition.stop(); } catch (_) { }
    }
    unidadVoiceIsListening = false;
    actualizarEstadoBotonVozUnidad();
    return;
  }
  if (unidadVoiceShouldRun && !unidadVoiceIsListening) {
    setTimeout(() => {
      if (unidadVoiceShouldRun && !unidadVoiceIsListening && !agentExclusiveVoiceMode) iniciarEscuchaVozUnidad();
    }, 120);
  }
  actualizarEstadoBotonVozUnidad();
}

function _esRespuestaSi(texto = "") {
  return /\b(si|sí|claro|ok|de acuerdo|correcto|adelante|vale|por supuesto)\b/i.test(String(texto || ""));
}

function _asegurarValorSelect(selectEl, valor = "") {
  if (!selectEl) return false;
  const v = String(valor || "").trim();
  if (!v) return false;
  const opt = Array.from(selectEl.options || []).find((o) =>
    String(o.value || "").trim().toLowerCase() === v.toLowerCase()
    || String(o.textContent || "").trim().toLowerCase() === v.toLowerCase()
  );
  if (!opt) return false;
  selectEl.value = opt.value;
  selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function _agenteUnidadEnModoExclusivo() {
  return _asegurarControladorAgenteUnidad().isExclusive();
}

const LECTURAS_AGENT_VIEWER_CACHE_KEY = "cb_lecturas_agent_images_v2";
const lecturasAgentViewerState = {
  token: 0,
  payload: null,
  slides: [],
  currentIndex: 0,
  refs: null,
  keyHandler: null,
  memCache: new Map(),
  storeLoaded: false,
  storageUrlCache: new Map(),
  autoReadActive: false,
  autoReadUtterance: null,
  autoReadLockedUntil: 0,
  autoReadRunId: 0,
  autoReadAdvanceTimer: null,
  autoReadSpeaking: false,
  autoReadSpeakSeq: 0
};

function _lecturasAgentIsAutoReadSpeaking() {
  const refs = lecturasAgentViewerState.refs;
  const open = refs?.modal?.getAttribute?.("aria-hidden") === "false";
  return open && lecturasAgentViewerState.autoReadActive === true && lecturasAgentViewerState.autoReadSpeaking === true;
}

function _lecturasAgentSafeHtml(text = "") {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _lecturasAgentHash(value = "") {
  const text = String(value || "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

function _lecturasAgentSafePathPart(value = "") {
  return String(value || "").trim().replace(/[^\w.-]+/g, "_").slice(0, 80) || "sin_valor";
}

function _lecturasAgentBuildStoragePath(payload = {}, slide = {}) {
  const uid = String(auth?.currentUser?.uid || "anon").trim();
  const sourceCollection = _lecturasAgentSafePathPart(payload?.sourceCollection || payload?.coleccion || "lecturasNuevas");
  const lecturaId = _lecturasAgentSafePathPart(payload?.id || "sin_id");
  const paragraphHash = _lecturasAgentSafePathPart(slide?.paragraphHash || _lecturasAgentHash(slide?.text || "s"));
  return `lecturas-agent/${uid}/${sourceCollection}/${lecturaId}/${paragraphHash}.png`;
}

function _lecturasAgentLoadCacheStore() {
  if (lecturasAgentViewerState.storeLoaded) return;
  lecturasAgentViewerState.storeLoaded = true;
  try {
    const raw = sessionStorage.getItem(LECTURAS_AGENT_VIEWER_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    Object.entries(parsed).forEach(([key, value]) => {
      const k = String(key || "").trim();
      const v = String(value || "").trim();
      if (!k || !v) return;
      lecturasAgentViewerState.memCache.set(k, v);
    });
  } catch (_) {}
}

function _lecturasAgentPersistCacheStore() {
  try {
    const entries = Array.from(lecturasAgentViewerState.memCache.entries()).slice(-200);
    const out = {};
    entries.forEach(([k, v]) => { out[k] = v; });
    sessionStorage.setItem(LECTURAS_AGENT_VIEWER_CACHE_KEY, JSON.stringify(out));
  } catch (_) {}
}

function _lecturasAgentNormalizeParagraphHtml(html = "") {
  const wrap = document.createElement("div");
  wrap.innerHTML = String(html || "").trim();
  const blocks = Array.from(wrap.querySelectorAll("p, li, blockquote, h2, h3, h4"));
  const out = [];
  blocks.forEach((node) => {
    const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
    if (!text || text.length < 24) return;
    out.push({
      html: node.outerHTML,
      text
    });
  });
  if (out.length) return out;
  const plain = String(wrap.textContent || "").replace(/\r/g, "").trim();
  if (!plain) return [];
  return plain
    .split(/\n{2,}|(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÑ])/)
    .map((chunk) => String(chunk || "").replace(/\s+/g, " ").trim())
    .filter((chunk) => chunk.length > 18)
    .map((chunk) => ({ html: `<p>${_lecturasAgentSafeHtml(chunk)}</p>`, text: chunk }));
}

function _lecturasAgentExtractDataUrlInfo(dataUrl = "") {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: String(match[1] || "").trim(),
    base64: String(match[2] || "").trim()
  };
}

async function _lecturasAgentUrlToInlinePart(url = "") {
  const src = String(url || "").trim();
  if (!src) return null;
  const inline = _lecturasAgentExtractDataUrlInfo(src);
  if (inline?.base64 && inline?.mimeType) {
    return { inlineData: { mimeType: inline.mimeType, data: inline.base64 } };
  }
  try {
    const res = await fetch(src, { cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || !String(blob.type || "").startsWith("image/")) return null;
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const info = _lecturasAgentExtractDataUrlInfo(String(reader.result || ""));
        if (info?.base64) resolve(info.base64);
        else reject(new Error("invalid_data_url"));
      };
      reader.onerror = () => reject(reader.error || new Error("reader_error"));
      reader.readAsDataURL(blob);
    });
    return { inlineData: { mimeType: blob.type, data: base64 } };
  } catch (_) {
    return null;
  }
}

async function _lecturasAgentCollectStyleReferenceParts(index = 0, token = 0) {
  const out = [];
  const slides = Array.isArray(lecturasAgentViewerState.slides) ? lecturasAgentViewerState.slides : [];
  for (let i = index - 1; i >= 0; i--) {
    if (token !== lecturasAgentViewerState.token) break;
    const s = slides[i];
    const src = String(s?.imageUrl || "").trim();
    if (!src) continue;
    const part = await _lecturasAgentUrlToInlinePart(src);
    if (part) out.push(part);
    if (out.length >= 2) break;
  }
  return out;
}

function _lecturasAgentBuildImagePrompt(payload = {}, slide = {}, index = 0, referenceCount = 0) {
  const titulo = String(payload?.titulo || "Lectura").trim();
  const coleccion = String(payload?.sourceCollection || payload?.coleccion || "").trim();
  const etiqueta = coleccion === "lecturasASC" ? "Lecturas ASC" : "Lecturas nuevas";
  const estiloBase = "Ilustración editorial narrativa, moderna, elegante, coherente entre páginas, luz cinematográfica, sin texto impreso.";
  const coherenceLine = referenceCount > 0
    ? `Coherencia visual: mantén paleta, composición y tratamiento similares a las ${referenceCount} imágenes de referencia adjuntas.`
    : "Coherencia visual: define un estilo consistente para reutilizar en los siguientes párrafos.";
  return [
    "Genera una imagen 16:9 para ilustrar un párrafo de lectura escolar en español.",
    `Título de la lectura: ${titulo}.`,
    `Colección: ${etiqueta}.`,
    `Párrafo ${index + 1}: ${String(slide?.text || "").slice(0, 1600)}.`,
    `Estilo visual: ${estiloBase}`,
    coherenceLine,
    "Evita letras, marcas de agua, firmas y texto incrustado dentro de la imagen."
  ].join("\n");
}

async function _lecturasAgentGenerateImage(payload = {}, slide = {}, index = 0, token = 0) {
  const referenceParts = await _lecturasAgentCollectStyleReferenceParts(index, token);
  const prompt = _lecturasAgentBuildImagePrompt(payload, slide, index, referenceParts.length);
  const parts = [{ text: prompt }, ...referenceParts];
  const {response: res, data} = await geminiGenerateViaApi("gemini-3-pro-image-preview", {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      temperature: 0.78
    }
  });
  if (!res.ok) {
    const detail = String(data?.error?.message || data?.error || "");
    throw new Error(`Gemini image HTTP ${res.status}: ${detail || res.statusText}`);
  }
  if (token !== lecturasAgentViewerState.token) throw new Error("cancelled");
  const outParts = data?.candidates?.[0]?.content?.parts || [];
  for (const part of outParts) {
    const inline = part?.inlineData || part?.inline_data;
    const mime = String(inline?.mimeType || inline?.mime_type || "").trim();
    const b64 = String(inline?.data || "").trim();
    if (!b64 || !/^image\//i.test(mime)) continue;
    return { dataUrl: `data:${mime};base64,${b64}`, mimeType: mime };
  }
  throw new Error("No se recibió imagen en la respuesta.");
}

async function _lecturasAgentTryReadStorageUrl(slide = {}) {
  const path = String(slide?.storagePath || "").trim();
  if (!path) return "";
  const cached = lecturasAgentViewerState.storageUrlCache.get(path);
  if (cached) return cached;
  try {
    const url = await getDownloadURL(storageRef(storage, path));
    if (url) {
      lecturasAgentViewerState.storageUrlCache.set(path, url);
      return url;
    }
  } catch (_) {}
  return "";
}

async function _lecturasAgentPersistImageToStorage(slide = {}, dataUrl = "") {
  const path = String(slide?.storagePath || "").trim();
  const src = String(dataUrl || "").trim();
  if (!path || !src) return "";
  try {
    await uploadString(storageRef(storage, path), src, "data_url");
    const url = await getDownloadURL(storageRef(storage, path));
    if (url) {
      lecturasAgentViewerState.storageUrlCache.set(path, url);
      return url;
    }
  } catch (_) {}
  return "";
}

function _lecturasAgentRenderDots() {
  const refs = lecturasAgentViewerState.refs;
  if (!refs?.dots) return;
  const dots = lecturasAgentViewerState.slides.map((_, idx) => {
    const active = idx === lecturasAgentViewerState.currentIndex ? " is-active" : "";
    return `<button type="button" class="lecturas-asc-agent-dot${active}" data-dot-index="${idx}" aria-label="Ir al párrafo ${idx + 1}"></button>`;
  }).join("");
  refs.dots.innerHTML = dots;
}

function _lecturasAgentRenderCurrentSlide() {
  const refs = lecturasAgentViewerState.refs;
  if (!refs) return;
  const slide = lecturasAgentViewerState.slides[lecturasAgentViewerState.currentIndex];
  if (!slide) return;
  refs.counter.textContent = `${lecturasAgentViewerState.currentIndex + 1} / ${lecturasAgentViewerState.slides.length}`;
  refs.pageText.innerHTML = slide.html || `<p>${_lecturasAgentSafeHtml(slide.text || "")}</p>`;
  refs.prev.disabled = lecturasAgentViewerState.currentIndex <= 0;
  refs.next.disabled = lecturasAgentViewerState.currentIndex >= lecturasAgentViewerState.slides.length - 1;
  const status = String(slide.imageStatus || "idle");
  if (status === "ready" && slide.imageUrl) {
    refs.imageWrap.innerHTML = `<img src="${slide.imageUrl}" alt="Ilustración del párrafo ${lecturasAgentViewerState.currentIndex + 1}" class="lecturas-asc-agent-image" loading="lazy">`;
  } else if (status === "error") {
    refs.imageWrap.innerHTML = `<div class="lecturas-asc-agent-image-state is-error"><p>No pude generar esta imagen.</p></div>`;
  } else {
    refs.imageWrap.innerHTML = `<div class="lecturas-asc-agent-image-state"><span class="lecturas-asc-agent-spinner"></span><p>Generando imagen del párrafo...</p></div>`;
  }
  const disabled = status === "loading" ? "disabled" : "";
  const autoReadActive = lecturasAgentViewerState.autoReadActive === true;
  refs.imageActions.innerHTML = `
    <button type="button" class="lecturas-asc-agent-read ${autoReadActive ? "is-active" : ""}" data-action="auto-read" aria-label="${autoReadActive ? "Pausar lectura automática" : "Leer automáticamente"}">
      <i class="fas ${autoReadActive ? "fa-pause-circle" : "fa-book-open"}" aria-hidden="true"></i>
      <span>${autoReadActive ? "Pausar lectura" : "Leer lectura"}</span>
    </button>
    <button type="button" class="lecturas-asc-agent-regenerate" data-retry-index="${lecturasAgentViewerState.currentIndex}" ${disabled}>Volver a generar imagen</button>
  `;
  _lecturasAgentRenderDots();
}

function _lecturasAgentSetSlide(index = 0, options = {}) {
  const total = lecturasAgentViewerState.slides.length;
  if (!total) return;
  const next = Math.max(0, Math.min(Number(index) || 0, total - 1));
  lecturasAgentViewerState.currentIndex = next;
  _lecturasAgentRenderCurrentSlide();
  if (lecturasAgentViewerState.autoReadActive && options?.manual === true) {
    _lecturasAgentSpeakCurrentSlide({ restart: true });
  }
}

function _lecturasAgentClearAutoReadTimer() {
  if (lecturasAgentViewerState.autoReadAdvanceTimer) clearTimeout(lecturasAgentViewerState.autoReadAdvanceTimer);
  lecturasAgentViewerState.autoReadAdvanceTimer = null;
}

function _lecturasAgentStopAutoRead(options = {}) {
  const silent = options?.silent === true;
  lecturasAgentViewerState.autoReadActive = false;
  lecturasAgentViewerState.autoReadRunId += 1;
  lecturasAgentViewerState.autoReadSpeaking = false;
  lecturasAgentViewerState.autoReadSpeakSeq += 1;
  lecturasAgentViewerState.autoReadLockedUntil = 0;
  _lecturasAgentClearAutoReadTimer();
  const utter = lecturasAgentViewerState.autoReadUtterance;
  lecturasAgentViewerState.autoReadUtterance = null;
  try { if (utter) utter.onend = utter.onerror = utter.onstart = null; } catch (_) {}
  _clearAgentSpeechPlaybackTimer();
  _resetAgentSpeechPlaybackCallbacks();
  try {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch (_) {}
  if (!silent) _lecturasAgentRenderCurrentSlide();
}

function _lecturasAgentAdvanceAfterPlayback(runId = 0) {
  if (!lecturasAgentViewerState.autoReadActive) return;
  if (Number(runId || 0) !== Number(lecturasAgentViewerState.autoReadRunId || 0)) return;
  if (lecturasAgentViewerState.currentIndex >= lecturasAgentViewerState.slides.length - 1) {
    _lecturasAgentStopAutoRead();
    return;
  }
  _lecturasAgentClearAutoReadTimer();
  lecturasAgentViewerState.autoReadAdvanceTimer = setTimeout(() => {
    if (!lecturasAgentViewerState.autoReadActive) return;
    if (Number(runId || 0) !== Number(lecturasAgentViewerState.autoReadRunId || 0)) return;
    _lecturasAgentSetSlide(lecturasAgentViewerState.currentIndex + 1, { manual: false });
    _lecturasAgentSpeakCurrentSlide({ restart: true });
  }, 360);
}

function _lecturasAgentSpeakCurrentSlide(options = {}) {
  if (lecturasAgentViewerState.autoReadActive !== true) return;
  const restart = options?.restart === true;
  if (!restart && lecturasAgentViewerState.autoReadSpeaking) return;
  const runId = Number(lecturasAgentViewerState.autoReadRunId || 0);
  const expectedIndex = Number(lecturasAgentViewerState.currentIndex || 0);
  const speakSeq = Number((lecturasAgentViewerState.autoReadSpeakSeq || 0) + 1);
  lecturasAgentViewerState.autoReadSpeakSeq = speakSeq;
  const slide = lecturasAgentViewerState.slides[lecturasAgentViewerState.currentIndex];
  if (!slide) return;
  const text = String(slide.text || "").replace(/\s+/g, " ").trim();
  if (!text) {
    _lecturasAgentAdvanceAfterPlayback(runId);
    return;
  }
  lecturasAgentViewerState.autoReadSpeaking = true;
  const handled = hablarAgenteUnidad(text, {
    cancelarPrevio: true,
    onPlaybackStart: () => {
      if (!lecturasAgentViewerState.autoReadActive) return;
      if (Number(runId || 0) !== Number(lecturasAgentViewerState.autoReadRunId || 0)) return;
      if (Number(speakSeq || 0) !== Number(lecturasAgentViewerState.autoReadSpeakSeq || 0)) return;
      if (Number(expectedIndex || 0) !== Number(lecturasAgentViewerState.currentIndex || 0)) return;
      lecturasAgentViewerState.autoReadLockedUntil = Date.now() + 180;
    },
    onPlaybackEnd: () => {
      if (!lecturasAgentViewerState.autoReadActive) return;
      if (Number(runId || 0) !== Number(lecturasAgentViewerState.autoReadRunId || 0)) return;
      if (Number(speakSeq || 0) !== Number(lecturasAgentViewerState.autoReadSpeakSeq || 0)) return;
      if (Number(expectedIndex || 0) !== Number(lecturasAgentViewerState.currentIndex || 0)) return;
      lecturasAgentViewerState.autoReadSpeaking = false;
      _lecturasAgentAdvanceAfterPlayback(runId);
    },
    onPlaybackError: () => {
      if (!lecturasAgentViewerState.autoReadActive) return;
      if (Number(runId || 0) !== Number(lecturasAgentViewerState.autoReadRunId || 0)) return;
      if (Number(speakSeq || 0) !== Number(lecturasAgentViewerState.autoReadSpeakSeq || 0)) return;
      lecturasAgentViewerState.autoReadSpeaking = false;
      _lecturasAgentStopAutoRead();
    }
  });
  if (handled === false) {
    lecturasAgentViewerState.autoReadSpeaking = false;
    _lecturasAgentStopAutoRead();
  }
}

function _lecturasAgentToggleAutoRead() {
  if (lecturasAgentViewerState.autoReadActive) {
    _lecturasAgentStopAutoRead();
    return;
  }
  lecturasAgentViewerState.autoReadActive = true;
  lecturasAgentViewerState.autoReadRunId += 1;
  lecturasAgentViewerState.autoReadSpeaking = false;
  lecturasAgentViewerState.autoReadLockedUntil = Date.now() + 180;
  _lecturasAgentRenderCurrentSlide();
  _lecturasAgentSpeakCurrentSlide({ restart: true });
}

function _lecturasAgentUpdateSlideFromCached(slide = {}, cachedUrl = "") {
  const url = String(cachedUrl || "").trim();
  if (!url) return false;
  slide.imageUrl = url;
  slide.imageStatus = "ready";
  return true;
}

async function _lecturasAgentEnsureSlideImage(slide = {}, idx = 0, token = 0, options = {}) {
  const forceRegenerate = options?.forceRegenerate === true;
  const cacheKey = String(slide?.cacheKey || "").trim();
  if (!forceRegenerate && cacheKey) {
    const fromCache = String(lecturasAgentViewerState.memCache.get(cacheKey) || "").trim();
    if (_lecturasAgentUpdateSlideFromCached(slide, fromCache)) return true;
  }
  if (!forceRegenerate) {
    const storageUrl = await _lecturasAgentTryReadStorageUrl(slide);
    if (storageUrl) {
      slide.imageUrl = storageUrl;
      slide.imageStatus = "ready";
      if (cacheKey) {
        lecturasAgentViewerState.memCache.set(cacheKey, storageUrl);
        _lecturasAgentPersistCacheStore();
      }
      return true;
    }
  }

  slide.imageStatus = "loading";
  if (idx === lecturasAgentViewerState.currentIndex) _lecturasAgentRenderCurrentSlide();
  const generated = await _lecturasAgentGenerateImage(lecturasAgentViewerState.payload, slide, idx, token);
  if (token !== lecturasAgentViewerState.token) throw new Error("cancelled");

  const persistentUrl = await _lecturasAgentPersistImageToStorage(slide, generated.dataUrl);
  const finalUrl = persistentUrl
    ? `${persistentUrl}${persistentUrl.includes("?") ? "&" : "?"}v=${Date.now()}`
    : generated.dataUrl;
  slide.imageUrl = finalUrl;
  slide.imageStatus = "ready";
  if (cacheKey) {
    lecturasAgentViewerState.memCache.set(cacheKey, slide.imageUrl);
    _lecturasAgentPersistCacheStore();
  }
  return true;
}

async function _lecturasAgentGenerateQueue(token = 0, options = {}) {
  const slides = lecturasAgentViewerState.slides;
  if (!Array.isArray(slides) || !slides.length) return;
  const pending = slides
    .map((slide, idx) => ({ slide, idx }))
    .filter((it) => options?.onlyIndex == null
      ? !it.slide.imageUrl || options?.forceRegenerate === true
      : it.idx === Number(options.onlyIndex));
  if (!pending.length) return;
  const concurrency = options?.onlyIndex != null ? 1 : 2;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, pending.length) }).map(async () => {
    while (cursor < pending.length) {
      if (token !== lecturasAgentViewerState.token) return;
      const pos = cursor++;
      const { slide, idx } = pending[pos];
      try {
        await _lecturasAgentEnsureSlideImage(slide, idx, token, {
          forceRegenerate: options?.forceRegenerate === true
        });
      } catch (_) {
        if (token !== lecturasAgentViewerState.token) return;
        slide.imageStatus = "error";
      }
      if (idx === lecturasAgentViewerState.currentIndex) _lecturasAgentRenderCurrentSlide();
    }
  });
  await Promise.allSettled(workers);
}

function _lecturasAgentEnsureModal() {
  if (lecturasAgentViewerState.refs?.modal) return lecturasAgentViewerState.refs;
  let modal = document.getElementById("lecturasASCAgent");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "lecturasASCAgent";
    modal.className = "lecturas-asc-agent-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="lecturas-asc-agent-backdrop" data-action="close"></div>
      <section class="lecturas-asc-agent-panel" role="dialog" aria-modal="true" aria-label="Lector de lecturas del agente">
        <header class="lecturas-asc-agent-head">
          <div class="lecturas-asc-agent-head-meta">
            <span id="lecturasASCAgentCollection" class="lecturas-asc-agent-collection">Lectura</span>
          </div>
          <button type="button" class="lecturas-asc-agent-close" data-action="close" aria-label="Cerrar visor">&times;</button>
        </header>
        <div class="lecturas-asc-agent-book">
          <button type="button" id="lecturasASCAgentPrev" class="lecturas-asc-agent-nav is-prev" aria-label="Párrafo anterior">‹</button>
          <div class="lecturas-asc-agent-page">
            <div class="lecturas-asc-agent-media-wrap">
              <h3 id="lecturasASCAgentTitle" class="lecturas-asc-agent-title">Lectura</h3>
              <div id="lecturasASCAgentImageWrap" class="lecturas-asc-agent-media"></div>
              <div id="lecturasASCAgentImageActions" class="lecturas-asc-agent-image-actions"></div>
            </div>
            <article class="lecturas-asc-agent-text-wrap">
              <div class="lecturas-asc-agent-text-head">
                <span id="lecturasASCAgentCounter" class="lecturas-asc-agent-counter"></span>
              </div>
              <div id="lecturasASCAgentPageText" class="lecturas-asc-agent-page-text"></div>
            </article>
          </div>
          <button type="button" id="lecturasASCAgentNext" class="lecturas-asc-agent-nav is-next" aria-label="Párrafo siguiente">›</button>
        </div>
        <footer class="lecturas-asc-agent-foot">
          <div id="lecturasASCAgentDots" class="lecturas-asc-agent-dots"></div>
        </footer>
      </section>
    `;
    document.body.appendChild(modal);
  }
  const refs = {
    modal,
    collection: modal.querySelector("#lecturasASCAgentCollection"),
    title: modal.querySelector("#lecturasASCAgentTitle"),
    close: modal.querySelector(".lecturas-asc-agent-close"),
    prev: modal.querySelector("#lecturasASCAgentPrev"),
    next: modal.querySelector("#lecturasASCAgentNext"),
    imageWrap: modal.querySelector("#lecturasASCAgentImageWrap"),
    imageActions: modal.querySelector("#lecturasASCAgentImageActions"),
    counter: modal.querySelector("#lecturasASCAgentCounter"),
    pageText: modal.querySelector("#lecturasASCAgentPageText"),
    dots: modal.querySelector("#lecturasASCAgentDots")
  };
  modal.addEventListener("click", (e) => {
    const closeAction = e.target?.closest?.("[data-action='close']");
    if (closeAction) {
      window.cbCloseLecturasAgentViewer?.();
      return;
    }
    const dot = e.target?.closest?.("[data-dot-index]");
    if (dot) {
      _lecturasAgentSetSlide(Number(dot.dataset.dotIndex || 0), { manual: true });
      return;
    }
    const retry = e.target?.closest?.("[data-retry-index]");
    if (retry) {
      const idx = Number(retry.dataset.retryIndex || -1);
      const slide = lecturasAgentViewerState.slides[idx];
      if (!slide) return;
      slide.imageStatus = "idle";
      slide.imageUrl = "";
      if (slide.cacheKey) lecturasAgentViewerState.memCache.delete(slide.cacheKey);
      _lecturasAgentRenderCurrentSlide();
      _lecturasAgentGenerateQueue(lecturasAgentViewerState.token, {
        onlyIndex: idx,
        forceRegenerate: true
      }).catch(() => {});
      return;
    }
    const autoReadBtn = e.target?.closest?.("[data-action='auto-read']");
    if (autoReadBtn) {
      _lecturasAgentToggleAutoRead();
    }
  });
  refs.prev?.addEventListener("click", () => _lecturasAgentSetSlide(lecturasAgentViewerState.currentIndex - 1, { manual: true }));
  refs.next?.addEventListener("click", () => _lecturasAgentSetSlide(lecturasAgentViewerState.currentIndex + 1, { manual: true }));
  if (!lecturasAgentViewerState.keyHandler) {
    lecturasAgentViewerState.keyHandler = (e) => {
      if (lecturasAgentViewerState.refs?.modal?.getAttribute("aria-hidden") !== "false") return;
      if (e.key === "Escape") {
        e.preventDefault();
        window.cbCloseLecturasAgentViewer?.();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        _lecturasAgentSetSlide(lecturasAgentViewerState.currentIndex - 1, { manual: true });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        _lecturasAgentSetSlide(lecturasAgentViewerState.currentIndex + 1, { manual: true });
      }
    };
    document.addEventListener("keydown", lecturasAgentViewerState.keyHandler);
  }
  lecturasAgentViewerState.refs = refs;
  return refs;
}

window.cbIsAgentExclusiveMode = function cbIsAgentExclusiveMode() {
  return _agenteUnidadEnModoExclusivo();
};

window.cbOpenLecturasAgentViewer = function cbOpenLecturasAgentViewer(payload = {}) {
  const refs = _lecturasAgentEnsureModal();
  _lecturasAgentLoadCacheStore();
  const rawHtml = String(payload?.htmlLectura || payload?.contenidoHTML || "").trim() || "<p>(Sin contenido)</p>";
  const normalized = _lecturasAgentNormalizeParagraphHtml(rawHtml);
  const sourceCollection = String(payload?.sourceCollection || payload?.coleccion || "").trim() || "lecturasNuevas";
  const title = String(payload?.titulo || payload?.tema || "Lectura sin título").trim();
  lecturasAgentViewerState.token += 1;
  const token = lecturasAgentViewerState.token;
  lecturasAgentViewerState.payload = {
    id: String(payload?.id || "").trim(),
    sourceCollection,
    titulo: title
  };
  lecturasAgentViewerState.slides = normalized.length
    ? normalized.map((item, idx) => {
      const paragraphHash = _lecturasAgentHash(item.text);
      const cacheKey = `${sourceCollection}:${lecturasAgentViewerState.payload.id}:${paragraphHash}`;
      const cached = String(lecturasAgentViewerState.memCache.get(cacheKey) || "").trim();
      return {
        id: `${idx + 1}`,
        html: item.html,
        text: item.text,
        paragraphHash,
        cacheKey,
        storagePath: _lecturasAgentBuildStoragePath(lecturasAgentViewerState.payload, { paragraphHash, text: item.text }),
        imageUrl: cached,
        imageStatus: cached ? "ready" : "idle"
      };
    })
    : [{
      id: "1",
      html: "<p>(Sin contenido)</p>",
      text: "",
      paragraphHash: "sin_parrafo",
      cacheKey: "",
      storagePath: "",
      imageUrl: "",
      imageStatus: "error"
    }];
  lecturasAgentViewerState.currentIndex = 0;
  _lecturasAgentStopAutoRead({ silent: true });
  refs.collection.textContent = sourceCollection === "lecturasASC" ? "Lecturas ASC" : "Lecturas nuevas";
  refs.title.textContent = title;
  refs.modal.classList.add("is-open");
  refs.modal.setAttribute("aria-hidden", "false");
  _lecturasAgentRenderCurrentSlide();
  _lecturasAgentGenerateQueue(token).catch(() => {});
  return true;
};

window.cbCloseLecturasAgentViewer = function cbCloseLecturasAgentViewer() {
  const refs = _lecturasAgentEnsureModal();
  lecturasAgentViewerState.token += 1;
  _lecturasAgentStopAutoRead({ silent: true });
  refs.modal.classList.remove("is-open");
  refs.modal.setAttribute("aria-hidden", "true");
  return true;
};

function _leerEstadoMasterAgenteStorage() {
  try {
    const raw = localStorage.getItem(AGENT_MASTER_ENABLED_STORAGE_KEY);
    if (raw == null) return true;
    return String(raw).trim() !== "0";
  } catch (_) {
    return true;
  }
}

function _guardarEstadoMasterAgenteStorage(enabled = true) {
  try {
    localStorage.setItem(AGENT_MASTER_ENABLED_STORAGE_KEY, enabled ? "1" : "0");
  } catch (_) {
    // noop
  }
}

function _setEstadoUIAgentMaster(enabled = true) {
  const value = enabled === true;
  const root = document.querySelector(".unidad-global-agents-footer");
  if (root) root.setAttribute("data-agent-enabled", value ? "on" : "off");
  const toggle = document.getElementById("unidadAgentEnabledToggle");
  if (toggle && toggle.checked !== value) toggle.checked = value;
}

function _esAgenteMasterHabilitado() {
  return unidadAgentMasterEnabled === true;
}

function _aplicarEstadoMasterAgente(enabled = true, options = {}) {
  const { persist = true, fromUser = false } = options || {};
  const next = enabled === true;
  unidadAgentMasterEnabled = next;
  _setEstadoUIAgentMaster(next);
  if (persist) _guardarEstadoMasterAgenteStorage(next);
  if (next) return;
  try {
    const ctrl = _asegurarControladorAgenteUnidad();
    if (ctrl?.isExclusive?.()) ctrl.close();
  } catch (_) {}
  _setAgentExclusiveVoiceMode(false);
  if (_vozGlobalHabilitadaPorConfiguracion()) {
    unidadVoiceShouldRun = true;
    setTimeout(() => {
      if (!agentExclusiveVoiceMode && unidadVoiceShouldRun && !unidadVoiceIsListening) iniciarEscuchaVozUnidad();
    }, 120);
  }
  if (fromUser) {
    _hablarSiFuncionaRespuestaVoz("_agentMasterToggle", "Agente desactivado. Comandos de voz globales reactivados.", { cancelarPrevio: true, preferLive: true });
  }
}

function _inicializarSwitchMasterAgenteUnidad() {
  const toggle = document.getElementById("unidadAgentEnabledToggle");
  unidadAgentMasterEnabled = _leerEstadoMasterAgenteStorage();
  _setEstadoUIAgentMaster(unidadAgentMasterEnabled);
  if (!toggle || toggle.dataset.boundAgentMaster === "1") return;
  toggle.dataset.boundAgentMaster = "1";
  toggle.checked = unidadAgentMasterEnabled === true;
  toggle.addEventListener("change", () => {
    _aplicarEstadoMasterAgente(toggle.checked === true, { persist: true, fromUser: true });
  });
}

function _configurarRecursosGlobalesEnTabla(config = {}) {
  const map = {
    fichas: "ficha_",
    anexos: "anexo_",
    recortables: "recortable_",
    videos: "video_"
  };
  Object.entries(map).forEach(([key, prefix]) => {
    const checked = !!config[key];
    document.querySelectorAll(`input[type='checkbox'][name^='${prefix}']`).forEach((chk) => {
      if (chk.checked !== checked) {
        chk.checked = checked;
        chk.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  });
}

function _parseRecursosGlobalesDesdeTexto(texto = "") {
  const raw = String(texto || "").toLowerCase();
  const recursos = ["fichas", "anexos", "recortables", "videos"];
  if (_esRespuestaSi(raw) && !recursos.some((r) => raw.includes(r.slice(0, -1)) || raw.includes(r))) {
    return { fichas: true, anexos: true, recortables: true, videos: true };
  }
  if (/\bninguno|nada|sin recursos\b/.test(raw)) {
    return { fichas: false, anexos: false, recortables: false, videos: false };
  }
  const base = /\b(sin|quita|remueve|elimina)\b/.test(raw) && !/\bsolo\b/.test(raw)
    ? { fichas: true, anexos: true, recortables: true, videos: true }
    : { fichas: false, anexos: false, recortables: false, videos: false };
  const solo = /\bsolo\b/.test(raw);
  const out = solo ? { fichas: false, anexos: false, recortables: false, videos: false } : { ...base };
  recursos.forEach((recurso) => {
    const singular = recurso.replace(/s$/, "");
    const rxNeg = new RegExp(`\\b(?:sin|quita|remueve|elimina|desactiva)\\b[^.\\n]*\\b${singular}s?\\b`, "i");
    const rxPos = new RegExp(`\\b(?:con|agrega|añade|anade|activa|marca|pon|usar|incluye|solo)\\b[^.\\n]*\\b${singular}s?\\b`, "i");
    if (rxNeg.test(raw)) out[recurso] = false;
    else if (rxPos.test(raw) || raw.includes(recurso) || raw.includes(singular)) out[recurso] = true;
  });
  return out;
}

function _seleccionarLecturaParaUnidadDesdeColeccion(coleccion = "", titulo = "") {
  const q = _normalizarTexto(titulo);
  if (!q) return false;
  const pool = _poolLecturasBusqueda().filter((it) => {
    const col = String(it?.sourceCollection || it?.coleccion || (String(it?.tipo || "").toLowerCase() === "asc" ? "lecturasASC" : "lecturasNuevas")).trim();
    return !coleccion || col === coleccion;
  });
  const found = pool.find((it) => _normalizarTexto(it?.titulo || it?.tema || "").includes(q))
    || pool.find((it) => q.includes(_normalizarTexto(it?.titulo || it?.tema || "")));
  if (!found?.id) return false;
  if (coleccion === "lecturasASC") {
    const sel = document.getElementById("unidadTemaASC");
    if (!sel) return false;
    if (!Array.from(sel.options || []).some((o) => String(o.value) === String(found.id))) {
      const opt = document.createElement("option");
      opt.value = String(found.id);
      opt.textContent = _labelLecturaPrincipal(found);
      sel.appendChild(opt);
    }
    sel.value = String(found.id);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    guardarSelectsUnidad();
    return true;
  }
  return _aplicarLecturaPrincipalSeleccionada(found);
}
function hablarUnidad(texto = "", opciones = {}) {
  const { cancelarPrevio = false, rate = 0.97, pitch = 0.88, forceLocalImmediate = false, preferLive = false } = opciones || {};
  const textoPlano = String(texto || "").trim();
  if (!textoPlano) return;
  const now = Date.now();
  if (textoPlano === ultimaSalidaVozTexto && (now - ultimaSalidaVozAt) < 1800) return;
  ultimaSalidaVozTexto = textoPlano;
  ultimaSalidaVozAt = now;
  if (forceLocalImmediate) {
    _hablarUnidadLocalRapida(textoPlano, { cancelarPrevio });
    return;
  }
  if (GEMINI_LIVE_VOICE_ONLY && hasRuntimeGeminiApiKey()) {
    if (preferLive) {
      _hablarCentralizadoLive(textoPlano, { cancelarPrevio });
      return;
    }
    const okTts = _hablarConGeminiTts(textoPlano, {
      cancelarPrevio,
      onFail: () => {
        const okLive = _hablarConGeminiLive(textoPlano, { cancelarPrevio });
        if (!okLive) logVisual("🔇 Gemini TTS/Live voz no disponible para este mensaje.");
      }
    });
    if (okTts) return;
    const okLive = _hablarConGeminiLive(textoPlano, { cancelarPrevio });
    if (okLive) return;
    logVisual("🔇 Gemini TTS/Live voz no disponible para este mensaje.");
    return;
  }
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;
  _marcarFraseHabladaUnidad(textoPlano);
  if (cancelarPrevio) window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(textoPlano);
  utterance.lang = charlyVoiceLocale || CHARLY_VOICE_LOCALE_DEFAULT;
  utterance.rate = rate;
  utterance.pitch = pitch;
  if (!vozUnidadPreferida) vozUnidadPreferida = _resolverVozNaturalUnidad();
  if (vozUnidadPreferida) utterance.voice = vozUnidadPreferida;
  utterance.onstart = () => _setIndicadorHablandoCharly(true);
  const apagar = () => _setIndicadorHablandoCharly(false);
  utterance.onend = apagar;
  utterance.onerror = apagar;
  window.speechSynthesis.speak(utterance);
}

function hablarUnidadComandoRapido(texto = "", opciones = {}) {
  const { cancelarPrevio = true } = opciones || {};
  hablarUnidad(texto, { cancelarPrevio, preferLive: true });
}

function _hablarUnidadLocalRapida(texto = "", opciones = {}) {
  if (!texto || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;
  const { cancelarPrevio = true } = opciones || {};
  _marcarFraseHabladaUnidad(texto);
  if (cancelarPrevio) window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(texto));
  utterance.lang = charlyVoiceLocale || CHARLY_VOICE_LOCALE_DEFAULT;
  utterance.rate = Math.max(0.8, Math.min(1.25, charlyVoiceSpeed || 1.0));
  utterance.pitch = Math.max(0.75, Math.min(1.2, charlyVoicePitch || 0.95));
  if (!vozUnidadPreferida) vozUnidadPreferida = _resolverVozNaturalUnidad();
  if (vozUnidadPreferida) utterance.voice = vozUnidadPreferida;
  utterance.onstart = () => _setIndicadorHablandoCharly(true);
  const apagar = () => _setIndicadorHablandoCharly(false);
  utterance.onend = apagar;
  utterance.onerror = apagar;
  window.speechSynthesis.speak(utterance);
}

function _canonTextoVoz(s = "") {
  return _normalizarTexto(String(s || ""))
    .replace(/[^a-z0-9]/g, "");
}

function _marcarFraseHabladaUnidad(texto = "", guardMs = 0) {
  const safeText = String(texto || "").trim();
  const now = Date.now();
  ultimaFraseHabladaUnidad = safeText;
  ultimaFraseHabladaAt = now;
  const estimatedGuard = Math.max(1800, Math.min(12000, safeText.length * 62));
  ultimaFraseHabladaGuardUntil = now + Math.max(estimatedGuard, Number(guardMs) || 0);
}

function _esEcoDeAgente(transcripcion = "") {
  const now = Date.now();
  if (!ultimaFraseHabladaUnidad || (now - ultimaFraseHabladaAt) > 5000) return false;
  const a = _canonTextoVoz(transcripcion);
  const b = _canonTextoVoz(ultimaFraseHabladaUnidad);
  if (!a || !b) return false;
  if (a === b) return true;
  if (now < Number(ultimaFraseHabladaGuardUntil || 0) && a.length >= 10 && b.includes(a)) return true;
  const minLen = Math.min(a.length, b.length);
  const maxLen = Math.max(a.length, b.length);
  // Evita falsos positivos cuando el usuario repite solo una opción corta
  // mencionada dentro de una frase larga del agente.
  if (minLen < 14) return false;
  const ratio = minLen / Math.max(1, maxLen);
  if (ratio < 0.82) return false;
  return a.includes(b) || b.includes(a);
}

function _responderWakeConBajaLatencia(texto = "") {
  const msg = String(texto || "").trim();
  if (!msg) return;
  // Confirmación inmediata local para minimizar latencia percibida del wake-word.
  hablarUnidad(msg, { cancelarPrevio: true, forceLocalImmediate: true });
  if (!unidadVoiceShouldRun) return;
  if (geminiLiveSessionUnidad && geminiLiveIsOpen) return;
  if (!geminiLiveReconnectInFlight && !geminiLiveReconnectTimer) {
    iniciarGeminiLiveUnidad().catch(() => { });
  }
}

function _matchComandoSistema(key = "", fnName = "", texto = "", defaultRegex = "") {
  const t = _normalizarTexto(texto);
  const base = _matchComando(key, t, defaultRegex);
  if (base) {
    const cfg = _leerConfigComandosVoz();
    const rowFn = _normalizarFnComandoVoz(String(cfg?.[key]?.fn || fnName).trim());
    if (!cfg?.[key] || rowFn === fnName) {
      return { key, match: base };
    }
  }
  const entries = _listarComandosConfigurados(({ row, key: cfgKey }) =>
    _normalizarFnComandoVoz(String(row.fn || "").trim()) === fnName && cfgKey !== key
  );
  for (const { key: cfgKey, row } of entries) {
    const rx = _compilarRegexFlexible(String(row.regex || "").trim());
    if (!rx) continue;
    const m = t.match(rx);
    if (m) return { key: cfgKey, match: m };
  }
  return null;
}

function _esComandoDespertar(norm = "") {
  const t = _normalizarTexto(norm);
  if (t === "charly") return true;
  if (/^charly[\s,.;:¡!¿?_-]+$/.test(t)) return true;
  return !!_matchComandoSistema("wake_charly", "_esComandoDespertar", t);
}

function _esComandoSaludo(norm = "") {
  return !!_matchComandoSistema("greet_charly", "_esComandoSaludo", norm);
}

function _extraerComandoDespuesDeWake(norm = "") {
  const t = _normalizarTexto(norm);
  if (!t) return "";
  if (t === "charly") return "";
  if (/^charly\b/.test(t)) {
    return t.replace(/^charly\b/, "").replace(/^[\s,.;:¡!¿?_-]+/, "").trim();
  }
  const found = _matchComandoSistema("wake_charly", "_esComandoDespertar", t);
  const m = found?.match;
  if (!m || typeof m.index !== "number") return "";
  const start = Number(m.index);
  const end = start + String(m[0] || "").length;
  // Priorizar lo que va después del wake (ej. "oye charly abre...").
  const suffix = t.slice(end).replace(/^[\s,.;:¡!¿?_-]+/, "").trim();
  if (suffix) return suffix;
  // Fallback cuando el wake viene al final (ej. "abre modal charly").
  return t.slice(0, start).replace(/[\s,.;:¡!¿?_-]+$/, "").trim();
}

function _esComandoDescanso(norm = "") {
  return !!_matchComandoSistema("sleep_charly", "_esComandoDescanso", norm);
}

function _esComandoCerrarVentana(norm = "") {
  return /\b(cierra(?:\s+la\s+ventana)?|cerrar|atras|atrás)\b/i.test(norm);
}

function _escaparTextoParaGemini(texto = "") {
  return String(texto || "").replace(/"/g, '\\"').replace(/\n/g, " ").trim();
}

function _marcarLiveSesionCaida(origen = "unknown") {
  geminiLiveInputCircuitOpenUntil = Date.now() + 4500;
  geminiLiveMicUploadPaused = true;
  geminiLiveIsOpen = false;
  geminiLiveSessionClosing = true;
  geminiLiveSessionUnidad = null;
  _detenerLecturaCompletaCharly();
  _setIndicadorHablandoCharly(false);
  _programarReconectarLive(origen);
}

function _manejarErrorEnvioLive(err, origen = "send_live") {
  if (/CLOSING|CLOSED|closing|closed/i.test(String(err?.message || ""))) {
    _marcarLiveSesionCaida(origen);
    return true;
  }
  return false;
}

function _safeSendClientContent(payload, origen = "send_client_content") {
  if (!geminiLiveSessionUnidad || !geminiLiveIsOpen || geminiLiveSessionClosing) return false;
  try {
    const maybe = geminiLiveSessionUnidad.sendClientContent(payload);
    if (maybe && typeof maybe.then === "function") {
      maybe.catch((err) => {
        _manejarErrorEnvioLive(err, origen);
      });
    }
    return true;
  } catch (err) {
    if (_manejarErrorEnvioLive(err, origen)) return false;
    throw err;
  }
}

function _safeSendRealtimeInput(payload, origen = "send_realtime_input") {
  if (!geminiLiveSessionUnidad || !geminiLiveIsOpen || geminiLiveSessionClosing) return false;
  if (Date.now() < Number(geminiLiveInputCircuitOpenUntil || 0)) return false;
  try {
    const maybe = geminiLiveSessionUnidad.sendRealtimeInput(payload);
    if (maybe && typeof maybe.then === "function") {
      maybe.catch((err) => {
        _manejarErrorEnvioLive(err, origen);
      });
    }
    return true;
  } catch (err) {
    if (_manejarErrorEnvioLive(err, origen)) return false;
    return false;
  }
}

function _hablarConGeminiLive(texto = "", opciones = {}) {
  if (!geminiLiveSessionUnidad || !geminiLiveIsOpen) return false;
  const { cancelarPrevio = false } = opciones || {};
  if (!texto) return false;
  if (cancelarPrevio) _limpiarAudioGeminiProgramado();
  const estimatedMs = Math.max(12000, Math.min(90000, String(texto || "").trim().length * 58));
  geminiLiveAllowOutputUntil = Date.now() + estimatedMs;
  _marcarFraseHabladaUnidad(texto, estimatedMs);
  return _safeSendClientContent({
    turns: [{
      role: "user",
      parts: [{
        text: `Di exactamente esta frase en ${_descripcionLocaleCharly(charlyVoiceLocale)} con ${_descripcionPersonaVozActual()}. Mantén ritmo fluido y natural. No agregues ni quites palabras: "${_escaparTextoParaGemini(texto)}"`
      }]
    }],
    turnComplete: true
  }, "ws_closed_hablar");
}

function _encolarHablaLive(texto = "", opciones = {}) {
  const t = String(texto || "").trim();
  if (!t) return false;
  const { cancelarPrevio = false } = opciones || {};
  if (cancelarPrevio) {
    geminiLivePendingSpeechQueue = [{ text: t, cancelarPrevio: true, ts: Date.now() }];
    return true;
  }
  geminiLivePendingSpeechQueue.push({ text: t, cancelarPrevio: false, ts: Date.now() });
  if (geminiLivePendingSpeechQueue.length > 6) {
    geminiLivePendingSpeechQueue = geminiLivePendingSpeechQueue.slice(-6);
  }
  return true;
}

function _procesarColaHablaLive() {
  if (!geminiLiveSessionUnidad || !geminiLiveIsOpen) return false;
  if (!Array.isArray(geminiLivePendingSpeechQueue) || !geminiLivePendingSpeechQueue.length) return false;
  const cola = [...geminiLivePendingSpeechQueue];
  geminiLivePendingSpeechQueue = [];
  let emitted = false;
  cola.forEach((item) => {
    if (!item?.text) return;
    const ok = _hablarConGeminiLive(String(item.text), { cancelarPrevio: !!item.cancelarPrevio });
    if (ok) emitted = true;
  });
  return emitted;
}

function _hablarCentralizadoLive(texto = "", opciones = {}) {
  const t = String(texto || "").trim();
  if (!t) return false;
  const { cancelarPrevio = false } = opciones || {};
  const okNow = _hablarConGeminiLive(t, { cancelarPrevio });
  if (okNow) return true;
  _encolarHablaLive(t, { cancelarPrevio });
  if (!unidadVoiceShouldRun) return true;
  if (!geminiLiveReconnectInFlight && !geminiLiveReconnectTimer) {
    iniciarGeminiLiveUnidad({ withMic: !_agenteUnidadEnModoExclusivo() }).catch((err) => {
      logVisual(`⚠️ No se pudo centralizar voz en Live: ${err?.message || "sin detalle"}`);
    });
  }
  return true;
}

function _obtenerDataUrlAudioGemini(base64Data = "", mimeType = "") {
  if (!base64Data) return "";
  const mime = String(mimeType || "").trim() || "audio/wav";
  return `data:${mime};base64,${base64Data}`;
}

async function _solicitarAudioTtsGemini(ai, Modality, texto, voiceName) {
  const speedDesc =
    (charlyVoiceSpeed <= 0.9) ? "ritmo calmado" :
      (charlyVoiceSpeed >= 1.15) ? "ritmo dinámico" : "ritmo natural";
  const pitchDesc =
    (charlyVoicePitch <= 0.9) ? "tono grave" :
      (charlyVoicePitch >= 1.05) ? "tono ligeramente agudo" : "tono medio";
  const response = await ai.models.generateContent({
    model: GEMINI_TTS_MODEL_DEFAULT,
    contents: [{
      role: "user",
      parts: [{
        text: `Di exactamente esta frase en ${_descripcionLocaleCharly(charlyVoiceLocale)} con ${_estiloVozCharlyActual()}, mood ${charlyVoiceMood}, ${speedDesc} y ${pitchDesc}. No agregues ni quites palabras: "${_escaparTextoParaGemini(texto)}"`
      }]
    }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName
          }
        }
      }
    }
  });

  const parts = response?.candidates?.[0]?.content?.parts
    || response?.response?.candidates?.[0]?.content?.parts
    || [];
  const audioPart = parts.find((p) => p?.inlineData?.data);
  const audioData = audioPart?.inlineData?.data || "";
  const audioMime = audioPart?.inlineData?.mimeType || "audio/wav";
  return _obtenerDataUrlAudioGemini(audioData, audioMime);
}

async function _obtenerClienteGeminiTtsUnidad() {
  if (geminiTtsAiClientUnidad) return geminiTtsAiClientUnidad;
  const apiKey = getRuntimeGeminiApiKey();
  if (!apiKey || apiKey.includes("__GEMINI_API_KEY_LOCAL__")) {
    throw new Error("GEMINI_API_KEY no disponible para TTS.");
  }
  const { GoogleGenAI } = await _loadGoogleGenAiLiveModule();
  geminiTtsAiClientUnidad = new GoogleGenAI({
    apiKey,
    apiVersion: "v1beta",
    httpOptions: { apiVersion: "v1beta" }
  });
  return geminiTtsAiClientUnidad;
}

function _esErrorGemini429(err) {
  const status = Number(err?.status ?? err?.statusCode ?? err?.code);
  const msg = String(err?.message || "").toLowerCase();
  return status === 429 || msg.includes("429") || msg.includes("too many requests") || msg.includes("quota");
}

function _hablarConGeminiTts(texto = "", opciones = {}) {
  if (!texto || !hasRuntimeGeminiApiKey()) return false;
  const { cancelarPrevio = false, onFail = null } = opciones || {};
  const now = Date.now();
  if (geminiTtsRequestInFlight) return false;
  if (now < geminiTtsCooldownUntil) return false;
  if ((now - geminiTtsLastRequestAt) < GEMINI_TTS_MIN_INTERVAL_MS) return false;

  const requestId = ++geminiTtsLastRequestUnidad;
  geminiTtsLastRequestAt = now;
  geminiTtsRequestInFlight = true;
  _marcarFraseHabladaUnidad(texto);

  if (cancelarPrevio && geminiTtsAudioElUnidad) {
    try {
      geminiTtsAudioElUnidad.pause();
      geminiTtsAudioElUnidad.src = "";
    } catch (_) {
      // noop
    }
  }

  (async () => {
    try {
      const voiceName = _actualizarVozCharlyDesdeThemeSettings();
      const { Modality } = await _loadGoogleGenAiLiveModule();
      const ai = await _obtenerClienteGeminiTtsUnidad();
      const candidates = Array.from(new Set([voiceName, ...CHARLY_TTS_MALE_FALLBACKS, ...CHARLY_TTS_FEMALE_VOICES]));
      let src = "";
      let usedVoice = voiceName;
      for (const vName of candidates) {
        try {
          src = await _solicitarAudioTtsGemini(ai, Modality, texto, vName);
          if (src) {
            usedVoice = vName;
            break;
          }
        } catch (err) {
          if (_esErrorGemini429(err)) throw err;
          // intenta la siguiente voz
        }
      }
      if (!src || requestId !== geminiTtsLastRequestUnidad) return;
      geminiTts429Streak = 0;
      geminiTtsCooldownUntil = 0;
      charlyTtsVoiceName = usedVoice;
      if (usedVoice !== voiceName) {
        logVisual(`ℹ️ Voz solicitada "${voiceName}" no disponible. Usando "${usedVoice}".`);
      }

      const audio = new Audio(src);
      geminiTtsAudioElUnidad = audio;
      audio.onplay = () => _setIndicadorHablandoCharly(true);
      const apagar = () => {
        if (audio === geminiTtsAudioElUnidad) _setIndicadorHablandoCharly(false);
      };
      audio.onended = apagar;
      audio.onerror = apagar;
      await audio.play();
    } catch (err) {
      if (_esErrorGemini429(err)) {
        geminiTts429Streak += 1;
        const waitMs = Math.min(
          GEMINI_TTS_COOLDOWN_MAX_MS,
          GEMINI_TTS_COOLDOWN_BASE_MS * Math.pow(2, Math.max(0, geminiTts429Streak - 1))
        );
        geminiTtsCooldownUntil = Date.now() + waitMs;
        if ((Date.now() - geminiTtsLastQuotaLogAt) > 4000) {
          geminiTtsLastQuotaLogAt = Date.now();
          logVisual(`⚠️ Gemini TTS en límite de cuota (429). Pausa ${Math.ceil(waitMs / 1000)}s.`);
        }
      }
      logVisual(`⚠️ Gemini TTS fallback (${charlyTtsVoiceName}): ${err?.message || "sin detalle"}`);
      if (typeof onFail === "function") onFail();
    } finally {
      geminiTtsRequestInFlight = false;
    }
  })();
  return true;
}

function _renderTemplateUnidad(template = "", vars = {}) {
  let out = String(template || "");
  Object.entries(vars || {}).forEach(([k, v]) => {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? ""));
  });
  return out;
}

function _pickSaludoUnidad(nombre = "docente") {
  const pool = unidadModalGreetingCount === 0
    ? SALUDOS_UNIDAD_PRIMERA
    : SALUDOS_UNIDAD_CONTINUACION;

  const candidatos = pool.filter((s) => s !== ultimoSaludoUnidad);
  const base = (candidatos.length ? candidatos : pool)[Math.floor(Math.random() * (candidatos.length ? candidatos.length : pool.length))];
  const saludo = _renderTemplateUnidad(base, { nombre });
  ultimoSaludoUnidad = base;
  ultimoSaludoUnidadAt = Date.now();
  unidadModalGreetingCount += 1;
  return saludo;
}

async function obtenerNombreUsuarioAutenticadoUnidad() {
  if (nombreUsuarioUnidadCache) return nombreUsuarioUnidadCache;

  const user = auth?.currentUser || null;
  if (!user) return "docente";

  try {
    const snapUser = await getDoc(doc(db, "users", user.uid));
    if (snapUser.exists()) {
      const data = snapUser.data() || {};
      const nombre = (
        data.name ||
        data.nombre ||
        [data.firstName, data.lastName].filter(Boolean).join(" ").trim() ||
        data.firstName ||
        data.displayName ||
        user.displayName ||
        user.email ||
        "docente"
      );
      nombreUsuarioUnidadCache = nombre;
      return nombre;
    }
  } catch (_) {
    // noop
  }

  nombreUsuarioUnidadCache = user.displayName || user.email || "docente";
  return nombreUsuarioUnidadCache;
}

function textoConNumero(valor = "") {
  const raw = _normalizarTexto(valor);
  const direct = raw.match(/\b\d{1,2}\b/);
  if (direct) return direct[0];
  const mapa = {
    cero: "0",
    uno: "1",
    una: "1",
    primer: "1",
    primero: "1",
    dos: "2",
    segundo: "2",
    tres: "3",
    tercero: "3",
    cuatro: "4",
    cuarto: "4",
    cinco: "5",
    quinto: "5",
    seis: "6",
    sexto: "6",
    siete: "7",
    octavo: "8",
    ocho: "8",
    nueve: "9",
    diez: "10"
  };
  for (const [token, num] of Object.entries(mapa)) {
    if (raw.includes(token)) return num;
  }
  return "";
}

function extraerComando(texto, etiqueta, limites = []) {
  const base = _normalizarTexto(texto);
  const clave = _normalizarTexto(etiqueta);
  const idx = base.indexOf(clave);
  if (idx === -1) return null;

  const start = idx + clave.length;
  let end = base.length;
  limites.forEach((limite) => {
    const pos = base.indexOf(_normalizarTexto(limite), start);
    if (pos !== -1 && pos < end) end = pos;
  });
  return base.slice(start, end).replace(/[:;,.-]+/g, " ").trim();
}

function aplicarValorSelectPorVoz(selectEl, valorHablado = "", config = {}) {
  if (!selectEl) return false;
  const original = String(valorHablado || "").trim();
  const normal = _normalizarTexto(original);
  if (!normal) return false;

  const opts = Array.from(selectEl.options || []);
  const alias = config?.alias || {};

  const buscarCoincidencia = (needle = "") => {
    if (!needle) return null;
    const n = _normalizarTexto(needle);
    return opts.find((opt) => {
      const t = _normalizarTexto(opt.textContent || "");
      const v = _normalizarTexto(opt.value || "");
      return t === n || v === n || t.includes(n) || n.includes(t);
    }) || null;
  };

  let opcion = buscarCoincidencia(normal);
  if (!opcion) {
    const numero = textoConNumero(normal);
    if (numero && alias[numero]) {
      for (const alt of alias[numero]) {
        opcion = buscarCoincidencia(alt);
        if (opcion) break;
      }
    }
  }

  if (!opcion) return false;
  selectEl.value = opcion.value;
  selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

async function aplicarLecturaPrincipalPorVoz(valorHablado = "") {
  const selectTemaActual = document.getElementById("unidadTema");
  const selectTemaASCActual = document.getElementById("unidadTemaASC");
  if (!selectTemaActual) return false;
  const valor = _normalizarTexto(valorHablado);
  if (!valor) return false;

  const matchOption = Array.from(selectTemaActual.options || []).find((opt) => {
    const txt = _normalizarTexto(opt.textContent || "");
    const val = _normalizarTexto(opt.value || "");
    return txt.includes(valor) || valor.includes(txt) || val === valor;
  });

  if (matchOption) {
    selectTemaActual.value = matchOption.value;
    if (selectTemaASCActual) selectTemaASCActual.value = "";
    selectTemaActual.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  try {
    if (!Array.isArray(window.todasLasLecturas) || !window.todasLasLecturas.length) {
      await cargarTodasLasLecturas();
    }
  } catch (_) {
    // noop
  }

  const pool = [
    ...(Array.isArray(window.todasLasLecturas) ? window.todasLasLecturas : []),
    ...(Array.isArray(window.lecturasNuevas) ? window.lecturasNuevas : []),
    ...(Array.isArray(window.lecturasASC) ? window.lecturasASC : [])
  ];

  const lectura = pool.find((l) => {
    const titulo = _normalizarTexto(l?.titulo || l?.tema || "");
    const sinopsis = _normalizarTexto(l?.sinopsis || l?.resumen || l?.descripcion || "");
    return titulo.includes(valor) || valor.includes(titulo) || (sinopsis && (sinopsis.includes(valor) || valor.includes(sinopsis)));
  });
  let lecturaResol = lectura || null;
  if (!lecturaResol?.id) {
    try {
      const [snapN, snapA] = await Promise.all([
        getDocs(collection(db, "lecturasNuevas")),
        getDocs(collection(db, "lecturasASC"))
      ]);
      const remoto = [];
      snapN.forEach((d) => remoto.push({ id: d.id, ...d.data(), tipo: "principal" }));
      snapA.forEach((d) => remoto.push({ id: d.id, ...d.data(), tipo: "asc" }));
      lecturaResol = remoto.find((l) => {
        const titulo = _normalizarTexto(l?.titulo || l?.tema || "");
        const sinopsis = _normalizarTexto(l?.sinopsis || l?.resumen || l?.descripcion || "");
        return titulo.includes(valor) || valor.includes(titulo) || (sinopsis && (sinopsis.includes(valor) || valor.includes(sinopsis)));
      }) || null;
      if (lecturaResol?.id) {
        if (!Array.isArray(window.todasLasLecturas)) window.todasLasLecturas = [];
        if (!window.todasLasLecturas.some((x) => x?.id === lecturaResol.id)) window.todasLasLecturas.push(lecturaResol);
      }
    } catch (_) {
      // noop
    }
  }
  if (!lecturaResol?.id) return false;

  if (!Array.from(selectTemaActual.options || []).some((opt) => opt.value === lecturaResol.id)) {
    const opt = document.createElement("option");
    opt.value = lecturaResol.id;
    opt.textContent = lecturaResol.titulo || lecturaResol.tema || "Lectura seleccionada por voz";
    selectTemaActual.appendChild(opt);
  }

  selectTemaActual.value = lecturaResol.id;
  if (selectTemaASCActual) selectTemaASCActual.value = "";
  selectTemaActual.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function _categoriasDisponiblesVoz() {
  const botones = Array.from(document.querySelectorAll(".btn-icono-categoria.instrucciones[data-categoria]"));
  const cats = botones.map((b) => String(b.dataset.categoria || "").trim()).filter(Boolean);
  return Array.from(new Set(cats));
}

function _resolverCategoriaPorVoz(texto = "") {
  const t = _normalizarTexto(texto);
  if (!t) return "";
  const categorias = _categoriasDisponiblesVoz();
  let best = "";
  let bestScore = 0;
  categorias.forEach((cat) => {
    const n = _normalizarTexto(cat);
    let score = 0;
    if (t.includes(n)) score += 4;
    const tokens = n.split(/\s+/).filter(Boolean);
    tokens.forEach((tk) => {
      if (tk.length > 2 && t.includes(tk)) score += 1;
    });
    if (score > bestScore) {
      best = cat;
      bestScore = score;
    }
  });
  return bestScore > 0 ? best : "";
}

function _canonSubtemaClave(s = "") {
  return _normalizarTexto(String(s || "")).replace(/[^a-z0-9]/g, "");
}

function _canonSubtemaSuave(s = "") {
  // Normaliza y colapsa letras repetidas para tolerar errores de dictado ("connocimiento" -> "conocimiento")
  return _canonSubtemaClave(s).replace(/([a-z])\1+/g, "$1");
}

function _subtemaAliasesCanonMap() {
  const alias = {};
  const known = Object.keys(window.categoriaPorSubtema || {});
  known.forEach((k) => {
    const canon = _canonSubtemaClave(k);
    alias[canon] = k;
    alias[_canonSubtemaClave(formatearSubtema(k))] = k;
  });

  // Alias frecuentes por voz
  alias[_canonSubtemaClave("expresion escrita")] = "ExpresionEscrita";
  alias[_canonSubtemaClave("expresionescrita")] = "ExpresionEscrita";
  alias[_canonSubtemaClave("expresion oral")] = "ExpresionOral";
  alias[_canonSubtemaClave("expresionoral")] = "ExpresionOral";
  alias[_canonSubtemaClave("conocimiento del medio")] = "ConocimientoDelMedio";
  alias[_canonSubtemaClave("conocimientodelmedio")] = "ConocimientoDelMedio";
  alias[_canonSubtemaClave("mi localidad")] = "MiLocalidad";
  alias[_canonSubtemaClave("milocalidad")] = "MiLocalidad";
  alias[_canonSubtemaClave("civica etica")] = "CivicaEtica";
  alias[_canonSubtemaClave("civicaetica")] = "CivicaEtica";
  return alias;
}

function _normalizarSubtemaDesdeVoz(s = "") {
  const canon = _canonSubtemaSuave(s);
  if (!canon) return "";
  const alias = _subtemaAliasesCanonMap();
  if (alias[canon]) return alias[canon];
  const entry = Object.entries(alias).find(([k]) => _canonSubtemaSuave(k) === canon);
  return entry?.[1] || s;
}

function _filasSubtemas() {
  return Array.from(document.querySelectorAll(".tabla-secuencia tbody tr"));
}

function _resolverFilaSubtemaPorVoz(textoSubtema = "", categoriaPreferida = "") {
  const objetivoRaw = _normalizarSubtemaDesdeVoz(textoSubtema);
  const objetivo = _normalizarTexto(objetivoRaw);
  const objetivoCanon = _canonSubtemaSuave(objetivoRaw);
  if (!objetivo) return null;
  const categoriaNorm = _normalizarTexto(categoriaPreferida);

  let best = null;
  let bestScore = 0;

  _filasSubtemas().forEach((row) => {
    const tdCategoria = row.children?.[1]?.textContent || "";
    const tdSubtema = row.children?.[2]?.textContent || "";
    const subtemaInterno =
      row.querySelector('input[name^="generar_"]')?.dataset?.subtema ||
      row.querySelector('input[name^="generar_subtema_"]')?.dataset?.subtema ||
      "";
    const catNorm = _normalizarTexto(tdCategoria);
    const subNorm = _normalizarTexto(tdSubtema);
    const subCanon = _canonSubtemaSuave(tdSubtema);
    const subInternoNorm = _normalizarTexto(subtemaInterno);
    const subInternoCanon = _canonSubtemaSuave(subtemaInterno);
    if (!subNorm) return;

    let score = 0;
    if (objetivo === subNorm) score += 6;
    if (objetivoCanon && subCanon && objetivoCanon === subCanon) score += 8;
    if (subtemaInterno && objetivo === subInternoNorm) score += 8;
    if (subtemaInterno && objetivoCanon && subInternoCanon && objetivoCanon === subInternoCanon) score += 12;
    if (subNorm.includes(objetivo) || objetivo.includes(subNorm)) score += 4;
    if (subInternoNorm && (subInternoNorm.includes(objetivo) || objetivo.includes(subInternoNorm))) score += 4;
    if (objetivoCanon && subCanon && (subCanon.includes(objetivoCanon) || objetivoCanon.includes(subCanon))) score += 4;
    if (objetivoCanon && subInternoCanon && (subInternoCanon.includes(objetivoCanon) || objetivoCanon.includes(subInternoCanon))) score += 4;
    subNorm.split(/\s+/).forEach((tk) => {
      if (tk.length > 2 && objetivo.includes(tk)) score += 1;
    });
    if (categoriaNorm && catNorm === categoriaNorm) score += 2;
    if (categoriaNorm && catNorm && categoriaNorm !== catNorm) score -= 2;

    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  });

  return bestScore > 0 ? best : null;
}

function _setCheckboxEnFila(row, tipo = "", checked = true) {
  if (!row) return false;
  const prefixes = {
    ficha: "ficha_",
    anexo: "anexo_",
    video: "video_",
    recortable: "recortable_",
    generar: "generar_",
    relacion: "relacion_"
  };
  const pref = prefixes[tipo];
  if (!pref) return false;
  const el = row.querySelector(`input[name^="${pref}"]`);
  if (!el) return false;
  el.checked = checked;
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function _setCantidadActividadesEnFila(row, valor = "") {
  if (!row) return false;
  const n = Number.parseInt(String(valor || "").trim(), 10);
  if (!Number.isFinite(n)) return false;
  const input = row.querySelector('input[name^="num_"]');
  if (!input) return false;
  input.value = String(Math.max(1, Math.min(10, n)));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function _parseAccionesRecursos(texto = "") {
  const limpio = _normalizarTexto(texto).replace(/\s+/g, " ");
  const acciones = [];

  const recursoRegex = /\b(?:agrega(?:r)?|anade|añade|pon(?:er)?|quita(?:r)?|elimina(?:r)?|remueve?|borra(?:r)?|marca(?:r)?|desmarca(?:r)?|activa(?:r)?|desactiva(?:r)?)?\s*(?:un|una|el|la|los|las)?\s*(fichas?|anexos?|videos?|recortables?)\b/gi;
  const matches = Array.from(limpio.matchAll(recursoRegex));
  if (!matches.length) return acciones;

  const extraerDestinos = (segmento = "") => {
    const destinos = [];
    const reDestino = /(?:^|\b(?:en|para|de|del|al|a)\b)\s+([a-z0-9ñü\s]+?)(?=(?:\s+y\s+(?:(?:en|para|de|del|al|a)\b|(?:un|una|el|la|los|las)?\s*(?:fichas?|anexos?|videos?|recortables?)\b))|[,;]|$)/gi;
    let md;
    while ((md = reDestino.exec(segmento)) !== null) {
      const destino = String(md[1] || "")
        .trim()
        .replace(/\(.*?\)/g, "")
        .replace(/\b(?:y|e)\b\s*$/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (destino) destinos.push(destino);
    }
    return destinos;
  };

  matches.forEach((match, index) => {
    const tipoRaw = _normalizarTexto(match[1]);
    const tipo = tipoRaw.endsWith("s") ? tipoRaw.slice(0, -1) : tipoRaw;
    const start = Number(match.index || 0) + String(match[0] || "").length;
    const end = index + 1 < matches.length ? Number(matches[index + 1].index || limpio.length) : limpio.length;
    const segmento = limpio.slice(start, end).trim();
    extraerDestinos(segmento).forEach((subtema) => {
      acciones.push({ tipo, subtema });
    });
  });

  return acciones;
}

function _parseCategoriaContexto(texto = "") {
  const m = _normalizarTexto(texto).match(/categoria\s+([a-z0-9áéíóúñü\s]+)/i);
  if (!m?.[1]) return "";
  return _resolverCategoriaPorVoz(m[1]);
}

function _labelControlVoz(el) {
  if (!el) return "";
  const id = el.id ? `#${el.id}` : "";
  const aria = el.getAttribute?.("aria-label") || "";
  const title = el.getAttribute?.("title") || "";
  const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (txt) return `${id} ${txt}`.trim();
  return `${id} ${aria} ${title}`.trim();
}

function _labelCheckboxVoz(chk) {
  if (!chk) return "";
  const tr = chk.closest("tr");
  const id = chk.id ? `#${chk.id}` : "";
  const name = chk.name ? `[name=${chk.name}]` : "";
  if (tr) {
    const c = tr.children?.[1]?.textContent || "";
    const s = tr.children?.[2]?.textContent || "";
    const tipo =
      chk.name?.startsWith("ficha_") ? "ficha" :
        chk.name?.startsWith("anexo_") ? "anexo" :
          chk.name?.startsWith("video_") ? "video" :
            chk.name?.startsWith("recortable_") ? "recortable" :
              chk.name?.startsWith("generar_") ? "generar" :
                chk.name?.startsWith("relacion_") ? "relacion" : "checkbox";
    return `${id} ${name} ${tipo} categoria ${c} subtema ${s}`.trim();
  }
  return `${id} ${name}`.trim();
}

function _resumenControlesGemini(maxItems = 220) {
  const out = [];
  const botones = Array.from(document.querySelectorAll("button[id]"));
  const checks = Array.from(document.querySelectorAll("input[type='checkbox']"));
  const selects = Array.from(document.querySelectorAll("select[id], select[name]"));
  const modales = Array.from(document.querySelectorAll("[id^='modal'], .modal, .unidad-modal"));

  botones.forEach((b) => out.push({ type: "button", key: b.id, label: _labelControlVoz(b) }));
  checks.forEach((c) => out.push({ type: "checkbox", key: c.id || c.name || "", label: _labelCheckboxVoz(c) }));
  selects.forEach((s) => {
    const opts = Array.from(s.options || []).slice(0, 20).map((o) => (o.textContent || o.value || "").trim()).filter(Boolean);
    out.push({
      type: "select",
      key: s.id || s.name || "",
      label: `${_labelControlVoz(s)} opciones: ${opts.join(" | ")}`
    });
  });
  modales.forEach((m) => out.push({ type: "modal", key: m.id || "", label: `${m.id || "(sin-id)"} modal` }));

  return out.filter((x) => x.key || x.label).slice(0, maxItems);
}

function _extraerJsonPlanoGemini(texto = "") {
  const clean = String(texto || "").replace(/```json|```/gi, "").trim();
  if (clean.startsWith("{") && clean.endsWith("}")) return clean;
  const i = clean.indexOf("{");
  if (i < 0) return "";
  let level = 0;
  for (let p = i; p < clean.length; p++) {
    if (clean[p] === "{") level++;
    if (clean[p] === "}") {
      level--;
      if (level === 0) return clean.slice(i, p + 1);
    }
  }
  return "";
}

function _esSolicitudAccionExplicita(textoNorm = "") {
  return /\b(abrir|abre|genera|generar|crear|crea|muestra|mostrar|selecciona|seleccionar|marca|desmarca|activa|desactiva|pon|cambia|guardar|guarda|cancelar|cancela|borrar|borra|eliminar|elimina|agrega|anade|añade|dicta|buscar|busca|leer|leeme|léeme|encuentra|localiza)\b/i.test(textoNorm);
}

function _esComandoParametrosUnidad(textoNorm = "") {
  return /\b(nivel|grado|trimestre|unidad|lectura principal|lectura)\b/i.test(textoNorm);
}

function _debeIntentarPlannerGemini(transcripcion = "", textoNorm = "") {
  if (!transcripcion || !textoNorm) return false;
  if (textoNorm.length < 12) return false;
  if (_estaModalInstruccionesAbierto()) return false;
  if (voicePendingInputCapture?.target === "textareaInstruccionesGemini") return false;
  if (_esComandoDespertar(textoNorm) || _esComandoDescanso(textoNorm)) return false;
  if (_esComandoParametrosUnidad(textoNorm)) return false;
  if (!_esSolicitudAccionExplicita(textoNorm)) return false;
  return true;
}

async function _analizarComandoConGeminiPlanner(texto = "") {
  const comando = String(texto || "").trim();
  if (!comando) return null;

  const controles = _resumenControlesGemini();
  const modelo = "gemini-2.5-flash";
  const prompt = `
Eres un planificador de acciones de UI. Convierte la petición del usuario en JSON estricto.
Devuelve SOLO un objeto JSON con esta forma:
{
  "intent": "ui_control|content_edit|none",
  "confidence": 0.0,
  "actions": [
    {"action":"click|check|uncheck|toggle|set_select|set_input|open_modal|close_modal","target":"id_o_descripcion_control","value":"opcional"}
  ],
  "summary":"breve"
}

Reglas:
- Usa solo controles que aparezcan en la lista.
- Si no hay control claro, devuelve intent=none y actions=[]
- confidence debe ser de 0 a 1 segun certeza de que el comando es inequívoco.
- Sin markdown, sin explicación fuera del JSON.

Petición usuario:
${comando}

Controles disponibles:
${JSON.stringify(controles)}
`;

  try {
    const {data} = await geminiGenerateViaApi(modelo, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1
      }
    });
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const j = _extraerJsonPlanoGemini(raw);
    if (!j) return null;
    const parsed = JSON.parse(j);
    if (!parsed || !Array.isArray(parsed.actions)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function _scoreMatchTexto(a = "", b = "") {
  const aa = _normalizarTexto(a);
  const bb = _normalizarTexto(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 10;
  let s = 0;
  if (aa.includes(bb) || bb.includes(aa)) s += 6;
  bb.split(/\s+/).forEach((t) => {
    if (t.length > 2 && aa.includes(t)) s += 1;
  });
  return s;
}

function _findControlByTargetTexto(target = "", preferType = "") {
  const t = String(target || "").trim();
  if (!t) return null;

  if (t.startsWith("#")) {
    const idEl = document.getElementById(t.slice(1));
    if (idEl) return idEl;
  }
  const byId = document.getElementById(t);
  if (byId) return byId;

  const selectors = {
    button: "button",
    checkbox: "input[type='checkbox']",
    select: "select",
    input: "input[type='number'], input[type='text'], textarea",
    modal: "[id^='modal'], .modal, .unidad-modal",
    any: "button, input, select, textarea, [id^='modal'], .modal, .unidad-modal"
  };
  const sel = selectors[preferType] || selectors.any;
  const nodes = Array.from(document.querySelectorAll(sel));

  let best = null;
  let bestScore = 0;
  nodes.forEach((n) => {
    const label = n.type === "checkbox" ? _labelCheckboxVoz(n) : _labelControlVoz(n);
    const score = _scoreMatchTexto(label, t);
    if (score > bestScore) {
      best = n;
      bestScore = score;
    }
  });
  return bestScore >= 3 ? best : null;
}

function _ejecutarActionUI(action = {}) {
  const act = _normalizarTexto(action?.action || "");
  const target = action?.target || "";
  const value = action?.value;
  if (!act || !target) return false;

  const typeHint =
    act.includes("check") ? "checkbox" :
      act.includes("select") ? "select" :
        act.includes("modal") ? "modal" :
          act.includes("input") ? "input" : "button";

  const el = _findControlByTargetTexto(target, typeHint);
  if (!el) return false;

  if (act === "click" || act === "open_modal" || act === "close_modal") {
    if (typeof el.click === "function") el.click();
    return true;
  }
  if (act === "check") {
    if (el.type === "checkbox") {
      el.checked = true;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }
  if (act === "uncheck") {
    if (el.type === "checkbox") {
      el.checked = false;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }
  if (act === "toggle") {
    if (el.type === "checkbox") {
      el.checked = !el.checked;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }
  if (act === "set_select") {
    if (el.tagName === "SELECT") {
      const opts = Array.from(el.options || []);
      const chosen = opts.find((o) => _scoreMatchTexto(o.textContent || o.value || "", String(value || "")) >= 4);
      if (chosen) {
        el.value = chosen.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
  }
  if (act === "set_input") {
    if ("value" in el) {
      el.value = String(value ?? "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }
  return false;
}

async function _ejecutarPlanGeminiSiAplica(transcripcion = "") {
  const norm = _normalizarTexto(transcripcion);
  if (!_debeIntentarPlannerGemini(transcripcion, norm)) return false;
  const plan = await _analizarComandoConGeminiPlanner(transcripcion);
  if (!plan || !Array.isArray(plan.actions) || !plan.actions.length) return false;
  const conf = Number(plan?.confidence);
  if (!Number.isFinite(conf) || conf < 0.72) return false;
  let okCount = 0;
  for (const a of plan.actions) {
    if (_ejecutarActionUI(a)) okCount++;
  }
  if (okCount > 0) {
    logVisual(`✅ Ejecutadas ${okCount} acciones del plan.`);
    return true;
  }
  return false;
}

function _clickButtonById(id = "", speechLabel = "") {
  if (id === "btnAbrirModalUnidad") {
    const nowOpen = Date.now();
    const lastOpen = Number(voiceActionLastAt[id] || 0);
    if ((nowOpen - lastOpen) < 2200 && modalUnidad?.style?.display === "block") return true;
    const okOpen = abrirGenerarUnidadNuevaSeccion();
    if (okOpen) {
      voiceActionLastAt[id] = nowOpen;
      if (speechLabel) logVisual(`🧭 ${speechLabel}`);
      return true;
    }
  }
  const btn = document.getElementById(id);
  if (!btn) return false;
  const modalLecturas = document.getElementById("modalSeleccionarLectura");
  const modalLecturasAbierto = !!(modalLecturas && modalLecturas.style.display === "flex");
  if ((id === "btnConfirmarSeleccion" || id === "btnCancelarSeleccion" || id === "btnAnteriorPagina" || id === "btnSiguientePagina") && !modalLecturasAbierto) {
    return false;
  }

  const now = Date.now();
  const last = Number(voiceActionLastAt[id] || 0);
  if ((now - last) < 2200) {
    if (id === "btnAbrirModalUnidad" && modalUnidad?.style?.display === "block") return true;
    return false;
  }

  if (id === "btnAbrirModalUnidad" && modalUnidad?.style?.display === "block") {
    return true;
  }

  btn.click();
  voiceActionLastAt[id] = now;
  if (speechLabel) logVisual(`🧭 ${speechLabel}`);
  return true;
}

function _scoreSidebarIntent(norm = "", label = "") {
  const a = _normalizarTexto(norm);
  const b = _normalizarTexto(label);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 10;
  let score = 0;
  const toks = b.split(/\s+/).filter((t) => t.length > 2);
  toks.forEach((t) => {
    if (a.includes(t)) score += 2;
  });
  return score;
}

function _aliasesSidebarEntrada(entry = {}) {
  const out = [];
  const label = _normalizarTexto(entry.label || "");
  const id = _normalizarTexto(entry.id || "");
  const href = _normalizarTexto(entry.href || "");
  const hrefBase = href.replace(/\.html$/i, "");
  if (label) out.push(label);
  if (id) out.push(id);
  if (hrefBase) out.push(hrefBase);

  if (/analisis\s+editorial/.test(label) || id.includes("analiseditorial") || hrefBase.includes("generarlectura")) {
    out.push("analisis editorial", "editorial", "generar lectura");
  }
  if (/moodle/.test(label) || hrefBase.includes("moodlecourse")) {
    out.push("crear cursos de moodle", "moodle", "cursos moodle", "curso moodle");
  }
  if (/voice\s*transcribe/.test(label) || hrefBase.includes("voicetranscribe")) {
    out.push("voice transcribe", "transcribe", "transcribir voz", "voz transcribe");
  }
  if (/perfil/.test(label) || hrefBase.includes("perfil")) {
    out.push("perfil", "mi perfil");
  }
  if (/usuarios/.test(label) || id.includes("gestionusuarios") || hrefBase.includes("gestionusuarios")) {
    out.push("usuarios", "gestion de usuarios", "gestionar usuarios", "administrar usuarios");
  }
  if (/chat/.test(label) || id.includes("chatlink") || hrefBase.includes("chat")) {
    out.push("chat", "abrir chat", "ir a chat");
  }

  return Array.from(new Set(out.filter(Boolean)));
}

function _obtenerEntradasSidebarMenu() {
  const links = Array.from(document.querySelectorAll("#sidebar .sidebar-menu a, #sidebar .sidebar-menu button"));
  return links.map((el) => {
    const label = (el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "").replace(/\s+/g, " ").trim();
    return {
      el,
      label,
      id: el.id || "",
      norm: _normalizarTexto(label),
      href: el.getAttribute("href") || ""
    };
  }).filter((x) => x.label);
}

async function _manejarComandosSidebarMenu(texto = "") {
  const norm = _normalizarTexto(texto);
  if (!norm) return false;
  if (/\b(generar|genera|crear|crea)\s+(unidad|lectura)\s+nueva\b/.test(norm)) return false;
  if (/\b(lecturas?\s+nuevas?|sugerencias?\s+de\s+lectura)\b/.test(norm)) return false;
  if (/\b(selecciona|seleccionar|elige|pon|cambia|buscar|busca|filtra|filtrar)\s+(?:la\s+)?(?:lectura|titulo|título)\b/.test(norm)) return false;
  const pideAccion = _esSolicitudAccionExplicita(norm) || /\b(ir a|ve a|abrir|abre|muestra|mostrar|entra a|navega a)\b/.test(norm);
  const mencionaMenu = /\b(menu|sidebar|seccion|sección)\b/.test(norm);

  const entries = _obtenerEntradasSidebarMenu();
  if (!entries.length) return false;

  let best = null;
  let bestScore = 0;
  entries.forEach((item) => {
    let s = _scoreSidebarIntent(norm, item.label);
    const aliases = _aliasesSidebarEntrada(item);
    aliases.forEach((a) => {
      s = Math.max(s, _scoreSidebarIntent(norm, a));
      if (norm.includes(_normalizarTexto(a))) s += 3;
    });
    if (s > bestScore) {
      best = item;
      bestScore = s;
    }
  });

  // Si no hay verbo de acción, exige match fuerte para evitar falsos positivos.
  if (!best) return false;
  if (!pideAccion && !mencionaMenu && bestScore < 7) return false;
  if ((pideAccion || mencionaMenu) && bestScore < 3) return false;

  if (typeof best.el.click === "function") {
    best.el.click();
    logVisual(`🧭 Sidebar: abriendo "${best.label}".`);
    return true;
  }
  return false;
}

function _esElementoVisible(el) {
  if (!el) return false;
  const cs = window.getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
  if (el.hidden) return false;
  return true;
}

function _cerrarVentanaActivaPorVoz() {
  const candidatosPrioridad = [
    { modal: document.getElementById("modalInstruccionesGemini"), closeBtn: document.getElementById("btnCancelarInstrucciones") },
    { modal: document.getElementById("modalResultadoUnidad"), closeBtn: document.getElementById("cerrarModalResultadoUnidad") },
    { modal: document.getElementById("modalGenerarUnidad"), closeBtn: document.getElementById("cerrarModalUnidad") },
    { modal: document.getElementById("modalGenerarUnidadSecundaria"), closeBtn: document.getElementById("cerrarModalUnidadSecundaria") }
  ];

  for (const item of candidatosPrioridad) {
    const m = item?.modal;
    if (!m || !_esElementoVisible(m)) continue;
    if (item.closeBtn && typeof item.closeBtn.click === "function") {
      item.closeBtn.click();
      return true;
    }
    if (m.id === "modalGenerarUnidad") setUnidadWorkspaceMode(false);
    m.style.display = "none";
    return true;
  }

  const modales = Array.from(document.querySelectorAll(".modal, .unidad-modal, [id^='modal']"))
    .filter((m) => _esElementoVisible(m));
  for (const m of modales) {
    const btn = m.querySelector("button[id*='cerrar'], button[id*='Cancelar'], .close, .btn-cerrar");
    if (btn && typeof btn.click === "function") {
      btn.click();
      return true;
    }
    if (m.id === "modalGenerarUnidad") setUnidadWorkspaceMode(false);
    m.style.display = "none";
    return true;
  }
  return false;
}

async function _manejarComandosBotonesGlobales(texto = "") {
  const norm = _normalizarTexto(texto);
  if (!norm) return false;
  const targetFallbackByKey = {
    open_generar_unidad: "btnAbrirModalUnidad",
    open_lecturas_nuevas: "btnSugerenciasLectura",
    open_secuencia: "btnSecuenciaAlcance",
    open_campos_formativos: "btnCamposFormativos",
    open_estilos: "btnAgregarEstilo",
    open_lecturas_asc: "btnLecturasAsc",
    open_metodologia: "btnAbrirModalMetodologia",
    open_unidades_guardadas: "btnListaUnidadesGuardadas"
  };
  const buttonCmds = _listarComandosConfigurados(({ row }) =>
    _normalizarFnComandoVoz(String(row.fn || "").trim()) === "_clickButtonById"
  );
  const matchedKeys = new Set();
  for (const { key, row } of buttonCmds) {
    const src = String(row.regex || "").trim();
    if (!src) continue;
    const rx = _compilarRegexFlexible(src);
    if (!rx || !rx.test(norm)) continue;
    matchedKeys.add(key);
    const fallbackId = String(targetFallbackByKey[key] || "").trim();
    const configuredId = String(row.target || "").trim();
    const id = (configuredId && document.getElementById(configuredId)) ? configuredId : fallbackId;
    if (!id) continue;
    if (key === "open_generar_unidad" || key === "open_lecturas_nuevas") {
      _limpiarAudioGeminiProgramado();
    }
    if (_clickButtonById(id, `${_nombreComando(key, "Ejecutando comando")}...`)) {
      if (_debeResponderComando(key, false)) hablarUnidadComandoRapido(`${_nombreComando(key, "Comando ejecutado")}.`);
      return true;
    }
  }

  // Fallback seguro: si la función está vacía/rota, pero el target es un botón válido y el regex coincide, ejecutar click.
  const unknownFnButtonCmds = _listarComandosConfigurados(({ row, key }) => {
    if (matchedKeys.has(key)) return false;
    const fnNorm = _normalizarFnComandoVoz(String(row.fn || "").trim());
    if (fnNorm === "_clickButtonById") return false;
    const id = String(row.target || "").trim();
    if (!id) return false;
    const el = document.getElementById(id);
    if (!el) return false;
    const tag = String(el.tagName || "").toUpperCase();
    return tag === "BUTTON" || tag === "A";
  });
  for (const { key, row } of unknownFnButtonCmds) {
    const src = String(row.regex || "").trim();
    if (!src) continue;
    const rx = _compilarRegexFlexible(src);
    if (!rx || !rx.test(norm)) continue;
    const fallbackId = String(targetFallbackByKey[key] || "").trim();
    const configuredId = String(row.target || "").trim();
    const id = (configuredId && document.getElementById(configuredId)) ? configuredId : fallbackId;
    if (!id) continue;
    if (key === "open_generar_unidad" || key === "open_lecturas_nuevas") {
      _limpiarAudioGeminiProgramado();
    }
    if (_clickButtonById(id, `${_nombreComando(key, "Ejecutando comando")}...`)) {
      if (_debeResponderComando(key, false)) hablarUnidadComandoRapido(`${_nombreComando(key, "Comando ejecutado")}.`);
      return true;
    }
  }
  return false;
}

function _parseActividadCmd(texto = "") {
  const t = _normalizarTexto(texto);
  let m = t.match(/(\d+)\s+actividades?\s+(?:en|para)\s+([a-z0-9áéíóúñü\s]+)/i);
  if (m) return { cantidad: m[1], subtema: m[2].trim() };
  m = t.match(/(?:en|para)\s+([a-z0-9áéíóúñü\s]+)\s+(\d+)\s+actividades?/i);
  if (m) return { cantidad: m[2], subtema: m[1].trim() };
  return null;
}

function _estaModalInstruccionesAbierto() {
  const modal = document.getElementById("modalInstruccionesGemini");
  return !!(modal && modal.style.display === "block");
}

function _obtenerTextareaInstrucciones() {
  return document.getElementById("textareaInstruccionesGemini");
}

function _editarTextareaPorComando(textoCmd = "", textarea) {
  if (!textarea) return false;
  const texto = String(textoCmd || "").trim();
  const norm = _normalizarTexto(texto);

  const reemplazo = texto.match(/(?:reemplaza|sustituye|cambia(?: la parte)?)(?:\s+el texto)?\s+["“]?(.+?)["”]?\s+por\s+["“]?(.+?)["”]?$/i);
  if (reemplazo && reemplazo[1] && reemplazo[2]) {
    const from = reemplazo[1].trim();
    const to = reemplazo[2].trim();
    if (!from) return false;
    if (textarea.value.includes(from)) {
      textarea.value = textarea.value.replace(from, to);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    return false;
  }

  const agregar = texto.match(/^(?:agrega|anade|escribe|dicta)\s*[:\-]?\s*(.+)$/i);
  if (agregar && agregar[1]) {
    const pieza = agregar[1].trim();
    if (!pieza) return false;
    textarea.value = textarea.value ? `${textarea.value}\n${pieza}` : pieza;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  if (norm.includes("limpia") || norm.includes("borra todo")) {
    textarea.value = "";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  return false;
}

async function _manejarComandosModalInstrucciones(texto = "") {
  const norm = _normalizarTexto(texto);
  const modalAbierto = _estaModalInstruccionesAbierto();

  if (norm.includes("abr") && norm.includes("instruccion")) {
    const categoria = _resolverCategoriaPorVoz(norm);
    if (categoria) {
      abrirModalInstrucciones(categoria);
      return true;
    }
  }

  if (!modalAbierto) return false;

  if (norm.includes("guardar")) {
    document.getElementById("btnGuardarInstrucciones")?.click();
    if (_debeResponderPorFuncion("_setInputByVoice", false)) hablarUnidad("Instrucciones guardadas.");
    return true;
  }
  if (norm.includes("cancelar") || norm.includes("cerrar")) {
    document.getElementById("btnCancelarInstrucciones")?.click();
    if (_debeResponderPorFuncion("_setInputByVoice", false)) hablarUnidad("Instrucciones canceladas.");
    return true;
  }
  if (norm.includes("borrar") || norm.includes("eliminar")) {
    document.getElementById("btnBorrarInstrucciones")?.click();
    if (_debeResponderPorFuncion("_setInputByVoice", false)) hablarUnidad("Borrado ejecutado.");
    return true;
  }
  if (norm.includes("intentar de nuevo") || norm.includes("reinicia texto")) {
    const textareaReset = _obtenerTextareaInstrucciones();
    if (textareaReset) {
      textareaReset.value = "";
      textareaReset.dispatchEvent(new Event("input", { bubbles: true }));
      textareaReset.focus();
      if (_debeResponderPorFuncion("_setInputByVoice", false)) hablarUnidad("Texto reiniciado. Puedes dictar de nuevo.");
      return true;
    }
  }

  const textarea = _obtenerTextareaInstrucciones();
  if (!textarea) return false;
  const editado = _editarTextareaPorComando(texto, textarea);
  if (editado) {
    if (_debeResponderPorFuncion("_setInputByVoice", false)) hablarUnidad("Hecho. Actualicé el texto de instrucciones.");
    return true;
  }

  // Dictado libre cuando el modal está abierto.
  if (norm.length > 3) {
    textarea.value = textarea.value ? `${textarea.value}\n${texto.trim()}` : texto.trim();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  return false;
}

async function _manejarComandosCategoriasYSubtemas(texto = "") {
  const norm = _normalizarTexto(texto);
  const categoria = _resolverCategoriaPorVoz(norm) || _parseCategoriaContexto(norm);

  // Generar categoría por voz
  if (norm.includes("genera") && (norm.includes("categoria") || !!categoria)) {
    if (!categoria) return false;
    if (window.generandoCategoria === categoria) {
      const now = Date.now();
      const last = ultimoAnuncioGeneracionPorCategoria[categoria] || 0;
      if (now - last > 10000) {
        hablarUnidad(`La categoría ${categoria} ya se está generando.`);
        ultimoAnuncioGeneracionPorCategoria[categoria] = now;
      }
      return true;
    }
    const btn = document.querySelector(`.btn-icono-categoria.generar[data-categoria="${categoria}"]`);
    if (btn) {
      btn.click();
      hablarUnidad(`Generando la categoría ${categoria}.`);
      ultimoAnuncioGeneracionPorCategoria[categoria] = Date.now();
      return true;
    }
    return false;
  }

  // Acciones de recursos por subtema
  const acciones = _parseAccionesRecursos(norm);
  let cambios = 0;
  for (const act of acciones) {
    const row = _resolverFilaSubtemaPorVoz(act.subtema, categoria);
    if (!row) continue;
    if (_setCheckboxEnFila(row, act.tipo, true)) cambios++;
  }

  // Cantidad de actividades por subtema
  const actCmd = _parseActividadCmd(norm);
  if (actCmd) {
    const row = _resolverFilaSubtemaPorVoz(actCmd.subtema, categoria);
    if (row && _setCantidadActividadesEnFila(row, actCmd.cantidad)) cambios++;
  }

  if (cambios > 0) {
    hablarUnidad("Listo, ya actualicé los subtemas solicitados.");
    return true;
  }
  return false;
}

async function _manejarParametrosUnidadPorVoz(textoNorm = "") {
  const t = _normalizarTexto(textoNorm);
  if (!t) return false;
  const selectNivelActual = document.getElementById("unidadNivel");
  const selectGradoActual = document.getElementById("unidadGrado");
  const selectTrimestreActual = document.getElementById("unidadTrimestre");
  const selectUnidadActual = document.getElementById("unidadNumero");
  const selectTemaActual = document.getElementById("unidadTema");
  if (
    /\b(abrir|abre|generar|genera|crear|crea|vamos a generar)\b/.test(t) &&
    /\b(unidad nueva|lectura nueva|lecturas nuevas|sugerencias de lectura|modal de unidad)\b/.test(t)
  ) {
    return false;
  }

  const _extraerValorCampo = (texto, campoRegex) => {
    const m = texto.match(campoRegex);
    if (!m?.[1]) return "";
    return String(m[1]).split(/\b(?:y|ademas|además|luego|despues|después)\b|[,;]+/i)[0].trim();
  };
  const _extraerTrasMatch = (texto, matchObj) => {
    if (!matchObj || typeof matchObj.index !== "number") return "";
    const fin = Number(matchObj.index) + String(matchObj[0] || "").length;
    const resto = String(texto || "").slice(fin).trim();
    if (!resto) return "";
    return resto.split(/\b(?:y|ademas|además|luego|despues|después)\b|[,;]+/i)[0].trim();
  };
  const _escRegex = (s = "") => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const _extraerPorEtiquetas = (texto, etiquetas = [], topes = []) => {
    if (!texto || !etiquetas.length) return "";
    const et = etiquetas.map(_escRegex).join("|");
    const tp = (topes || []).filter(Boolean).map(_escRegex);
    const stop = tp.length ? `(?=\\s+(?:${tp.join("|")})\\b|$)` : "$";
    const rx = new RegExp(`\\b(?:${et})\\b\\s*(?:a|en|de|numero|número)?\\s+(.+?)\\s*${stop}`, "i");
    const m = String(texto).match(rx);
    return m?.[1] ? String(m[1]).trim() : "";
  };

  const mNivel = _matchComando("set_nivel", t) || _matchComandoPorTarget("_manejarParametrosUnidadPorVoz", "unidadNivel", t);
  const mGrado = _matchComando("set_grado", t) || _matchComandoPorTarget("_manejarParametrosUnidadPorVoz", "unidadGrado", t);
  const mTrimestre = _matchComando("set_trimestre", t) || _matchComandoPorTarget("_manejarParametrosUnidadPorVoz", "unidadTrimestre", t);
  const mUnidad = _matchComando("set_unidad_numero", t) || _matchComandoPorTarget("_manejarParametrosUnidadPorVoz", "unidadNumero", t);
  const mLectura = _matchComando("set_lectura_principal", t) || _matchComandoPorTarget("_manejarParametrosUnidadPorVoz", "unidadTema", t);
  if (!mNivel && !mGrado && !mTrimestre && !mUnidad && !mLectura) return false;
  const topesGenerales = ["nivel", "grado", "trimestre", "unidad", "lectura principal", "lectura", "tema principal", "tema"];

  let nivelCmd = mNivel
    ? (_extraerPorEtiquetas(t, ["nivel"], topesGenerales.filter((x) => x !== "nivel"))
      || (mNivel?.[1] || "").trim()
      || _extraerTrasMatch(t, mNivel)
      || _extraerValorCampo(t, /\bnivel\s*(?:a|en|de)?\s+([^,;]+)/i))
    : "";
  let gradoCmd = mGrado
    ? (_extraerPorEtiquetas(t, ["grado"], topesGenerales.filter((x) => x !== "grado"))
      || (mGrado?.[1] || "").trim()
      || _extraerTrasMatch(t, mGrado)
      || _extraerValorCampo(t, /\bgrado\s*(?:a|en|de)?\s+([^,;]+)/i))
    : "";
  let trimestreCmd = mTrimestre
    ? (_extraerPorEtiquetas(t, ["trimestre"], topesGenerales.filter((x) => x !== "trimestre"))
      || (mTrimestre?.[1] || "").trim()
      || _extraerTrasMatch(t, mTrimestre)
      || _extraerValorCampo(t, /\btrimestre\s*(?:a|en|de)?\s+([^,;]+)/i))
    : "";
  let unidadCmd = mUnidad
    ? (_extraerPorEtiquetas(t, ["unidad"], topesGenerales.filter((x) => x !== "unidad"))
      || (mUnidad?.[1] || "").trim()
      || _extraerTrasMatch(t, mUnidad)
      || _extraerValorCampo(t, /\bunidad\s*(?:a|en|de|numero|número)?\s+([^,;]+)/i))
    : "";
  let lecturaCmd = mLectura
    ? (_extraerPorEtiquetas(t, ["lectura principal", "tema principal", "lectura", "tema"], topesGenerales.filter((x) => !["lectura principal", "lectura", "tema principal", "tema"].includes(x)))
      || (mLectura?.[1] || "").trim()
      || _extraerTrasMatch(t, mLectura)
      || _extraerValorCampo(t, /\b(?:lectura|tema)\s+(?:principal|prinicpal)\s*(?:a|en|de)?\s+(.+)$/i))
    : "";

  // Refuerzo unidadNumero: siempre prioriza número si está presente.
  const unidadDirecta = mUnidad ? t.match(/\b(?:cambia|pon|ajusta|selecciona|define)?\s*(?:la\s*)?unidad\s*(?:a|en|numero|número)?\s*(\d{1,2}|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/i) : null;
  if (unidadDirecta?.[1]) unidadCmd = unidadDirecta[1];

  // Refuerzo unidadTema: lectura/tema principal (incluye typo "prinicpal")
  const mLecturaPrincipal = mLectura ? t.match(/\b(?:lectura|tema)\s+(?:principal|prinicpal)?\s*(?:a|en|de)?\s*(.+)$/i) : null;
  if (mLecturaPrincipal?.[1]) lecturaCmd = mLecturaPrincipal[1].trim();
  // Corta conectores al final: "..., y ..." / "; ..."
  if (lecturaCmd) {
    // No cortar por "y" porque puede formar parte legítima del título ("Lalo y el caracol brillante").
    lecturaCmd = String(lecturaCmd).split(/\b(?:ademas|además|luego|despues|después)\b|[,;]+/i)[0].trim();
  }

  if (unidadCmd && /\bnueva\b/.test(_normalizarTexto(unidadCmd))) unidadCmd = "";
  if (lecturaCmd && /\bnueva\b/.test(_normalizarTexto(lecturaCmd))) lecturaCmd = "";

  if (!nivelCmd && !gradoCmd && !trimestreCmd && !unidadCmd && !lecturaCmd) return false;

  const pendientes = [];
  let huboCambios = false;

  if (nivelCmd) {
    const prev = String(selectNivelActual?.value || "");
    const okNivel = aplicarValorSelectPorVoz(selectNivelActual, nivelCmd, {
      alias: { preescolar: ["preescolar"], primaria: ["primaria"], secundaria: ["secundaria"] }
    });
    if (okNivel && String(selectNivelActual?.value || "") !== prev) logVisual(`✅ nivel: ${prev} -> ${selectNivelActual.value}`);
    if (!okNivel) pendientes.push("nivel");
    huboCambios = huboCambios || okNivel;
  }

  if (gradoCmd) {
    const prev = String(selectGradoActual?.value || "");
    const okGrado = aplicarValorSelectPorVoz(selectGradoActual, gradoCmd, {
      alias: { "1": ["primero", "primer", "1"], "2": ["segundo", "2"], "3": ["tercero", "3"], "4": ["cuarto", "4"], "5": ["quinto", "5"], "6": ["sexto", "6"] }
    });
    if (okGrado && String(selectGradoActual?.value || "") !== prev) logVisual(`✅ grado: ${prev} -> ${selectGradoActual.value}`);
    if (!okGrado) pendientes.push("grado");
    huboCambios = huboCambios || okGrado;
  }

  if (trimestreCmd) {
    const prev = String(selectTrimestreActual?.value || "");
    const okTrimestre = aplicarValorSelectPorVoz(selectTrimestreActual, trimestreCmd, {
      alias: { "1": ["1", "uno", "primer", "primero"], "2": ["2", "dos", "segundo"], "3": ["3", "tres", "tercero"] }
    });
    if (okTrimestre && String(selectTrimestreActual?.value || "") !== prev) logVisual(`✅ trimestre: ${prev} -> ${selectTrimestreActual.value}`);
    if (!okTrimestre) pendientes.push("trimestre");
    huboCambios = huboCambios || okTrimestre;
  }

  if (unidadCmd) {
    // Primero intentar por número directo para unidadNumero.
    let okUnidad = false;
    const prev = String(selectUnidadActual?.value || "");
    const nUnidad = textoConNumero(unidadCmd);
    if (nUnidad && selectUnidadActual) {
      const optExact = Array.from(selectUnidadActual.options || []).find((o) => {
        const ov = _normalizarTexto(o.value || "");
        const ot = _normalizarTexto(o.textContent || "");
        return ov === nUnidad || /\b\d{1,2}\b/.test(ot) && ot.includes(nUnidad);
      });
      if (optExact) {
        selectUnidadActual.value = optExact.value;
        selectUnidadActual.dispatchEvent(new Event("change", { bubbles: true }));
        okUnidad = true;
      }
    }
    if (!okUnidad) okUnidad = aplicarValorSelectPorVoz(selectUnidadActual, unidadCmd, {
      alias: {
        "0": ["0", "cero"], "1": ["1", "uno", "primera", "primero"], "2": ["2", "dos", "segunda", "segundo"],
        "3": ["3", "tres", "tercera", "tercero"], "4": ["4", "cuatro", "cuarta", "cuarto"], "5": ["5", "cinco", "quinta", "quinto"],
        "6": ["6", "seis", "sexta", "sexto"], "7": ["7", "siete"], "8": ["8", "ocho"], "9": ["9", "nueve"], "10": ["10", "diez"]
      }
    });
    if (okUnidad && String(selectUnidadActual?.value || "") !== prev) logVisual(`✅ unidadNumero: ${prev} -> ${selectUnidadActual.value}`);
    if (!okUnidad) pendientes.push("unidad");
    huboCambios = huboCambios || okUnidad;
  }

  if (lecturaCmd) {
    const prev = String(selectTemaActual?.value || "");
    const lecturaLimpia = String(lecturaCmd || "").replace(/^(a|en|de)\s+/, "").trim();
    const okLectura = await aplicarLecturaPrincipalPorVoz(lecturaLimpia);
    const temaDespues = document.getElementById("unidadTema");
    if (okLectura && String(temaDespues?.value || "") !== prev) logVisual(`✅ unidadTema: ${prev} -> ${temaDespues?.value || ""}`);
    if (!okLectura) pendientes.push("lectura principal");
    huboCambios = huboCambios || okLectura;
  }

  if (pendientes.length) {
    const respondePendientes =
      (pendientes.includes("nivel") && _debeResponderComando("set_nivel", false))
      || (pendientes.includes("grado") && _debeResponderComando("set_grado", false))
      || (pendientes.includes("trimestre") && _debeResponderComando("set_trimestre", false))
      || (pendientes.includes("unidad") && _debeResponderComando("set_unidad_numero", false))
      || (pendientes.includes("lectura principal") && _debeResponderComando("set_lectura_principal", false));
    if (respondePendientes) hablarUnidad(NO_PARAMETRO_MSG, { cancelarPrevio: true });
    logVisual(`🎤 ${NO_PARAMETRO_MSG} (${pendientes.join(", ")})`);
    return true;
  }

  if (huboCambios) {
    logVisual("✅ Parámetros de la unidad actualizados por voz.");
  }
  return true;
}

function _extraerContextoResultadoParaCopiloto(maxLen = 14000) {
  const cont = document.getElementById("resultadoUnidadGenerada");
  if (!cont) return "";
  const bloques = Array.from(cont.querySelectorAll(".bloque-subtema, .bloque-categoria"));
  if (!bloques.length) {
    return (cont.innerText || "").replace(/\s+/g, " ").trim().slice(0, maxLen);
  }
  const partes = [];
  bloques.forEach((b, i) => {
    const alumno = (b.querySelector(".col-alumno")?.innerText || "").trim();
    const maestro = (b.querySelector(".col-maestro")?.innerText || "").trim();
    if (alumno) partes.push(`Bloque ${i + 1} Alumno:\n${alumno}`);
    if (maestro) partes.push(`Bloque ${i + 1} Maestro:\n${maestro}`);
  });
  return partes.join("\n\n").slice(0, maxLen);
}

function _reemplazoGlobalTextoResultado(from = "", to = "") {
  const cont = document.getElementById("resultadoUnidadGenerada");
  if (!cont || !from) return false;
  const buscado = String(from).trim();
  const reemplazo = String(to ?? "").trim();
  if (!buscado) return false;

  const walker = document.createTreeWalker(cont, NodeFilter.SHOW_TEXT, null);
  let node;
  let cambios = 0;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue) continue;
    if (node.nodeValue.includes(buscado)) {
      node.nodeValue = node.nodeValue.split(buscado).join(reemplazo);
      cambios++;
    }
  }
  return cambios > 0;
}

function _eliminarCategoriaResultado(categoria = "") {
  const cat = String(categoria || "").trim();
  if (!cat) return false;
  const id = `contenedor-${cat.replace(/\s/g, "-")}`;
  const byId = document.getElementById(id);
  if (byId) {
    byId.remove();
    return true;
  }
  const headers = Array.from(document.querySelectorAll("#resultadoUnidadGenerada .bloque-categoria h2"));
  const header = headers.find((h) => _normalizarTexto(h.textContent || "").includes(_normalizarTexto(cat)));
  const bloque = header?.closest(".bloque-categoria");
  if (bloque) {
    bloque.remove();
    return true;
  }
  return false;
}

function _eliminarSubtemaResultado(subtema = "") {
  const sub = _normalizarTexto(subtema);
  if (!sub) return false;
  const bloques = Array.from(document.querySelectorAll("#resultadoUnidadGenerada .bloque-subtema"));
  const target = bloques.find((b) => _normalizarTexto(b.textContent || "").includes(sub));
  if (!target) return false;
  target.remove();
  return true;
}

function _parseReemplazoVoz(texto = "") {
  const cmd = String(texto || "").trim();
  const m = cmd.match(/(?:reemplaza|sustituye|cambia(?: la parte)?)(?:\s+el texto)?\s+["“]?(.+?)["”]?\s+por\s+["“]?(.+?)["”]?$/i);
  if (!m) return null;
  return { from: m[1].trim(), to: m[2].trim() };
}

async function _responderCopilotoConGemini(pregunta = "") {
  if (!geminiLiveSessionUnidad || !geminiLiveIsOpen) return false;
  const contexto = _extraerContextoResultadoParaCopiloto();
  const memoria = _resumenMemoriaConversacion(1400);
  _agregarMemoriaConversacion("user", pregunta);
  return _safeSendClientContent({
    turns: [{
      role: "user",
      parts: [{
        text:
          `Actúa como copiloto pedagógico. Responde en español con una sola frase (máximo 20 palabras).\n` +
          `Sin saludos, sin relleno y sin listas largas.\n` +
          `Si falta contexto, haz una sola pregunta corta (máximo 8 palabras).\n` +
          `Historial reciente:\n${memoria || "sin historial"}\n\n` +
          `Contexto de la unidad:\n${contexto}\n\n` +
          `Pregunta del usuario:\n${pregunta}`
      }]
    }],
    turnComplete: true
  }, "ws_closed_copiloto");
}

async function _obtenerContextoFirestoreParaCharly(pregunta = "", force = false) {
  const now = Date.now();
  const key = _normalizarTexto(String(pregunta || "")).slice(0, 120);
  if (!force && now < Number(charlyDbContextBlockedUntil || 0)) {
    return "";
  }
  if (!force
    && charlyDbContextCache.text
    && charlyDbContextCache.key === key
    && (now - Number(charlyDbContextCache.ts || 0)) < 120000) {
    return charlyDbContextCache.text;
  }

  const user = auth?.currentUser || null;
  if (!user) return "";

  try {
    const queryNorm = _normalizarTexto(String(pregunta || ""));
    const _extraerTituloLecturaSolicitado = (txt = "") => {
      const raw = String(txt || "").trim();
      const patrones = [
        /(?:lee|leer|léeme|leeme)\s+(?:la\s+)?(?:lectura\s+)?(.+)$/i,
        /(?:quiero|puedes|podrias|podrías)\s+(?:que\s+)?(?:leas|leer)\s+(?:la\s+)?(?:lectura\s+)?(.+)$/i,
        /(?:la\s+)?lectura\s+(.+)$/i
      ];
      let picked = "";
      for (const rx of patrones) {
        const m = raw.match(rx);
        if (m?.[1]) {
          picked = String(m[1]).trim();
          break;
        }
      }
      const limpio = picked
        .replace(/\b(completa|entera|todo|toda|por\s+favor|porfa|ahora|charly)\b/gi, " ")
        .replace(/^[:\-.,\s]+/, "")
        .replace(/\s+/g, " ")
        .trim();
      return {
        raw: limpio,
        norm: _normalizarTexto(limpio)
      };
    };
    const tituloSolicitado = _extraerTituloLecturaSolicitado(pregunta);
    const consultaLecturaEspecifica = (() => {
      const raw = String(pregunta || "").trim();
      const m1 = raw.match(/(?:lee|leer|léeme|leeme)\s+(?:la\s+)?lectura\s+(.+)$/i);
      const m2 = raw.match(/(?:la\s+)?lectura\s+(.+)$/i);
      const picked = (m1?.[1] || m2?.[1] || "").trim();
      const fromOld = _normalizarTexto(
        picked
          .replace(/\b(completa|entera|todo|toda)\b/gi, " ")
          .replace(/^[:\-.,\s]+/, "")
          .trim()
      );
      return tituloSolicitado.norm || fromOld;
    })();
    const lecturaCache = _leerLecturaCache();
    const lecturaCacheNorm = _normalizarTexto(lecturaCache?.titulo || "");
    const tokensConsulta = (consultaLecturaEspecifica || queryNorm).split(/\s+/).filter((tk) => tk.length > 2);
    const prefASC = /\b(asc|vieja|viejas|hist[oó]rica|hist[oó]ricas|primeras)\b/i.test(String(pregunta || ""));
    const prefNuevas = /\b(nueva|nuevas|reciente|recientes|charly[-\s]?brown)\b/i.test(String(pregunta || ""));
    const idPreferido = String(
      document.getElementById("unidadTema")?.value
      || document.getElementById("unidadTemaASC")?.value
      || ""
    ).trim();
    const localPool = _poolLecturasBusqueda();
    const local = Array.isArray(localPool) ? localPool : [];

    let source = local;
    if (!source.length) {
      const [snapNuevas, snapAsc] = await Promise.all([
        getDocs(query(collection(db, "lecturasNuevas"), limit(120))),
        getDocs(query(collection(db, "lecturasASC"), limit(120)))
      ]);
      const remotasNuevas = snapNuevas.docs.map((d) => ({ id: d.id, tipo: "principal", sourceCollection: "lecturasNuevas", ...d.data() }));
      const remotasAsc = snapAsc.docs.map((d) => ({ id: d.id, tipo: "asc", sourceCollection: "lecturasASC", ...d.data() }));
      source = [...remotasNuevas, ...remotasAsc];
    }
    if (lecturaCache?.id && !consultaLecturaEspecifica) {
      source = [
        {
          id: lecturaCache.id,
          tipo: lecturaCache.tipo || "principal",
          sourceCollection: lecturaCache.coleccion || (lecturaCache.esLecturaHistoricaASC ? "lecturasASC" : "lecturasNuevas"),
          titulo: lecturaCache.titulo || "",
          tema: lecturaCache.tema || lecturaCache.titulo || "",
          autorReferencia: lecturaCache.autor || "",
          nivel: lecturaCache.nivel || "",
          grado: lecturaCache.grado || "",
          trimestre: lecturaCache.trimestre || "",
          unidad: lecturaCache.unidad || "",
          contenidoPlano: lecturaCache.contenidoCompleto || "",
          preguntas: Array.isArray(lecturaCache.preguntas) ? lecturaCache.preguntas : [],
          tipoTexto: lecturaCache.tipoTexto || "",
          ejeArticulador: lecturaCache.ejeArticulador || ""
        },
        ...source.filter((l) => String(l?.id || "") !== String(lecturaCache.id || ""))
      ];
    }
    const lecturasGemini = source.map((l) => _mapearLecturaResumenParaBusqueda(l));
    const lecturasById = new Map(lecturasGemini.map((l) => [String(l?.id || ""), l]));
    const lecturaPreferida = idPreferido ? (lecturasById.get(idPreferido) || null) : null;

    const scoreLectura = (l) => {
      const titulo = _normalizarTexto(l?.titulo || "");
      const sinopsis = _normalizarTexto(l?.sinopsis || "");
      const autor = _normalizarTexto(l?.autor || "");
      const col = String(l?.coleccion || "").trim();
      const objetivo = consultaLecturaEspecifica || queryNorm;
      if (!objetivo) return 1;
      let score = 0;
      // Prioridad máxima: coincidencia de título (evita mezclar lecturas).
      if (titulo === objetivo) score += 200;
      if (titulo.startsWith(objetivo)) score += 140;
      if (titulo.includes(objetivo)) score += 100;
      if (objetivo.includes(titulo) && titulo.length > 8) score += 80;
      if (!consultaLecturaEspecifica && sinopsis.includes(objetivo)) score += 20;
      if (autor.includes(objetivo)) score += 12;
      const tokens = objetivo.split(/\s+/).filter(Boolean);
      tokens.forEach((tk) => {
        if (titulo.includes(tk)) score += 9;
        if (!consultaLecturaEspecifica && sinopsis.includes(tk)) score += 2;
        if (autor.includes(tk)) score += 1;
      });
      // Si el usuario pidió una lectura específica, descarta candidatas sin relación real de título.
      if (consultaLecturaEspecifica) {
        const overlap = tokens.filter((tk) => tk.length > 2 && titulo.includes(tk)).length;
        const minOverlap = Math.max(1, Math.ceil(tokens.length * 0.6));
        const matchesTitle = titulo.includes(consultaLecturaEspecifica)
          || consultaLecturaEspecifica.includes(titulo)
          || overlap >= minOverlap;
        if (!matchesTitle) score = 0;
      }
      if (!consultaLecturaEspecifica && lecturaCache?.id && String(l?.id || "") === String(lecturaCache.id || "")) {
        score += 60;
        if (lecturaCacheNorm) {
          if (consultaLecturaEspecifica && lecturaCacheNorm === consultaLecturaEspecifica) score += 200;
          if (consultaLecturaEspecifica && lecturaCacheNorm.includes(consultaLecturaEspecifica)) score += 140;
          const overlap = tokensConsulta.filter((tk) => lecturaCacheNorm.includes(tk)).length;
          if (overlap) score += overlap * 25;
          if (consultaLecturaEspecifica && !lecturaCacheNorm.includes(consultaLecturaEspecifica) && !tokensConsulta.some((tk) => lecturaCacheNorm.includes(tk))) {
            score = 0;
          }
        }
      }
      if (lecturaPreferida?.id && String(l?.id || "") === String(lecturaPreferida.id || "")) {
        score += 80;
      }
      if (prefASC && col === "lecturasASC") score += 90;
      if (prefASC && col === "lecturasNuevas") score -= 35;
      if (prefNuevas && col === "lecturasNuevas") score += 90;
      if (prefNuevas && col === "lecturasASC") score -= 35;
      return score;
    };

    let topLecturasScored = lecturasGemini
      .map((l) => ({ ...l, _score: scoreLectura(l) }))
      .filter((l) => l._score > 0)
      .sort((a, b) => b._score - a._score);
    if (consultaLecturaEspecifica && topLecturasScored.length) {
      const mejor = topLecturasScored[0];
      // Si la consulta es específica y el mejor match es débil, no mezclar lectura incorrecta.
      if (Number(mejor?._score || 0) < 120) {
        topLecturasScored = [];
      }
    }
    if (consultaLecturaEspecifica && lecturaPreferida?.id) {
      const preferNorm = _normalizarTexto(String(lecturaPreferida.titulo || ""));
      const overlap = tokensConsulta.filter((tk) => preferNorm.includes(tk)).length;
      const minOverlap = Math.max(1, Math.ceil(tokensConsulta.length * 0.6));
      if (preferNorm && (preferNorm.includes(consultaLecturaEspecifica) || overlap >= minOverlap)) {
        const ya = topLecturasScored.find((l) => String(l?.id || "") === String(lecturaPreferida.id || ""));
        const preferScored = { ...lecturaPreferida, _score: Math.max(260, Number(ya?._score || 0)) };
        topLecturasScored = [
          preferScored,
          ...topLecturasScored.filter((l) => String(l?.id || "") !== String(lecturaPreferida.id || ""))
        ];
      }
    }
    let disambiguacion = null;
    if (consultaLecturaEspecifica && !prefASC && !prefNuevas) {
      const candASC = topLecturasScored.find((l) => String(l?.coleccion || "") === "lecturasASC") || null;
      const candNuevas = topLecturasScored.find((l) => String(l?.coleccion || "") === "lecturasNuevas") || null;
      if (candASC && candNuevas) {
        const delta = Math.abs(Number(candASC?._score || 0) - Number(candNuevas?._score || 0));
        if (delta <= 36) {
          disambiguacion = {
            requiere: true,
            pregunta: "No estoy seguro(a) de cuál lectura deseas. ¿De las nuevas o de las míticas lecturas de ASC?",
            opciones: {
              lecturasASC: {
                id: candASC.id || "",
                titulo: candASC.titulo || "",
                coleccion: "lecturasASC",
                contenidoCompleto: String(candASC.contenidoCompleto || ""),
                grado: candASC.grado || "",
                trimestre: candASC.trimestre || "",
                unidad: candASC.unidad || ""
              },
              lecturasNuevas: {
                id: candNuevas.id || "",
                titulo: candNuevas.titulo || "",
                coleccion: "lecturasNuevas",
                contenidoCompleto: String(candNuevas.contenidoCompleto || ""),
                grado: candNuevas.grado || "",
                trimestre: candNuevas.trimestre || "",
                unidad: candNuevas.unidad || ""
              }
            }
          };
        }
      }
    }

    const topLecturas = topLecturasScored
      .slice(0, 8)
      .map((l) => ({
        id: l.id || "",
        titulo: l.titulo || "",
        sinopsis: l.sinopsis || "",
        autor: l.autor || "",
        nivel: l.nivel || "",
        grado: l.grado || "",
        trimestre: l.trimestre || "",
        unidad: l.unidad || "",
        tipo: l.tipo || "",
        coleccion: l.coleccion || "",
        esLecturaHistoricaASC: !!l.esLecturaHistoricaASC,
        tipoTexto: l.tipoTexto || "",
        ejeArticulador: l.ejeArticulador || ""
      }));

    const principal = topLecturasScored[0] || null;
    let principalFull = null;
    let contenidoPrincipal = "";
    if (principal?.id) {
      principalFull = await _obtenerLecturaCompletaDesdeRef(principal);
      contenidoPrincipal = String(principalFull?.contenidoCompleto || "");
      if (principalFull?.id) {
        _guardarLecturaCache(principalFull);
      }
    }

    const contenidoPrincipalSafe = String(contenidoPrincipal || "").slice(0, 80000);
    const principalPayload = principalFull || principal;
    const payload = {
      query: String(pregunta || ""),
      lecturaSolicitada: tituloSolicitado.raw || "",
      disambiguacion,
      totalCandidates: source.length,
      topLecturas,
      lecturaPrincipal: principalPayload ? {
        id: principalPayload.id || "",
        titulo: principalPayload.titulo || "",
        sinopsis: principalPayload.sinopsis || "",
        autor: principalPayload.autor || "",
        tipoTexto: principalPayload.tipoTexto || "",
        ejeArticulador: principalPayload.ejeArticulador || "",
        nivel: principalPayload.nivel || "",
        grado: principalPayload.grado || "",
        trimestre: principalPayload.trimestre || "",
        unidad: principalPayload.unidad || "",
        tipo: principalPayload.tipo || "",
        coleccion: principalPayload.coleccion || "",
        esLecturaHistoricaASC: !!principalPayload.esLecturaHistoricaASC,
        notaRespeto: principalPayload.notaRespeto || "",
        score: Number(principal?._score || 0),
        contenidoCompleto: contenidoPrincipalSafe,
        preguntas: Array.isArray(principalFull?.preguntas) ? principalFull.preguntas : [],
        campos: principalFull?.campos || {}
      } : null
    };
    const raw = JSON.stringify(payload);
    charlyDbContextCache = { ts: now, key, text: raw };
    charlyDbContextBlockedUntil = 0;
    return raw;
  } catch (err) {
    charlyDbContextBlockedUntil = Date.now() + 30000;
    const msg = String(err?.message || "");
    logVisual(`⚠️ No se pudo leer contexto de lecturas desde Firestore: ${msg || "sin detalle"}`);
    return "";
  }
}

async function _responderConversacionContinuaConGemini(pregunta = "") {
  const q = String(pregunta || "").trim();
  if (!q) return false;
  _agregarMemoriaConversacion("user", q);
  const modoLectura = String(charlyLecturaContextoConversacion?.modo || "").trim();
  if (modoLectura === "analiza" && voiceRespuestaContinuaActiva) {
    const manejadoAnalisis = await _manejarConversacionAnaliticaLectura(q);
    if (manejadoAnalisis) return true;
  }
  if (!geminiLiveSessionUnidad || !geminiLiveIsOpen) return false;
  const prefPendiente = _preferenciaColeccionLecturaDesdeTexto(q);
  if (charlyLecturaDisambiguacionPendiente && prefPendiente) {
    const elegido = charlyLecturaDisambiguacionPendiente?.opciones?.[prefPendiente] || null;
    if (elegido?.contenidoCompleto) {
      const etiquetaColeccion = prefPendiente === "lecturasASC"
        ? "de las míticas lecturas ASC"
        : "de lecturas nuevas";
      const confirmacion = `Perfecto, leeré la opción ${etiquetaColeccion}: ${elegido.titulo || "sin título"}.`;
      charlyLecturaDisambiguacionPendiente = null;
      const started = _iniciarLecturaCompletaCharly(
        String(elegido.contenidoCompleto || ""),
        String(elegido.titulo || ""),
        confirmacion
      );
      if (started) return true;
    }
  }
  geminiLiveAllowOutputUntil = Date.now() + 15000;
  const contextoLecturaActiva = charlyLecturaContextoConversacion && charlyLecturaContextoConversacion.id
    ? {
      lecturaPrincipal: {
        id: charlyLecturaContextoConversacion.id,
        coleccion: charlyLecturaContextoConversacion.coleccion,
        titulo: charlyLecturaContextoConversacion.titulo,
        contenidoCompleto: String(charlyLecturaContextoConversacion.contenidoCompleto || "").slice(0, 80000)
      },
      modo: charlyLecturaContextoConversacion.modo || "profundizar"
    }
    : null;
  const contextoFirebase = contextoLecturaActiva
    ? JSON.stringify(contextoLecturaActiva)
    : await _obtenerContextoFirestoreParaCharly(q, false);
  const memoria = _resumenMemoriaConversacion(1800);
  const solicitudLectura = /\b(lectura|lee|leer|léeme|leeme|cuento|texto)\b/i.test(q);
  const solicitudLecturaExplicita = /\b(lee|leer|leeme|léeme)\b/i.test(q) && /\b(lectura|cuento|texto)\b/i.test(q);
  const solicitudLecturaCompleta = /\b(lee|leer|leeme|léeme|leeme|léeme)\b.*\b(completa|entera|todo|toda)\b|\blectura completa\b/i.test(q);
  const debeLeerTexto = solicitudLecturaCompleta || solicitudLecturaExplicita;
  if (debeLeerTexto) {
    let lecturaCompleta = "";
    let lecturaTitulo = "";
    let lecturaMeta = null;
    let lecturaSolicitada = "";
    try {
      const ctx = JSON.parse(String(contextoFirebase || "{}"));
      lecturaCompleta = String(ctx?.lecturaPrincipal?.contenidoCompleto || "").trim();
      lecturaTitulo = String(ctx?.lecturaPrincipal?.titulo || "").trim();
      lecturaMeta = ctx?.lecturaPrincipal || null;
      lecturaSolicitada = String(ctx?.lecturaSolicitada || "").trim();
      const dis = ctx?.disambiguacion || null;
      if (dis?.requiere && dis?.opciones) {
        charlyLecturaDisambiguacionPendiente = dis;
        hablarUnidad(
          String(dis.pregunta || "No estoy seguro(a) de cuál lectura deseas. ¿De las nuevas o de las míticas lecturas de ASC?"),
          { cancelarPrevio: true, preferLive: true }
        );
        return true;
      }
    } catch (_) {
      lecturaCompleta = "";
      lecturaTitulo = "";
      lecturaMeta = null;
      lecturaSolicitada = "";
    }
    if (lecturaCompleta) {
      const etiquetaColeccion = lecturaMeta?.esLecturaHistoricaASC
        ? "de lecturas ASC (histórica)"
        : (lecturaMeta?.coleccion === "lecturasNuevas" ? "de lecturas nuevas" : "");
      const confirmacion = `Confirmo la lectura ${lecturaTitulo || "seleccionada"} ${etiquetaColeccion}`.trim() +
        `, de grado ${lecturaMeta?.grado || "sin grado"}, trimestre ${lecturaMeta?.trimestre || "sin trimestre"}, unidad ${lecturaMeta?.unidad || "sin unidad"}.`;
      const started = _iniciarLecturaCompletaCharly(lecturaCompleta, lecturaTitulo, confirmacion);
      if (started) return true;
    }
    if (lecturaSolicitada) {
      hablarUnidad(`No encontré con seguridad la lectura ${lecturaSolicitada}. ¿Me confirmas el título exacto?`, { cancelarPrevio: true, preferLive: true });
      return true;
    }
  }
  const policy = solicitudLecturaCompleta
    ? "Si el usuario pide leer la lectura completa, léela íntegra y en orden, sin resumir."
    : CHARLY_BREVITY_POLICY;
  return _safeSendClientContent({
    turns: [{
      role: "user",
      parts: [{
        text:
          `Actúa como Charly en conversación por voz.\n` +
          `${policy}\n` +
          `Responde natural, útil y breve; sin listas, sin relleno.\n` +
          `${_guiaEtiquetasLiveCharly()}\n` +
          `Para conversación afectiva, usa etiquetas cuando aporten tono (no en cada respuesta).\n` +
          `${solicitudLectura ? "Si te preguntan por una lectura, primero confirma título, grado, trimestre y unidad; luego responde.\n" : ""}` +
          `Mantén continuidad con este historial reciente.\n` +
          `Historial:\n${memoria || "sin historial"}\n` +
          `Cuando aplique, usa el contexto de Firebase incluido abajo.\n` +
          `Si el usuario pide terminar la plática, confirma y calla.\n` +
          `Contexto Firebase (JSON resumido):\n${contextoFirebase || "sin contexto disponible"}\n\n` +
          `Mensaje del usuario:\n${q}`
      }]
    }],
    turnComplete: true
  }, "ws_closed_conversacion");
}

function _preguntarCopilotoTrasGeneracion(categoria = "") {
  voiceCopilotoPendiente = true;
  const pregunta = `¿Quieres que te ayude a profundizar en el tema que estamos generando${categoria ? ` de ${categoria}` : ""}?`;
  if (geminiLiveSessionUnidad && geminiLiveIsOpen) {
    try {
      const ok = _safeSendClientContent({
        turns: [{
          role: "user",
          parts: [{ text: `Di exactamente esta pregunta en español: ${pregunta}` }]
        }],
        turnComplete: true
      }, "ws_closed_pregunta_copiloto");
      if (!ok) throw new Error("live_closed");
      return;
    } catch (_) {
      // fallback local
    }
  }
  hablarUnidad(pregunta, { cancelarPrevio: false });
}

async function _manejarModoCopilotoResultado(texto = "") {
  const norm = _normalizarTexto(texto);
  if (!norm) return false;

  if (voiceCopilotoPendiente) {
    if (/\b(si|acepto|claro|ok|de acuerdo|ayudame|ayúdame)\b/.test(norm)) {
      voiceCopilotoPendiente = false;
      voiceCopilotoActivo = true;
      hablarUnidad("Perfecto. Ya estoy listo para ayudarte con mejoras y cambios en el resultado.");
      return true;
    }
    if (/\b(no|despues|después|luego|cancelar)\b/.test(norm)) {
      voiceCopilotoPendiente = false;
      voiceCopilotoActivo = false;
      hablarUnidad("Entendido, seguimos sin copiloto por ahora.");
      return true;
    }
  }

  if (!voiceCopilotoActivo) return false;

  const eliminarCat = norm.match(/elimina\s+la?\s*categoria\s+(.+)$/i);
  if (eliminarCat?.[1]) {
    const ok = _eliminarCategoriaResultado(eliminarCat[1]);
    hablarUnidad(ok ? "Categoría eliminada." : "No encontré esa categoría en el resultado.");
    return true;
  }

  const eliminarSub = norm.match(/elimina\s+el?\s*subtema\s+(.+)$/i);
  if (eliminarSub?.[1]) {
    const ok = _eliminarSubtemaResultado(eliminarSub[1]);
    hablarUnidad(ok ? "Subtema eliminado." : "No encontré ese subtema en el resultado.");
    return true;
  }

  const reemplazo = _parseReemplazoVoz(texto);
  if (reemplazo) {
    const ok = _reemplazoGlobalTextoResultado(reemplazo.from, reemplazo.to);
    hablarUnidad(ok ? "Cambio aplicado en el texto." : "No encontré ese texto para reemplazar.");
    return true;
  }

  const cambiarParrafo = texto.match(/cambia\s+el?\s*parrafo\s+["“]?(.+?)["”]?\s+por\s+["“]?(.+?)["”]?$/i);
  if (cambiarParrafo?.[1] && cambiarParrafo?.[2]) {
    const cont = document.getElementById("resultadoUnidadGenerada");
    const parr = Array.from(cont?.querySelectorAll("p") || []).find((p) =>
      _normalizarTexto(p.textContent || "").includes(_normalizarTexto(cambiarParrafo[1]))
    );
    if (parr) {
      parr.textContent = cambiarParrafo[2].trim();
      hablarUnidad("Párrafo actualizado.");
    } else {
      hablarUnidad("No encontré ese párrafo.");
    }
    return true;
  }

  // Si no es comando de edición, tratarlo como pregunta de profundización.
  const respondido = await _responderCopilotoConGemini(texto);
  if (!respondido) {
    hablarUnidad("No tengo sesión activa de Gemini para profundizar, pero puedo seguir editando el texto.");
  }
  return true;
}

function _segmentarComandosVoz(transcripcion = "") {
  const raw = String(transcripcion || "").trim();
  if (!raw) return [];
  if (_estaModalInstruccionesAbierto() || voicePendingInputCapture?.target === "textareaInstruccionesGemini") {
    return [raw];
  }
  const rawNorm = _normalizarTexto(raw);
  const esComandoCategoriaCompartida =
    /\b(categoria|categoría)\b/.test(rawNorm) &&
    _resolverColumnasSecuenciaDesdeTexto(rawNorm).length > 1;
  if (esComandoCategoriaCompartida) {
    return [raw];
  }
  const _pareceDictadoAInput = (texto = "") => {
    const norm = _normalizarTexto(texto);
    if (!norm) return false;
    const entries = _listarComandosConfigurados(({ row }) =>
      _normalizarFnComandoVoz(String(row.fn || "").trim()) === "_setInputByVoice"
    );
    for (const { row } of entries) {
      const src = String(row.regex || "").trim();
      if (!src) continue;
      const rx = _compilarRegexFlexible(src);
      if (!rx) continue;
      if (rx.test(norm)) return true;
    }
    return false;
  };
  const splitByComma = !_pareceDictadoAInput(raw);
  const normalized = raw
    .replace(
      /\s+y\s+(?=(?:agrega(?:r)?|anade|añade|pon(?:er)?|inserta(?:r)?|quita(?:r)?|elimina(?:r)?|remueve?|borra(?:r)?|marca(?:r)?|desmarca(?:r)?|activa(?:r)?|desactiva(?:r)?)\b)/gi,
      " | "
    )
    .replace(
      /\s+y\s+(?=(?:un|una|el|la|los|las)\s+(?:recortables?|fichas?|anexos?|videos?)\b|(?:recortables?|fichas?|anexos?|videos?)\b)/gi,
      " | "
    )
    .replace(/\s+y\s+luego\s+/gi, " | ")
    .replace(/\s+despues\s+de\s+eso\s+/gi, " | ")
    .replace(/\s+despues\s+/gi, " | ")
    .replace(/\s+después\s+de\s+eso\s+/gi, " | ")
    .replace(/\s+después\s+/gi, " | ")
    .replace(/\s+ademas\s+/gi, " | ")
    .replace(/\s+además\s+/gi, " | ")
    .replace(/\s+tambien\s+/gi, " | ")
    .replace(/\s+también\s+/gi, " | ")
    .replace(/\s*;\s*/g, " | ");
  const segmented = splitByComma ? normalized.replace(/\s*,\s*/g, " | ") : normalized;

  const parts = segmented
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p.length > 2);

  return parts.length > 1 ? parts : [raw];
}

async function procesarComandoVozUnidad(transcripcion = "", opciones = {}) {
  if (_lecturasAgentIsAutoReadSpeaking()) {
    return;
  }
  const agenteExclusivo = _agenteUnidadEnModoExclusivo();
  if (agenteExclusivo) {
    const textoAgente = _normalizarTexto(transcripcion);
    if (!textoAgente) return;
    if (_esEcoDeAgente(transcripcion)) {
      logVisual("ℹ️ [Agente] Transcript ignorado por eco.");
      return;
    }
    const esControlLectura =
      _esComandoDetenerLectura(textoAgente) || _esComandoContinuarLectura(textoAgente);
    const esControlSistema =
      _esComandoDespertar(textoAgente) || _esComandoDescanso(textoAgente)
      || /\b(cancela|cancelar|alto|deten|detener|parar|stop)\b/.test(textoAgente);
    const esRespuestaBreveValida =
      /\b(si|sí|no|ok|vale|siguiente|continuar|cancelar|leer|buscar|crear|generar)\b/.test(textoAgente);
    // En modo exclusivo priorizamos respuesta rápida del agente:
    // solo bloquea ruido muy corto durante habla activa, excepto comandos válidos.
    const bloqueaRuidoCortoEnHabla =
      Date.now() < Number(charlySpeakingVisibleUntil || 0)
      && !esControlLectura
      && !esControlSistema
      && !esRespuestaBreveValida
      && textoAgente.length < 6;
    if (bloqueaRuidoCortoEnHabla) {
      return;
    }
    await _asegurarControladorAgenteUnidad().handleVoiceTranscript(transcripcion, textoAgente);
    return;
  }
  if (!VOICE_HARDCODED_COMMANDS_ENABLED) return;
  if (!agenteExclusivo && !_agenteComandosVozActivo()) return;
  if (!agenteExclusivo && !_hayComandosVozActivos()) return;
  if (VOICE_COMMANDS_ALWAYS_ON) charlyAwake = true;
  const { fromBatch = false, skipDedup = false, internalBatchStep = false } = opciones || {};
  const canonIn = _canonTextoVoz(transcripcion || "");
  const nowIn = Date.now();
  if (canonIn && canonIn === charlyLastHandledCanon && (nowIn - charlyLastHandledAt) < 4200) {
    return;
  }
  if (charlyCommandInFlight && !internalBatchStep) {
    if (!canonIn) return;
    if (canonIn === charlyInFlightCanon) return;
    if (canonIn === charlyPendingCommandCanon) return;
    if (canonIn === charlyLastHandledCanon && (nowIn - charlyLastHandledAt) < 4200) return;
    charlyPendingCommand = String(transcripcion || "");
    charlyPendingCommandCanon = canonIn;
    return;
  }
  if (!internalBatchStep) {
    charlyCommandInFlight = true;
    charlyInFlightCanon = canonIn;
  }
  let texto = "";

  try {
  texto = _normalizarTexto(transcripcion);
  if (!texto) return;
  const comandoDetenerLectura = _esComandoDetenerLectura(texto);
  const comandoContinuarLectura = _esComandoContinuarLectura(texto);
  if (workflowPlayIsolationMode && workflowPlayPendingResponse) {
    await _resolverPendienteWorkflowPlayDesdeVoz(texto, transcripcion);
    return;
  }
  if (workflowPlayIsolationMode) {
    const esControl = _esComandoDespertar(texto)
      || _esComandoDescanso(texto)
      || /\b(cancela|cancelar|alto|deten|detener|parar|stop)\b/.test(texto);
    if (!esControl) return;
  }
  if (charlyLecturaPreguntasPendientes?.awaitingConfirm && Date.now() <= Number(charlyLecturaPreguntasPendientes.expiresAt || 0)) {
    if (_esRespuestaAfirmativaVoz(texto)) {
      const payload = { ...charlyLecturaPreguntasPendientes };
      charlyLecturaPreguntasPendientes = null;
      const startedQuestions = await _iniciarLecturaDesdeCache({
        id: `preguntas-${Date.now()}`,
        contenidoCompleto: payload.texto,
        titulo: "Preguntas de comprensión",
        tema: "Preguntas de comprensión",
        preguntas: []
      });
      if (!startedQuestions) {
        hablarUnidad("No pude continuar con las preguntas de comprensión en este momento.", { cancelarPrevio: true, preferLive: true });
      }
      return true;
    }
    if (_esRespuestaNegativaVoz(texto) || _esRespuestaCancelarVoz(texto)) {
      charlyLecturaPreguntasPendientes = null;
      hablarUnidad("Entendido. Termino aquí la lectura.", { cancelarPrevio: true, preferLive: true });
      return true;
    }
  } else if (charlyLecturaPreguntasPendientes?.awaitingConfirm) {
    charlyLecturaPreguntasPendientes = null;
  }
  if (charlyLecturaEnCurso) {
    if (comandoDetenerLectura) {
      _detenerLecturaCompletaCharly({ clearResume: true });
      hablarUnidad("Detengo la lectura.", { cancelarPrevio: true, preferLive: true });
      return;
    }
    if (comandoContinuarLectura) {
      _enviarBloqueLecturaActual();
      return;
    }
    // Mientras hay lectura activa, ignora ruido/órdenes no explícitas.
    return;
  }
  if (comandoContinuarLectura && !charlyLecturaEnCurso) {
    const resumed = await _reanudarLecturaCompletaCharly();
    if (resumed) {
      hablarUnidad("Continúo la lectura.", { cancelarPrevio: true, preferLive: true });
      return;
    }
    hablarUnidad("No tengo una lectura pausada para continuar.", { cancelarPrevio: true, preferLive: true });
    return;
  }
  const esWake = _esComandoDespertar(texto);
  if (!esWake && _esEcoDeAgente(transcripcion)) return;

  if (_esComandoDescanso(texto)) {
    if (!VOICE_COMMANDS_ALWAYS_ON) charlyAwake = false;
    voiceCopilotoActivo = false;
    voiceCopilotoPendiente = false;
    _setRespuestaContinuaActiva(false);
    if (_debeResponderPorFuncion("_esComandoDescanso", true)) {
      hablarUnidad("Entendido, me quedo en espera.", { cancelarPrevio: true, preferLive: true });
    }
    return;
  }
  if (esWake) {
    const wakeCanon = canonIn || _canonTextoVoz(texto);
    const nowWake = Date.now();
    if (wakeCanon && wakeCanon === charlyLastWakeCanon && (nowWake - charlyLastWakeAt) < 5500) {
      return;
    }
    charlyLastWakeCanon = wakeCanon;
    charlyLastWakeAt = nowWake;
    charlyAwake = true;
    _actualizarVozCharlyDesdeThemeSettings();
    const resto = _extraerComandoDespuesDeWake(texto);
    const restoNorm = _normalizarTexto(resto);
    const restoEsSoloSaludo = !!restoNorm && _esComandoSaludo(restoNorm) && !_esSolicitudAccionExplicita(restoNorm);
    const respondeWake = _debeResponderPorFuncion("_esComandoDespertar", true);
    let saludoEmitido = false;
    // Si ya está despierto y no hay acción adicional, no repetir respuesta.
    const saludoDespertar = "Hola, soy Charly. Estoy listo para ayudarte.";
    if (!resto || resto.length <= 2) {
      if ((nowWake - charlyLastGreetingAt) > 5000) {
        if (respondeWake) {
          _responderWakeConBajaLatencia(saludoDespertar);
          saludoEmitido = true;
        }
      }
    } else {
      if (respondeWake) {
        _responderWakeConBajaLatencia(saludoDespertar);
        saludoEmitido = true;
      }
    }
    if (saludoEmitido) {
      charlyLastGreetingAt = nowWake;
    }
    if (!geminiLiveSessionUnidad && unidadVoiceShouldRun) {
      iniciarGeminiLiveUnidad().catch(() => { });
    }
    const cfgWake = _leerConfigComandosVoz()?.wake_charly || {};
    const nextWake = _resolverSiguienteComandoPorResultado(cfgWake, "ok");
    if (nextWake) {
      if (/^(any|cualquiera|esperar(?:\s+instruccion|\s+instrucción)?)$/i.test(nextWake)) {
        // No-op: queda despierto esperando la siguiente instrucción del usuario.
      } else {
        await _ejecutarCadenaPostComando(nextWake, texto, new Set(["cmd:wake_charly"]), "ok");
      }
    }
    if (restoEsSoloSaludo) {
      // Evita doble respuesta ("aquí estoy" + saludo) cuando el resto solo es saludo.
      return;
    }
    if (resto && resto.length > 2) {
      await procesarComandoVozUnidad(resto, { fromBatch: true, skipDedup: true, internalBatchStep: true });
    }
    return;
  }
  if (VOICE_COMMANDS_ALWAYS_ON || !_requiereWakeWord()) {
    charlyAwake = true;
  }
  if (!charlyAwake) return;
  if (voiceRespuestaContinuaActiva && _esComandoFinalizarPlatica(texto)) {
    _setRespuestaContinuaActiva(false);
    hablarUnidad("Perfecto, finalizamos la plática.", { cancelarPrevio: true, preferLive: true });
    return;
  }
  if (_esComandoSaludo(texto) && !_esSolicitudAccionExplicita(texto)) {
    const nowGreet = Date.now();
    if ((nowGreet - charlyLastGreetingAt) < 4500) return;
    if (_debeResponderPorFuncion("_esComandoSaludo", true)) {
      hablarUnidad("Hola, aquí estoy.", { cancelarPrevio: true, preferLive: true });
      charlyLastGreetingAt = nowGreet;
    }
    return;
  }

  if (LEGACY_VOICE_SHORTCUTS_ENABLED && _esComandoCerrarVentana(texto)) {
    const ok = _cerrarVentanaActivaPorVoz();
    if (!ok) logVisual("ℹ️ No hay ventana activa para cerrar.");
    return;
  }

  // Prioridad crítica: abrir "Generar Unidad Nueva" no debe quedar bloqueado por
  // estados pendientes del flujo de lecturas ni por subflujos intermedios.
  const matchedOpenUnidad = _matchComando("open_generar_unidad", texto);
  if (matchedOpenUnidad) {
    logVisual("🧭 Voz: open_generar_unidad (prioritario).");
    const openedFromVoice = await _manejarComandosBotonesGlobales(transcripcion);
    if (openedFromVoice) {
      _limpiarPendientesLecturaParaAgente();
      charlyLecturaWorkflowCommandKey = "";
      return;
    }
    logVisual("⚠️ open_generar_unidad detectado, pero no se pudo abrir el botón objetivo.");
  }

  const manejadoAgente = await _asegurarControladorAgenteUnidad().handleVoiceTranscript(transcripcion, texto);
  if (manejadoAgente) return;
  if (_agenteUnidadEnModoExclusivo()) return;

  // Prioridad alta: flujo simple y determinista para búsqueda/selección de lectura por voz.
  if (LEGACY_VOICE_SHORTCUTS_ENABLED) {
    const manejadoLecturaSimple = await _manejarLecturaPorVozSimple(transcripcion);
    if (manejadoLecturaSimple) return;
  }

  const capturadoPendiente = await _intentarConsumirCapturaPendiente(transcripcion);
  if (capturadoPendiente) return;

  const resolvioPendienteLectura = await _resolverPendientesLecturaPorVoz(transcripcion);
  if (resolvioPendienteLectura) return;

  const accionLecturaDirecta = await _manejarAccionLecturaTablaPorVozDirecta(transcripcion);
  if (accionLecturaDirecta) return;

  if (LEGACY_VOICE_SHORTCUTS_ENABLED && _estaModalInstruccionesAbierto()) {
    const manejadoModalTemprano = await _manejarComandosModalInstrucciones(transcripcion);
    if (manejadoModalTemprano) return;
  }

  if (!fromBatch) {
    const partes = _segmentarComandosVoz(transcripcion);
    if (partes.length > 1) {
      for (const parte of partes) {
        await procesarComandoVozUnidad(parte, { fromBatch: true, skipDedup: true, internalBatchStep: true });
      }
      return;
    }
  }

  const now = Date.now();
  if (!skipDedup && texto === ultimaTranscripcionComando && (now - ultimaTranscripcionAt) < 2500) {
    return;
  }
  ultimaTranscripcionComando = texto;
  ultimaTranscripcionAt = now;

  const manejadoBoton = await _manejarComandosBotonesGlobales(transcripcion);
  if (manejadoBoton) return;

  const manejadoCustom = await _manejarComandosPersonalizadosGenerales(transcripcion);
  if (manejadoCustom) return;

  const manejadoBusquedaLectura = await _manejarBusquedaLecturaDirecta(transcripcion);
  if (manejadoBusquedaLectura) return;

  const manejadoParametros = await _manejarParametrosUnidadPorVoz(texto);
  if (manejadoParametros) return;

  if (voiceRespuestaContinuaActiva) {
    const respondido = await _responderConversacionContinuaConGemini(transcripcion);
    if (!respondido) {
      hablarUnidad("No tengo sesión activa para conversar en este momento.", { cancelarPrevio: true });
    }
    return;
  }

  if (LEGACY_VOICE_SHORTCUTS_ENABLED) {
    const manejadoSidebar = await _manejarComandosSidebarMenu(transcripcion);
    if (manejadoSidebar) return;

    const ejecutadoPorPlanGemini = await _ejecutarPlanGeminiSiAplica(transcripcion);
    if (ejecutadoPorPlanGemini) return;

    const manejadoCopiloto = await _manejarModoCopilotoResultado(transcripcion);
    if (manejadoCopiloto) return;

    const manejadoModal = await _manejarComandosModalInstrucciones(transcripcion);
    if (manejadoModal) return;

    const manejadoCategoria = await _manejarComandosCategoriasYSubtemas(transcripcion);
    if (manejadoCategoria) return;
  }
  } finally {
    if (!internalBatchStep) {
      charlyCommandInFlight = false;
      charlyInFlightCanon = "";
      if (canonIn && !_esComandoDespertar(texto)) {
        charlyLastHandledCanon = canonIn;
        charlyLastHandledAt = Date.now();
      }
      if (charlyPendingCommand) {
        const next = charlyPendingCommand;
        charlyPendingCommand = "";
        charlyPendingCommandCanon = "";
        setTimeout(() => {
          procesarComandoVozUnidad(next, { skipDedup: true }).catch(() => { });
        }, 120);
      }
    }
  }
}

function _programarProcesamientoLiveTranscripcion(inputTx = "") {
  const limpio = String(inputTx || "").trim();
  if (!limpio) return;
  if (_agenteUnidadEnModoExclusivo()) {
    if (_esEcoDeAgente(limpio)) {
      logVisual("ℹ️ [Agente] Live input ignorado por eco.");
      return;
    }
    procesarComandoVozUnidad(limpio, { skipDedup: true }).catch(() => { });
    return;
  }
  const norm = _normalizarTexto(limpio);
  if (_debeIgnorarEntradaPorHablaAgente(norm)) return;
  lastLiveTranscriptCanon = _canonTextoVoz(limpio);
  lastLiveTranscriptAt = Date.now();
  if (charlyLecturaEnCurso) {
    if (_esComandoFinalizarPlatica(norm) || _esComandoDetenerLectura(norm) || _esComandoContinuarLectura(norm)) {
      procesarComandoVozUnidad(limpio, { skipDedup: true }).catch(() => { });
    }
    return;
  }
  if (_esComandoDespertar(norm) || _esComandoDescanso(norm) || _esComandoSaludo(norm)) {
    liveTranscriptPending = "";
    if (liveTranscriptTimer) {
      clearTimeout(liveTranscriptTimer);
      liveTranscriptTimer = null;
    }
    procesarComandoVozUnidad(limpio, { skipDedup: true }).catch(() => { });
    return;
  }
  liveTranscriptPending = limpio;
  if (liveTranscriptTimer) clearTimeout(liveTranscriptTimer);
  liveTranscriptTimer = setTimeout(() => {
    const finalTx = liveTranscriptPending;
    liveTranscriptPending = "";
    liveTranscriptTimer = null;
    if (!finalTx) return;
    procesarComandoVozUnidad(finalTx).catch(() => { });
  }, 90);
}

async function detenerGeminiLiveUnidad() {
  try {
    geminiLivePendingSpeechQueue = [];
    geminiLivePendingStageCompletion = false;
    _limpiarTimerCierreStageLive();
    geminiLiveConnectPromise = null;
    geminiLiveSessionConfigKey = "";
    geminiLiveSessionClosing = true;
    geminiLiveActiveSessionEpoch = 0;
    geminiLiveInputCircuitOpenUntil = Date.now() + 1500;
    geminiLiveMicUploadPaused = true;
    geminiLiveIsOpen = false;
    if (geminiLiveProcessorNode) {
      geminiLiveProcessorNode.disconnect();
      geminiLiveProcessorNode.onaudioprocess = null;
      if (geminiLiveProcessorNode.port) geminiLiveProcessorNode.port.onmessage = null;
      geminiLiveProcessorNode = null;
    }
    if (geminiLiveSourceNode) {
      geminiLiveSourceNode.disconnect();
      geminiLiveSourceNode = null;
    }
    if (geminiLiveInputCtx) {
      await geminiLiveInputCtx.close().catch(() => { });
      geminiLiveInputCtx = null;
    }
    if (geminiLiveWorkletUrl) {
      URL.revokeObjectURL(geminiLiveWorkletUrl);
      geminiLiveWorkletUrl = "";
    }
    if (geminiLiveMicStream) {
      geminiLiveMicStream.getTracks().forEach((t) => t.stop());
      geminiLiveMicStream = null;
    }
    if (geminiLiveSessionUnidad) {
      geminiLiveSessionUnidad.close();
      geminiLiveSessionUnidad = null;
    }
    _asegurarControladorAgenteUnidad().setMicState(false, "live-stop");
  } catch (_) {
    // noop
  }
}

function _buildGeminiLiveSessionConfigKey(modelLive = "") {
  return JSON.stringify({
    model: String(modelLive || ""),
    persona: String(activeUnidadAgentPersona?.id || "charly"),
    voice: String(charlyTtsVoiceName || ""),
    mood: String(charlyVoiceMood || ""),
    locale: String(charlyVoiceLocale || ""),
    speed: Number(charlyVoiceSpeed || 1),
    pitch: Number(charlyVoicePitch || 1)
  });
}

async function _asegurarCapturaMicGeminiLive(sessionEpoch = 0) {
  if (geminiLiveMicStream && geminiLiveInputCtx && geminiLiveProcessorNode && geminiLiveSourceNode) {
    geminiLiveMicUploadPaused = false;
    if (_agenteUnidadEnModoExclusivo()) _asegurarControladorAgenteUnidad().setMicState(true, "reuse-stream");
    return true;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este navegador no soporta captura de micrófono.");
  }

  geminiLiveMicStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 16000,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });

  geminiLiveInputCtx = new AudioContext();
  geminiLiveSourceNode = geminiLiveInputCtx.createMediaStreamSource(geminiLiveMicStream);
  geminiLiveProcessorNode = await _crearNodoCapturaMicUnidad(geminiLiveInputCtx);
  const liveInputCtx = geminiLiveInputCtx;
  const inputSampleRate = Number(liveInputCtx?.sampleRate) || 48000;

  if (geminiLiveProcessorNode?.port) {
    geminiLiveProcessorNode.port.onmessage = (event) => {
      if (geminiLiveActiveSessionEpoch !== sessionEpoch) return;
      if (!geminiLiveSessionUnidad || !geminiLiveIsOpen || !unidadVoiceShouldRun || !liveInputCtx || liveInputCtx.state === "closed") return;
      if (geminiLiveMicUploadPaused) return;
      if (Date.now() < Number(geminiLiveInputCircuitOpenUntil || 0)) return;
      const now = Date.now();
      if ((now - Number(geminiLiveLastRealtimeSendAt || 0)) < GEMINI_LIVE_REALTIME_MIN_INTERVAL_MS) return;
      const input = event?.data instanceof Float32Array ? event.data : new Float32Array(0);
      if (!input.length) return;
      const down = _downsampleFloat32(input, inputSampleRate, 16000);
      if (!down.length) return;
      const ok = _safeSendRealtimeInput({
        audio: {
          data: _float32ToPcm16Base64(down),
          mimeType: "audio/pcm;rate=16000"
        }
      }, "ws_closed_realtime_port");
      if (ok) geminiLiveLastRealtimeSendAt = now;
    };
    geminiLiveSourceNode.connect(geminiLiveProcessorNode);
  } else {
    geminiLiveProcessorNode.onaudioprocess = (event) => {
      if (geminiLiveActiveSessionEpoch !== sessionEpoch) return;
      if (!geminiLiveSessionUnidad || !geminiLiveIsOpen || !unidadVoiceShouldRun || !liveInputCtx || liveInputCtx.state === "closed") return;
      if (geminiLiveMicUploadPaused) return;
      if (Date.now() < Number(geminiLiveInputCircuitOpenUntil || 0)) return;
      const now = Date.now();
      if ((now - Number(geminiLiveLastRealtimeSendAt || 0)) < GEMINI_LIVE_REALTIME_MIN_INTERVAL_MS) return;
      const input = event.inputBuffer.getChannelData(0);
      const down = _downsampleFloat32(input, inputSampleRate, 16000);
      if (!down.length) return;
      const ok = _safeSendRealtimeInput({
        audio: {
          data: _float32ToPcm16Base64(down),
          mimeType: "audio/pcm;rate=16000"
        }
      }, "ws_closed_realtime_onaudio");
      if (ok) geminiLiveLastRealtimeSendAt = now;
    };
    geminiLiveSourceNode.connect(geminiLiveProcessorNode);
    geminiLiveProcessorNode.connect(geminiLiveInputCtx.destination);
  }
  geminiLiveMicUploadPaused = false;
  logVisual("🎤 Micrófono Live activo");
  if (_agenteUnidadEnModoExclusivo()) _asegurarControladorAgenteUnidad().setMicState(true, "capture-ready");
  return true;
}

function _normalizarModeloGeminiLive(modelo = "") {
  return String(modelo || "")
    .replace(/^models\//i, "")
    .replace(":generateContent", "")
    .replace(":streamGenerateContent", "")
    .trim()
    .toLowerCase();
}

function _resolverModeloGeminiFlashLive() {
  const modeloSelect = _normalizarModeloGeminiLive(getSelectedModel() || "");
  // La activación por wake-word debe usar siempre una variante Flash Live.
  if (modeloSelect && /(flash-live|native-audio-preview)/.test(modeloSelect)) {
    return modeloSelect;
  }
  return GEMINI_LIVE_MODEL_DEFAULT;
}

async function iniciarGeminiLiveUnidad(options = {}) {
  const withMic = options?.withMic !== false;
  const forceRestart = options?.forceRestart === true;
  if (geminiLiveConnectPromise) return geminiLiveConnectPromise;
  const sessionEpoch = Date.now();
  _actualizarVozCharlyDesdeThemeSettings();
  const modelLive = _resolverModeloGeminiFlashLive();
  const desiredConfigKey = _buildGeminiLiveSessionConfigKey(modelLive);

  if (!forceRestart && geminiLiveSessionUnidad && geminiLiveIsOpen && geminiLiveSessionConfigKey === desiredConfigKey) {
    if (withMic) await _asegurarCapturaMicGeminiLive(geminiLiveActiveSessionEpoch);
    return geminiLiveSessionUnidad;
  }

  geminiLiveConnectPromise = (async () => {
    await detenerGeminiLiveUnidad();
    geminiLiveActiveSessionEpoch = sessionEpoch;
    geminiLiveSessionClosing = true;
    geminiLiveMicUploadPaused = true;
    geminiLiveInputCircuitOpenUntil = Date.now() + 900;
    geminiLiveLastRealtimeSendAt = 0;

    let liveApiKey = "";
    try {
      const tokenJson = await requestGeminiLiveTokenViaApi(
        modelLive,
        _buildLiveSystemInstructionActual()
      );
      liveApiKey = String(tokenJson?.token || "").trim();
      if (!liveApiKey) throw new Error("Token efímero vacío.");
    } catch (err) {
      throw new Error(`No se pudo crear token efímero para Live API: ${err?.message || "sin detalle"}`);
    }

    const { GoogleGenAI, Modality } = await _loadGoogleGenAiLiveModule();
    const ai = new GoogleGenAI({
      apiKey: liveApiKey,
      apiVersion: "v1alpha",
      httpOptions: { apiVersion: "v1alpha" }
    });

    geminiLiveSessionUnidad = await ai.live.connect({
      model: modelLive,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: _buildLiveSystemInstructionActual(),
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: charlyTtsVoiceName
            }
          }
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        thinkingConfig: {
          thinkingBudget: 0
        }
      },
      callbacks: {
        onopen: () => {
          if (geminiLiveActiveSessionEpoch !== sessionEpoch) return;
          geminiLiveIsOpen = true;
          geminiLiveSessionClosing = false;
          geminiLiveMicUploadPaused = !withMic;
          geminiLiveInputCircuitOpenUntil = 0;
          geminiLiveSessionConfigKey = desiredConfigKey;
          logVisual(`🎧 Live API conectada (${modelLive})`);
          if (_agenteUnidadEnModoExclusivo()) {
            _asegurarControladorAgenteUnidad().setMicState(withMic, withMic ? "live-open" : "live-open-no-mic");
          }
          _procesarColaHablaLive();
        },
        onmessage: (message) => {
          if (geminiLiveActiveSessionEpoch !== sessionEpoch) return;
          if (message?.serverContent?.interrupted) {
            _limpiarAudioGeminiProgramado();
            return;
          }

          const inputTx = message?.serverContent?.inputTranscription?.text || "";
          if (inputTx) {
            lastLiveInputAt = Date.now();
            logVisual(`🎤 [Live] ${inputTx}`);
            _programarProcesamientoLiveTranscripcion(inputTx);
          }

          const outTx = message?.serverContent?.outputTranscription?.text || "";
          if (outTx) {
            logVisual(`🗣️ [Gemini] ${outTx}`);
            _agregarMemoriaConversacion("assistant", outTx);
            if (charlyLecturaEnCurso && charlyLecturaPlan) {
              charlyLecturaPlan.chunkHadOutput = true;
            }
            if (_agenteUnidadEnModoExclusivo()) {
              _asegurarControladorAgenteUnidad().updateSpeechText(outTx);
            }
          }
          const permitirAudioSalida = Date.now() <= geminiLiveAllowOutputUntil;

          const parts = message?.serverContent?.modelTurn?.parts || [];
          parts.forEach((part) => {
            const data = part?.inlineData?.data || "";
            if (data) {
              if (charlyLecturaEnCurso && charlyLecturaPlan) {
                charlyLecturaPlan.chunkHadOutput = true;
              }
              if (permitirAudioSalida) _reproducirPcmGemini(data);
            }
          });
          if (_agenteUnidadEnModoExclusivo() && message?.serverContent?.turnComplete === true) {
            _programarCierreHablaAgenteLive("turn-complete");
          }
          if (charlyLecturaEnCurso && message?.serverContent?.turnComplete === true) {
            const plan = charlyLecturaPlan;
            const elapsed = Date.now() - Number(plan?.lastChunkSentAt || 0);
            const hadOutput = !!plan?.chunkHadOutput;
            if (hadOutput || elapsed > 1800) {
              _avanzarLecturaCompletaCharly("turnComplete");
            } else {
              logVisual("ℹ️ turnComplete sin audio del bloque; espero timer para avanzar.");
            }
          }
        },
        onerror: (e) => {
          if (geminiLiveActiveSessionEpoch !== sessionEpoch) return;
          geminiLiveIsOpen = false;
          geminiLiveSessionClosing = true;
          geminiLiveMicUploadPaused = true;
          geminiLiveInputCircuitOpenUntil = Date.now() + 4500;
          _setIndicadorHablandoCharly(false);
          if (_agenteUnidadEnModoExclusivo()) _asegurarControladorAgenteUnidad().setMicState(false, "live-error");
          logVisual(`❌ Live API error: ${e?.message || "desconocido"}`);
          geminiLiveSessionUnidad = null;
          geminiLiveSessionConfigKey = "";
          if (charlyLecturaEnCurso) {
            _programarReconectarLecturaLive("onerror");
            return;
          }
          _detenerLecturaCompletaCharly();
          _programarReconectarLive("onerror");
        },
        onclose: (e) => {
          if (geminiLiveActiveSessionEpoch !== sessionEpoch) return;
          geminiLiveIsOpen = false;
          geminiLiveSessionClosing = true;
          geminiLiveMicUploadPaused = true;
          geminiLiveInputCircuitOpenUntil = Date.now() + 4500;
          _setIndicadorHablandoCharly(false);
          if (_agenteUnidadEnModoExclusivo()) _asegurarControladorAgenteUnidad().setMicState(false, "live-close");
          logVisual(`🔌 Live API cerrada: ${e?.reason || "sin detalle"}`);
          geminiLiveSessionUnidad = null;
          geminiLiveSessionConfigKey = "";
          if (charlyLecturaEnCurso) {
            _programarReconectarLecturaLive("onclose");
            return;
          }
          _detenerLecturaCompletaCharly();
          _programarReconectarLive("onclose");
        }
      }
    });

    if (withMic) {
      await _asegurarCapturaMicGeminiLive(sessionEpoch);
    }
    return geminiLiveSessionUnidad;
  })();

  try {
    return await geminiLiveConnectPromise;
  } finally {
    geminiLiveConnectPromise = null;
  }
}

function actualizarEstadoBotonVozUnidad() {
  if (!btnVozUnidad) return;
  btnVozUnidad.dataset.active = unidadVoiceShouldRun ? "1" : "0";
  btnVozUnidad.innerHTML = unidadVoiceShouldRun
    ? '<i class="fa-solid fa-microphone-slash"></i><span class="unidad-btn-text"> Desactivar voz</span>'
    : '<i class="fa-solid fa-microphone"></i><span class="unidad-btn-text"> Activar voz</span>';
}

function _programarReintentoVozPorInteraccionUsuario() {
  if (unidadVoiceAwaitingUserGestureRetry) return;
  unidadVoiceAwaitingUserGestureRetry = true;
  const eventos = ["pointerdown", "keydown", "touchstart"];
  const handler = () => {
    eventos.forEach((evt) => window.removeEventListener(evt, handler, true));
    unidadVoiceAwaitingUserGestureRetry = false;
    if (!_vozGlobalHabilitadaPorConfiguracion() && !agentExclusiveVoiceMode) return;
    unidadVoiceShouldRun = true;
    charlyAwake = true;
    actualizarEstadoBotonVozUnidad();
    setTimeout(() => {
      if (unidadVoiceShouldRun && !unidadVoiceIsListening) {
        iniciarEscuchaVozUnidad();
      }
    }, 60);
  };
  eventos.forEach((evt) => window.addEventListener(evt, handler, { capture: true, once: true }));
  logVisual("🎤 Voz en espera de interacción para activar micrófono.");
}

function inicializarReconocimientoVozUnidad() {
  if (!SpeechRecognitionAPI) return null;
  if (unidadVoiceRecognition) return unidadVoiceRecognition;

  const recognition = new SpeechRecognitionAPI();
  recognition.lang = "es-MX";
  recognition.continuous = true;
  // Permite detectar wake-word antes del resultado final para responder más rápido.
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    unidadVoiceIsListening = true;
    unidadVoiceStartRetryMs = 650;
    clearTimeout(unidadVoiceRestartTimer);
    if (_agenteUnidadEnModoExclusivo()) {
      _asegurarControladorAgenteUnidad().setMode("listening");
      _asegurarControladorAgenteUnidad().setMicState(true, "global-shared");
    }
    actualizarEstadoBotonVozUnidad();
  };

  recognition.onend = () => {
    unidadVoiceIsListening = false;
    if (_agenteUnidadEnModoExclusivo()) {
      _asegurarControladorAgenteUnidad().setMicState(false, "global-shared");
    }
    actualizarEstadoBotonVozUnidad();
    const modalAbierto = modalUnidad?.style.display === "block";
    const shouldKeepListening = unidadVoiceShouldRun
      && (agentExclusiveVoiceMode || modalAbierto || charlyWakeWordAlwaysOn);
    if (!shouldKeepListening) return;
    clearTimeout(unidadVoiceRestartTimer);
    unidadVoiceRestartTimer = setTimeout(() => {
      if (unidadVoiceShouldRun && !unidadVoiceIsListening) iniciarEscuchaVozUnidad();
    }, 350);
  };

  recognition.onerror = (event) => {
    const err = event?.error || "desconocido";
    if (_agenteUnidadEnModoExclusivo()) {
      _asegurarControladorAgenteUnidad().setMicState(false, "global-shared");
    }
    if (err === "not-allowed" || err === "service-not-allowed") {
      // Algunos navegadores bloquean start() fuera de interacción de usuario.
      // Mantener comandos activos y reintentar en el próximo gesto.
      unidadVoiceShouldRun = true;
      actualizarEstadoBotonVozUnidad();
      _programarReintentoVozPorInteraccionUsuario();
      return;
    }
    if (err !== "no-speech" && err !== "aborted") {
      logVisual(`🎤 Error de reconocimiento de voz: ${err}`);
    }
  };

  recognition.onresult = (event) => {
    const result = event.results?.[event.results.length - 1];
    const transcript = result?.[0]?.transcript || "";
    if (!transcript) return;
    const norm = _normalizarTexto(transcript);
    if (!norm) return;
    if (_lecturasAgentIsAutoReadSpeaking()) {
      // Durante lectura automática, ignoramos reconocimiento para evitar
      // auto-comandos provocados por el propio audio del agente.
      return;
    }
    const isFinal = !!result?.isFinal;
    const inExclusiveAgent = _agenteUnidadEnModoExclusivo();
    const ignoredBySpeakingGate = _debeIgnorarEntradaPorHablaAgente(norm);
    // En modo agente exclusivo priorizamos captar respuestas finales del usuario
    // justo al terminar de hablar (ej: "sí", "no", "continuar").
    if (ignoredBySpeakingGate && !(inExclusiveAgent && isFinal)) return;
    if (inExclusiveAgent && !isFinal) return;
    if (!isFinal) {
      const esControlLectura = charlyLecturaEnCurso && (_esComandoDetenerLectura(norm) || _esComandoContinuarLectura(norm));
      const esComandoSistema =
        _esComandoDespertar(norm) ||
        _esComandoDescanso(norm) ||
        _esComandoSaludo(norm);
      if (!esComandoSistema && !esControlLectura) return;
    }
    const canon = _canonTextoVoz(transcript);
    if (geminiLiveSessionUnidad && geminiLiveIsOpen) {
      const now = Date.now();
      if (canon && canon === lastLiveTranscriptCanon && (now - Number(lastLiveTranscriptAt || 0)) < 2600) {
        // Evita doble ejecución (Live + SpeechRecognition) del mismo comando.
        return;
      }
    }
    logVisual(`🎤 Comando ${isFinal ? "final" : "interino"}: ${transcript}`);
    procesarComandoVozUnidad(transcript, { skipDedup: !isFinal }).catch(() => { });
  };

  unidadVoiceRecognition = recognition;
  return recognition;
}

function iniciarEscuchaVozUnidad() {
  if (!SpeechRecognitionAPI) {
    hablarUnidad("Tu navegador no soporta reconocimiento de voz.");
    return;
  }

  const recognition = inicializarReconocimientoVozUnidad();
  if (!recognition || unidadVoiceIsListening) return;
  try {
    recognition.start();
  } catch (err) {
    const name = String(err?.name || "").trim();
    const msg = String(err?.message || err || "").trim();
    const low = `${name} ${msg}`.toLowerCase();
    if (low.includes("invalidstateerror") || low.includes("already started")) return;
    if (low.includes("not-allowed") || low.includes("service-not-allowed") || low.includes("notallowederror")) {
      unidadVoiceShouldRun = true;
      actualizarEstadoBotonVozUnidad();
      _programarReintentoVozPorInteraccionUsuario();
      return;
    }
    if (!unidadVoiceShouldRun) return;
    clearTimeout(unidadVoiceRestartTimer);
    unidadVoiceRestartTimer = setTimeout(() => {
      if (unidadVoiceShouldRun && !unidadVoiceIsListening) iniciarEscuchaVozUnidad();
    }, unidadVoiceStartRetryMs);
    unidadVoiceStartRetryMs = Math.min(unidadVoiceStartRetryMs + 250, 1800);
    logVisual(`🎤 Reintentando escucha (${name || "Error"} ${msg || "sin detalle"})`);
  }
}

function iniciarEscuchaPasivaCharly() {
  if (!SpeechRecognitionAPI) return;
  if (!_vozGlobalHabilitadaPorConfiguracion()) {
    unidadVoiceShouldRun = false;
    actualizarEstadoBotonVozUnidad();
    return;
  }
  // Comandos globales directos (sin requerir abrir/cerrar agente).
  unidadVoiceShouldRun = true;
  if (typeof charlyAwake !== "undefined") charlyAwake = true;
  actualizarEstadoBotonVozUnidad();
  iniciarEscuchaVozUnidad();
}

function detenerEscuchaVozUnidad() {
  unidadVoiceShouldRun = false;
  voiceCopilotoPendiente = false;
  voiceCopilotoActivo = false;
  clearTimeout(unidadVoiceRestartTimer);
  if (unidadVoiceRecognition && unidadVoiceIsListening) {
    try { unidadVoiceRecognition.stop(); } catch (_) { }
  }
  detenerGeminiLiveUnidad().catch(() => { });
  unidadVoiceIsListening = false;
  actualizarEstadoBotonVozUnidad();
}

function mantenerEscuchaPasivaCharly() {
  // Mantiene a Charly disponible por wakeword sin dejar la sesión Live abierta.
  try {
    detenerGeminiLiveUnidad().catch(() => { });
  } catch (_) {
    // noop
  }
  if (!_vozGlobalHabilitadaPorConfiguracion()) {
    unidadVoiceShouldRun = false;
    voiceCopilotoPendiente = false;
    voiceCopilotoActivo = false;
    actualizarEstadoBotonVozUnidad();
    return;
  }
  unidadVoiceShouldRun = true;
  voiceCopilotoPendiente = false;
  voiceCopilotoActivo = false;
  if (typeof charlyAwake !== "undefined") charlyAwake = true;
  actualizarEstadoBotonVozUnidad();
  iniciarEscuchaVozUnidad();
}

async function iniciarAsistenteVozUnidad(options = {}) {
  const agentExclusive = options?.agentExclusive === true;
  if (!agentExclusive && !_vozGlobalHabilitadaPorConfiguracion()) {
    unidadVoiceShouldRun = false;
    _setAgentExclusiveVoiceMode(false);
    actualizarEstadoBotonVozUnidad();
    return false;
  }
  unidadVoiceShouldRun = true;
  _setAgentExclusiveVoiceMode(agentExclusive);
  // Al abrir el modal de unidad, Charly debe quedar activo para obedecer
  // comandos directos de selects sin requerir "despierta charly".
  charlyAwake = true;
  actualizarEstadoBotonVozUnidad();
  geminiLiveAllowOutputUntil = 0;
  try {
    await iniciarGeminiLiveUnidad({
      withMic: !agentExclusive,
      forceRestart: agentExclusive === true
    });
  } catch (err) {
    logVisual(`⚠️ Live API no disponible, uso reconocimiento local: ${err?.message || "sin detalle"}`);
  }

  setTimeout(() => {
    if (!unidadVoiceShouldRun || agentExclusiveVoiceMode) return;
    iniciarEscuchaVozUnidad();
  }, 350);
}

function _normalizarGeneroUsuario(value = "") {
  const raw = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (!raw) return "";
  if (["hombre", "masculino", "male", "m", "varon", "varón"].includes(raw)) return "male";
  if (["mujer", "femenino", "female", "f"].includes(raw)) return "female";
  return "";
}

function _extraerPrimerNombre(value = "") {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.split(" ")[0] || "";
}

async function _inferirGeneroUsuarioConGemini(nombre = "") {
  const clean = String(nombre || "").trim();
  if (!clean) return "neutral";
  try {
    const prompt = `Responde SOLO una palabra: male, female o neutral.
Nombre: ${clean}
Si no es claro, responde neutral.`;
    const raw = String(await enviarPrompt([{ role: "user", text: prompt }]) || "").toLowerCase();
    if (raw.includes("female")) return "female";
    if (raw.includes("male")) return "male";
    return "neutral";
  } catch (_) {
    return "neutral";
  }
}

async function _obtenerPersonaUsuarioActual() {
  const now = Date.now();
  const uid = String(auth?.currentUser?.uid || "").trim();
  if (!uid) return { name: "", gender: "neutral" };
  if (unidadUserPersonaCache.uid === uid && (now - Number(unidadUserPersonaCache.ts || 0)) < 300000) {
    return { name: unidadUserPersonaCache.name || "", gender: unidadUserPersonaCache.gender || "neutral" };
  }
  let userData = null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    userData = snap?.exists?.() ? (snap.data() || {}) : {};
  } catch (_) {
    userData = {};
  }
  const name = String(
    userData?.nombre
    || userData?.name
    || `${userData?.firstName || ""} ${userData?.lastName || ""}`.trim()
    || auth?.currentUser?.displayName
    || ""
  ).trim();
  const firstName = _extraerPrimerNombre(name);
  let gender = _normalizarGeneroUsuario(userData?.genero || userData?.gender || userData?.sexo || "");
  if (!gender && firstName) {
    gender = await _inferirGeneroUsuarioConGemini(firstName);
  }
  if (!gender) gender = "neutral";
  unidadUserPersonaCache = { ts: now, uid, name: firstName, gender };
  return { name: firstName, gender };
}

function _normalizarPerfilAgente(agentId = 0, value = {}) {
  const base = AGENT_PROFILE_DEFAULTS[Number(agentId)] || {};
  const generoRaw = String(value?.genero || base.genero || "female").trim().toLowerCase();
  const genero = generoRaw === "male" ? "male" : "female";
  const nombre = String(value?.nombre || base.nombre || `Agente ${agentId}`).trim();
  const descripcion = String(value?.descripcion || base.descripcion || "").trim();
  const identidad = String(value?.identidad || `Eres ${nombre}. ${descripcion || "Eres una agente pedagógica útil, clara y concreta."}`).trim();
  const speedRaw = Number(value?.speed ?? base.speed ?? 1);
  const pitchRaw = Number(value?.pitch ?? base.pitch ?? 1);
  const speed = Number.isFinite(speedRaw) ? Math.max(0.75, Math.min(1.35, speedRaw)) : 1;
  const pitch = Number.isFinite(pitchRaw) ? Math.max(0.75, Math.min(1.2, pitchRaw)) : 1;
  const fallbackVoice = genero === "male"
    ? (CHARLY_TTS_MALE_FALLBACKS[0] || "Orus")
    : (CHARLY_TTS_FEMALE_VOICES[0] || "Aoede");
  return {
    ...base,
    ...value,
    id: String(value?.id || base.id || `agente_${agentId}`),
    nombre,
    genero,
    voiceName: String(value?.voiceName || base.voiceName || fallbackVoice).trim() || fallbackVoice,
    mood: String(value?.mood || base.mood || "profesional").trim() || "profesional",
    locale: String(value?.locale || base.locale || "es-MX").trim() || "es-MX",
    speed,
    pitch,
    descripcion,
    identidad
  };
}

function _normalizarMapaPerfilesAgente(map = null) {
  const out = {};
  for (let i = 1; i <= 6; i += 1) {
    out[i] = _normalizarPerfilAgente(i, map?.[i] || AGENT_PROFILE_DEFAULTS[i] || {});
  }
  return out;
}

function _uidUsuarioActualAuth() {
  return String(auth?.currentUser?.uid || "").trim();
}

function _claveStoragePerfilesAgente(uid = "") {
  const cleanUid = String(uid || "").trim();
  return cleanUid ? `${AGENT_PROFILES_STORAGE_KEY}_${cleanUid}` : AGENT_PROFILES_STORAGE_KEY;
}

function _normalizarTimestampMs(value = 0) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function _normalizarEnvelopePerfiles(payload = null) {
  if (!payload || typeof payload !== "object") {
    return { profiles: _normalizarMapaPerfilesAgente(), updatedAt: 0, hasData: false };
  }
  const maybeProfiles = payload?.profiles && typeof payload.profiles === "object" ? payload.profiles : payload;
  const hasData = !!(payload?.profiles || Object.keys(maybeProfiles || {}).length);
  return {
    profiles: _normalizarMapaPerfilesAgente(maybeProfiles),
    updatedAt: _normalizarTimestampMs(payload?.updatedAt || payload?.agentProfilesUpdatedAt || 0),
    hasData
  };
}

function _leerPerfilesAgenteStorageDetallado(uid = "") {
  const safeUid = String(uid || _uidUsuarioActualAuth()).trim();
  const keyByUser = _claveStoragePerfilesAgente(safeUid);
  try {
    const raw = localStorage.getItem(keyByUser);
    if (raw) return _normalizarEnvelopePerfiles(JSON.parse(raw));
    if (safeUid) {
      return { profiles: _normalizarMapaPerfilesAgente(), updatedAt: 0, hasData: false };
    }
    const rawLegacy = localStorage.getItem(AGENT_PROFILES_STORAGE_KEY);
    if (!rawLegacy) return { profiles: _normalizarMapaPerfilesAgente(), updatedAt: 0, hasData: false };
    return _normalizarEnvelopePerfiles(JSON.parse(rawLegacy));
  } catch (_) {
    return { profiles: _normalizarMapaPerfilesAgente(), updatedAt: 0, hasData: false };
  }
}

function _leerPerfilesAgenteStorage(uid = "") {
  return _leerPerfilesAgenteStorageDetallado(uid).profiles;
}

function _guardarPerfilesAgenteStorage(map = null, uid = "", updatedAt = 0) {
  const safeUid = String(uid || _uidUsuarioActualAuth()).trim();
  const key = _claveStoragePerfilesAgente(safeUid);
  const ts = _normalizarTimestampMs(updatedAt || Date.now());
  const payload = {
    updatedAt: ts,
    profiles: _normalizarMapaPerfilesAgente(map)
  };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (_) {}
}

async function _leerPerfilesAgenteFirebase(uid = "") {
  const safeUid = String(uid || _uidUsuarioActualAuth()).trim();
  if (!safeUid) return null;
  try {
    const snap = await getDoc(doc(db, "users", safeUid));
    if (!snap?.exists?.()) return null;
    const data = snap.data() || {};
    const raw = data?.[AGENT_PROFILES_USER_FIELD];
    if (!raw || typeof raw !== "object") return null;
    return {
      profiles: _normalizarMapaPerfilesAgente(raw),
      updatedAt: _normalizarTimestampMs(data?.agentProfilesUpdatedAt || 0)
    };
  } catch (err) {
    logVisual(`⚠️ No se pudieron leer perfiles de agentes en Firebase: ${err?.message || "sin detalle"}`);
    return null;
  }
}

async function _guardarPerfilesAgenteFirebase(map = null, uid = "", updatedAt = 0) {
  const safeUid = String(uid || _uidUsuarioActualAuth()).trim();
  if (!safeUid) return false;
  const perfiles = _normalizarMapaPerfilesAgente(map);
  const ts = _normalizarTimestampMs(updatedAt || Date.now());
  const payload = {
    [AGENT_PROFILES_USER_FIELD]: perfiles,
    agentProfilesUpdatedAt: ts
  };
  try {
    await updateDoc(doc(db, "users", safeUid), payload);
    return true;
  } catch (err) {
    try {
      await setDoc(doc(db, "users", safeUid), payload, { merge: true });
      return true;
    } catch (errSet) {
      logVisual(`⚠️ No se pudieron guardar perfiles de agentes en Firebase: ${errSet?.message || err?.message || "sin detalle"}`);
      return false;
    }
  }
}

async function _resolverPerfilesAgentePorUsuario(uid = "") {
  const safeUid = String(uid || _uidUsuarioActualAuth()).trim();
  if (!safeUid) return false;
  const local = _leerPerfilesAgenteStorageDetallado(safeUid);
  const remote = await _leerPerfilesAgenteFirebase(safeUid);
  const localTs = _normalizarTimestampMs(local?.updatedAt || 0);
  const remoteTs = _normalizarTimestampMs(remote?.updatedAt || 0);
  let selectedProfiles = _normalizarMapaPerfilesAgente();
  let selectedTs = _normalizarTimestampMs(Date.now());
  let shouldPushRemote = false;

  if (remote?.profiles) {
    if (local?.hasData && localTs > (remoteTs + 1000)) {
      selectedProfiles = local.profiles;
      selectedTs = localTs || Date.now();
      shouldPushRemote = true;
    } else {
      selectedProfiles = remote.profiles;
      selectedTs = remoteTs || Date.now();
      shouldPushRemote = false;
    }
  } else if (local?.hasData) {
    selectedProfiles = local.profiles;
    selectedTs = localTs || Date.now();
    shouldPushRemote = true;
  } else {
    selectedProfiles = _normalizarMapaPerfilesAgente();
    selectedTs = Date.now();
    shouldPushRemote = true;
  }

  _aplicarPerfilesAgente(selectedProfiles, { persist: true, syncRemote: false, updatedAt: selectedTs });
  if (shouldPushRemote) await _guardarPerfilesAgenteFirebase(selectedProfiles, safeUid, selectedTs);
  return true;
}

async function _cargarPerfilesAgenteFirebase(options = {}) {
  const { force = false } = options || {};
  const uid = _uidUsuarioActualAuth();
  if (!uid) return false;
  if (!force && unidadAgentProfilesSyncState.uid === uid && unidadAgentProfilesSyncState.loaded) return true;
  if (unidadAgentProfilesSyncState.uid === uid && unidadAgentProfilesSyncState.loadingPromise) {
    return unidadAgentProfilesSyncState.loadingPromise;
  }
  const loader = (async () => {
    await _resolverPerfilesAgentePorUsuario(uid);
    unidadAgentProfilesSyncState = { uid, loaded: true, loadingPromise: null };
    return true;
  })().catch(() => {
    unidadAgentProfilesSyncState = { uid, loaded: true, loadingPromise: null };
    return false;
  });
  unidadAgentProfilesSyncState = { uid, loaded: false, loadingPromise: loader };
  return loader;
}

function _obtenerPerfilesAgente() {
  const uid = _uidUsuarioActualAuth();
  if (unidadAgentProfilesCache && unidadAgentProfilesCacheUid === uid) return _normalizarMapaPerfilesAgente(unidadAgentProfilesCache);
  unidadAgentProfilesCache = _leerPerfilesAgenteStorage(uid);
  unidadAgentProfilesCacheUid = uid;
  return _normalizarMapaPerfilesAgente(unidadAgentProfilesCache);
}

function _actualizarNombresAgenteEnFooter(map = null) {
  const perfiles = _normalizarMapaPerfilesAgente(map || _obtenerPerfilesAgente());
  document.querySelectorAll(".unidad-agent-card").forEach((card) => {
    const id = Number(card?.dataset?.agentId || 0);
    const profile = perfiles[id];
    if (!profile) return;
    const nameEl = card.querySelector(".unidad-agent-name");
    if (nameEl) {
      const nombre = String(profile.nombre || `Agente ${id}`);
      const labelEl = nameEl.querySelector(".unidad-agent-name-label");
      if (labelEl) {
        labelEl.textContent = nombre;
      } else {
        nameEl.textContent = nombre;
      }
    }
    card.dataset.agentGender = String(profile.genero || "female");
    card.title = `${profile.nombre || `Agente ${id}`}`;
  });
}

function _aplicarPerfilesAgente(map = null, options = {}) {
  const { persist = false, syncRemote = persist, updatedAt = 0 } = options || {};
  const ctrl = (() => {
    try { return _asegurarControladorAgenteUnidad(); } catch (_) { return null; }
  })();
  const activeId = Number(ctrl?.getActiveAgentId?.() || 0);
  const prevPersona = activeId > 0 ? _normalizarPerfilAgente(activeId, activeUnidadAgentPersona || {}) : null;
  const perfiles = _normalizarMapaPerfilesAgente(map || _obtenerPerfilesAgente());
  unidadAgentProfilesCache = perfiles;
  unidadAgentProfilesCacheUid = _uidUsuarioActualAuth();
  const ts = _normalizarTimestampMs(updatedAt || Date.now());
  if (persist) _guardarPerfilesAgenteStorage(perfiles, unidadAgentProfilesCacheUid, ts);
  if (syncRemote) {
    _guardarPerfilesAgenteFirebase(perfiles, unidadAgentProfilesCacheUid, ts).catch(() => {});
  }
  try { ctrl?.setPersonas?.(perfiles); } catch (_) {}
  if (activeId > 0 && prevPersona) {
    const nextPersona = _normalizarPerfilAgente(activeId, perfiles[activeId] || {});
    const changed =
      String(prevPersona.voiceName || "") !== String(nextPersona.voiceName || "")
      || String(prevPersona.mood || "") !== String(nextPersona.mood || "")
      || String(prevPersona.locale || "") !== String(nextPersona.locale || "")
      || Number(prevPersona.speed || 1) !== Number(nextPersona.speed || 1)
      || Number(prevPersona.pitch || 1) !== Number(nextPersona.pitch || 1);
    if (changed) {
      _actualizarVozCharlyDesdeThemeSettings();
      _programarReinicioLivePorCambioVoz();
    }
  }
  _actualizarNombresAgenteEnFooter(perfiles);
  return perfiles;
}

function _inicializarSincronizacionPerfilesAgentePorAuth() {
  if (unidadAgentProfilesAuthWatcherReady) return;
  unidadAgentProfilesAuthWatcherReady = true;
  try {
    onAuthStateChanged(auth, (user) => {
      const uid = String(user?.uid || "").trim();
      unidadUserPersonaCache = { ts: 0, uid: "", name: "", gender: "neutral" };
      unidadAgentProfilesCache = null;
      unidadAgentProfilesCacheUid = "";
      unidadAgentProfilesSyncState = { uid: "", loaded: false, loadingPromise: null };
      _aplicarPerfilesAgente(_obtenerPerfilesAgente(), { persist: false, syncRemote: false });
      if (!uid) return;
      _cargarPerfilesAgenteFirebase({ force: true }).catch(() => {});
    });
  } catch (_) {}
}

function _vocesPorGenero(genero = "female") {
  if (String(genero || "").trim().toLowerCase() === "male") {
    return Array.from(new Set(CHARLY_TTS_MALE_FALLBACKS));
  }
  return Array.from(new Set(CHARLY_TTS_FEMALE_VOICES));
}

function _inicializarModalConfigAgentes() {
  const modal = document.getElementById("unidadAgentConfigModal");
  const btnOpen = document.getElementById("btnUnidadAgentesConfig");
  const closeElems = modal ? Array.from(modal.querySelectorAll("[data-action='close-agent-config']")) : [];
  const selAgent = document.getElementById("unidadAgentCfgAgentId");
  const inputName = document.getElementById("unidadAgentCfgName");
  const selGender = document.getElementById("unidadAgentCfgGender");
  const selVoice = document.getElementById("unidadAgentCfgVoice");
  const selMood = document.getElementById("unidadAgentCfgMood");
  const inputSpeed = document.getElementById("unidadAgentCfgSpeed");
  const inputPitch = document.getElementById("unidadAgentCfgPitch");
  const inputDesc = document.getElementById("unidadAgentCfgDescription");
  const btnSave = document.getElementById("unidadAgentCfgSave");
  if (!modal || !btnOpen || !selAgent || !inputName || !selGender || !selVoice || !selMood || !inputSpeed || !inputPitch || !inputDesc || !btnSave) return;
  if (modal.dataset.boundAgentCfg === "1") return;
  modal.dataset.boundAgentCfg = "1";

  const fillVoiceOptions = (gender = "female", selected = "") => {
    const voices = _vocesPorGenero(gender);
    const selectedVoice = String(selected || "").trim();
    const list = [...voices];
    if (selectedVoice && !list.includes(selectedVoice)) list.unshift(selectedVoice);
    selVoice.innerHTML = list.map((v) => `<option value="${v}">${v}</option>`).join("");
    const target = String(selected || voices[0] || "").trim();
    if (target) selVoice.value = target;
  };

  const fillAgentForm = (agentId = 1) => {
    const perfiles = _obtenerPerfilesAgente();
    const p = perfiles[Number(agentId)] || _normalizarPerfilAgente(agentId, {});
    inputName.value = String(p.nombre || "");
    selGender.value = String(p.genero || "female");
    fillVoiceOptions(selGender.value, String(p.voiceName || ""));
    selMood.value = String(p.mood || "profesional");
    inputSpeed.value = Number(p.speed || 1).toFixed(2);
    inputPitch.value = Number(p.pitch || 1).toFixed(2);
    inputDesc.value = String(p.descripcion || "");
  };

  const open = async () => {
    await _cargarPerfilesAgenteFirebase({ force: true }).catch(() => {});
    const perfiles = _obtenerPerfilesAgente();
    selAgent.innerHTML = Object.keys(perfiles).map((k) => {
      const id = Number(k);
      const p = perfiles[id];
      const nombre = String(p?.nombre || `Agente ${id}`);
      return `<option value="${id}">Agente ${id}: ${nombre}</option>`;
    }).join("");
    selAgent.value = "1";
    fillAgentForm(1);
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  };

  const close = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  };

  btnOpen.addEventListener("click", () => { open().catch(() => {}); });
  closeElems.forEach((el) => el.addEventListener("click", close));
  selAgent.addEventListener("change", () => fillAgentForm(Number(selAgent.value || 1)));
  selGender.addEventListener("change", () => fillVoiceOptions(selGender.value, selVoice.value));
  btnSave.addEventListener("click", async () => {
    const id = Number(selAgent.value || 1);
    const uid = _uidUsuarioActualAuth();
    const ts = Date.now();
    const perfiles = _obtenerPerfilesAgente();
    const prev = perfiles[id] || _normalizarPerfilAgente(id, {});
    perfiles[id] = _normalizarPerfilAgente(id, {
      ...prev,
      nombre: inputName.value,
      genero: selGender.value,
      voiceName: selVoice.value,
      mood: selMood.value,
      speed: Number(inputSpeed.value || prev.speed || 1),
      pitch: Number(inputPitch.value || prev.pitch || 1),
      descripcion: inputDesc.value
    });
    _aplicarPerfilesAgente(perfiles, { persist: true, syncRemote: false, updatedAt: ts });
    if (uid) {
      await _guardarPerfilesAgenteFirebase(perfiles, uid, ts).catch(() => false);
      unidadAgentProfilesSyncState = { uid, loaded: true, loadingPromise: null };
    }
    fillAgentForm(id);
    if (selAgent.options[selAgent.selectedIndex]) {
      selAgent.options[selAgent.selectedIndex].textContent = `Agente ${id}: ${perfiles[id].nombre}`;
    }
  });
}

function _asegurarControladorAgenteUnidad() {
  if (unidadAgentController) return unidadAgentController;
  unidadAgentController = createUnidadAgentController({
    log: logVisual,
    useExternalVoiceInput: true,
    normalizeText: _normalizarTexto,
    canonText: _canonTextoVoz,
    normalizeOrdinal: _normalizarNumeroOrdinarioTexto,
    isAgentUiEnabled: _esAgenteMasterHabilitado,
    setExclusiveVoiceMode: _setAgentExclusiveVoiceMode,
    startVoiceAssistant: iniciarAsistenteVozUnidad,
    stopVoiceAssistant: ({ reason } = {}) => {
      // Cerrar el stage de agente NO debe apagar los comandos de voz globales.
      // Solo salimos del modo exclusivo para permitir que la escucha global retome.
      if (String(reason || "").trim() === "close-agent-stage") {
        _setAgentExclusiveVoiceMode(false);
        return;
      }
      detenerEscuchaVozUnidad();
    },
    stopSpeech: () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    speakAsAgent: hablarAgenteUnidad,
    syncAcademicContext: (agentState) => {
      _asegurarValorSelect(document.getElementById("unidadNivel"), agentState?.nivel || "Primaria");
      _asegurarValorSelect(document.getElementById("unidadGrado"), agentState?.grado || "");
      if (agentState?.trimestre) _asegurarValorSelect(document.getElementById("unidadTrimestre"), agentState.trimestre);
      if (agentState?.unidad) _asegurarValorSelect(document.getElementById("unidadNumero"), agentState.unidad);
      guardarSelectsUnidad();
    },
    syncReadingDraftContext: (agentState) => {
      _asegurarValorSelect(document.getElementById("nivelNuevo"), agentState?.nivel || "Primaria");
      _asegurarValorSelect(document.getElementById("gradoNuevo"), agentState?.grado || "");
      _asegurarValorSelect(document.getElementById("trimestreNuevo"), agentState?.trimestre || "");
      _asegurarValorSelect(document.getElementById("unidadNuevo"), agentState?.unidad || "");
    },
    onActiveAgentChange: (agentId, persona) => {
      activeUnidadAgentPersona = persona || null;
    },
    getInitialPersonas: () => _obtenerPerfilesAgente(),
    getUserPersona: _obtenerPersonaUsuarioActual,
    onCommandConsumed: (transcripcion = "") => {
      const canon = _canonTextoVoz(transcripcion || "");
      charlyPendingCommand = "";
      charlyPendingCommandCanon = "";
      if (!canon) return;
      charlyLastHandledCanon = canon;
      charlyLastHandledAt = Date.now();
    },
    openUnitSection: abrirGenerarUnidadNuevaSeccion,
    parseGlobalResources: _parseRecursosGlobalesDesdeTexto,
    configureGlobalResources: _configurarRecursosGlobalesEnTabla,
    applyResourceOverrideByText: (raw) => _setTablaSecuenciaCheckboxByVoiceTarget("", "", raw),
    preferCollectionFromText: _preferenciaColeccionLecturaDesdeTexto,
    extractTitleFromCommand: _extraerTituloLecturaDesdeComando,
    selectLectureForUnit: _seleccionarLecturaParaUnidadDesdeColeccion,
    executeReadingAction: async (action, collection, title, raw) => {
      if (action === "buscar") return _buscarLecturaPorVozTarget(collection, title, raw);
      if (action === "leer") return _leerLecturaPorVozTarget(collection, title, raw);
      return false;
    },
    clearReadingWorkflowState: () => _limpiarPendientesLecturaParaAgente(),
    processReadingWorkflowInput: async (raw) => _resolverPendientesLecturaPorVoz(raw),
    isReadingConversationActive: () => {
      if (!voiceRespuestaContinuaActiva) return false;
      return !!String(charlyLecturaContextoConversacion?.id || "").trim();
    },
    processReadingConversationInput: async (raw) => _responderConversacionContinuaConGemini(raw),
    getReadingWorkflowState: () => _estadoPendientesLecturaParaAgente(),
    createUnitFromCurrentReading: async () => _crearUnidadDesdeLecturaActualParaAgente(),
    generateAllUnit: () => document.getElementById("btnGenerarTodo")?.click(),
    openUnitResult: abrirModalResultadoUnidad,
    generateCategoryByVoiceText: (raw) => _generarCategoriaByVoiceTarget("", "", raw)
  });
  _actualizarNombresAgenteEnFooter(unidadAgentController.getPersonas?.() || _obtenerPerfilesAgente());
  return unidadAgentController;
}

function abrirModalResultadoUnidad() {
  restaurarResultadoUnidadDesdeStorage();
  adaptarTablasResultadoResponsive();
  if (modalResultadoUnidad) modalResultadoUnidad.style.display = "block";
}

function prepararNuevoResultadoUnidad() {
  const cont = document.getElementById("resultadoUnidadGenerada");
  if (cont) cont.innerHTML = "";
  limpiarResultadoUnidadEnStorage();
  window.tablaInicialInsertada = false;
  window.rutaYTablaInsertadasEnNotas = false;
  window.notasMaestroAcumuladas = "";
  window.respuestaFinal = "";
}

function abrirGenerarUnidadNuevaSeccion() {
  const panel = modalUnidad?.querySelector(".unidad-editor-panel, .unidad-panel");
  const mostrandoSoloSeccion = !!panel?.classList?.contains("solo-seccion-activa");
  if (modalUnidad?.style?.display === "block" && !mostrandoSoloSeccion) return true;
  mostrarHostUnidad({ soloSeccion: false });
  cerrarModalesAcopladosUnidad();
  acoplarModalesSeccionEnUnidad();
  guardarSeccionActiva("modalGenerarUnidad");
  setTimeout(() => {
    verificarSecuencia();
  }, 60);
  iniciarAsistenteVozUnidad().catch(() => { });
  return true;
}

function detenerGeneracionUnidadGlobal() {
  window.stopRequestedUnidad = true;
  cancelarGeneracionProyectos();
  window.onGeminiStatus = null;
  logVisual("⏹ Generación de la unidad detenida por el usuario.");
}

async function regenerarResultadoUnidadDesdeToolbar() {
  const categoriaObjetivo =
    window.generandoCategoria ||
    window.categoriaEnProceso ||
    window.ultimaCategoriaFallida ||
    window.ultimaCategoriaIntentada ||
    "";

  if (!categoriaObjetivo) {
    alert("⚠️ No hay una categoría específica para reintentar todavía.");
    return;
  }

  detenerGeneracionUnidadGlobal();
  for (let i = 0; i < 30 && window.generandoCategoria; i++) {
    await sleep(150);
  }
  limpiarResultadoCategoria(categoriaObjetivo);
  window.stopRequestedUnidad = false;
  window.cancelarProyectos = false;
  window.categoriaEnProceso = "";
  window.generandoCategoria = null;
  abrirModalResultadoUnidad();
  window.ultimaCategoriaIntentada = categoriaObjetivo;
  await generarSeccionCategoria(categoriaObjetivo);
}


// Modal
btnAbrirModal?.addEventListener("click", () => {
  abrirGenerarUnidadNuevaSeccion();
});

cerrarModal?.addEventListener("click", () => {
  setUnidadWorkspaceMode(false);
  const panel = modalUnidad?.querySelector(".unidad-editor-panel, .unidad-panel");
  if (panel) panel.classList.remove("solo-seccion-activa");
  modalUnidad.style.display = "none";
  guardarSeccionActiva("");
  mantenerEscuchaPasivaCharly();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
});

btnVozUnidad?.addEventListener("click", () => {
  if (unidadVoiceShouldRun) {
    detenerEscuchaVozUnidad();
    hablarUnidad("Voz desactivada.");
    return;
  }
  iniciarAsistenteVozUnidad().catch(() => { });
});

btnAbrirResultadoUnidad?.addEventListener("click", () => {
  abrirModalResultadoUnidad();
});
btnAbrirResultadoUnidadTop?.addEventListener("click", () => {
  abrirModalResultadoUnidad();
});

cerrarModalResultadoUnidad?.addEventListener("click", () => {
  if (modalResultadoUnidad) modalResultadoUnidad.style.display = "none";
  mantenerEscuchaPasivaCharly();
});

window.addEventListener("cb-ui-modal-closed", () => {
  // Si la voz está activa, reasegura escucha tras cerrar modales de configuración u otros.
  if (!unidadVoiceShouldRun) return;
  setTimeout(() => {
    if (!unidadVoiceShouldRun) return;
    if (!unidadVoiceIsListening) iniciarEscuchaVozUnidad();
  }, 120);
});

btnDetenerGeneracionUnidad?.addEventListener("click", detenerGeneracionUnidadGlobal);
btnRegenerarResultadoUnidad?.addEventListener("click", () => {
  regenerarResultadoUnidadDesdeToolbar().catch(() => {
    alert("❌ No se pudo regenerar la unidad.");
  });
});

// Carga lecturas por nivel y grado





function verificarEstadoLecturas() {

  // Verificar checkboxes de relación
  document.querySelectorAll('input[name^="relacion_"]').forEach(chk => {
    const nombre = chk.name;
    const subtema = nombre.replace('relacion_', '');
  });
}

function _normalizarTexto(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function _labelLecturaPrincipal(lectura = {}) {
  const titulo = lectura.titulo || lectura.tema || "Sin título";
  const nivel = lectura.nivel || "N/A";
  const grado = lectura.grado || "N/A";
  const trimestre = lectura.trimestre || "N/A";
  const unidad = lectura.unidad || "N/A";
  const tipo = lectura.tipo === "principal" ? "Principal" : "ASC";
  return `${titulo} [${nivel}, ${grado}, T${trimestre}, U${unidad}] - ${tipo}`;
}

function _poolLecturasBusqueda() {
  const pool = [
    ...(Array.isArray(window.todasLasLecturas) ? window.todasLasLecturas : []),
    ...(Array.isArray(window.lecturasNuevas) ? window.lecturasNuevas : []),
    ...(Array.isArray(window.lecturasASC) ? window.lecturasASC : []),
    ...(Array.isArray(window.lecturasFiltradas) ? window.lecturasFiltradas : [])
  ];
  const seen = new Set();
  return pool.filter((l) => {
    const id = String(l?.id || "").trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function _refrescarOpcionesInputTema(filtro = "") {
  if (!inputTemaTexto) return;
  const q = _normalizarTexto(filtro);
  const lecturas = _poolLecturasBusqueda();
  const filtradas = q
    ? lecturas.filter((l) => _normalizarTexto(l.titulo || l.tema || "").includes(q))
    : lecturas;
  const prev = String(inputTemaTexto.value || "");
  inputTemaTexto.innerHTML = '<option value="">Selecciona una lectura</option>';
  filtradas.slice(0, 250).forEach((l) => {
    const opt = document.createElement("option");
    opt.value = String(l.id || "");
    opt.textContent = String(l.titulo || l.tema || "Sin título");
    inputTemaTexto.appendChild(opt);
  });
  if (prev && Array.from(inputTemaTexto.options || []).some((o) => String(o.value) === prev)) {
    inputTemaTexto.value = prev;
  }
}

function _sincronizarInputTemaConSelect() {
  if (!inputTemaTexto || !selectTema) return;
  const id = String(selectTema.value || "").trim();
  if (!id) {
    inputTemaTexto.value = "";
    return;
  }
  if (!Array.from(inputTemaTexto.options || []).some((o) => String(o.value) === id)) {
    _refrescarOpcionesInputTema("");
  }
  inputTemaTexto.value = id;
}

function _aplicarLecturaPrincipalSeleccionada(lectura = null) {
  if (!lectura || !lectura.id) return false;
  if (!selectTema) return false;
  _guardarLecturaCache(lectura);
  selectTema.innerHTML = `<option value="${lectura.id}">${_labelLecturaPrincipal(lectura)}</option>`;
  selectTema.value = lectura.id;
  selectTema.dispatchEvent(new Event("change", { bubbles: true }));
  if (selectTemaASC) selectTemaASC.value = "";
  _sincronizarInputTemaConSelect();
  guardarSelectsUnidad();
  return true;
}

function _filtrarLecturasDesdeInputTema(raw = "") {
  const texto = String(raw || "").trim();
  _refrescarOpcionesInputTema(texto);
  const modal = document.getElementById("modalSeleccionarLectura");
  const abierto = !!(modal && modal.style.display === "flex");
  if (!abierto) return;
  const inpFiltro = document.getElementById("filtroBusquedaLectura");
  if (!inpFiltro || !("value" in inpFiltro)) return;
  inpFiltro.value = texto;
  inpFiltro.dispatchEvent(new Event("input", { bubbles: true }));
  if (typeof window.aplicarFiltrosModal === "function") {
    try { window.aplicarFiltrosModal(); } catch (_) { }
  }
}

async function _aplicarBusquedaManualTema(raw = "") {
  const texto = String(raw || "").trim();
  if (!texto) {
    if (selectTema) {
      selectTema.value = "";
      selectTema.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return false;
  }

  const t = _normalizarTexto(texto);
  if (!_poolLecturasBusqueda().length) {
    try { await cargarTodasLasLecturas({ forceRefresh: true }); } catch (_) { }
  }
  const lecturas = _poolLecturasBusqueda();
  let best = null;
  let bestScore = 0;
  lecturas.forEach((l) => {
    const titulo = _normalizarTexto(l.titulo || l.tema || "");
    if (!titulo) return;
    let score = 0;
    if (titulo === t) score += 12;
    if (titulo.startsWith(t)) score += 9;
    if (titulo.includes(t)) score += 7;
    const tokens = t.split(/\s+/).filter(Boolean);
    tokens.forEach((tk) => { if (titulo.includes(tk)) score += 2; });
    if (score > bestScore) {
      best = l;
      bestScore = score;
    }
  });

  if (best && bestScore >= 4) {
    return _aplicarLecturaPrincipalSeleccionada(best);
  }

  // Fallback completo: usa lógica existente que puede consultar fuentes remotas.
  const ok = await aplicarLecturaPrincipalPorVoz(texto);
  if (ok) _sincronizarInputTemaConSelect();
  return !!ok;
}

function _extraerConsultaLecturaSimple(texto = "") {
  const norm = _normalizarTexto(texto);
  if (!norm) return "";
  const patrones = [
    /(?:selecciona|seleccionar|buscar|busca|elige|pon)\s+(?:la\s+)?(?:lectura|titulo|título)\s*(?:es|se\s+llama|:)?\s+(.+)$/i,
    /(?:la\s+)?lectura\s*(?:es|se\s+llama)\s+(.+)$/i
  ];
  for (const rx of patrones) {
    const m = norm.match(rx);
    if (m?.[1]) return String(m[1]).replace(/^[:\-.,\s]+/, "").trim();
  }
  return "";
}

async function _manejarLecturaPorVozSimple(transcripcion = "") {
  const raw = String(transcripcion || "").trim();
  const norm = _normalizarTexto(raw);
  if (!norm) return false;

  const activePending = !!(voicePendingInputCapture
    && voicePendingInputCapture.target === "unidadTemaTexto"
    && Date.now() <= Number(voicePendingInputCapture.expiresAt || 0));

  const consulta = _extraerConsultaLecturaSimple(raw);

  if (!consulta && activePending) {
    if (!/\b(cancela|cancelar|olvida|deten|parar|alto|charly|abre|abrir|cierra|cerrar)\b/i.test(norm)) {
      voicePendingInputCapture = null;
      if (inputTemaTexto) {
        inputTemaTexto.value = raw;
        inputTemaTexto.dispatchEvent(new Event("input", { bubbles: true }));
      }
      await _aplicarBusquedaManualTema(raw);
      return true;
    }
    return false;
  }

  const triggerLectura = /\b(selecciona|seleccionar|buscar|busca|elige|pon)\s+(?:la\s+)?(?:lectura|titulo|título)\b/i.test(norm)
    || /\blectura\s+(?:es|se\s+llama)\b/i.test(norm);
  if (!triggerLectura) return false;

  if (!consulta) {
    voicePendingInputCapture = {
      target: "unidadTemaTexto",
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000
    };
    hablarUnidad("Dime el título de la lectura.", { cancelarPrevio: true });
    return true;
  }

  if (inputTemaTexto) {
    inputTemaTexto.value = consulta;
    inputTemaTexto.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const ok = await _aplicarBusquedaManualTema(consulta);
  const speakCfg = _debeResponderComando("modal_lecturas_buscar_texto", false);
  if (speakCfg) {
    hablarUnidad(ok ? `Seleccioné ${consulta}.` : `No encontré ${consulta}.`, { cancelarPrevio: true });
  }
  return true;
}

function _obtenerMateriaSeleccionadaUnidad() {
  const selectTema = document.getElementById("unidadTema");
  const idLectura = selectTema?.value;
  if (!idLectura) return "";

  const lecturaSel =
    (Array.isArray(window.lecturasFiltradas) && window.lecturasFiltradas.find(l => l.id === idLectura)) ||
    (Array.isArray(window.lecturasNuevas) && window.lecturasNuevas.find(l => l.id === idLectura)) ||
    (Array.isArray(window.lecturasASC) && window.lecturasASC.find(l => l.id === idLectura)) ||
    null;

  return lecturaSel?.materia || "";
}

async function _resolverLecturaPorId(idLectura = "") {
  if (!idLectura) return null;
  const lecturaCache = _leerLecturaCache();
  if (lecturaCache?.id === idLectura) {
    return {
      id: lecturaCache.id,
      titulo: lecturaCache.titulo,
      tema: lecturaCache.tema || lecturaCache.sinopsis || lecturaCache.titulo,
      nivel: lecturaCache.nivel,
      grado: lecturaCache.grado,
      trimestre: lecturaCache.trimestre,
      unidad: lecturaCache.unidad,
      tipo: lecturaCache.tipo || "principal",
      autorReferencia: lecturaCache.autor || "",
      tipoTexto: lecturaCache.tipoTexto || "",
      ejeArticulador: lecturaCache.ejeArticulador || "",
      preguntas: Array.isArray(lecturaCache.preguntas) ? lecturaCache.preguntas : [],
      contenidoPlano: lecturaCache.contenidoCompleto || "",
      campos: lecturaCache.campos || {}
    };
  }
  const pool = [
    ...(Array.isArray(window.lecturasNuevas) ? window.lecturasNuevas : []),
    ...(Array.isArray(window.lecturasASC) ? window.lecturasASC : []),
    ...(Array.isArray(window.lecturasFiltradas) ? window.lecturasFiltradas : []),
    ...(Array.isArray(window.todasLasLecturas) ? window.todasLasLecturas : [])
  ];
  let lectura = pool.find(l => l.id === idLectura) || null;
  if (lectura) return lectura;

  // Fallback: leer documento directo por ID en ambas colecciones.
  try {
    const refNueva = doc(db, "lecturasNuevas", idLectura);
    const snapNueva = await getDoc(refNueva);
    if (snapNueva.exists()) return { id: snapNueva.id, ...snapNueva.data(), tipo: "principal" };
  } catch (_) { }
  try {
    const refASC = doc(db, "lecturasASC", idLectura);
    const snapASC = await getDoc(refASC);
    if (snapASC.exists()) return { id: snapASC.id, ...snapASC.data(), tipo: "asc" };
  } catch (_) { }
  return null;
}

function _puntuarSecuenciaDoc(docData = {}, categorias = {}, materiaObjetivo = "") {
  const materiaDoc = _normalizarTexto(docData.materia || "");
  const materiaObj = _normalizarTexto(materiaObjetivo || "");
  let score = 0;

  // Prioridad fuerte: materia coincidente cuando existe.
  if (materiaObj && materiaDoc && materiaDoc === materiaObj) score += 250;
  if (materiaObj && !materiaDoc) score += 20; // legado sin campo materia
  if (materiaObj && materiaDoc && materiaDoc !== materiaObj) score -= 200;

  // Cobertura curricular: más claves T/AE/C/P presentes => mayor score.
  const subtemasEsperados = Object.values(categorias).flat();
  subtemasEsperados.forEach((sub) => {
    const base = String(sub).replace(/\s+/g, "_");
    ["T", "AE", "C", "P"].forEach((tipo) => {
      if (docData?.[`${base}_${tipo}`]) score += 2;
    });
  });

  // Desempate por fecha.
  const fecha = docData?.updatedAt?.toDate?.()
    || docData?.fechaCreacion
    || docData?.timestamp
    || null;
  const ts = fecha ? new Date(fecha).getTime() : 0;
  score += Number.isFinite(ts) ? (ts / 1e13) : 0;

  return score;
}

function _seleccionarMejorSecuenciaDoc(docs = [], categorias = {}, materiaObjetivo = "") {
  if (!Array.isArray(docs) || !docs.length) return null;
  let best = docs[0];
  let bestScore = _puntuarSecuenciaDoc(best, categorias, materiaObjetivo);
  for (let i = 1; i < docs.length; i++) {
    const current = docs[i];
    const score = _puntuarSecuenciaDoc(current, categorias, materiaObjetivo);
    if (score > bestScore) {
      best = current;
      bestScore = score;
    }
  }
  return best;
}


async function actualizarTemasLecturas() {
  const nivel = selectNivel.value;
  const gradoTexto = selectGrado.value;
  const gradoNumero = gradoMap[gradoTexto];
  const selectTema = document.getElementById('unidadTema');
  const temaActual = selectTema?.value || "";

  // Verificar si hay una selección bloqueada por el usuario
  const seleccionModal = localStorage.getItem('lecturaSeleccionadaDesdeModal') === 'true';
  const ultimaLectura = localStorage.getItem('ultimaLecturaSeleccionada');

  if (seleccionModal && ultimaLectura) {
    const pool = _poolLecturasBusqueda();
    let lecturaBloqueada = pool.find((l) => String(l?.id || "") === String(ultimaLectura)) || null;
    if (!lecturaBloqueada) {
      try {
        lecturaBloqueada = await _resolverLecturaPorId(ultimaLectura);
      } catch (_) {
        lecturaBloqueada = null;
      }
    }
    const coincide = _lecturaCoincideConContexto(lecturaBloqueada, {
      nivel,
      grado: gradoNumero || gradoTexto,
      trimestre: selectTrimestre?.value || "",
      unidad: selectUnidad?.value || ""
    });
    if (coincide) {
      return; // Mantener selección manual solo si coincide con el contexto actual
    }
    // Si cambió el contexto, liberar bloqueo y limpiar lectura obsoleta.
    localStorage.removeItem('lecturaSeleccionadaDesdeModal');
    localStorage.removeItem('ultimaLecturaSeleccionada');
    if (selectTema) selectTema.value = "";
    if (inputTemaTexto) inputTemaTexto.value = "";
  }

  if (!nivel || !gradoNumero) {
    if (selectTema) {
      selectTema.innerHTML = '<option value="">Selecciona nivel y grado primero</option>';
    }
    _sincronizarInputTemaConSelect();
    _refrescarOpcionesInputTema("");
    guardarSelectsUnidad();
    return;
  }

  // Si ya hay lectura seleccionada, no sobreescribirla en cada verificación.
  if (temaActual) {
    let lecturaActual = _poolLecturasBusqueda().find((l) => String(l?.id || "") === String(temaActual)) || null;
    if (!lecturaActual) {
      try {
        lecturaActual = await _resolverLecturaPorId(temaActual);
      } catch (_) {
        lecturaActual = null;
      }
    }
    const coincide = _lecturaCoincideConContexto(lecturaActual, {
      nivel,
      grado: gradoNumero || gradoTexto,
      trimestre: selectTrimestre?.value || "",
      unidad: selectUnidad?.value || ""
    });
    if (!coincide) {
      if (selectTema) selectTema.value = "";
      if (inputTemaTexto) inputTemaTexto.value = "";
    }
    guardarSelectsUnidad();
    if (coincide) return;
  }

  // Si llegamos aquí, limpiar el bloqueo
  localStorage.removeItem('lecturaSeleccionadaDesdeModal');

  // Limpiar select y mostrar botón de búsqueda
  if (selectTema) {
    selectTema.innerHTML = `
      <option value="">Usa el botón "Buscar" para seleccionar lectura</option>
    `;
  }
  _sincronizarInputTemaConSelect();
  _refrescarOpcionesInputTema("");
  guardarSelectsUnidad();
}


async function actualizarLecturasASC() {
  const nivel = selectNivel.value;
  const gradoTexto = selectGrado.value;
  const gradoNumero = gradoMap[gradoTexto];
  if (!nivel || !gradoNumero) return;

  try {
    const q = query(
      collection(db, "lecturasASC"),
      where("nivel", "==", nivel),
      where("grado", "==", gradoNumero)
    );
    const snap = await getDocs(q);
    const materiaObjetivo = _obtenerMateriaSeleccionadaUnidad();
    lecturasASC = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // ✅ IMPORTANTE: Guardar también en variable global
    window.lecturasASC = lecturasASC;

    selectTemaASC.innerHTML = "<option value=''>Selecciona lectura ASC</option>";
    lecturasASC.forEach(l => {
      const option = document.createElement("option");
      option.value = l.id;

      const titulo = l.tema || l.titulo || "Sin título";
      const nivel = l.nivel || "N/A";
      const grado = l.grado || "N/A";
      const trimestre = l.trimestre || "N/A";
      const unidad = (l.unidad ?? "N/A");

      option.textContent = `${titulo} [${nivel}, ${grado}, T${trimestre}, U${unidad}]`;
      selectTemaASC.appendChild(option);
    });

  } catch (error) {
  }
}




// Añadir botón para generar todas las categorías
function conectarBotonGenerarTodo() {
  const btnGenerarTodo = document.getElementById("btnGenerarTodo");
  if (!btnGenerarTodo) return;

  // Remover event listeners previos
  const nuevoBoton = btnGenerarTodo.cloneNode(true);
  btnGenerarTodo.parentNode.replaceChild(nuevoBoton, btnGenerarTodo);

  const btnActual = document.getElementById("btnGenerarTodo");

  btnActual.addEventListener("click", async () => {
    if (btnActual.disabled) return;

    window.stopRequestedUnidad = false;
    window.cancelarProyectos = false;
    btnActual.disabled = true;
    const originalText = btnActual.textContent;
    const originalBg = btnActual.style.background;
    btnActual.textContent = "⏳ Preparando...";

    try {
      // ✅ Obtener categorías disponibles
      const categoriasDisponibles = new Set();
      document.querySelectorAll('.categoria-header h3').forEach(h3 => {
        const categoria = h3.textContent.trim();
        if (categoria && categoria !== "Generar sección") {
          categoriasDisponibles.add(categoria);
        }
      });

      // Ordenar categorías
      const ordenCategorias = [
        'Proyectos',
        'Lenguaje y comunicación',
        'Matemáticas',
        'Ciencias experimentales',
        'Ciencias sociales',
        'Formación socioemocional',
        'Artes'
      ];

      const categoriasOrdenadas = Array.from(categoriasDisponibles)
        .filter(cat => ordenCategorias.includes(cat))
        .sort((a, b) => {
          const indexA = ordenCategorias.indexOf(a);
          const indexB = ordenCategorias.indexOf(b);
          return indexA - indexB;
        });

      if (categoriasOrdenadas.length === 0) {
        alert("⚠️ No se encontraron categorías para generar.");
        btnActual.textContent = originalText;
        btnActual.disabled = false;
        return;
      }


      // ✅ GENERACIÓN SECUENCIAL (UNA POR UNA)
      for (let i = 0; i < categoriasOrdenadas.length; i++) {
        if (window.stopRequestedUnidad) break;
        const categoria = categoriasOrdenadas[i];

        // Actualizar estado
        btnActual.textContent = `⏳ ${categoria}... (${i + 1}/${categoriasOrdenadas.length})`;

        try {
          // Buscar botón de la categoría
          let botonGenerar = null;

          // Buscar por data-categoria
          botonGenerar = document.querySelector(`button[data-categoria="${categoria}"]`);

          // Si no se encuentra, buscar por texto
          if (!botonGenerar) {
            const todosBotones = document.querySelectorAll('.btn-generar-categoria');
            todosBotones.forEach(boton => {
              const categoriaHeader = boton.closest('.categoria-header');
              if (categoriaHeader) {
                const h3 = categoriaHeader.querySelector('h3');
                if (h3 && h3.textContent.trim() === categoria) {
                  botonGenerar = boton;
                }
              }
            });
          }

          if (!botonGenerar) {
            continue;
          }

          if (botonGenerar.disabled) {
            continue;
          }


          // 🔥 SOLUCIÓN: Usar la función generarSeccionCategoria directamente
          // en lugar de hacer .click()
          await generarSeccionCategoria(categoria);

          if (window.stopRequestedUnidad) break;

          // Pequeña pausa entre categorías
          await new Promise(resolve => setTimeout(resolve, 1500));

        } catch (error) {
          if (window.stopRequestedUnidad) break;
          // Continuar con la siguiente categoría
        }
      }

      // ✅ Completado
      btnActual.textContent = window.stopRequestedUnidad
        ? "⏹️ Generación detenida"
        : "✅ ¡Unidad completa generada!";
      abrirModalResultadoUnidad();
      setTimeout(() => {
        btnActual.textContent = originalText;
        btnActual.style.background = originalBg;
        btnActual.disabled = false;
        window.stopRequestedUnidad = false;
        window.cancelarProyectos = false;
      }, 3000);

    } catch (error) {
      btnActual.textContent = "❌ Error - Intentar nuevamente";
      setTimeout(() => {
        btnActual.textContent = originalText;
        btnActual.disabled = false;
        window.stopRequestedUnidad = false;
        window.cancelarProyectos = false;
      }, 3000);
    }
  });
}


const estiloInstrucciones = document.createElement('style');
estiloInstrucciones.textContent = `
    .categoria-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
        flex-wrap: wrap;
    }
    
    .categoria-header h3 {
        margin: 0;
        display: inline-block;
    }
    
    .botones-categoria {
        display: flex;
        gap: 8px;
        align-items: center;
    }
    
    .btn-instrucciones-gemini {
        background-color: #9c27b0 !important;
        color: white !important;
        padding: 6px 12px !important;
        border: none !important;
        border-radius: 4px !important;
        cursor: pointer !important;
        font-size: 13px !important;
        transition: background-color 0.3s !important;
        display: flex !important;
        align-items: center !important;
        gap: 5px !important;
    }
    
    .btn-instrucciones-gemini:hover {
        background-color: #7b1fa2 !important;
    }
    
    .btn-instrucciones-gemini i {
        font-size: 12px !important;
    }
    
    #modalInstruccionesGemini {
        display: none;
        position: fixed;
        z-index: 10002;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0,0,0,0.4);
    }
    
    .modal-contenido-instrucciones {
        background-color: white;
        margin: 5% auto;
        padding: 20px;
        border-radius: 8px;
        width: 80%;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
    }
    
    .modal-header-instrucciones {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        border-bottom: 1px solid #eee;
        padding-bottom: 10px;
    }
    
    .instrucciones-textarea {
        width: 100%;
        height: 150px;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-family: monospace;
        font-size: 14px;
        resize: vertical;
        margin-bottom: 15px;
    }
    
    .instrucciones-preview {
        background-color: #f9f9f9;
        border: 1px solid #eee;
        border-radius: 4px;
        padding: 10px;
        font-size: 13px;
        margin-top: 10px;
        max-height: 200px;
        overflow-y: auto;
    }
`;
document.head.appendChild(estiloInstrucciones);


// Agrega esta función para crear el modal
function crearModalInstrucciones() {
  const modal = document.createElement('div');
  modal.id = 'modalInstruccionesGemini';
  modal.innerHTML = `
    <div class="modal-contenido-instrucciones">
        <div class="modal-header-instrucciones">
            <h3><i class="fas fa-comment-alt" style="color: #9c27b0; margin-right: 8px;"></i>Instrucciones para Gemini</h3>
            <button id="cerrarModalInstrucciones" style="background:none;border:none;font-size:20px;cursor:pointer;color:#666;">&times;</button>
        </div>
        <div>
            <p><strong><i class="fas fa-folder" style="color: #2c5aa0;"></i> Categoría:</strong> <span id="categoriaInstrucciones" style="color: #2c5aa0; font-weight: bold;"></span></p>
            <p style="color: #666; font-size: 13px; margin-bottom: 15px;">
                <i class="fas fa-info-circle"></i> Estas instrucciones se añadirán al prompt enviado a Gemini para esta categoría.
            </p>
            
            <textarea 
                id="textareaInstruccionesGemini" 
                class="instrucciones-textarea" 
                placeholder="Ejemplo: 
• Incluir 3 preguntas de metacognición
• Usar ejemplos de la vida real
• Enfatizar trabajo colaborativo
• Añadir actividades prácticas..."
            ></textarea>
            
            <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px;">
                <button id="btnBorrarInstrucciones" style="padding: 8px 16px; background: #ff9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
                    <i class="fas fa-trash-alt"></i> Borrar
                </button>
                <button id="btnCancelarInstrucciones" style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
                    <i class="fas fa-times"></i> Cancelar
                </button>
                <button id="btnGuardarInstrucciones" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
                    <i class="fas fa-save"></i> Guardar
                </button>
            </div>
            
            <div class="instrucciones-preview">
                <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 8px;">
                    <i class="fas fa-eye" style="color: #2196F3;"></i>
                    <strong>Vista previa:</strong>
                </div>
                <div id="previewInstrucciones"></div>
            </div>
        </div>
    </div>
`;


  document.body.appendChild(modal);

  // Event listeners para el modal
  document.getElementById('cerrarModalInstrucciones').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  document.getElementById('btnCancelarInstrucciones').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  document.getElementById('btnGuardarInstrucciones').addEventListener('click', guardarInstruccionesGemini);

  document.getElementById('textareaInstruccionesGemini').addEventListener('input', actualizarPreviewInstrucciones);

  document.getElementById('btnBorrarInstrucciones').addEventListener('click', () => {
    const modal = document.getElementById('modalInstruccionesGemini');
    const categoria = modal.dataset.categoriaActual;

    if (confirm(`¿Estás seguro de que quieres borrar las instrucciones para "${categoria}"?`)) {
      window.instruccionesGeminiPorCategoria[categoria] = '';
      try {
        localStorage.removeItem(`instrucciones_gemini_${categoria}`);
      } catch (e) {
      }

      // Limpiar textarea y preview
      document.getElementById('textareaInstruccionesGemini').value = '';
      actualizarPreviewInstrucciones();
      actualizarBadgeInstrucciones(categoria, '');

      mostrarNotificacion(`🗑️ Instrucciones borradas para ${categoria}`, 'info');
    }
  });

  // Cerrar modal al hacer clic fuera
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });

  return modal;
}

// Variable global para almacenar instrucciones por categoría
window.instruccionesGeminiPorCategoria = {};


// 🕐 FUNCIÓN AUXILIAR: Esperar generación de categoría (DEBES DEFINIRLA)
function esperarGeneracionCategoria(categoria) {
  return new Promise((resolve) => {

    const checkInterval = setInterval(() => {
      // Verificar si apareció el contenedor de la categoría
      const contenedorCategoria = document.getElementById(`contenedor-${categoria.replace(/\s/g, "-")}`);
      const spinner = document.querySelector(`#spinner-${categoria}-${Object.keys(categoriaPorSubtema).find(sub => categoriaPorSubtema[sub] === categoria)}`);

      // Si ya no hay spinner y existe el contenedor, asumimos que terminó
      if ((!spinner || !spinner.querySelector('.fa-spinner')) && contenedorCategoria) {
        clearInterval(checkInterval);
        resolve();
      }

      // Verificar también por botón habilitado
      const boton = document.querySelector(`button[data-categoria="${categoria}"]`);
      if (boton && !boton.disabled) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 2000); // Verificar cada 2 segundos

    // Timeout de seguridad (5 minutos por categoría)
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve();
    }, 300000);
  });
}


// Función auxiliar para obtener categorías seleccionadas
function obtenerCategoriasSeleccionadas() {
  const categoriasSeleccionadas = new Set();

  document.querySelectorAll('input[type="checkbox"][name^="generar_"]').forEach(checkbox => {
    if (checkbox.checked && checkbox.dataset.categoria) {
      categoriasSeleccionadas.add(checkbox.dataset.categoria);
    }
  });

  return Array.from(categoriasSeleccionadas);
}



// Función para seleccionar/deseleccionar todas las categorías
function toggleTodasCategorias(seleccionar) {
  const checkboxes = document.querySelectorAll('input[type="checkbox"][name^="generar_"]');

  checkboxes.forEach(checkbox => {
    checkbox.checked = seleccionar;
  });
  actualizarBotonSeleccionUnidad();
}

function actualizarBotonSeleccionUnidad() {
  const btn = document.getElementById("btnSeleccionarTodo");
  if (!btn) return;
  const checks = Array.from(document.querySelectorAll('input[type="checkbox"][name^="generar_"]'));
  const todosMarcados = checks.length > 0 && checks.every((checkbox) => checkbox.checked);
  const icon = btn.querySelector("i");
  const text = btn.querySelector(".unidad-btn-text");
  const label = todosMarcados ? "Deseleccionar todo" : "Seleccionar todo";
  btn.title = todosMarcados ? "Deseleccionar todos los subtemas" : "Seleccionar todos los subtemas";
  btn.setAttribute("aria-label", btn.title);
  btn.setAttribute("aria-pressed", todosMarcados ? "true" : "false");
  btn.dataset.tooltip = label;
  if (text) text.textContent = label;
  if (icon) icon.className = todosMarcados ? "fa-solid fa-xmark" : "fa-solid fa-check";
}

function _toggleChecksUnidadPorPrefijo(prefijo = "", force = null) {
  const checks = Array.from(document.querySelectorAll(`input[type="checkbox"][name^="${prefijo}_"]`));
  if (!checks.length) return false;
  const todosMarcados = checks.every((checkbox) => checkbox.checked);
  const nextState = typeof force === "boolean" ? force : !todosMarcados;
  checks.forEach((checkbox) => {
    checkbox.checked = nextState;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  });
  return nextState;
}

function enlazarBotonesRecursosUnidad() {
  const bindings = [
    ["btnToggleFichasUnidad", "ficha"],
    ["btnToggleAnexosUnidad", "anexo"],
    ["btnToggleVideosUnidad", "video"],
    ["btnToggleRecortablesUnidad", "recortable"],
    ["btnToggleRelacionLecturaUnidad", "relacion"]
  ];
  bindings.forEach(([id, prefijo]) => {
    const btn = document.getElementById(id);
    if (!btn || btn.dataset.bound === "true") return;
    btn.addEventListener("click", () => {
      const activo = _toggleChecksUnidadPorPrefijo(prefijo);
      btn.setAttribute("aria-pressed", activo ? "true" : "false");
    });
    btn.dataset.bound = "true";
  });
  actualizarBotonSeleccionUnidad();
}


// 🔧 CORRECCIÓN COMPLETA DE agregarControlesSeleccion
function agregarControlesSeleccion() {
  const btnSelExistente = document.getElementById("btnSeleccionarTodo");
  const btnDesExistente = document.getElementById("btnDeseleccionarTodo");
  if (btnSelExistente || btnDesExistente) {
    if (btnSelExistente && !btnSelExistente.dataset.bound) {
      btnSelExistente.addEventListener("click", () => {
        const checks = Array.from(document.querySelectorAll('input[type="checkbox"][name^="generar_"]'));
        const todosMarcados = checks.length > 0 && checks.every((checkbox) => checkbox.checked);
        toggleTodasCategorias(!todosMarcados);
      });
      btnSelExistente.dataset.bound = "true";
      actualizarBotonSeleccionUnidad();
    }
    if (btnDesExistente && !btnDesExistente.dataset.bound) {
      btnDesExistente.addEventListener("click", () => toggleTodasCategorias(false));
      btnDesExistente.dataset.bound = "true";
    }
    return;
  }

  // Verificar si ya existen controles para no duplicarlos
  if (document.querySelector(".contenedor-controles-seleccion")) {
    return;
  }

  // Crear contenedor principal
  const contenedorControles = document.createElement("div");
  contenedorControles.className = "contenedor-controles-seleccion";
  contenedorControles.style.cssText = `
    display: flex;
    gap: 10px;
    margin: 10px 0;
    padding: 10px;
    background-color: #f8f9fa;
    border-radius: 4px;
    border: 1px solid #dee2e6;
    flex-wrap: wrap;
  `;

  // Botón Seleccionar todo
  const btnSeleccionarTodo = document.createElement("button");
  btnSeleccionarTodo.type = "button";
  btnSeleccionarTodo.textContent = "Seleccionar todo";
  btnSeleccionarTodo.style.cssText = `
    background-color: #2196F3;
    color: white;
    padding: 8px 15px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.3s;
    flex: 1;
    min-width: 150px;
  `;
  btnSeleccionarTodo.addEventListener("click", () => toggleTodasCategorias(true));
  btnSeleccionarTodo.addEventListener("mouseenter", () => {
    btnSeleccionarTodo.style.backgroundColor = "#1976D2";
  });
  btnSeleccionarTodo.addEventListener("mouseleave", () => {
    btnSeleccionarTodo.style.backgroundColor = "#2196F3";
  });

  // Botón Deseleccionar todo
  const btnDeseleccionarTodo = document.createElement("button");
  btnDeseleccionarTodo.type = "button";
  btnDeseleccionarTodo.textContent = "Deseleccionar todo";
  btnDeseleccionarTodo.style.cssText = `
    background-color: #f44336;
    color: white;
    padding: 8px 15px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.3s;
    flex: 1;
    min-width: 150px;
  `;
  btnDeseleccionarTodo.addEventListener("click", () => toggleTodasCategorias(false));
  btnDeseleccionarTodo.addEventListener("mouseenter", () => {
    btnDeseleccionarTodo.style.backgroundColor = "#d32f2f";
  });
  btnDeseleccionarTodo.addEventListener("mouseleave", () => {
    btnDeseleccionarTodo.style.backgroundColor = "#f44336";
  });

  // Botón Invertir selección
  const btnInvertirSeleccion = document.createElement("button");
  btnInvertirSeleccion.type = "button";
  btnInvertirSeleccion.textContent = "Invertir selección";
  btnInvertirSeleccion.style.cssText = `
    background-color: #9C27B0;
    color: white;
    padding: 8px 15px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.3s;
    flex: 1;
    min-width: 150px;
  `;
  btnInvertirSeleccion.addEventListener("click", () => toggleInvertirSeleccion());
  btnInvertirSeleccion.addEventListener("mouseenter", () => {
    btnInvertirSeleccion.style.backgroundColor = "#7B1FA2";
  });
  btnInvertirSeleccion.addEventListener("mouseleave", () => {
    btnInvertirSeleccion.style.backgroundColor = "#9C27B0";
  });

  // Agregar botones al contenedor
  contenedorControles.appendChild(btnSeleccionarTodo);
  contenedorControles.appendChild(btnDeseleccionarTodo);
  contenedorControles.appendChild(btnInvertirSeleccion);

  // ✅ CORRECCIÓN IMPORTANTE: Verificar que contenedorCamposSecuencia existe
  if (!contenedorCamposSecuencia) {
    return;
  }

  // ✅ Buscar el botón "Generar todas las categorías" de forma segura
  const btnGenerarTodo = document.getElementById("btnGenerarTodo");

  // Insertar antes del botón "Generar todas las categorías" si existe
  if (btnGenerarTodo && btnGenerarTodo.parentNode === contenedorCamposSecuencia) {
    contenedorCamposSecuencia.insertBefore(contenedorControles, btnGenerarTodo);
  } else {
    // Si no existe el botón o no es hijo directo, insertar al inicio
    if (contenedorCamposSecuencia.firstChild) {
      contenedorCamposSecuencia.insertBefore(contenedorControles, contenedorCamposSecuencia.firstChild);
    } else {
      // Si el contenedor está vacío, simplemente agregar
      contenedorCamposSecuencia.appendChild(contenedorControles);
    }
  }

}

// 🔧 NUEVA FUNCIÓN: Invertir selección
function toggleInvertirSeleccion() {
  document.querySelectorAll('input[type="checkbox"][name^="generar_"]')
    .forEach(checkbox => {
      checkbox.checked = !checkbox.checked;
    });
}


function obtenerCategoriasPorGrado(grado) {
  if (["Primero", "Segundo", "Tercero"].includes(grado)) {
    return {
      "Lenguaje y comunicación": ["Artes", "Ortografía", "ExpresionOral", "Habilidades"],
      "Ciencias sociales": ["Historia", "Geografia"],
      "Matemáticas": ["Matematicas"]
    };
  } else {
    return {
      "Lenguaje y comunicación": ["Artes", "Ortografía", "Gramatica", "ExpresionEscrita", "Habilidades"],
      "Ciencias experimentales": ["Naturales", "ConocimientoDelMedio", "MiLocalidad"],
      "Ciencias sociales": ["Historia", "Geografia"],
      "Formación socioemocional": ["Socioemocional", "CivicaEtica"],
      "Matemáticas": ["Matematicas"]
    };
  }
}


// =========================
// Helpers para la propuesta IA
// =========================
function _extraerBloqueJSON(texto) {
  if (!texto) return null;
  // Limpia fences
  let s = texto.replace(/```json/gi, "").replace(/```/g, "").trim();

  // Si ya parece JSON simple
  if (s.startsWith("{") && s.endsWith("}")) return s;

  // Busca el primer bloque que balancee llaves
  const start = s.indexOf("{");
  if (start === -1) return null;
  let nivel = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === "{") nivel++;
    else if (ch === "}") {
      nivel--;
      if (nivel === 0) {
        return s.slice(start, i + 1);
      }
    }
  }
  return null;
}

function _crearPropuestaFallback(nivel, grado, trimestre, unidad, categorias) {
  // Si la IA falla, proponemos algo mínimamente útil por subtema
  const plano = {};
  const mk = (sub, t, ae, c, p) => {
    const k = sub.replace(/\s+/g, "_");
    plano[`${k}_T`] = t;
    plano[`${k}_AE`] = ae;
    plano[`${k}_C`] = c;
    plano[`${k}_P`] = p;
  };

  Object.entries(categorias).forEach(([cat, subs]) => {
    subs.forEach(sub => {
      const catTxt = cat.toLowerCase();
      mk(
        sub,
        `Eje de ${sub} en ${cat}`,
        `Aplica conocimientos de ${sub} en ${catTxt} según ${grado}° (${nivel}).`,
        `Conceptos clave de ${sub} para la Unidad ${unidad}.`,
        `Trabajo guiado: analizar → discutir → crear (Trimestre ${trimestre}).`
      );
    });
  });
  return plano;
}

// =========================
// 1) Proponer secuencia con IA cuando no existe en Firestore
// =========================
async function proponerSecuenciaIA(nivel, grado, trimestre, unidad, categorias) {
  // ⚠️ Clonar y quitar "Proyectos" para que la IA NO genere T/AE/C/P de esa categoría
  const categoriasSinProyectos = Object.fromEntries(
    Object.entries(categorias).filter(([cat]) => cat !== "Proyectos")
  );

  const descripcionCategorias = Object.entries(categoriasSinProyectos)
    .map(([cat, subs]) => `- ${cat}: ${subs.map(s => `"${s}"`).join(", ")}`)
    .join("\n");

  const prompt = `
  Eres un experto en diseño curricular de educación básica de ALTO RIGOR COGNITIVO.

  Genera una propuesta SINTÉTICA de Temas (T), Aprendizajes Esperados (AE), Contenidos (C) y Procesos (P) para cada SUBTEMA listado.

  **IMPORTANTE — NIVEL DE DIFICULTAD**
  Ajusta el nivel académico según el grado:
  - 1°-2°: habilidades cognitivas básicas → comparar, clasificar, identificar patrones.
  - 3°-4°: habilidades intermedias → analizar causas, explicar procesos, resolver problemas guiados.
  - 5°-6°: habilidades avanzadas → argumentar, evaluar, relacionar múltiples fuentes, diseñar soluciones.

  **REQUISITO OBLIGATORIO**
  Los AE y P deben requerir:
  - pensamiento analítico
  - interpretación
  - evaluación
  - creación (según grado)
  - NO aceptar actividades mecánicas o literales
  - SIEMPRE incorporar vocabulario académico disciplinar

  Devuelve SOLO un JSON válido con el formato:

  {
    "Subtema": {
      "T": "Tema profundo, contextualizado y disciplinar",
      "AE": "Aprendizaje esperado complejo, medible y de nivel cognitivo alto",
      "C": "Contenido específicamente vinculado al subtema",
      "P": "Proceso de trabajo riguroso, crítico y reflexivo"
    }
  }

  Subtemas:
  ${descripcionCategorias}
  `;


  const raw = await enviarPrompt([{ role: "user", text: prompt }]);
  const bloque = _extraerBloqueJSON(raw);
  if (!bloque) return _crearPropuestaFallback(nivel, grado, trimestre, unidad, categoriasSinProyectos);

  try {
    const parsed = JSON.parse(bloque);
    const plano = {};
    Object.entries(parsed || {}).forEach(([sub, obj]) => {
      const base = (sub || "").toString().replace(/\s+/g, "_");
      // 🚫 Cierre de seguridad: nunca metas "Proyectos"
      if (base.toLowerCase() === "proyectos") return;
      if (obj && typeof obj === "object") {
        if (obj.T) plano[`${base}_T`] = String(obj.T);
        if (obj.AE) plano[`${base}_AE`] = String(obj.AE);
        if (obj.C) plano[`${base}_C`] = String(obj.C);
        if (obj.P) plano[`${base}_P`] = String(obj.P);
      }
    });
    if (!Object.keys(plano).length) {
      return _crearPropuestaFallback(nivel, grado, trimestre, unidad, categoriasSinProyectos);
    }
    return plano;
  } catch {
    return _crearPropuestaFallback(nivel, grado, trimestre, unidad, categoriasSinProyectos);
  }
}


// =========================
// 2) Conectar botones “Generar sección” (helper seguro)
// =========================


function wireCategoriaButtons() {
  // Limpiar event listeners previos
  const botones = document.querySelectorAll(".btn-icono-categoria.generar");

  botones.forEach(btn => {
    // Crear un nuevo botón para eliminar event listeners anteriores
    const nuevoBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(nuevoBtn, btn);
  });

  // Reconectar los botones con nuevos event listeners
  document.querySelectorAll(".btn-icono-categoria.generar").forEach(btn => {
    // Prevenir múltiples event listeners
    btn.removeEventListener("click", generarCategoriaHandler);
    btn.addEventListener("click", generarCategoriaHandler);
  });

  const btnDetenerProyectos = document.getElementById("btn-detener-Proyectos");
  if (btnDetenerProyectos) {
    btnDetenerProyectos.onclick = () => {
      window.stopRequestedUnidad = true;
      cancelarGeneracionProyectos();
    };
  }
}


// Handler separado para mejor control
function generarCategoriaHandler(event) {
  event.preventDefault();
  event.stopPropagation();

  const btn = event.currentTarget;
  // Obtener la categoría del data-categoria o del header más cercano
  const categoriaHeader = btn.closest('.categoria-header');
  let cat = btn.dataset.categoria;

  if (!cat && categoriaHeader) {
    const h3 = categoriaHeader.querySelector('h3');
    if (h3) {
      cat = h3.textContent.trim();
    }
  }

  if (cat && !btn.disabled) {
    window.stopRequestedUnidad = false;
    window.cancelarProyectos = false;

    // Cambiar estado visual
    btn.disabled = true;
    btn.classList.add('disabled', 'active');
    const originalIcon = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    const stopBtn = (cat === "Proyectos") ? document.getElementById("btn-detener-Proyectos") : null;
    if (stopBtn) {
      window.cancelarProyectos = false;
      stopBtn.style.display = "inline-flex";
      stopBtn.disabled = false;
    }

    // Llamar a la función de generación
    generarSeccionCategoria(cat)
      .then(() => {
        // Éxito: ícono de check por 2 segundos
        btn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => {
          btn.innerHTML = originalIcon;
          btn.disabled = false;
          btn.classList.remove('disabled', 'active');
        }, 2000);
      })
      .catch(err => {
        // Error: ícono de error por 2 segundos
        btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
        setTimeout(() => {
          btn.innerHTML = originalIcon;
          btn.disabled = false;
          btn.classList.remove('disabled', 'active');
        }, 2000);
      })
      .finally(() => {
        if (stopBtn) {
          stopBtn.style.display = "none";
          stopBtn.disabled = true;
        }
        window.cancelarProyectos = false;
        window.stopRequestedUnidad = false;
      });
  }
}

function setCategoriaSpinnerUI(categoria, isLoading) {
  const selector = `.btn-icono-categoria.generar[data-categoria="${categoria}"]`;
  const btn = document.querySelector(selector);
  if (!btn) return null;

  if (!btn.dataset.originalIconHtml) {
    btn.dataset.originalIconHtml = btn.innerHTML;
  }

  if (isLoading) {
    btn.disabled = true;
    btn.classList.add("disabled", "active");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  } else {
    btn.innerHTML = btn.dataset.originalIconHtml || '<i class="fas fa-magic"></i>';
    btn.disabled = false;
    btn.classList.remove("disabled", "active");
  }
  return btn;
}



function sincronizarBadgesInstrucciones() {
  // Buscar todos los botones de instrucciones y actualizar sus badges
  document.querySelectorAll('.btn-icono-categoria.instrucciones').forEach(btn => {
    const categoria = btn.dataset.categoria;
    if (categoria && window.instruccionesGeminiPorCategoria) {
      const instrucciones = window.instruccionesGeminiPorCategoria[categoria] || '';
      actualizarBadgeInstrucciones(categoria, instrucciones);
    }
  });
}

// Llama a esta función después de que se genera la interfaz
// En verificarSecuencia, al final, después de agregar los controles:
setTimeout(() => {
  sincronizarBadgesInstrucciones();
}, 800);



// =========================
// 3) Verificar secuencia (usa Firestore o IA, y arma la UI) - CORREGIDA
// =========================
let verificandoSecuencia = false; // Bandera para prevenir ejecuciones múltiples

async function verificarSecuencia() {
  if (!window.instruccionesGeminiPorCategoria) {
    window.instruccionesGeminiPorCategoria = {};
  }
  if (verificandoSecuencia) return;
  verificandoSecuencia = true;

  const nivel = selectNivel?.value;
  const grado = selectGrado?.value;
  const trimestre = selectTrimestre?.value;
  const unidad = selectUnidad?.value;

  if (!nivel || !grado || !trimestre || !unidad) {
    verificandoSecuencia = false;
    return;
  }



  if (!nivel || !grado || !trimestre || !unidad) {
    verificandoSecuencia = false;
    return;
  }

  try {
    // ✅ ACTUALIZAR LECTURAS PRIMERO
    await actualizarTemasLecturas();
    await actualizarLecturasASC();
    window.lecturaInsertadaParaLenguaje = false;
    window.bloqueLecturaGlobalParaLenguaje = "";
    window.lecturaNuevaCoincidenteGlobal = null;

    // ✅ CORRECCIÓN: AGREGAR "Ciencias experimentales" al catálogo de categorías
    const categorias = {
      "Proyectos": ["Proyectos"],
      "Lenguaje y comunicación": ["Artes", "Ortografía", "Gramatica", "ExpresionEscrita", "ExpresionOral", "Habilidades"],
      "Ciencias experimentales": ["Naturales", "ConocimientoDelMedio", "MiLocalidad"], // ✅ AGREGADO
      "Ciencias sociales": ["Historia", "Geografia"],
      "Formación socioemocional": ["CivicaEtica", "Socioemocional"],
      "Matemáticas": ["Matematicas"]
    };
    const materiaObjetivo = _obtenerMateriaSeleccionadaUnidad();

    // Query a Firestore
    const q = query(
      collection(db, "secuenciaAlcance"),
      where("nivel", "==", nivel),
      where("grado", "==", grado),
      where("trimestre", "==", trimestre),
      where("unidad", "==", unidad)
    );
    const snap = await getDocs(q);

    // Limpia contenedor de controles
    contenedorCamposSecuencia.innerHTML = "";

    // Decide fuente de secuencia
    if (snap.empty) {
      secuenciaActual = await proponerSecuenciaIA(nivel, grado, trimestre, unidad, categorias);
    } else {
      const candidatos = snap.docs.map((d) => d.data() || {});
      const mejor = _seleccionarMejorSecuenciaDoc(candidatos, categorias, materiaObjetivo);
      secuenciaActual = mejor || candidatos[0] || {};
    }

    // Mantén ambas referencias en sync para el resto del código que usa una u otra
    window.secuenciaActual = secuenciaActual;

    // 🟢 CORREGIDO: Mapeo subtema → categoría (global) - INCLUIR "Ciencias experimentales"
    window.categoriaPorSubtema = {
      Proyectos: "Proyectos",
      Artes: "Lenguaje y comunicación",
      Ortografía: "Lenguaje y comunicación",
      Gramatica: "Lenguaje y comunicación",
      ExpresionEscrita: "Lenguaje y comunicación",
      ExpresionOral: "Lenguaje y comunicación",
      Habilidades: "Lenguaje y comunicación",
      Naturales: "Ciencias experimentales", // ✅ PERTENECE A CIENCIAS EXPERIMENTALES
      ConocimientoDelMedio: "Ciencias experimentales", // ✅ PERTENECE A CIENCIAS EXPERIMENTALES
      MiLocalidad: "Ciencias experimentales", // ✅ PERTENECE A CIENCIAS EXPERIMENTALES
      Socioemocional: "Formación socioemocional",
      CivicaEtica: "Formación socioemocional",
      Historia: "Ciencias sociales",
      Geografia: "Ciencias sociales",
      Matematicas: "Matemáticas"
    };

    // 🟢 CORREGIDO: Construir categorias para UI desde categoriaPorSubtema
    const categoriasParaUI = {};
    Object.values(window.categoriaPorSubtema).forEach(cat => {
      if (!categoriasParaUI[cat]) {
        categoriasParaUI[cat] = [];
      }
    });

    // Agrupar subtemas por categoría
    Object.entries(window.categoriaPorSubtema).forEach(([subtema, categoria]) => {
      if (!categoriasParaUI[categoria]) {
        categoriasParaUI[categoria] = [];
      }
      categoriasParaUI[categoria].push(subtema);
    });

    const todosLosSubtemas = Object.values(categoriasParaUI).flat();

    // Construye UI por categoría - usar categoriasParaUI en lugar del objeto original
    for (const [categoria, subtemas] of Object.entries(categoriasParaUI)) {
      const tabla = document.createElement("table");
      tabla.className = "tabla-secuencia unidad-table";
      tabla.style.width = "100%";
      tabla.innerHTML = `
        <thead>
          <tr>
            <th style="width: 40px;" title="Generar" aria-label="Generar"><i class="fa-solid fa-bolt unidad-th-icon"></i></th>
            <th title="Categoria" aria-label="Categoria"><i class="fa-solid fa-tags unidad-th-icon"></i></th>
            <th title="Subtema" aria-label="Subtema"><i class="fa-solid fa-bookmark unidad-th-icon"></i></th>
            <th title="Relacionar con lectura" aria-label="Relacionar con lectura"><i class="fa-solid fa-book-open unidad-th-icon"></i></th>
            <th title="Interdisciplinariedad" aria-label="Interdisciplinariedad"><i class="fa-solid fa-diagram-project unidad-th-icon"></i></th>
            <th title="Recortables" aria-label="Recortables"><i class="fa-solid fa-scissors unidad-th-icon"></i></th>
            <th title="Fichas" aria-label="Fichas"><i class="fa-solid fa-pen-nib unidad-th-icon"></i></th>
            <th title="Anexos" aria-label="Anexos"><i class="fa-solid fa-paperclip unidad-th-icon"></i></th>
            <th title="Videos" aria-label="Videos"><i class="fa-solid fa-film unidad-th-icon"></i></th>
            <th title="Actividades" aria-label="Actividades"><i class="fa-solid fa-list-ol unidad-th-icon"></i></th>
          </tr>
        </thead>
        <tbody></tbody>
      `;

      const tbody = tabla.querySelector("tbody");

      subtemas.forEach(subtema => {
        const fila = document.createElement("tr");

        // ✅ Checkbox para seleccionar/deseleccionar este SUBTEMA específico
        const chkGenerarSubtema = document.createElement("input");
        chkGenerarSubtema.type = "checkbox";
        chkGenerarSubtema.name = `generar_subtema_${subtema}`;
        chkGenerarSubtema.dataset.categoria = categoria;
        chkGenerarSubtema.dataset.subtema = subtema;
        chkGenerarSubtema.checked = true; // Por defecto seleccionado


        // Relación con lectura - CORREGIDO
        const chkRelacion = document.createElement("input");
        chkRelacion.type = "checkbox";
        chkRelacion.name = `relacion_${subtema}`;

        // Por defecto activado en todas excepto Proyectos, pero editable.
        chkRelacion.checked = (categoria !== "Proyectos");

        // ✅ NUEVO: Checkbox para seleccionar categoría
        const chkGenerar = document.createElement("input");
        chkGenerar.type = "checkbox";
        // CORRECCIÓN: Usar el nombre del subtema en lugar de la categoría
        chkGenerar.name = `generar_${subtema}`;
        chkGenerar.checked = true; // Por defecto seleccionado
        chkGenerar.dataset.categoria = categoria;
        chkGenerar.dataset.subtema = subtema; // Agregar referencia al subtema

        // ✅ Checkbox para la categoría (usado por "Generar todas las categorías")
        const chkGenerarCategoria = document.createElement("input");
        chkGenerarCategoria.type = "checkbox";
        chkGenerarCategoria.name = `generar_categoria_${categoria}`;
        chkGenerarCategoria.dataset.categoria = categoria;
        chkGenerarCategoria.checked = true; // Por defecto seleccionado


        // Interdisciplinariedad
        const selectInterdisciplinariedad = document.createElement("select");
        selectInterdisciplinariedad.name = `interdisciplinariedad_${subtema}`;
        selectInterdisciplinariedad.className = "interdisc-select";
        selectInterdisciplinariedad.size = 1;
        selectInterdisciplinariedad.innerHTML = `<option value="">Ninguna</option>`;
        todosLosSubtemas.forEach(op => {
          if (op !== subtema) {
            const option = document.createElement("option");
            option.value = op;
            option.textContent = op;
            selectInterdisciplinariedad.appendChild(option);
          }
        });

        const interdiscWrap = document.createElement("div");
        interdiscWrap.className = "interdisc-dropdown";
        const interdiscTrigger = document.createElement("button");
        interdiscTrigger.type = "button";
        interdiscTrigger.className = "interdisc-trigger";
        interdiscTrigger.title = "Interdisciplinariedad";
        interdiscTrigger.setAttribute("aria-haspopup", "listbox");
        interdiscTrigger.setAttribute("aria-expanded", "false");
        interdiscTrigger.innerHTML = `
          <span class="interdisc-trigger-label">Ninguna</span>
          <i class="fa-solid fa-caret-down interdisc-trigger-icon" aria-hidden="true"></i>
        `;

        const interdiscMenu = document.createElement("div");
        interdiscMenu.className = "interdisc-menu";
        interdiscMenu.setAttribute("role", "listbox");

        Array.from(selectInterdisciplinariedad.options).forEach((opt) => {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "interdisc-option";
          item.textContent = opt.textContent || "Ninguna";
          item.dataset.value = opt.value || "";
          item.setAttribute("role", "option");
          interdiscMenu.appendChild(item);
        });
        document.body.appendChild(interdiscMenu);

        const aplicarInterdisc = (value = "") => {
          selectInterdisciplinariedad.value = value;
          const selected = selectInterdisciplinariedad.options[selectInterdisciplinariedad.selectedIndex];
          const label = (selected?.textContent || "Ninguna").trim();
          const labelNode = interdiscTrigger.querySelector(".interdisc-trigger-label");
          if (labelNode) labelNode.textContent = label;
          interdiscTrigger.classList.toggle("has-value", !!value);
          interdiscMenu.querySelectorAll(".interdisc-option").forEach((opt) => {
            const active = (opt.dataset.value || "") === value;
            opt.classList.toggle("is-active", active);
            opt.setAttribute("aria-selected", active ? "true" : "false");
          });
          selectInterdisciplinariedad.dispatchEvent(new Event("change", { bubbles: true }));
        };

        const posicionarInterdiscMenu = (anchor = null) => {
          const rect = interdiscTrigger.getBoundingClientRect();
          const menuWidth = Math.min(220, Math.max(150, rect.width));
          interdiscMenu.style.minWidth = `${menuWidth}px`;
          interdiscMenu.style.maxWidth = `${menuWidth}px`;
          const prevDisplay = interdiscMenu.style.display;
          const prevVisibility = interdiscMenu.style.visibility;
          interdiscMenu.style.visibility = "hidden";
          interdiscMenu.style.display = "block";
          const menuHeight = interdiscMenu.offsetHeight || 220;
          interdiscMenu.style.display = prevDisplay || "";
          interdiscMenu.style.visibility = prevVisibility || "";

          const leftIdeal = rect.left + ((rect.width - menuWidth) / 2);
          const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, leftIdeal));
          interdiscMenu.style.left = `${left}px`;

          const gap = 2;
          const espacioAbajo = window.innerHeight - rect.bottom;
          const abrirArriba = espacioAbajo < (menuHeight + 10) && rect.top > (menuHeight + 10);
          const top = abrirArriba
            ? Math.max(8, rect.top - menuHeight - gap)
            : Math.min(window.innerHeight - menuHeight - 8, rect.bottom + gap);
          interdiscMenu.style.top = `${Math.max(8, top)}px`;
        };

        let interdiscCloseTimer = null;
        const abrirInterdisc = (ev = null) => {
          if (interdiscCloseTimer) {
            clearTimeout(interdiscCloseTimer);
            interdiscCloseTimer = null;
          }
          document.querySelectorAll(".interdisc-dropdown.is-open").forEach((node) => {
            if (node !== interdiscWrap) node.classList.remove("is-open");
          });
          document.querySelectorAll(".interdisc-menu.is-open").forEach((node) => {
            if (node !== interdiscMenu) node.classList.remove("is-open");
          });
          interdiscWrap.classList.add("is-open");
          interdiscMenu.classList.add("is-open");
          interdiscTrigger.setAttribute("aria-expanded", "true");
          posicionarInterdiscMenu(ev);
        };

        const cerrarInterdisc = () => {
          interdiscWrap.classList.remove("is-open");
          interdiscMenu.classList.remove("is-open");
          interdiscTrigger.setAttribute("aria-expanded", "false");
        };

        const programarCierreInterdisc = () => {
          if (interdiscCloseTimer) clearTimeout(interdiscCloseTimer);
          interdiscCloseTimer = setTimeout(() => {
            cerrarInterdisc();
            interdiscCloseTimer = null;
          }, 100);
        };

        interdiscWrap.addEventListener("mouseenter", abrirInterdisc);
        interdiscWrap.addEventListener("mouseleave", programarCierreInterdisc);
        interdiscMenu.addEventListener("mouseenter", () => {
          if (interdiscCloseTimer) {
            clearTimeout(interdiscCloseTimer);
            interdiscCloseTimer = null;
          }
        });
        interdiscMenu.addEventListener("mouseleave", programarCierreInterdisc);

        interdiscMenu.addEventListener("click", (e) => {
          const option = e.target?.closest?.(".interdisc-option");
          if (!option) return;
          e.preventDefault();
          aplicarInterdisc(option.dataset.value || "");
          cerrarInterdisc();
        });

        document.addEventListener("click", (e) => {
          if (!interdiscWrap.contains(e.target) && !interdiscMenu.contains(e.target)) cerrarInterdisc();
        });

        window.addEventListener("resize", () => {
          if (!interdiscWrap.classList.contains("is-open")) return;
          posicionarInterdiscMenu();
        });
        window.addEventListener("scroll", () => {
          if (!interdiscWrap.classList.contains("is-open")) return;
          cerrarInterdisc();
        }, true);

        aplicarInterdisc("");

        // Recursos
        const chkRecortable = Object.assign(document.createElement("input"), { type: "checkbox", name: `recortable_${subtema}` });
        const chkFichas = Object.assign(document.createElement("input"), { type: "checkbox", name: `ficha_${subtema}` });
        const chkAnexos = Object.assign(document.createElement("input"), { type: "checkbox", name: `anexo_${subtema}` });
        const chkVideos = Object.assign(document.createElement("input"), { type: "checkbox", name: `video_${subtema}` });

        [
          chkGenerar,
          chkRelacion,
          chkRecortable,
          chkFichas,
          chkAnexos,
          chkVideos
        ].forEach((chk) => chk.classList.add("categoria-switch"));

        // Cantidad
        const inputCantidad = document.createElement("input");
        inputCantidad.type = "number";
        inputCantidad.name = `num_${subtema}`;
        inputCantidad.min = 1;
        inputCantidad.max = 10;
        inputCantidad.value = (categoria === "Artes") ? 4 : 2;
        inputCantidad.style.width = "60px";

        // TDs
        const tdGenerar = document.createElement("td");
        tdGenerar.appendChild(chkGenerar);

        const tdCategoria = document.createElement("td");
        tdCategoria.textContent = categoria;

        const tdSubtema = document.createElement("td");
        tdSubtema.textContent = formatearSubtema(subtema);

        const tdRelacion = document.createElement("td");
        tdRelacion.appendChild(chkRelacion);

        const tdInterdisc = document.createElement("td");
        interdiscWrap.appendChild(selectInterdisciplinariedad);
        interdiscWrap.appendChild(interdiscTrigger);
        tdInterdisc.appendChild(interdiscWrap);

        const tdRecort = document.createElement("td");
        tdRecort.appendChild(chkRecortable);

        const tdFicha = document.createElement("td");
        tdFicha.appendChild(chkFichas);

        const tdAnexo = document.createElement("td");
        tdAnexo.appendChild(chkAnexos);

        const tdVideo = document.createElement("td");
        tdVideo.appendChild(chkVideos);

        const tdCantidad = document.createElement("td");
        tdCantidad.appendChild(inputCantidad);

        fila.append(tdGenerar, tdCategoria, tdSubtema, tdRelacion, tdInterdisc, tdRecort, tdFicha, tdAnexo, tdVideo, tdCantidad);
        tbody.appendChild(fila);
      });

      const encabezado = document.createElement("div");
      encabezado.className = "categoria-header";

      // Verificar si hay instrucciones guardadas para esta categoría
      const tieneInstrucciones = window.instruccionesGeminiPorCategoria?.[categoria]?.trim().length > 0;

      encabezado.innerHTML = `
        <h3>${categoria}</h3>
        <div class="botones-categoria">
            <div class="tooltip">
                <button type="button" 
                        class="btn-icono-categoria instrucciones ${tieneInstrucciones ? 'has-instructions' : ''}" 
                        data-categoria="${categoria}" 
                        title="Añadir instrucciones específicas para Gemini"
                        id="btn-instrucciones-${categoria.replace(/\s+/g, '-')}">
                    <i class="fas fa-comment-alt"></i>
                    ${tieneInstrucciones ? '<span class="badge-instrucciones">!</span>' : ''}
                </button>
                <span class="tooltiptext">Instrucciones para Gemini</span>
            </div>
            
            <div class="tooltip">
                <button type="button" 
                        class="btn-icono-categoria generar" 
                        data-categoria="${categoria}" 
                        title="Generar esta sección completa"
                        id="btn-generar-${categoria.replace(/\s+/g, '-')}">
                    <i class="fas fa-magic"></i>
                </button>
                <span class="tooltiptext">Generar sección</span>
            </div>
        </div>
    `;


      const caption = document.createElement("caption");
      caption.className = "tabla-secuencia-caption";
      caption.appendChild(encabezado);
      tabla.prepend(caption);
      const tablaWrap = document.createElement("div");
      tablaWrap.className = "tabla-secuencia-wrap unidad-editor-table-wrap";
      tablaWrap.appendChild(tabla);
      contenedorCamposSecuencia.appendChild(tablaWrap);

      // Agrega los event listeners
      setTimeout(() => {
        const btnInstrucciones = encabezado.querySelector('.btn-icono-categoria.instrucciones');

        if (btnInstrucciones) {
          let clickTimer = null;

          btnInstrucciones.addEventListener('click', (e) => {
            if (clickTimer === null) {
              // Primer click - configurar timer
              clickTimer = setTimeout(() => {
                // Click simple - abrir modal
                abrirModalInstrucciones(categoria);
                clickTimer = null;
              }, 250);
            } else {
              // Doble click - mostrar instrucciones rápidamente
              clearTimeout(clickTimer);
              clickTimer = null;
              mostrarInstruccionesRapido(categoria);
            }
          });

          btnInstrucciones.addEventListener('dblclick', (e) => {
            e.preventDefault();
            // El doble click ya es manejado por el timer
          });
        }
      }, 100);

      function mostrarInstruccionesRapido(categoria) {
        const instrucciones = window.instruccionesGeminiPorCategoria?.[categoria];

        if (!instrucciones || !instrucciones.trim()) {
          mostrarNotificacion(`ℹ️ No hay instrucciones guardadas para ${categoria}`, 'info');
          return;
        }

        // Crear tooltip rápido
        const tooltip = document.createElement('div');
        tooltip.style.cssText = `
            position: fixed;
            background: white;
            border: 2px solid #9c27b0;
            border-radius: 6px;
            padding: 12px;
            max-width: 300px;
            max-height: 200px;
            overflow-y: auto;
            z-index: 10003;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 13px;
            line-height: 1.4;
        `;

        tooltip.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <strong style="color: #9c27b0;">${categoria}</strong>
                <button onclick="this.parentElement.parentElement.remove()" 
                        style="background: none; border: none; color: #666; cursor: pointer; font-size: 16px;">
                    ×
                </button>
            </div>
            <div style="color: #333;">${instrucciones.replace(/\n/g, '<br>')}</div>
        `;

        // Posicionar cerca del botón
        const btn = document.getElementById(`btn-instrucciones-${categoria.replace(/\s+/g, '-')}`);
        if (btn) {
          const rect = btn.getBoundingClientRect();
          tooltip.style.top = `${rect.bottom + 5}px`;
          tooltip.style.left = `${rect.left}px`;
        } else {
          tooltip.style.top = '50px';
          tooltip.style.right = '50px';
        }

        document.body.appendChild(tooltip);

        // Auto-remover después de 5 segundos
        setTimeout(() => {
          if (tooltip.parentNode) {
            tooltip.remove();
          }
        }, 5000);
      }


    }

    const botones = contenedorCamposSecuencia.querySelectorAll('.btn-generar-categoria');
    botones.forEach(boton => {
      const categoriaHeader = boton.closest('.categoria-header');
      if (categoriaHeader) {
        const h3 = categoriaHeader.querySelector('h3');
        if (h3) {
          const categoriaNombre = h3.textContent.trim();
          boton.dataset.categoria = categoriaNombre;
        }
      }
    });

    // Luego llamar a wireCategoriaButtons
    setTimeout(() => {
      wireCategoriaButtons();
    }, 100);


    // Persistencia (localStorage) después de pintar la UI
    // CORRECCIÓN: En la función verificarSecuencia, busca el setTimeout de persistencia y reemplázalo con esto:
    setTimeout(() => {
      const inputs = contenedorCamposSecuencia.querySelectorAll("input, select");
      inputs.forEach(input => {
        const key = `unidad_${input.name || input.id || ""}`;
        const saved = localStorage.getItem(key);

        if (input.type === "checkbox") {
          if (saved !== null) input.checked = (saved === "true");

          // CORRECCIÓN: Remover event listeners previos y agregar nuevos
          input.replaceWith(input.cloneNode(true));
          const newInput = contenedorCamposSecuencia.querySelector(`[name="${input.name}"]`);

          newInput.addEventListener("change", function () {
            localStorage.setItem(key, this.checked.toString());
          });
        } else {
          if (saved !== null) input.value = saved;
          input.addEventListener("change", function () {
            localStorage.setItem(key, this.value);
          });
          input.addEventListener("input", function () {
            localStorage.setItem(key, this.value);
          });
        }
      });
    }, 500); // Aumentar timeout para asegurar que el DOM esté listo

    // 👇👇 **AQUÍ** pintamos / refrescamos la tabla inicial
    refrescarTablaInicial();

    // Conecta botones "Generar sección" - SOLO UNA VEZ
    if (typeof wireCategoriaButtons === "function") {
      wireCategoriaButtons();
    }

    // Botón "Generar todas las categorías" - SOLO UNA VEZ
    if (document.getElementById("btnGenerarTodo") && typeof conectarBotonGenerarTodo === "function") {
      conectarBotonGenerarTodo();
    }

    // ✅ Agregar controles de selección
    setTimeout(() => {
      try {
        // Verificar que contenedorCamposSecuencia existe y tiene contenido
        if (contenedorCamposSecuencia && !document.querySelector(".contenedor-controles-seleccion")) {
          agregarControlesSeleccion();
        }
      } catch (error) {
      }
    }, 300); // Esperar 300ms para asegurar que el DOM esté listo


  } catch (error) {
    console.error("verificarSecuencia error:", error);
    verificarBotonesGeneracion();
  } finally {
    verificandoSecuencia = false;
  }
}


function verificarBotonesGeneracion() {

  const botones = document.querySelectorAll('.btn-generar-categoria');

  botones.forEach((boton, index) => {
  });

  return botones.length > 0;
}

function abrirModalInstrucciones(categoria) {
  let modal = document.getElementById('modalInstruccionesGemini');
  if (!modal) {
    modal = crearModalInstrucciones();
  }

  // Establecer la categoría actual
  modal.dataset.categoriaActual = categoria;
  document.getElementById('categoriaInstrucciones').textContent = categoria;

  // Cargar instrucciones existentes
  const instruccionesGuardadas = window.instruccionesGeminiPorCategoria[categoria] || '';
  document.getElementById('textareaInstruccionesGemini').value = instruccionesGuardadas;

  // Actualizar preview
  actualizarPreviewInstrucciones();

  // Mostrar modal
  modal.style.display = 'block';
  document.getElementById('textareaInstruccionesGemini').focus();
  if (unidadVoiceShouldRun && _debeResponderPorFuncion("_openGeminiInstruccionesByCategoria", false)) {
    obtenerNombreUsuarioAutenticadoUnidad()
      .then((nombre) => hablarUnidad(`Lista ${nombre}, puedes dictar instrucciones para ${categoria}.`))
      .catch(() => { });
  }
}

// Función para actualizar el preview
function actualizarPreviewInstrucciones() {
  const textarea = document.getElementById('textareaInstruccionesGemini');
  const preview = document.getElementById('previewInstrucciones');

  if (textarea && preview) {
    const texto = textarea.value.trim();
    if (texto) {
      // Mostrar vista previa con formato
      const lineas = texto.split('\n').filter(line => line.trim());
      preview.innerHTML = `
                <div style="font-size: 12px; line-height: 1.4;">
                    ${lineas.map(line => `<div>• ${line}</div>`).join('')}
                </div>
            `;
    } else {
      preview.innerHTML = '<span style="color:#999; font-style:italic;">(Sin instrucciones guardadas)</span>';
    }
  }
}


// Función para guardar instrucciones
function guardarInstruccionesGemini() {
  const modal = document.getElementById('modalInstruccionesGemini');
  const categoria = modal.dataset.categoriaActual;
  const textarea = document.getElementById('textareaInstruccionesGemini');

  if (!categoria || !textarea) return;

  const instrucciones = textarea.value.trim();

  // Guardar en el objeto global
  window.instruccionesGeminiPorCategoria[categoria] = instrucciones;

  // También guardar en localStorage para persistencia
  try {
    localStorage.setItem(`instrucciones_gemini_${categoria}`, instrucciones);
  } catch (e) {
  }

  // Actualizar el badge en el botón
  actualizarBadgeInstrucciones(categoria, instrucciones);

  // Mostrar notificación
  mostrarNotificacion(`✅ Instrucciones guardadas para ${categoria}`, 'success');

  // Cerrar modal
  modal.style.display = 'none';
}


// Función para cargar instrucciones guardadas
function cargarInstruccionesGuardadas() {
  if (!window.instruccionesGeminiPorCategoria) {
    window.instruccionesGeminiPorCategoria = {};
  }

  // Cargar todas las categorías posibles
  const categoriasPosibles = [
    'Proyectos',
    'Lenguaje y comunicación',
    'Matemáticas',
    'Ciencias experimentales',
    'Ciencias sociales',
    'Formación socioemocional',
    'Artes'
  ];

  categoriasPosibles.forEach(categoria => {
    try {
      const instrucciones = localStorage.getItem(`instrucciones_gemini_${categoria}`);
      if (instrucciones !== null) {
        window.instruccionesGeminiPorCategoria[categoria] = instrucciones;

        // Actualizar badge si el botón ya existe
        setTimeout(() => {
          actualizarBadgeInstrucciones(categoria, instrucciones);
        }, 500);
      }
    } catch (e) {
    }
  });
}



function actualizarBadgeInstrucciones(categoria, instrucciones) {
  const btnId = `btn-instrucciones-${categoria.replace(/\s+/g, '-')}`;
  const btn = document.getElementById(btnId);

  if (!btn) return;

  const tieneInstrucciones = instrucciones && instrucciones.trim().length > 0;

  if (tieneInstrucciones) {
    btn.classList.add('has-instructions');

    // Asegurar que haya un badge
    let badge = btn.querySelector('.badge-instrucciones');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'badge-instrucciones';
      badge.textContent = '!';
      btn.appendChild(badge);
    }

    // Cambiar ícono a check cuando hay instrucciones
    const icon = btn.querySelector('i');
    if (icon) {
      icon.className = 'fas fa-check-circle';
    }
  } else {
    btn.classList.remove('has-instructions');

    // Remover badge si existe
    const badge = btn.querySelector('.badge-instrucciones');
    if (badge) {
      badge.remove();
    }

    // Restaurar ícono original
    const icon = btn.querySelector('i');
    if (icon) {
      icon.className = 'fas fa-comment-alt';
    }
  }
}

const estructuraActividades = `
    ⚡ REGLAS ABSOLUTAS PARA SUBACTIVIDADES:
    1. El número de subactividades (li) debe ser VARIABLE según lo requiera cada actividad:
    - Algunas actividades pueden tener solo 1 subactividad si es suficiente
    - Otras pueden tener 2, 3 o hasta 4 subactividades si la complejidad lo requiere
    - NO siempre deben ser 3 subactividades
    2. La cantidad debe ser NATURAL según el flujo de la actividad
    3. No forces subactividades innecesarias
    4. Cada subactividad debe tener un propósito claro
`;

// 🟢 También definir listaCriterios globalmente
const listaCriterios = "Localización, Interpretación, Integración, Evaluación, Reflexión/Transferencia";

// ===================== PROYECTOS (con PISA + RÚBRICA POR FASE + Fichas/Anexos/Video/Recortable) =====================
window.construirPromptProyecto = function (
  objetivosDelSubtema,
  contenidoLectura,
  preguntasComprension,
  subtema,
  tituloCreativo,
  instruccionesAdicionales = "",
  tituloLecturaRelacionada = ""
) {


  // ✅ CORRECCIÓN: Obtener unidadActual de forma segura
  const unidadActual = document.getElementById("unidadNumero")?.value || selectUnidad?.value || "1";

  const nivel = selectNivel.value || "Primaria";

  const grado = selectGrado.value || "Primero";
  const trimestre = (selectTrimestre.value || "1").toString();

  // 🧭 Metodología por trimestre
  const metodologiaPorTrimestre = { "1": "ABP", "2": "STEAM", "3": "AS" };
  const metodologia = metodologiaPorTrimestre[trimestre] || "ABP";

  // 🧠 Neurodiseño por grado
  const neuro =
    {
      "Primero":
        "Exploración sensoriomotriz, juego simbólico y emociones básicas. Se privilegia el vínculo con su entorno inmediato.",
      "Segundo":
        "Causalidad y narración. Se estimula la curiosidad y la estructuración del pensamiento a través de historias y exploración guiada.",
      "Tercero":
        "Razonamiento lógico-concreto. Se plantean problemas que requieren planificación básica y comprensión de relaciones causa-efecto.",
      "Cuarto":
        "Análisis crítico, justicia y sistemas. Se introduce el pensamiento lógico-formal y la lectura crítica de realidades sociales.",
      "Quinto":
        "Pensamiento sistémico, ética y salud colectiva. Se abordan problemas complejos y sus impactos comunitarios.",
      "Sexto":
        "Autonomía, impacto y legado. Se promueven proyectos de alcance mayor con sentido comunitario y social."
    }[grado] || "Ajuste evolutivo por edad.";

  // 📊 Resumen curricular global (mismo grado y trimestre)
  const { T_global, AE_global, C_global, P_global } = getResumenCurricularDelGradoTrimestre();
  const T_resumen = T_global?.length ? T_global.join("; ") : "(sin temas detectados)";
  const AE_resumen = AE_global?.length ? AE_global.join("; ") : "(sin aprendizajes esperados detectados)";
  const C_resumen = C_global?.length ? C_global.join("; ") : "(sin contenidos detectados)";
  const P_resumen = P_global?.length ? P_global.join("; ") : "(sin procesos detectados)";

  // 📋 Fases según metodología (corregidas)
  const fasesPorMetodologia = {
    ABP: ["Indagar", "Recolectar", "Formular el problema", "Organizar la experiencia", "Vivir la experiencia", "Resultados y análisis"],
    STEAM: ["Fase 1 Análisis del contexto y diagnóstico", "Fase 2 Diseño del proyecto e indagación", "Fase 3 Organización de la información", "Fase 4 Presentación de resultados", "Fase 5 Reflexión y evaluación"],
    AS: ["Punto de partida", "Lo que sé y quiero saber", "Organicemos", "Creatividad en marcha", "Compartimos y evaluamos"]
  };
  const fases = fasesPorMetodologia[metodologia] || ["Indagar", "Recolectar", "Formular el problema", "Organizar la experiencia", "Vivir la experiencia", "Resultados y análisis"];

  // 🧩 Lectura detonante opcional (si hay relación marcada)
  const tituloLecturaLimpio = String(tituloLecturaRelacionada || "").trim();
  const bloqueLectura = (contenidoLectura && contenidoLectura.trim())
    ? `
    <h3>Lectura detonante</h3>
    ${tituloLecturaLimpio ? `<p><strong>Título de la lectura relacionada:</strong> ${tituloLecturaLimpio}</p>` : ""}
    ${contenidoLectura}
    ${(preguntasComprension && preguntasComprension.length)
      ? `<ul>${preguntasComprension.map(p => `<li>${p.pregunta}<br><span style="color:mediumvioletred;">${p.respuesta || ""}</span></li>`).join("")}</ul>`
      : ""
    }`
    : "";

  // ============== NUEVO: detectar checkboxes de recursos para PROYECTOS ==============
  const subKey = (subtema || "").toString();
  const chkFicha = document.querySelector(`input[name='ficha_${subKey}']`);
  const chkAnexo = document.querySelector(`input[name='anexo_${subKey}']`);
  const chkVideo = document.querySelector(`input[name='video_${subKey}']`);
  const chkRecortable = document.querySelector(`input[name='recortable_${subKey}']`);

  const generarFichasFinal = !!chkFicha?.checked;
  const generarAnexosFinal = !!chkAnexo?.checked;
  const generarVideosFinal = !!chkVideo?.checked;
  const tieneRecortableFinal = !!chkRecortable?.checked;

  // Claves/etiquetas para PROYECTOS: siempre con prefijo p (p1a, p1b, ...)
  const obtenerClaveFichaSafe = (window.obtenerClaveProyectoFicha || window.obtenerClaveFicha || ((u) => `Ficha p${u}a`));
  const obtenerClaveRecortableSafe = (window.obtenerClaveProyectoRecortable || window.obtenerClaveRecortable || ((u) => `Recortable p${u}a`));
  const obtenerClaveAnexoSafe = (window.obtenerClaveProyectoAnexo || window.obtenerClaveAnexo || ((u) => `Anexo p${u}a`));
  const obtenerClaveVideoSafe = (window.obtenerClaveProyectoVideo || window.obtenerClaveVideo || ((u) => `Video p${u}a`));

  const claveFichaActual = generarFichasFinal ? obtenerClaveFichaSafe(unidadActual) : "";
  const claveRecortable = tieneRecortableFinal ? obtenerClaveRecortableSafe(unidadActual) : "";
  const claveAnexo = generarAnexosFinal ? obtenerClaveAnexoSafe(unidadActual) : "";
  const claveVideo = generarVideosFinal ? obtenerClaveVideoSafe(unidadActual) : "";
  // Generación dinámica del título del video según subtema + T/AE/C/P
  function generarTituloVideo(subtema) {
    const clave = subtema.replace(/\s+/g, "_");

    const T = secuenciaActual?.[`${clave}_T`] || "";
    const AE = secuenciaActual?.[`${clave}_AE`] || "";
    const C = secuenciaActual?.[`${clave}_C`] || "";
    const P = secuenciaActual?.[`${clave}_P`] || "";

    // Construcción dinámica del título
    let base = subtema;

    // Añadir rasgos curriculares compactos
    if (T) base += " — " + T.split(".")[0];
    else if (AE) base += " — " + AE.split(".")[0];
    else if (C) base += " — " + C.split(".")[0];

    return base;
  }

  // Sustituye el hardcodeado
  const tituloVideoGenerado = generarVideosFinal
    ? generarTituloVideo(subtema)
    : "";

  // Instrucción para USO ÚNICO de recursos dentro de actividades del proyecto
  const recursosOrdenados = [];
  if (generarFichasFinal) recursosOrdenados.push(`la ${claveFichaActual}`);
  if (generarAnexosFinal) recursosOrdenados.push(`el ${claveAnexo}`);
  if (tieneRecortableFinal) recursosOrdenados.push(`el ${claveRecortable}`);
  if (generarVideosFinal) recursosOrdenados.push(`el ${claveVideo} "${tituloVideoGenerado}"`);

  const instruccionRecursos = recursosOrdenados.length
    ? `IMPORTANTE: Usa cada uno de estos recursos **una sola vez** dentro de las actividades del proyecto (en fases distintas, si es posible). 
  ${recursosOrdenados.map((r, i) => `- Actividad ${i + 1}: usa ${r}`).join("\n")}
  No vuelvas a mencionar estos recursos en otras actividades.`
    : "";

  // Bloques a generar al FINAL del proyecto (como en otras categorías)
  let extraBloquesFinales = "";

  if (generarFichasFinal) {
    window.claveFichaActualGlobal = claveFichaActual;
    window.chkFichaActivo = true;
    extraBloquesFinales += `
    <!-- ===== FICHA DE REFUERZO ===== -->
    <h3 style="margin-top:24px;">${claveFichaActual}</h3>
    <p style="margin:6px 0 12px;">Ficha de refuerzo con 4 actividades. Mantén coherencia con la actividad donde se mencionó.</p>

        <div class="activity-fichas">
          <div class="actividad-principal">
            <p>1. <strong> Cambia al modo infinitivo todos los verbos que encuentres en la primera y segunda parte de la lectura generadora.</strong>  Apóyate en cualquier otra fuente de consulta válida. [IC T. IND]</p>
          </div>
          <ol type="a">
            <li>Subraya los sustantivos que sean esenciales en cada oración de la lectura.</li>
            <li>Dibuja en el margen de cada párrafo una imagen que represente la idea completa.</li>
          </ol>
          <span style="color:mediumvioletred;">Respuesta: Los sustantivos son "submarino, periscopio, explorador" y el dibujo debe mostrar un submarino observando con periscopio.</span>
        </div>
        <div class="activity-fichas">
          <div class="actividad-principal">
            <p>2. <strong> Cambia al modo infinitivo todos los verbos que encuentres en la primera y segunda parte de la lectura generadora.</strong>  Apóyate en cualquier otra fuente de consulta válida. [IC T. IND]</p>
          </div>
          <ol type="a">
            <li>Subraya los sustantivos que sean esenciales en cada oración de la lectura.</li>
            <li>Encierra en un rectángulo rojo el sustantivo clave.</li>
            <li>Dibuja en el margen de cada párrafo una imagen que represente la idea completa.</li>
          </ol>
          <span style="color:mediumvioletred;">Respuesta: Los sustantivos son "submarino, periscopio, explorador" y el dibujo debe mostrar un submarino observando con periscopio.</span>
        </div>
        <div class="activity-fichas">
          <div class="actividad-principal">
            <p>3. <strong> Cambia al modo infinitivo todos los verbos que encuentres en la primera y segunda parte de la lectura generadora.</strong>  Apóyate en cualquier otra fuente de consulta válida. [IC T. IND]</p>
          </div>
          <ol type="a">
            <li>Subraya los sustantivos que sean esenciales en cada oración de la lectura.</li>
            <li>Encierra en un rectángulo rojo el sustantivo clave.</li>
            <li>Dibuja en el margen de cada párrafo una imagen que represente la idea completa.</li>
          </ol>
          <span style="color:mediumvioletred;">Respuesta: Los sustantivos son "submarino, periscopio, explorador" y el dibujo debe mostrar un submarino observando con periscopio.</span>
        </div>
        <div class="activity-fichas">
          <div class="actividad-principal">
            <p>4. <strong> Cambia al modo infinitivo todos los verbos que encuentres en la primera y segunda parte de la lectura generadora.</strong>  Apóyate en cualquier otra fuente de consulta válida. [IC T. IND]</p>
          </div>
          <ol type="a">
            <li>Subraya los sustantivos que sean esenciales en cada oración de la lectura.</li>
          </ol>
          <span style="color:mediumvioletred;">Respuesta: Los sustantivos son "submarino, periscopio, explorador" y el dibujo debe mostrar un submarino observando con periscopio.</span>
        </div>
    `;
  }

  if (generarAnexosFinal) {
    extraBloquesFinales += `
<!-- ===== ANEXO VISUAL ===== -->
<div class="activity" style="margin-top:30px;">
  <strong>${claveAnexo} - [Tema del anexo]</strong>
  <div style="margin-top:10px; padding:10px; background:#f9f9f9; border-left:4px solid #6c63ff;">
    <p><em>Descripción visual detallada:</em> tablas/esquemas/mapa conceptual que sintetiza el contenido clave del proyecto.</p>
    <p style="margin-top:8px;">Este anexo sirve como <strong>referencia visual</strong> para apoyar la comprensión.</p>
  </div>
</div>
`;
  }

  if (tieneRecortableFinal) {
    extraBloquesFinales += `
<!-- ===== RECORTABLE ===== -->
<div class="activity" style="margin-top:30px;">
  <strong>${claveRecortable}</strong>
  <div style="margin-top:10px;">
    <p>Describe con precisión las piezas del recortable (tarjetas, colores, texto, tamaño) y cómo se usa en la actividad donde se mencionó. Añade espacio para pegarlo.</p>
  </div>
</div>
`;
  }

  if (generarVideosFinal) {
    extraBloquesFinales += `
<!-- ===== GUION DE VIDEO ===== -->
<div class="activity" style="margin-top:30px;">
  <strong>${claveVideo} - Guion de video educativo basado en el subtema: "${subtema}"</strong>
  <p style="margin:0; font-size:13px; color:#555;">
    Integrado con T/AE/C/P: ${secuenciaActual?.[`${subtema.replace(/\s+/g, "_")}_T`] || ""}
  </p>
  <table border="1" cellpadding="6" style="width:100%; margin-top:10px;">
    <tr style="background:#eaeaea;">
      <th>Tiempo</th><th>Guion</th><th>Transición</th><th>Elemento visual</th>
    </tr>
    <tr><td>0-6s</td><td>[Pregunta detonante o anclaje PNL del tema]</td><td>[Zoom/sonido]</td><td>[Animación/ícono central]</td></tr>
    <tr><td>6-12s</td><td>[Idea 1]</td><td>[Corte suave]</td><td>[Ilustración del concepto]</td></tr>
    <tr><td>12-18s</td><td>[Idea 2]</td><td>[Efecto/sonido]</td><td>[Escena breve]</td></tr>
    <tr><td>18-24s</td><td>[Aplicación]</td><td>[Transición]</td><td>[Recurso visual]</td></tr>
    <tr><td>24-30s</td><td>[Cierre con call to action claro]</td><td>[Fade out]</td><td>[Personaje invita a actuar]</td></tr>
  </table>
  <p style="margin-top:10px;"><em>Duración total 50–60s. Lenguaje dinámico y cercano. NO usar saludos repetitivos.</em></p>
</div>
`;
  }

  // ⛳ Lista de criterios para PISA (si viene de tu flujo). Fallback incluido.
  const criteriosCadena = (typeof listaCriterios !== "undefined" && listaCriterios)
    ? listaCriterios
    : "Localización, Interpretación, Integración, Evaluación, Reflexión/Transferencia";

  // 🆕 INSTRUCCIÓN DE LONGITUD PARA PROYECTOS
  const instruccionLongitudProyecto = `
    Para ${grado}° grado de ${nivel}, ajusta las actividades del proyecto:
    ${grado === "Primero" || grado === "Segundo" ?
      "- Instrucciones MUY claras y breves, lenguaje simple, mantener formato de actividades" :
      grado === "Tercero" || grado === "Cuarto" ?
        "- Instrucciones claras pero con más detalle,  mantener formato de actividades" :
        "- Instrucciones completas y detalladas,  mantener formato de actividades"
    }
    ${grado === "Primero" ?
      "- Actividades más guiadas, con pasos muy específicos" :
      "- Actividades que permitan mayor autonomía según el grado"
    }
  `;

  // Agrega las instrucciones al prompt del proyecto
  const instruccionesAdicionalesHTML = instruccionesAdicionales
    ? `
        <!-- INSTRUCCIONES ADICIONALES DEL USUARIO -->
        <div class="instrucciones-usuario-proyecto" style="background:#f0f7ff; border-left:4px solid #9C27B0; padding:10px; margin:15px 0; border-radius:4px;">
            <strong>✏️ Instrucciones específicas para el proyecto:</strong>
            <p>${instruccionesAdicionales}</p>
        </div>
        `
    : '';

  // ================= PROMPT FINAL =================
  const prompt = `
        ${instruccionesAdicionalesHTML}
  Eres un pedagogo especialista en diseño curricular neurodidáctico.
  Importante: devuelve SOLO HTML final, sin comentarios extra ni marcas de código.

  Genera un **proyecto trimestral** para primaria, basado en los **T/AE/C/P globales** del mismo grado y trimestre, aplicando **${metodologia}**.

  📊 Datos base:

  ${instruccionLongitudProyecto}

  - Nivel: ${nivel}
  - Grado: ${grado}
  - Trimestre: ${trimestre}
  - Metodología: ${metodologia}
  - Campo formativo: Integrador

  🧠 Información curricular integrada:
  - Temas (T): ${T_resumen}
  - Aprendizajes esperados (AE): ${AE_resumen}
  - Contenidos (C): ${C_resumen}
  - Procesos (P): ${P_resumen}

  ${bloqueLectura}

  📌 Pasos:
  1) Genera una **pregunta detonante** clara y contextual.
  2) Escribe una **lectura generadora** (300–500 palabras) segmentada en párrafos cortos.
      -IMPORTANTE: envuelve en bold <b>sinonimos</b> las palabras que puedan tener más de una sinónimo 
      -IMPORTANTE: los <b>sinonimos</b> deben ser palabras difíciles
      -crea una tabla al final de la lectura con las palabras en bold y sus sinónimos, 
      -los sinónimos de la tabla deben ser sencillos para que los niños los comprendan
  3) **Justo después de la lectura generadora, añade 6 preguntas de comprensión tipo PISA**, NO literales:
    - Al menos 1 metacognitiva.
    - Usa el formato EXACTO:
      <ol>
        <li>
          <p>1.<strong>¿…texto de la pregunta…?</strong></p>
          <p><strong>Nivel:</strong> Nivel 1|2|3 — <strong>Criterio:</strong> uno de: ${criteriosCadena}</p>
          <p style="color:#c970d6;">…respuesta esperada…</p>
        </li>
      </ol>
  4) Diseña el **proyecto por fases** de ${metodologia}. En **cada fase** genera actividades con **el mismo formato unificado** que usamos en otras categorías.
  5) Tras las actividades de **cada fase**, añade una **RÚBRICA DE FASE** (4 niveles) basada en el producto y desempeño que esa fase exige.
  6) Cierra con **criterios de evaluación global**.

  🧭 Fases a desarrollar (en orden):
  ${fases.map((f, i) => `${i + 1}. ${f}`).join("\n")}

  🎯 Reglas estrictas para **cada actividad**:
  - Cada actividad va en **<div class="activity">**.
  - Estructura EXACTA:
  - Importante: colocar de una a cuatro subactividades (li) según lo requiera por cada, Importante en modo singular, ej: "Recorta la imagen de la página 54 y pegala en el espacio en correspondiente"<div class="activity">

      **NUEVO FORMATO UNIFICADO PARA ACTIVIDADES:**
      IMPORTANTE: El número de subactividades (li) debe ser VARIABLE según lo requiera cada actividad:
      - Algunas actividades pueden tener solo 1 subactividad si es suficiente
      - Otras pueden tener 2, 3 o hasta 4 subactividades si la complejidad lo requiere
      - NO siempre deben ser 3 subactividades
      
      <div class="activity">
      <p>1. <strong> Cambia al modo infinitivo todos los verbos que encuentres en la primera y segunda parte de la lectura generadora.</strong>  Apóyate en cualquier otra fuente de consulta válida. [IC T. IND]</p>
        <ol type="a" class="steps">
          <li>Subactividad a) describe cómo hacerlo</li>
          <!-- AQUÍ PUEDEN IR DE 1 A 4 SUBACTIVIDADES SEGÚN SEA NECESARIO -->
          <li>Subactividad b) amplía o aplica lo anterior (OPCIONAL)</li>
          <li>Subactividad c) concluye o reflexiona (OPCIONAL)</li>
          <li>Subactividad d) pregunta metacognitiva solo si se requiere (OPCIONAL)</li>
        </ol>
        <div class="answer">
          <span style="color:mediumvioletred;">Respuesta: [Breve ejemplo de respuesta esperada]</span>
        </div>
      </div>

      EJEMPLOS DE ESTRUCTURAS VÁLIDAS:
      
      // ✅ Actividad con 1 sola subactividad:
      <div class="activity">
      <p>1. <strong> Cambia al modo infinitivo todos los verbos que encuentres en la primera y segunda parte de la lectura generadora.</strong>  Apóyate en cualquier otra fuente de consulta válida. [IC T. IND]</p>
        <ol type="a" class="steps">
          <li>Explica paso a paso tu procedimiento</li>
        </ol>
        <div class="answer">
          <span style="color:mediumvioletred;">Respuesta: [ejemplo de respuesta]</span>
        </div>
      </div>
      
      // ✅ Actividad con 2 subactividades:
      <div class="activity">
      <p>2. <strong> Cambia al modo infinitivo todos los verbos que encuentres en la primera y segunda parte de la lectura generadora.</strong>  Apóyate en cualquier otra fuente de consulta válida. [IC T. IND]</p>
        <ol type="a" class="steps">
          <li>Identifica las ideas principales</li>
          <li>Explica con tus palabras el mensaje del autor</li>
        </ol>
        <div class="answer">
          <span style="color:mediumvioletred;">Respuesta: [ejemplo de respuesta]</span>
        </div>
      </div>
      
      // ✅ Actividad con 3 subactividades:
      <div class="activity">
      <p>3. <strong> Cambia al modo infinitivo todos los verbos que encuentres en la primera y segunda parte de la lectura generadora.</strong>  Apóyate en cualquier otra fuente de consulta válida. [IC T. IND]</p>
        <ol type="a" class="steps">
          <li>Busca información en diferentes fuentes</li>
          <li>Organiza la información encontrada</li>
          <li>Prepara una breve presentación</li>
        </ol>
        <div class="answer">
          <span style="color:mediumvioletred;">Respuesta: [ejemplo de respuesta]</span>
        </div>
      </div>
      
      // ✅ Actividad con 4 subactividades (para casos complejos):
      <div class="activity">
      <p>4. <strong> Cambia al modo infinitivo todos los verbos que encuentres en la primera y segunda parte de la lectura generadora.</strong>  Apóyate en cualquier otra fuente de consulta válida. [IC T. IND]</p>
        <ol type="a" class="steps">
          <li>Formula tu hipótesis</li>
          <li>Diseña el procedimiento experimental</li>
          <li>Registra tus observaciones</li>
          <li>Analiza los resultados y saca conclusiones</li>
        </ol>
        <div class="answer">
          <span style="color:mediumvioletred;">Respuesta: [ejemplo de respuesta]</span>
        </div>
      </div>

     ${estructuraActividades}


  - Lenguaje claro; reto cognitivo alto (Bloom: analizar, evaluar, crear).
  - Máx. 50–70 palabras por actividad (sin steps/answer).
  - **Siempre** incluir **una pregunta metacognitiva** en algún paso (<em>itálica</em>).
  - **Variar modalidades**: [IC T. IND], [IC T. PAR], [IC T. EQUI] (la 1.ª de CADA fase DEBE llevar identificador).
  - Mínimo **2 actividades por fase**; máximo 3.

  ${instruccionRecursos}

  📦 Metadatos de FASE (al final de sus actividades):
  <div class="phase-meta">
    <p><strong>Producto:</strong> ...</p>
    <p><strong>Recursos:</strong> ...</p>
    <p><strong>Roles:</strong> ...</p>
    <p><strong>Tiempo estimado:</strong> ...</p>
    <p><strong>Evaluación:</strong> ...</p>
  </div>

  🟣 **RÚBRICA POR FASE (OBLIGATORIA, inmediatamente después de .phase-meta)**
  <div class="phase-rubric" style="margin:16px 0; border:2px solid #b57cb3; border-radius:8px;">
    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:color-mix(in srgb, var(--app-bg-color,#ffffff) 82%, var(--cb-chrome-bg,#3f4d98) 18%); color:var(--app-text-color,#0f172a);">
      <strong>Rúbrica de la fase</strong>
      <span style="opacity:.6;">Marca ✓ tu nivel</span>
    </div>
    <table border="1" cellpadding="10" cellspacing="0" style="width:100%; border-collapse:collapse; border-color:#b57cb3;">
      <thead>
        <tr>
          <th style="width:20%; background:color-mix(in srgb, var(--app-bg-color,#ffffff) 82%, var(--cb-chrome-bg,#3f4d98) 18%); color:var(--app-text-color,#0f172a);">Criterio</th>
          <th style="width:20%; background:color-mix(in srgb, var(--app-bg-color,#ffffff) 82%, var(--cb-chrome-bg,#3f4d98) 18%); color:var(--app-text-color,#0f172a);">Nivel 4</th>
          <th style="width:20%; background:color-mix(in srgb, var(--app-bg-color,#ffffff) 82%, var(--cb-chrome-bg,#3f4d98) 18%); color:var(--app-text-color,#0f172a);">Nivel 3</th>
          <th style="width:20%; background:color-mix(in srgb, var(--app-bg-color,#ffffff) 82%, var(--cb-chrome-bg,#3f4d98) 18%); color:var(--app-text-color,#0f172a);">Nivel 2</th>
          <th style="width:20%; background:color-mix(in srgb, var(--app-bg-color,#ffffff) 82%, var(--cb-chrome-bg,#3f4d98) 18%); color:var(--app-text-color,#0f172a);">Nivel 1</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Calidad del producto</strong></td>
          <td>[Producto claro, coherente y puntual acorde a la fase]</td>
          <td>[Producto claro con mejoras menores]</td>
          <td>[Aspectos centrales parcialmente claros]</td>
          <td>[Producto incompleto o copiado]</td>
        </tr>
        <tr>
          <td><strong>Comunicación y explicación</strong></td>
          <td>[Explica con claridad y soltura al grupo]</td>
          <td>[Explica con claridad]</td>
          <td>[Dificultad para clarificar ideas]</td>
          <td>[Lee sin explicar ni ampliar]</td>
        </tr>
        <tr>
          <td><strong>Uso de recursos</strong></td>
          <td>[Usa materiales pertinentes y coherentes con la fase]</td>
          <td>[Usa materiales que sintetizan ideas]</td>
          <td>[Materiales parcialmente relacionados; los usa poco]</td>
          <td>[No utiliza recursos visuales pertinentes]</td>
        </tr>
      </tbody>
    </table>
  </div>

  🧠 Neurodiseño (${grado}°): ${neuro}

  🔒 Salida: SIN encabezado global h1/h2.

  <h3>Pregunta detonante</h3>
  <p>[texto]</p>

  <h3>Lectura generadora</h3>
  <p>[lectura completa en 300–500 palabras]</p>

  <!-- 👇 BLOQUE OBLIGATORIO INMEDIATAMENTE DESPUÉS DE LA LECTURA -->
  <h3>Preguntas de comprensión</h3>
  <ol>
    <li>
      <p>1.<strong>¿…texto de la pregunta 1…?</strong></p>
      <p><strong>Nivel:</strong> Nivel 1|2|3 — <strong>Criterio:</strong> uno de: ${criteriosCadena}</p>
      <p style="color:#c970d6;">…respuesta esperada…</p>
    </li>
    <li>
      <p>2.<strong>¿…texto de la pregunta 2…?</strong></p>
      <p><strong>Nivel:</strong> Nivel 1|2|3 — <strong>Criterio:</strong> uno de: ${criteriosCadena}</p>
      <p style="color:#c970d6;">…respuesta esperada…</p>
    </li>
    <li>
      <p>3.<strong>¿…texto de la pregunta 3…?</strong></p>
      <p><strong>Nivel:</strong> Nivel 1|2|3 — <strong>Criterio:</strong> uno de: ${criteriosCadena}</p>
      <p style="color:#c970d6;">…respuesta esperada…</p>
    </li>
    <li>
      <p>4.<strong>¿…texto de la pregunta 4…?</strong></p>
      <p><strong>Nivel:</strong> Nivel 1|2|3 — <strong>Criterio:</strong> uno de: ${criteriosCadena}</p>
      <p style="color:#c970d6;">…respuesta esperada…</p>
    </li>
    <li>
      <p>5.<strong><em>¿…pregunta metacognitiva…?</em></strong></p>
      <p><strong>Nivel:</strong> Nivel 1|2|3 — <strong>Criterio:</strong> uno de: ${criteriosCadena}</p>
      <p style="color:#c970d6;">…respuesta esperada…</p>
    </li>
    <li>
      <p>6.<strong><em>¿…pregunta metacognitiva…?</em></strong></p>
      <p><strong>Nivel:</strong> Nivel 1|2|3 — <strong>Criterio:</strong> uno de: ${criteriosCadena}</p>
      <p style="color:#c970d6;">…respuesta esperada…</p>
    </li>
  </ol>

  <div class="project-phases">
    ${fases.map((f, i) => `
    <div class="phase">
      <h3>${i + 1}. ${f}</h3>
      <!-- Genera 2 o 3 actividades .activity -->
      <div class="phase-meta">
        <p><strong>Producto:</strong> ...</p>
        <p><strong>Recursos:</strong> ...</p>
        <p><strong>Roles:</strong> ...</p>
        <p><strong>Tiempo estimado:</strong> ...</p>
        <p><strong>Evaluación:</strong> ...</p>
      </div>
      <!-- Inserta aquí la .phase-rubric adaptada a esta fase -->
    </div>`).join("")}
  </div>

  <!-- ====== RECURSOS DEL PROYECTO (generados según checkboxes) ====== -->
  ${extraBloquesFinales}

  <div class="project-summary">
    <h3>Presentemos (Producto final y socialización)</h3>
    <p>[Describe el producto final y su presentación]</p>
    <h3>Criterios de evaluación global</h3>
    <ul>
      <li>Logro de AE globales</li>
      <li>Calidad del producto final</li>
      <li>Trabajo colaborativo</li>
      <li>Reflexión y transferencia</li>
    </ul>
  </div>
  `;

  // exportar algunos datos útiles por si se usan afuera
  return {
    prompt,
    T_global,
    AE_global,
    C_global,
    P_global,
    metodologia,
    generarFichasFinal,
    generarAnexosFinal,
    generarVideosFinal,
    tieneRecortableFinal,
    claveFichaActual,
    claveAnexo,
    claveRecortable,
    claveVideo,
    tituloVideoGenerado
  };
};
// ===================== FIN PROYECTOS =====================

// 🔧 FUNCIÓN DE LIMPIEZA PARA ARTES - SOLUCIÓN 3
function limpiarDuplicadosArtes() {
  const contenedor = document.querySelector('#contenedor-Lenguaje-y-comunicación');
  if (!contenedor) return;

  const fichas = contenedor.querySelectorAll('h3, .activity-fichas');
  const vistas = new Set();

  fichas.forEach(el => {
    const texto = el.textContent.trim().replace(/\s+/g, ' ');
    if (!/ficha\s+\d+/i.test(texto) && !el.classList.contains('activity-fichas')) {
      return;
    }
    const clave = texto.toLowerCase().replace(/ficha\s+\d+[a-z]?/g, 'ficha');
    if (vistas.has(clave)) {
      el.remove();
    } else {
      vistas.add(clave);
    }
  });
}



window.construirPromptDeCategoria = function (categoria, objetivos, contenidoLectura, preguntasComprension, nombresSubtemas = [], cantidad = 4, generarFichas = false, generarAnexos = false, generarVideos = false, tituloCreativo = "", promptTitulo, relacionadaConLectura = false, instruccionesAdicionales = "") {
  const unidadActual = document.getElementById("unidadNumero")?.value || selectUnidad?.value || "1";

  // La lectura base ya se inyecta en el render (col-alumno). No repetir en el HTML generado por IA.
  const debeIncluirLecturaCompleta = false;

  const bloqueLectura =
    debeIncluirLecturaCompleta && contenidoLectura?.trim()
      ? `
            <h3>Lectura generadora</h3>
            ${contenidoLectura}
            ${preguntasComprension?.length ? `
              <div class="preguntas-lectura">
                <h4>Preguntas de comprensión:</h4>
                <ul>
                  ${preguntasComprension.map(p =>
        `<li>${p.pregunta}<br><span style="color:mediumvioletred;">${p.respuesta || ""}</span></li>`
      ).join("")}
                </ul>
              </div>`
        : ""}
          `
      : "";


  const nivel = selectNivel.value;
  const grado = selectGrado.value;
  const subtemaClave = nombresSubtemas[0];
  const tituloFinal = tituloCreativo || formatearSubtema(subtemaClave);
  const subtemaFormateado = formatearSubtema(subtemaClave);

  const objetivosAgrupados = {};
  const objetivosDelSubtema = objetivos.filter(o => o.subtema === subtemaClave);

  // 1. Verificación unificada de opciones (parámetros y DOM)
  const checkboxFichas = document.querySelector(`input[name='ficha_${subtemaClave}']`);
  const checkboxAnexos = document.querySelector(`input[name='anexo_${subtemaClave}']`);
  const checkboxVideos = document.querySelector(`input[name='video_${subtemaClave}']`);
  const checkboxRecortable = document.querySelector(`input[name='recortable_${subtemaClave}']`);

  const generarFichasFinal = (generarFichas || (checkboxFichas && checkboxFichas.checked));
  const generarAnexosFinal = (generarAnexos || (checkboxAnexos && checkboxAnexos.checked));
  const generarVideosFinal = (generarVideos || (checkboxVideos && checkboxVideos.checked));
  const tieneRecortable = (objetivosDelSubtema.some(o => o.recortable) || (checkboxRecortable && checkboxRecortable.checked));


  objetivosDelSubtema.forEach(o => {
    if (!objetivosAgrupados[o.subtema]) objetivosAgrupados[o.subtema] = {};
    objetivosAgrupados[o.subtema][o.tipo] = o;
  });

  const T = objetivosAgrupados[subtemaClave]?.T?.descripcion || "Tema no disponible";
  const AE = objetivosAgrupados[subtemaClave]?.AE?.descripcion || "Aprendizaje esperado no disponible";
  const C = objetivosAgrupados[subtemaClave]?.C?.descripcion || "Contenido no disponible";
  const P = objetivosAgrupados[subtemaClave]?.P?.descripcion || "Proceso no disponible";

  const subtemaRelacionado = document.querySelector(`select[name='interdisciplinariedad_${subtemaClave}']`)?.value || "";
  const claveInterdisc = String(subtemaRelacionado || "").replace(/\s+/g, "_");
  const interdiscT = claveInterdisc ? (secuenciaActual?.[`${claveInterdisc}_T`] || "") : "";
  const interdiscAE = claveInterdisc ? (secuenciaActual?.[`${claveInterdisc}_AE`] || "") : "";
  const semillaCreativa = obtenerSemillaCreativa(categoria, subtemaClave);
  const notaInterdisc = subtemaRelacionado
    ? `Este subtema debe relacionarse de forma EXPLÍCITA con "${formatearSubtema(subtemaRelacionado)}".
       Incluye al menos 2 actividades que conecten conceptos de ambos subtemas.
       Referencia puente sugerida: Tema "${interdiscT || "No disponible"}"; AE "${interdiscAE || "No disponible"}".`
    : "";

  const competencias = `
1. **Para Matemáticas**:
   - Conceptos matemáticos: Investigar ideas básicas utilizando métodos inductivos y deductivos.
   - Retos matemáticos: Convertir el salón en un taller de solución de problemas.
   - Lógica matemática: Fomentar el pensamiento abstracto y metacognición.
   - Experimentación matemática: Aplicar conceptos matemáticos a situaciones reales.
   - Usa, tablas de valor posicional, Juegos de basta, Tablas de fracciones, uso de menor y mayor qué, etc...
   - Usa un nivel alto de complejidad y actividades de pre-requisito y ampliación.
   - Actividades con Sentido numérico y pensamiento algebraico.

2. **Para Lenguaje y comunicación**:
   - Expresión oral: Fomentar la fluidez verbal y el conocimiento del destinatario.
   - Expresión escrita: Desarrollar habilidades en redacción, ortografía y caligrafía.
   - Comprensión lectora: Incrementar las habilidades de comprensión y razonamiento verbal.
   - Convenciones lingüísticas: Dominio de gramática, sintaxis y literatura.

3. **Para Ciencias experimentales**:
   - Conceptos científicos: Construir glosarios y diagramas para visualizar conceptos.
   - Experimentación: Aplicar la ciencia con un enfoque en la salud y el ambiente.
   - Pensamiento científico: Desarrollar teorías y aplicarlas en la vida real.
   - Interdisciplinariedad: Relacionar ciencias con otras asignaturas.

4. **Para Ciencias sociales**:
   - Historia de paisajes y convivencia de mi comunidad
   - Conceptos sociales: Conceptualizar y abstraer ideas sociales.
   - Formación cultural: Elaborar comparaciones de culturas y sus aportaciones.
   - Gestión de la información: Analizar datos y usar diversas fuentes de información.
   - Actitudes y valores: Desarrollar posturas personales basadas en la historia y cultura.
  `;

  let extraDificultadCategoria = "";

  if (categoria === "Matemáticas") {
    extraDificultadCategoria = `
    Para Matemáticas, eleva la dificultad con actividades que impliquen comparación de métodos, resolución de problemas no rutinarios, análisis de errores y explicación detallada del razonamiento paso a paso. Incluye preguntas que fomenten la transferencia del conocimiento a situaciones reales y el uso de estrategias de resolución múltiples.  
    `;
  } else if (categoria === "Lenguaje y comunicación") {
    extraDificultadCategoria = `
    Para Lenguaje y comunicación, eleva la dificultad añadiendo análisis comparativo de textos, deducción de significados implícitos, formulación de hipótesis sobre el texto, y redacción de argumentos críticos que exijan justificar opiniones con ejemplos.  
    `;
  } else if (categoria === "Artes") {
    extraDificultadCategoria = `
    Para Artes, plantea actividades que vayan más allá de la reproducción...  
    `;
  } else if (categoria === "Ciencias experimentales") {
    extraDificultadCategoria = `
    Para Ciencias experimentales, incrementa la complejidad proponiendo experimentos de análisis de variables, formulación de hipótesis, interpretación de resultados en gráficos o tablas, y relación de conceptos científicos con problemas ambientales o de salud reales.  
    `;
  } else if (categoria === "Ciencias sociales") {
    extraDificultadCategoria = `
    Para Ciencias sociales, sube la dificultad solicitando comparación entre contextos históricos, análisis crítico de causas y consecuencias, debates argumentados sobre dilemas éticos o sociales, y elaboración de propuestas de mejora para la comunidad.  
    `;
  } else if (categoria === "Formación socioemocional") {
    extraDificultadCategoria = `
    Para Formación socioemocional, aumenta la dificultad con análisis de casos reales, toma de decisiones justificadas en situaciones complejas, reflexión profunda sobre emociones y valores, y diseño de estrategias grupales para la resolución de conflictos o mejora de la convivencia.  
    `;
  } else {
    extraDificultadCategoria = "";
  }

  const tipoActividad = `
  1. tipos de Actividades: Incluir variedad: opción múltiple, completar, dramatizar, construir, recortar, ordenar, escribir, etc.
  `;

  // 🔹 TÍTULO DE VIDEO DINÁMICO POR SUBTEMA + T/AE
  function generarTituloVideo(subtema, T, AE) {
    let base = formatearSubtema(subtema);

    // Añade un guiño al Tema / AE para que no se quede genérico
    if (T && T !== "Tema no disponible") {
      base += ` — ${T.split(".")[0]}`;
    } else if (AE && AE !== "Aprendizaje esperado no disponible") {
      base += ` — ${AE.split(".")[0]}`;
    }

    // Limita a algo razonable
    if (base.length > 80) base = base.slice(0, 77) + "...";
    return base;
  }

  const tituloVideoGenerado = generarVideosFinal
    ? generarTituloVideo(subtemaClave, T, AE)
    : "";

  // 2. GENERACIÓN UNIFICADA DE CLAVES Y RECURSOS
  const recursos = {
    fichas: { generado: false, clave: "" },
    anexos: { generado: false, clave: "" },
    recortables: { generado: false, clave: "" },
    videos: { generado: false, clave: tituloVideoGenerado }
  };

  // ✅ CORRECCIÓN: usar SIEMPRE los flags finales (…Final / tieneRecortable)
  if (generarFichasFinal) {
    recursos.fichas.clave = obtenerClaveFicha(unidadActual);
    recursos.fichas.generado = true;
    window.claveFichaActualGlobal = recursos.fichas.clave;
    window.chkFichaActivo = true;
  }

  if (generarAnexosFinal) {
    recursos.anexos.clave = obtenerClaveAnexo(unidadActual);
    recursos.anexos.generado = true;
    window.claveAnexoActualGlobal = recursos.anexos.clave;
  }

  if (tieneRecortable) {
    recursos.recortables.clave = obtenerClaveRecortable(unidadActual);
    recursos.recortables.generado = true;
  }

  if (generarVideosFinal && tituloVideoGenerado) {
    recursos.videos.generado = true;
  }


  // 3. CONSTRUCCIÓN UNIFICADA DE INSTRUCCIONES DE RECURSOS
  const recursosOrdenados = [];
  if (recursos.fichas.generado) recursosOrdenados.push(`la ${recursos.fichas.clave}`);
  if (recursos.anexos.generado) recursosOrdenados.push(`el anexo visual ${recursos.anexos.clave}`);
  if (recursos.recortables.generado) recursosOrdenados.push(`el ${recursos.recortables.clave}`);
  if (recursos.videos.generado) recursosOrdenados.push(`el video "${recursos.videos.clave}"`);

  const instruccionRecursos = recursosOrdenados.length > 0
    ? `IMPORTANTE: Cada uno de estos recursos debe usarse en **UNA sola actividad normal** y no repetirse:
  ${recursosOrdenados.map((r, idx) => `- Actividad ${idx + 1}: usa ${r}`).join("\n")}

  No vuelvas a mencionar estos recursos en otras actividades.
  - Ejemplos correctos:
    * "Usa el recortable ${recursos.recortables.clave} para apoyar la actividad..."
    * "Refuerza tu aprendizaje usando la ${recursos.fichas.clave}..."
    * "Consulta el anexo visual ${recursos.anexos.clave} para resolver esta actividad..."
    * "Mira el video '${recursos.videos.clave}' y responde..."

  ⚠️ Las demás actividades normales NO deben volver a mencionar estos recursos.`
    : "";

  // 4. BLOQUES FINALES UNIFICADOS
  let extraBloquesFinales = "";

  // Fichas - solo si está activo
  if (recursos.fichas.generado) {
    extraBloquesFinales += `
      🚨 OBLIGATORIO: genera EXACTAMENTE 1 ficha de refuerzo con clave <strong>${recursos.fichas.clave}</strong> y EXACTAMENTE 4 actividades.
      - Usa la MISMA calidad pedagógica y la MISMA estructura de las actividades normales.
      - Diferencia única: el contenedor debe ser <div class="activity-fichas"> en lugar de <div class="activity">.
      - Cada ficha debe profundizar/variar una actividad normal del subtema (no repetir literalmente).
      - Cada actividad de ficha debe incluir:
        1) instrucción principal en negritas,
        2) de 1 a 4 subactividades útiles,
        3) modalidad [IC T. IND] / [IC T. PAR] / [IC T. EQUI],
        4) respuesta esperada concreta en magenta.
      `;
  }

  // Anexos - solo si está activo
  if (recursos.anexos.generado) {
    extraBloquesFinales += `
      🚨 OBLIGATORIO: DEBES generar EXACTAMENTE 1 anexo visual:
      - Clave: <strong>${recursos.anexos.clave}</strong>
      - Formato: <div class="activity">...</div>
      - Descripción visual detallada para reforzar el conocimiento de la actividad
      - Puede ser tablas comparativas, esquemas, mapas conceptuales, etc.
      - NO OMITIR ESTO BAJO NINGUNA CIRCUNSTANCIA

      Ejemplo de estructura:
      <div class="activity" style="margin-top:30px;">
        <strong>${recursos.anexos.clave} - [tema del anexo]</strong>
        <div style="margin-top:10px; padding:10px; background:#f9f9f9; border-left:4px solid #6c63ff;">
          <p><em>Descripción detallada del material visual:</em></p>
          [Aquí va el contenido detallado del anexo]
          <p style="margin-top:8px;">Este anexo sirve como <strong>referencia visual</strong> para apoyar la comprensión.</p>
        </div>
      </div>
    `;
  }

  // Videos - solo si está activo
  if (recursos.videos.generado) {
    extraBloquesFinales += `
      🚨 OBLIGATORIO: DEBES generar **exactamente UN guion de video en tabla HTML al final del subtema**.

      IMPORTANTE: SOLO UNA ACTIVIDAD debe usar el **video "${recursos.videos.clave}"**.  
      - Menciónalo en el enunciado: "Mira el video "${recursos.videos.clave}" y responde...".  
      - Al final del subtema, genera el guion del video a partir de una pregunta generadora.

      GUION PROFESIONAL DE VIDEO:
      - El guion debe ser divertido, entretenido y captar la atención del alumno.
      - ESTRUCTURA OBLIGATORIA:
        1) Inicio: pregunta detonante o anclaje PNL (NO saludo genérico).
        2) Desarrollo: contenido del video en secuencia clara.
        3) Cierre: call to action concreto (qué hará el alumno después del video).
      - Usa lenguaje dinámico, preguntas curiosas y narrativas que sorprendan.
      - PROHIBIDO iniciar con frases repetitivas como "Hola pequeños exploradores", "Hola chicos", "Hola niños", o variantes.
      - Estructura el guion en una tabla HTML con columnas: Tiempo, Guion, Transición, Elemento visual.
      - Total entre 50 y 60 segundos (escenas de 4, 6 u 8 segundos).
      - Finaliza con una frase motivacional + call to action medible.

      Ejemplo de estructura:
      <div class="activity" style="margin-top:30px;">
        <strong>Guion de video: "${recursos.videos.clave}"</strong>
        <table border="1" cellpadding="6" style="width:100%; margin-top:10px;">
          <tr style="background:#eaeaea;">
            <th>Tiempo</th>
            <th>Guion</th>
            <th>Transición</th>
            <th>Elemento visual</th>
          </tr>
          <!-- filas del guion -->
        </table>
      </div>
    `;
  }

  // Recortables - solo si está activo
  if (recursos.recortables.generado) {
    extraBloquesFinales += `
      🚨 OBLIGATORIO: DEBES generar EXACTAMENTE 1 recortable:
      - Clave: <strong>${recursos.recortables.clave}</strong>
      - Formato: <div class="activity">...</div>
      - Descripción visual completa de la actividad recortable
      - Describe detalladamente cada tarjeta, imagen, pieza, color, texto, forma y tamaño.
      - Si hay categorías, grupos o instrucciones de uso, descríbelos con claridad.
      - Considera tamaño reducido para poder pegarlo en el libro de actividades.
    `;
  }

  const seccionesExtra = `
  ✅ Si el subtema lo amerita, agrega **una sola sección extra** al final de las actividades (pero no ambas), siguiendo una de estas opciones, siempre en formato profesional y adecuado:

  1. <div class="activity" style="margin-top:30px;">
     <strong>Para saber más.</strong>
     <p>Si hay un término o concepto importante que convenga reforzar, incluye una breve explicación de 1 a 2 líneas en lenguaje sencillo y directo, que ayude a consolidar el conocimiento.</p>
     <p><em>Ejemplo: "La fotosíntesis es el proceso por el cual las plantas convierten la luz solar en energía para vivir."</em></p>
  </div>

  2. <div class="activity" style="margin-top:30px;">
     <strong>El poder de la voz.</strong>
     <blockquote style="border-left: 4px solid #2196f3; padding-left:12px; margin:12px 0; font-style:italic; background:#f4f7fc;">
        "La educación es el arma más poderosa que puedes usar para cambiar el mundo."
        <br>
        <span style="font-weight:bold;">Nelson Mandela</span>
     </blockquote>
  </div>
  ⚠️ IMPORTANTE: No incluyas ambas. Solo una sección y solo si verdaderamente aporta al subtema. Si no aplica, omite esta sección.
  - No incluyas frases religiosas, controversiales, violentas o anónimas.
  - No incluir emojis
  `;

  const tituloCreativoPrompt = `
  Antes de generar las actividades, crea un título breve y atractivo (máximo 8 palabras) para el subtema "<strong>${subtemaFormateado}</strong>" que sea motivador para los estudiantes y conecte con las actividades.  

  ❗ Reglas del título:  
  - Debe ser claro y atractivo para niños de ${grado}° de ${nivel}.  
  - Evita signos de interrogación o exclamación.  
  - No uses emojis ni comillas.  
  - Debe sonar como un título de cuento o sección divertida del libro.  
  - Ejemplos:  
    - "Palabras que cuentan historias"  
    - "El secreto de las formas"  
    - "Exploradores del mar profundo"
  `;

  const ejeArticulador = `
  - <strong>Inclusión</strong>: Busca garantizar el derecho a la educación de todas y todos, reconociendo y valorando la diversidad cultural, lingüística, social y de capacidades.
  - <strong>Pensamiento Crítico</strong>: Fomenta la capacidad de analizar, cuestionar y reflexionar sobre la realidad, desarrollando habilidades para la toma de decisiones informadas y responsables.
  - <strong>Interculturalidad Crítica</strong>: Promueve el diálogo y el respeto entre diferentes culturas, reconociendo las desigualdades históricas y estructurales.
  - <strong>Igualdad de Género</strong>: Impulsa la equidad entre mujeres y hombres, cuestionando estereotipos y roles de género.
  - <strong>Vida Saludable</strong>: Fomenta hábitos y estilos de vida que favorezcan el bienestar físico, emocional y social.
  - <strong>Apropiación de las Culturas a través de la Lectura y la Escritura</strong>: Valora la lectura y la escritura como medios para acceder al conocimiento, expresar ideas y fortalecer la identidad cultural.
  - <strong>Artes y Experiencias Estéticas</strong>: Incorpora las manifestaciones artísticas y culturales en el proceso educativo, estimulando la creatividad y la apreciación estética.
  `;

  // Habilidades cognitivas
  const habilidades = {
    procesos: {
      'C': 'Captación',
      'M': 'Memoria',
      'E': 'Evaluación',
      'N': 'Producción convergente',
      'D': 'Producción divergente'
    },
    productos: {
      'U': 'Unidades',
      'C': 'Clases',
      'R': 'Relaciones',
      'S': 'Sistemas',
      'T': 'Transformaciones',
      'I': 'Implicaciones'
    },
    contenidos: {
      'F': 'Figurativos',
      'S': 'Simbólicos',
      'M': 'Semánticos'
    }
  };

  function generarHabilidad() {
    const proceso = Object.keys(habilidades.procesos)[Math.floor(Math.random() * 5)];
    const producto = Object.keys(habilidades.productos)[Math.floor(Math.random() * 6)];
    const contenido = Object.keys(habilidades.contenidos)[Math.floor(Math.random() * 3)];
    return `${proceso}${producto}${contenido}`;
  }

  function generarEjemploHabilidad(clave) {
    const ejemplos = {
      'ERM': 'Evaluar las relaciones entre conceptos semánticos en un texto.',
      'CSF': 'Identificar sistemas visuales (figurativos) en un diagrama.',
      'MUF': 'Memorizar unidades figurativas como símbolos o imágenes clave.',
      'NIM': 'Resolver problemas que implican inferencias semánticas.'
    };
    return ejemplos[clave] || 'Actividad diseñada para desarrollar esta combinación de habilidades.';
  }

  function generarBloqueHabilidad(habilidadClave) {
    return `
      <div class="habilidad-contexto" style="margin-top:20px; margin-bottom:30px; padding:12px; background:#f0f7ff; border-left:4px solid #4a90e2;">
        <h4>Habilidad Cognitiva Asociada ${habilidadClave}</h4>
        <p> → 
          ${habilidades.procesos[habilidadClave[0]]} + 
          ${habilidades.productos[habilidadClave[1]]} + 
          ${habilidades.contenidos[habilidadClave[2]]}
        </p>
        <p style="font-size:0.95em; color:#555;"><em>Ejemplo de aplicación:</em> ${generarEjemploHabilidad(habilidadClave)}</p>
      </div>
    `;
  }

  const habilidadSubtema = generarHabilidad();
  const bloqueHabilidadHTML = generarBloqueHabilidad(habilidadSubtema);

  const contenedorHabilidad = document.querySelector("#contenedorHabilidad");
  if (contenedorHabilidad) {
    contenedorHabilidad.innerHTML = bloqueHabilidadHTML;
  }

  const bloqueDespuesActividades = `
    ${bloqueHabilidadHTML}
    ${extraBloquesFinales}
  `;

  // 🆕 INSTRUCCIÓN ESPECÍFICA PARA LONGITUD SEGÚN GRADO
  const instruccionLongitud = `
    ${instruccionesAdicionales ? `📌 INSTRUCCIÓN ESPECÍFICA DEL USUARIO (OBLIGATORIA):
    ${instruccionesAdicionales}
    
    IMPORTANTE: Esta instrucción tiene PRIORIDAD sobre cualquier otra regla del prompt.
    ` : ''}
    
    IMPORTANTE: Para ${grado}° grado de ${nivel}, ajusta la longitud de las actividades:
    ${grado === "Primero" ?
      "- Instrucciones MUY cortas y simples (máximo 40-60 palabras por actividad)" :
      grado === "Segundo" ?
        "- Instrucciones cortas (máximo 40-50 palabras por actividad)" :
        grado === "Tercero" ?
          "- Instrucciones moderadas (máximo 50-60 palabras por actividad)" :
          grado === "Cuarto" ?
            "- Instrucciones más desarrolladas (máximo 60-70 palabras por actividad)" :
            grado === "Quinto" ?
              "- Instrucciones completas (máximo 70-80 palabras por actividad)" :
              "- Instrucciones detalladas (máximo 80-90 palabras por actividad)"
    }
    ${grado === "Primero" || grado === "Segundo" ?
      "- Usa lenguaje simple, concreto y familiar para niños pequeños" :
      "- Puedes usar vocabulario progresivamente más complejo"
    }
    ${grado === "Primero" ?
      "- Máximo 2 subactividades por actividad, preferiblemente 1" :
      grado === "Segundo" || grado === "Tercero" ?
        "- Máximo 3 subactividades por actividad" :
        "- Hasta 4 subactividades para actividades complejas"
    }
    
    ${instruccionesAdicionales ? `⚡ RECORDATORIO CRÍTICO: DEBES SEGUIR LA INSTRUCCIÓN ESPECÍFICA DEL USUARIO:
    "${instruccionesAdicionales}"
    Esta instrucción anula cualquier conflicto con otras reglas.` : ''}
  `;

  const prompt = `
    <h1><strong>${subtemaFormateado}</strong></h1>
    Genera SOLO HTML final, sin comentarios externos, sin markdown, sin bloques de código.

    CONTEXTO CURRICULAR:
    - Categoría: ${categoria}
    - Nivel: ${nivel}
    - Grado: ${grado}
    - Subtema: ${subtemaFormateado}
    - Habilidad cognitiva objetivo: ${habilidadSubtema}
    - Tema (T): ${T}
    - Aprendizaje esperado (AE): ${AE}
    - Contenido (C): ${C}
    - Proceso (P): ${P}
    - Semilla creativa anti-repetición: ${semillaCreativa}
    ${notaInterdisc}

    REGLA DE CALIDAD UNIFICADA (APLICA A ACTIVIDADES NORMALES Y FICHAS):
    - Todas las actividades deben tener la misma calidad didáctica, profundidad y claridad.
    - Cada actividad debe incluir:
      1) instrucción principal accionable en negritas,
      2) de 1 a 4 subactividades útiles (sin relleno),
      3) modalidad [IC T. IND] / [IC T. PAR] / [IC T. EQUI],
      4) respuesta esperada concreta en color magenta.
    - Cada actividad debe activar pensamiento de nivel alto: analizar, evaluar o crear.
    - Evita ejercicios mecánicos o triviales.

    ESTRUCTURA OBLIGATORIA POR ACTIVIDAD NORMAL:
    <div class="activity">
      <p>1. <strong>[Instrucción principal clara y exigente].</strong> [IC T. IND]</p>
      <ol type="a" class="steps">
        <li>[Subactividad 1]</li>
        <li>[Subactividad 2 opcional]</li>
        <li>[Subactividad 3 opcional]</li>
        <li>[Subactividad 4 opcional]</li>
      </ol>
      <div class="answer">
        <span style="color:mediumvioletred;">Respuesta: [ejemplo concreto y verificable]</span>
      </div>
    </div>

    CANTIDAD:
    - Genera EXACTAMENTE ${cantidad} actividades normales para el subtema.

    REGLAS DE LONGITUD Y CLARIDAD:
    ${instruccionLongitud}

    RELACIÓN CON LECTURA:
    ${relacionadaConLectura
      ? `- Las actividades deben basarse o relacionarse con la lectura proporcionada.`
      : `- Las actividades NO deben referirse a una lectura específica.`}
    ${relacionadaConLectura && contenidoLectura ? `- Contexto de lectura: ${contenidoLectura}` : ""}

    RECURSOS DIDÁCTICOS:
    ${instruccionRecursos}
    - Si un recurso se activa, úsalo una sola vez en actividades normales y luego crea su bloque final correspondiente.

    MEJORA PEDAGÓGICA ADICIONAL:
    ${extraDificultadCategoria}
    - Incluye al menos una actividad de transferencia a contexto real.
    - Incluye al menos una actividad con justificación o argumentación.
    - Incluye al menos una pregunta metacognitiva en itálicas.
    - Evita repetir literalmente estructuras o frases de ejecuciones anteriores para este subtema.
    - Mantén la creatividad alta: ejemplos nuevos, contextos distintos y variaciones didácticas reales.

    INSTRUCCIONES ESPECÍFICAS DEL USUARIO:
    ${instruccionesAdicionales || "Sin instrucciones adicionales."}

    BLOQUES FINALES OBLIGATORIOS (si están activados):
    ${bloqueDespuesActividades}
    ${seccionesExtra}

    RECORDATORIO FINAL:
    ${recursos.fichas.generado ? `- Debes incluir la ficha ${recursos.fichas.clave} con 4 actividades y formato .activity-fichas de calidad equivalente.` : ''}
    ${recursos.anexos.generado ? `- Debes incluir el anexo visual ${recursos.anexos.clave}.` : ''}
    ${recursos.recortables.generado ? `- Debes incluir el recortable ${recursos.recortables.clave}.` : ''}
    ${recursos.videos.generado ? `- Debes incluir el guion de video "${recursos.videos.clave}".` : ''}
  `;

  return prompt;
};

window.generarProgramaSintetico = function (secuenciaActual) {
  // Columnas para cada campo formativo (Set evita duplicados)
  const columnas = {
    "Lenguajes": { contenido: new Set(), proceso: new Set(), ambiente: "Áulico" },
    "Saberes y Pensamiento Científico": { contenido: new Set(), proceso: new Set(), ambiente: "Comunitario" },
    "Ética, Naturaleza y Sociedades": { contenido: new Set(), proceso: new Set(), ambiente: "Áulico" },
    "De lo Humano y lo Comunitario": { contenido: new Set(), proceso: new Set(), ambiente: "Comunitario" }
  };

  // ✅ Mapeo EXACTO categoría → columna del campo formativo
  const mapeoCampoFormativo = {
    "Lenguaje y comunicación": "Lenguajes",
    "Ciencias experimentales": "Saberes y Pensamiento Científico",
    "Conocimientos del medio": "Saberes y Pensamiento Científico", // ← nuevo
    "Ciencias sociales": "Ética, Naturaleza y Sociedades",
    "Formación socioemocional": "De lo Humano y lo Comunitario"
  };

  // ✅ Recorrer la secuencia filtrada por unidad/trim/nivel
  for (const key in secuenciaActual) {
    // solo procesamos Contenido (_C)
    if (key.endsWith("_C")) {
      const subtema = key.replace("_C", "");
      const categoria = categoriaPorSubtema[subtema]; // ej: Lenguaje y comunicación
      const campoFormativo = mapeoCampoFormativo[categoria];

      // solo si el subtema tiene categoría reconocida
      if (campoFormativo && columnas[campoFormativo]) {
        const contenido = secuenciaActual[`${subtema}_C`] || "";
        const proceso = secuenciaActual[`${subtema}_P`] || "";

        if (contenido.trim()) columnas[campoFormativo].contenido.add(contenido.trim());
        if (proceso.trim()) columnas[campoFormativo].proceso.add(proceso.trim());
      }
    }
  }

  // ✅ Convertimos Sets → texto limpio
  const columnasFinales = {};
  for (const campo in columnas) {
    columnasFinales[campo] = {
      contenido: Array.from(columnas[campo].contenido).join("<br>") || "-",
      proceso: Array.from(columnas[campo].proceso).join("<br>") || "-",
      ambiente: columnas[campo].ambiente
    };
  }

  // ✅ Tabla con formato Fase 5
  return `
    <div id="programa-sintetico" style="margin-bottom:20px;">
     <p>Puede realizar el codiseño curricular a partir de la siguiente contextualización pedagógica vinculada a los contenidos relevantes de los cuatro Campos Formativos:</p>
      <h3 style="text-align:center; background:#AEEEEE; margin-bottom:10px;">Fase 5</h3>
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; text-align:center; font-size:14px;">
        <thead>
          <tr style="background:#f2f2f2; font-weight:bold;">
            <th style="background:#ddebf7;"></th>
            <th style="background:#ddebf7;">Campos Formativos</th>
            <th style="background:#fff2cc;">Lenguajes</th>
            <th style="background:#CFEDEA;">Saberes y Pensamiento Científico</th>
            <th style="background:#e2efda;">Ética, Naturaleza y Sociedades</th>
            <th style="background:#f4cccc;">De lo Humano y lo Comunitario</th>
          </tr>
        </thead>
        <tbody>
          <!-- Contenidos -->
          <tr>
            <td rowspan="3" style="background:#CFEDEA; font-weight:bold; writing-mode: vertical-rl; transform: rotate(180deg);">
              Programa<br>Sintético
            </td>
            <td style="background:#ebf1de; font-weight:bold;">Contenidos</td>
            <td>${columnasFinales["Lenguajes"].contenido}</td>
            <td>${columnasFinales["Saberes y Pensamiento Científico"].contenido}</td>
            <td>${columnasFinales["Ética, Naturaleza y Sociedades"].contenido}</td>
            <td>${columnasFinales["De lo Humano y lo Comunitario"].contenido}</td>
          </tr>
          <!-- Procesos -->
          <tr>
            <td style="background:#ebf1de; font-weight:bold;">Procesos</td>
            <td>${columnasFinales["Lenguajes"].proceso}</td>
            <td>${columnasFinales["Saberes y Pensamiento Científico"].proceso}</td>
            <td>${columnasFinales["Ética, Naturaleza y Sociedades"].proceso}</td>
            <td>${columnasFinales["De lo Humano y lo Comunitario"].proceso}</td>
          </tr>
          <!-- Ambientes -->
          <tr>
            <td style="background:#CFEDEA; font-weight:bold;">Ambientes</td>
            <td>${columnasFinales["Lenguajes"].ambiente}</td>
            <td>${columnasFinales["Saberes y Pensamiento Científico"].ambiente}</td>
            <td>${columnasFinales["Ética, Naturaleza y Sociedades"].ambiente}</td>
            <td>${columnasFinales["De lo Humano y lo Comunitario"].ambiente}</td>
          </tr>
        </tbody>
      </table>
      <p><strong>Contextualización pedagógica de Lenguaje y comunicación</strong></p>
      <p>En la presente Unidad los alumnos lograrán un nivel taxonómico de Comprensión, Análisis y Aplicación en el Campo Formativo de
        Lenguajes. Los aprendizajes esperados se encuentran señalados en el Temario del Libro del Alumno.</p>
    </div>
  `;
};


// 🎨 Actualización de colores en generarRutaSugerida
window.generarRutaSugerida = function (subtemasOrdenados) {
  const coloresPorCategoria = {
    "Ortografía": "#a3d3f5",          // azul claro
    "Gramatica": "#d0e6ff",           // celeste
    "ExpresionEscrita": "#c7e8b4",    // verde claro
    "ExpresionOral": "#f9d5a7",       // naranja claro
    "Socioemocional": "#f7b7c3",      // rosa
    "CivicaEtica": "#f7b7c3",         // rosa
    "Habilidades": "#d9c2f0",         // morado claro
    "Naturales": "#ffe4a1",           // amarillo
    "ConocimientoDelMedio": "#c3f2e4",// verde agua  ← nuevo
    "Historia": "#ffd7a1",            // naranja
    "Geografia": "#c3f2e4",           // verde agua
    "Matematicas": "#b4d7ff"          // azul intenso
  };


  const items = subtemasOrdenados.map((subtema, index) => {
    const colorFondo = coloresPorCategoria[subtema] || (index % 2 ? '#a3d3f5' : '#d0e6ff');

    return `
      <div style="display:flex;align-items:center;margin-bottom:8px;">
        <div style="
          width:28px;height:28px;
          background:${colorFondo};
          color:#333;font-weight:bold;
          border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          margin-right:10px;">
          ${index + 1}
        </div>
        <span>${formatearSubtema(subtema)}</span>
      </div>
    `;
  }).join("");

  return `
    <div style="border-left:4px solid #4aa3df;padding-left:10px;margin:20px 0;">
      <h3 style="color:#9caa0f;margin-bottom:5px;">Ruta sugerida</h3>
      <p style="font-size:14px;line-height:1.4;">
        Esta herramienta le proporciona orientaciones para la organización de sus actividades durante la semana.
        Se propone un orden para realizar las diferentes secciones de la Unidad didáctica que puede modificar o seguir:
      </p>
      ${items}
    </div>
  `;
};

window.generarEstrategiaMatematica = function (subtema) {
  const personajeSvg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <rect width="120" height="120" rx="16" fill="#e2e8f0"/>
      <circle cx="60" cy="42" r="18" fill="#94a3b8"/>
      <rect x="36" y="62" width="48" height="34" rx="10" fill="#64748b"/>
      <text x="60" y="112" text-anchor="middle" font-size="10" fill="#334155">Estrategia</text>
    </svg>
  `);
  const graficoSvg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="280" viewBox="0 0 640 280">
      <rect width="640" height="280" fill="#f8fafc"/>
      <line x1="70" y1="230" x2="590" y2="230" stroke="#94a3b8" stroke-width="2"/>
      <line x1="70" y1="40" x2="70" y2="230" stroke="#94a3b8" stroke-width="2"/>
      <rect x="120" y="170" width="70" height="60" fill="#60a5fa"/>
      <rect x="250" y="120" width="70" height="110" fill="#34d399"/>
      <rect x="380" y="90" width="70" height="140" fill="#f59e0b"/>
      <rect x="510" y="140" width="70" height="90" fill="#f87171"/>
      <text x="320" y="24" text-anchor="middle" font-size="18" fill="#1e293b">Gráfico de ${String(subtema || "Matemáticas")}</text>
    </svg>
  `);
  const personajeSrc = `data:image/svg+xml;utf8,${personajeSvg}`;
  const graficoSrc = `data:image/svg+xml;utf8,${graficoSvg}`;

  return `
    <div class="estrategia-box" style="border:2px solid #cce4ff; padding:20px; margin:20px 0; border-radius:10px; background:#f9fcff;">
      <div style="display:flex; align-items:center; margin-bottom:15px;">
        <img src="${personajeSrc}" alt="Personaje Estrategia" style="width:80px; height:auto; margin-right:15px;">
        <div style="background:#ffeecf; padding:8px 15px; border-radius:20px; font-weight:bold; color:#555;">Estrategia</div>
      </div>

      <p style="font-weight:bold; margin-bottom:10px;">Estrategia visual para ${subtema}</p>
      
      <div style="text-align:center; margin-bottom:15px;">
        <!-- Imagen ilustrativa -->
        <img src="${graficoSrc}" alt="Gráfico explicativo" style="width:100%; max-width:500px;">
      </div>

      <p>Esta estrategia ayuda a comprender ${subtema} de forma visual. Observa cómo se representan los valores y comenta con un compañero.</p>

      <p>Para resolver este tipo de problemas, primero debes 
        <span style="border-bottom:1px solid #000; display:inline-block; min-width:200px;"></span>
      </p>

      <p style="margin-top:10px;">Observa el video <em>“${subtema}”</em> que te mostrará tu profesor(a).</p>
    </div>
  `;
};

async function generarNotasDeFichas(actividadesFichas, subtema, tituloCreativo) {
  const claveFicha = claveFichaActualGlobal || "(Ficha no detectada)";
  let bloqueNotasFicha = `
    <h4>Notas del maestro para las fichas de refuerzo (${formatearSubtema(subtema)})</h4>
    <p>Estas fichas están pensadas como actividades de refuerzo para profundizar el tema <strong>${tituloCreativo}</strong>. Se recomienda trabajarlas en la segunda mitad de la semana, después de las actividades principales.</p>
  `;

  for (let idx = 0; idx < actividadesFichas.length; idx++) {
    const actividadHTML = actividadesFichas[idx];
    const textoPlano = actividadHTML.replace(/<[^>]*>/g, "").trim();

    const modalidad = textoPlano.includes("[IC T. IND]") ? "Trabajo individual"
      : textoPlano.includes("[IC T. PAR]") ? "Trabajo en parejas"
        : textoPlano.includes("[IC T. EQUI]") ? "Trabajo en equipo"
          : "Sin modalidad definida";

    const promptGemini = `
Eres experto en didáctica. Analiza la siguiente ficha de refuerzo para modalidad: ${modalidad}.

Debes generar **notas para el maestro**, en **2 o 3 párrafos**, separados con etiquetas HTML <p>. 

Incluye:
1. Qué debe explicar antes de iniciar la ficha.
2. Cómo organizar el aula y gestionar el tiempo.
3. Qué recursos debe preparar.
4. Cómo apoyar a estudiantes con barreras de aprendizaje.

La respuesta debe estar en formato HTML válido (solo <p>, <strong> para títulos). NO uses listas.

---
Ficha:
${textoPlano}
---`;

    const respuestaGemini = await enviarPrompt([{ role: "user", text: promptGemini }]);
    const notasGemini = respuestaGemini
      .replace(/```html|```/g, "") // elimina envoltorios de código
      .replace(/\n/g, "")          // limpia saltos de línea sueltos
      .trim();

    bloqueNotasFicha += `
      <div class="nota-ficha">
        <p><strong>Actividad de refuerzo ${idx + 1} (${modalidad})</strong></p>
        ${notasGemini}
      </div>
    `;
  }

  return bloqueNotasFicha;
}


// ===================== FUNCIÓN CORREGIDA - EVITA GENERACIÓN DUPLICADA =====================
function debeRelacionarConLectura(subtema) {
  const chkRelacion = document.querySelector(`input[name='relacion_${subtema}']`);
  return chkRelacion ? chkRelacion.checked : false;
}




// 🟢 CORRECCIÓN: Modificar la función generarSeccionCategoria
async function generarSeccionCategoria(categoria) {
  let categoriaConErrores = false;

  // ✅ CORRECCIÓN: Obtener unidadActual de forma segura
  const unidadActual = document.getElementById("unidadNumero")?.value || selectUnidad?.value || "1";

  // ✅ INICIALIZAR CONTADORES AL INICIO DE CADA GENERACIÓN
  const contadoresActuales = inicializarContadoresUnidad(unidadActual);
  verificarUnidadActual();

  // 🚫 Candado para evitar ejecuciones duplicadas por error
  if (window.generandoCategoria === categoria) {
    return;
  }
  if (window.generandoCategoria && window.generandoCategoria !== categoria) {
    alert(`Ya se está generando la categoría "${window.generandoCategoria}". Espera a que termine.`);
    return;
  }
  window.generandoCategoria = categoria;
  window.categoriaEnProceso = categoria;
  window.ultimaCategoriaIntentada = categoria;
  setCategoriaSpinnerUI(categoria, true);
  const statusCategoriaId = `spinner-categoria-${categoria.replace(/\s+/g, "-")}`;
  try {
    // Abrir primero el modal de resultado para ver la generación en tiempo real.
    abrirModalResultadoUnidad();

    // Verificar si ya existe este contenedor
    const contenedorCategoriaId = `contenedor-${categoria.replace(/\s/g, "-")}`;
    const viejoContenedor = document.getElementById(contenedorCategoriaId);

    // === Categorías que SÍ requieren lectura obligatoria ===
    const categoriasQueRequierenLectura = []; // añade más si lo necesitas
    const categoriaRequiereLectura = categoriasQueRequierenLectura.includes(categoria);

    // === Lectura seleccionada (prioridad: principal -> alternativa) ===
    const selectTema = document.getElementById("unidadTema");
    const selectTemaASC = document.getElementById("unidadTemaASC");
    const lecturaPrincipalId = selectTema?.value || "";
    const lecturaAlternaId = selectTemaASC?.value || "";

    const nivelCtxLectura = document.getElementById("unidadNivel")?.value || selectNivel?.value || "";
    const gradoCtxLectura = document.getElementById("unidadGrado")?.value || selectGrado?.value || "";
    const trimestreCtxLectura = document.getElementById("unidadTrimestre")?.value || selectTrimestre?.value || "";
    const unidadCtxLectura = document.getElementById("unidadNumero")?.value || selectUnidad?.value || "";

    const lecturaPrincipalRaw = lecturaPrincipalId ? await _resolverLecturaPorId(lecturaPrincipalId) : null;
    const lecturaPrincipal = _lecturaCoincideConContexto(lecturaPrincipalRaw, {
      nivel: nivelCtxLectura,
      grado: gradoCtxLectura,
      trimestre: trimestreCtxLectura,
      unidad: unidadCtxLectura
    }) ? lecturaPrincipalRaw : null;
    const lecturaAlternaRaw = !lecturaPrincipal && lecturaAlternaId ? await _resolverLecturaPorId(lecturaAlternaId) : null;
    const lecturaAlterna = _lecturaCoincideConContexto(lecturaAlternaRaw, {
      nivel: nivelCtxLectura,
      grado: gradoCtxLectura,
      trimestre: trimestreCtxLectura,
      unidad: unidadCtxLectura
    }) ? lecturaAlternaRaw : null;
    const lectura = lecturaPrincipal || lecturaAlterna || null;

    const _contenidoLecturaLocal = (l = {}) =>
      l.contenidoHTML || l.contenidoPlano || l.textoLectura || l.lectura || l.contenido || l.texto || "";

    // Si la categoría LA REQUIERE y no hay lectura → se avisa y se detiene.
    if (categoriaRequiereLectura && !lectura) {
      alert(`Para "${categoria}" debes seleccionar una lectura válida.`);
      return;
    }

    // Si no la requiere → seguimos con lectura vacía
    const lecturaDisponible = !!lectura;
    const contenidoLecturaSeguro = lecturaDisponible ? _contenidoLecturaLocal(lectura) : "";
    const preguntasComprensionSeguras = lecturaDisponible
      ? (lectura.preguntasComprension || lectura.preguntas || [])
      : [];

    // === Subtemas de la categoría - CORREGIDO: Verificar checkboxes de cada subtema ===
    const subtemasDeCategoria = Object
      .entries(categoriaPorSubtema)
      .filter(([sub, cat]) => cat === categoria)
      .map(([sub]) => sub)
      .filter(sub => {
        // ✅ CORRECCIÓN IMPORTANTE: Verificar el checkbox específico de "Generar" para cada subtema
        const chkGenerar = document.querySelector(`input[name='generar_${sub}']`);
        // También verificar el checkbox de categoría general
        const chkCategoria = document.querySelector(`input[name^="generar_categoria_"][data-categoria="${categoria}"]`);

        // ✅ Solo generar si el checkbox del subtema específico está marcado
        // O si está marcado el checkbox de la categoría general
        return (chkGenerar && chkGenerar.checked) ||
          (chkCategoria && chkCategoria.checked);
      });

    if (!subtemasDeCategoria.length) {
      alert(`⚠️ Por favor selecciona al menos un subtema en la categoría "${categoria}" marcando los checkboxes en la columna "Generar".`);
      return;
    }

    // ✅ CORRECCIÓN: MOVER la verificación de "algún subtema seleccionado" AQUÍ, después de definir subtemasDeCategoria
    const algunSubtemaSeleccionado = subtemasDeCategoria.some(sub => {
      const chkRelacion = document.querySelector(`input[name='relacion_${sub}']`);
      return chkRelacion ? chkRelacion.checked : false;
    });

    // Limpiar subtemas existentes de esta categoría
    subtemasDeCategoria.forEach(subtema => {
      const bloqueId = `bloque-${categoria}-${subtema}`;
      const bloqueExistente = document.getElementById(bloqueId);
      if (bloqueExistente) {
        bloqueExistente.remove();
      }
    });

    // === Objetivos T/AE/C/P por subtema ===
    const objetivos = [];
    for (const subtema of subtemasDeCategoria) {
      const chkRelacion = document.querySelector(`input[name='relacion_${subtema}']`);
      const relacionada = chkRelacion ? chkRelacion.checked : false;

      const inputInter = document.querySelector(`select[name='interdisciplinariedad_${subtema}']`);
      const interdisciplinariedad = !!(inputInter && inputInter.value);

      const chkRecortable = document.querySelector(`input[name='recortable_${subtema}']`);
      const recortable = chkRecortable ? chkRecortable.checked : false;

      const inputCantidad = document.querySelector(`input[name='num_${subtema}']`);
      let cantidad = inputCantidad ? parseInt(inputCantidad.value, 10) : 1;
      if (recortable && cantidad > 2) cantidad = 2;

      const claveBase = subtema.replace(/\s+/g, "_");
      const catSub = (subtema === "Artes") ? "Artes" : (categoriaPorSubtema[subtema] || "Artes");

      const fallbackCategoria = descripcionesPorDefecto[catSub] || {
        T: `Tema general de ${catSub}`,
        AE: `Aprendizaje esperado genérico para ${catSub}`,
        C: `Contenido básico relacionado con ${catSub}`,
        P: `Proceso simple para trabajar ${catSub}`
      };

      const descripcionSecuencia = secuenciaActual?.[`${claveBase}_T`] || fallbackCategoria.T || `Tema no definido para ${subtema}`;
      const descripcionAE = secuenciaActual?.[`${claveBase}_AE`] || fallbackCategoria.AE || `Aprendizaje esperado no definido para ${subtema}`;
      const descripcionC = secuenciaActual?.[`${claveBase}_C`] || fallbackCategoria.C || `Contenido no definido para ${subtema}`;
      const descripcionP = secuenciaActual?.[`${claveBase}_P`] || fallbackCategoria.P || `Proceso no definido para ${subtema}`;

      objetivos.push({ subtema, tipo: "T", cantidad, descripcion: descripcionSecuencia, relacionada, interdisciplinariedad, recortable });
      objetivos.push({ subtema, tipo: "AE", cantidad, descripcion: descripcionAE, relacionada, interdisciplinariedad, recortable });
      objetivos.push({ subtema, tipo: "C", cantidad, descripcion: descripcionC, relacionada, interdisciplinariedad, recortable });
      objetivos.push({ subtema, tipo: "P", cantidad, descripcion: descripcionP, relacionada, interdisciplinariedad, recortable });
    }

    // Contenedor de categoría (crear si no existe / reutilizar si existe)
    let contenedor = viejoContenedor || document.getElementById(contenedorCategoriaId);
    if (!contenedor) {
      const resultadoUnidad = document.getElementById("resultadoUnidadGenerada");
      if (!resultadoUnidad) {
        return;
      }
      contenedor = document.createElement("div");
      contenedor.id = contenedorCategoriaId;
      contenedor.classList.add("bloque-categoria");
      resultadoUnidad.appendChild(contenedor);
    }

    // ✅ NUEVO: Agregar título de categoría
    const subtemasLista = subtemasDeCategoria.map(sub => formatearSubtema(sub)).join(", ");
    const tituloCategoriaHTML = `
        <h2 style="color: #2c5aa0; border-bottom: 2px solid #2c5aa0; padding-bottom: 8px; margin-bottom: 20px;">
            ${categoria}
            ${subtemasDeCategoria.length > 0 ?
        `<span style="font-size: 0.8em; color: #666; display: block; margin-top: 5px;">
                Subtemas: ${subtemasLista}
            </span>` :
        ''}
        </h2>
    `;

    // ✅ CORRECCIÓN: Insertar título de categoría al inicio del contenedor
    contenedor.innerHTML = tituloCategoriaHTML;
    if (categoria !== "Proyectos") {
      contenedor.insertAdjacentHTML(
        "beforeend",
        `<p id="${statusCategoriaId}"><i class="fas fa-spinner fa-spin"></i> Generando <strong>${categoria}</strong>...</p>`
      );
    }
    // Llevar la vista al bloque de la categoría que se está generando.
    contenedor.scrollIntoView({ behavior: "smooth", block: "start" });

    // ✅ CORRECCIÓN MEJORADA: BÚSQUEDA DE LECTURA PARA TODAS LAS CATEGORÍAS
    const nivel = document.getElementById("unidadNivel")?.value || selectNivel?.value || "";
    const gradoSeleccionado = document.getElementById("unidadGrado")?.value || selectGrado?.value || "";
    const trimestreSeleccionado = document.getElementById("unidadTrimestre")?.value || selectTrimestre?.value || "";
    const unidadSeleccionada = document.getElementById("unidadNumero")?.value || selectUnidad?.value || "";
    const lecturasNuevasActuales = window.lecturasNuevas || [];
    const lecturasASCActuales = window.lecturasASC || [];

    // ✅ CORRECCIÓN: Buscar en AMBAS colecciones: lecturasNuevas Y lecturasASC
    let lecturaCoincidenteGlobal = null;

    // Verificar si ALGUNA categoría necesita lectura
    const algunaCategoriaNecesitaLectura =
      categoria === "Lenguaje y comunicación" ||
      subtemasDeCategoria.some(sub => {
        const chkRelacion = document.querySelector(`input[name='relacion_${sub}']`);
        return chkRelacion ? chkRelacion.checked : false;
      });

    let lecturaCoincidente = null;
    const poolLecturas = [
      ...(Array.isArray(window.lecturasNuevas) ? window.lecturasNuevas : []),
      ...(Array.isArray(window.lecturasASC) ? window.lecturasASC : []),
      ...(Array.isArray(lecturasFiltradas) ? lecturasFiltradas : []),
      ...(Array.isArray(todasLasLecturas) ? todasLasLecturas : [])
    ];

    // Lectura principal (usuario)
    if (selectTema?.value) {
      lecturaCoincidente = poolLecturas.find(l => l.id === selectTema.value) || null;
      if (!lecturaCoincidente) {
        lecturaCoincidente = await _resolverLecturaPorId(selectTema.value);
      }
      if (!_lecturaCoincideConContexto(lecturaCoincidente, {
        nivel,
        grado: gradoSeleccionado,
        trimestre: trimestreSeleccionado,
        unidad: unidadSeleccionada
      })) {
        lecturaCoincidente = null;
      }
    }

    // Lectura alternativa (usuario)
    if (!lecturaCoincidente && selectTemaASC?.value) {
      lecturaCoincidente = poolLecturas.find(l => l.id === selectTemaASC.value) || null;
      if (!lecturaCoincidente) {
        lecturaCoincidente = await _resolverLecturaPorId(selectTemaASC.value);
      }
      if (!_lecturaCoincideConContexto(lecturaCoincidente, {
        nivel,
        grado: gradoSeleccionado,
        trimestre: trimestreSeleccionado,
        unidad: unidadSeleccionada
      })) {
        lecturaCoincidente = null;
      }
    }

    // Normalizar grado
    const mapaGrados = {
      "primero": "1", "segundo": "2", "tercero": "3",
      "cuarto": "4", "quinto": "5", "sexto": "6",
      "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6"
    };

    const gradoNormalizado = mapaGrados[String(gradoSeleccionado).trim().toLowerCase()] || String(gradoSeleccionado).trim();




    // PRIMERO: Buscar en lecturasNuevas
    // 🔒 SOLO buscar automáticamente si el usuario NO eligió lectura
    if (!lecturaCoincidente) {

      // 🔍 Buscar en lecturasNuevas / lecturasFiltradas
      lecturaCoincidente =
        poolLecturas.find(l => {
          const nivelLectura = String(l.nivel || "").trim().toLowerCase();
          const nivelBuscado = String(nivel).trim().toLowerCase();

          const gradoLectura = _normalizarGradoComparable(l.grado);
          const gradoBuscado = _normalizarGradoComparable(gradoNormalizado);

          const trimestreLectura = parseInt(l.trimestre || "0");
          const trimestreBuscado = parseInt(trimestreSeleccionado || "0");

          const unidadLectura = parseInt(l.unidad || "0");
          const unidadBuscada = parseInt(unidadSeleccionada || "0");

          return (
            nivelLectura === nivelBuscado &&
            gradoLectura === gradoBuscado &&
            trimestreLectura === trimestreBuscado &&
            unidadLectura === unidadBuscada
          );
        }) || null;

      // 🔍 Si no se encontró, buscar en lecturasASC
      if (!lecturaCoincidente && lecturasASCActuales.length > 0) {
        lecturaCoincidente = poolLecturas.find(l => {
          const nivelLectura = String(l.nivel || "").trim().toLowerCase();
          const nivelBuscado = String(nivel).trim().toLowerCase();

          const gradoLectura = _normalizarGradoComparable(l.grado);
          const gradoBuscado = _normalizarGradoComparable(gradoNormalizado);

          const trimestreLectura = parseInt(l.trimestre || "0");
          const trimestreBuscado = parseInt(trimestreSeleccionado || "0");

          const unidadLectura = parseInt(l.unidad || "0");
          const unidadBuscada = parseInt(unidadSeleccionada || "0");

          return (
            nivelLectura === nivelBuscado &&
            gradoLectura === gradoBuscado &&
            trimestreLectura === trimestreBuscado &&
            unidadLectura === unidadBuscada
          );
        }) || null;
      }
    }

    window.lecturaNuevaCoincidenteGlobal = lecturaCoincidente || null;



    // ✅ CORRECCIÓN: CREAR BLOQUE DE LECTURA GLOBAL UNA SOLA VEZ
    const _obtenerContenidoLectura = (lecturaObj = {}) =>
      lecturaObj.contenidoHTML
      || lecturaObj.contenidoPlano
      || lecturaObj.textoLectura
      || lecturaObj.lectura
      || lecturaObj.contenido
      || lecturaObj.texto
      || "";

    let bloqueLecturaGlobal = "";
    if (window.lecturaNuevaCoincidenteGlobal) {
      // Tomar preguntas desde cualquiera de los dos formatos
      const preguntasLectura =
        window.lecturaNuevaCoincidenteGlobal.preguntasComprension ||
        window.lecturaNuevaCoincidenteGlobal.preguntas ||
        [];
      const contenidoLecturaBase = _obtenerContenidoLectura(window.lecturaNuevaCoincidenteGlobal);
      const tituloLecturaBase =
        window.lecturaNuevaCoincidenteGlobal.titulo ||
        window.lecturaNuevaCoincidenteGlobal.tema ||
        "Sin título";

      bloqueLecturaGlobal = `
            <div class="bloque-lectura-global" style="margin-bottom:30px; border: 2px solid #e0e0e0; padding: 20px; border-radius: 8px; background: #f9f9f9;">
                <h3 style="color:#2c5aa0; margin-top:0;">📖 Lectura base</h3>
                <p style="margin:0 0 10px 0;"><strong>Título de la lectura:</strong> ${tituloLecturaBase}</p>
                <div class="contenido-lectura" style="line-height: 1.6;">
                    ${contenidoLecturaBase || "<em>Lectura sin contenido disponible</em>"}
                </div>
                ${preguntasLectura.length ? `
                    <div class="preguntas-lectura" style="margin-top:15px;">
                        <h4>Preguntas de comprensión:</h4>
                        <ul>
                            ${preguntasLectura.map(p =>
        `<li>${(typeof p === "string" ? p : (p.pregunta || p.texto || "")).trim()}<br>
                                  <span style="color:mediumvioletred;">${(typeof p === "object" ? (p.respuesta || "") : "")}</span></li>`
      ).join("")
          }
                        </ul>
                    </div>
                ` : ""}
            </div>
        `;
    }


    // ✅ CORRECCIÓN: PARA LENGUAJE Y COMUNICACIÓN - INSERTAR LECTURA GLOBAL DENTRO DEL COL-ALUMNO
    if (categoria === "Lenguaje y comunicación") {
      const algunSubtemaRelacionado = subtemasDeCategoria.some(sub => debeRelacionarConLectura(sub));

      if (algunSubtemaRelacionado && bloqueLecturaGlobal) {

        // ✅ CORRECCIÓN: Guardar referencia para usarla más tarde
        // NO la insertamos aquí, solo preparamos la variable
        window.bloqueLecturaGlobalParaLenguaje = bloqueLecturaGlobal;
        window.debeInsertarLecturaLenguaje = true;

      } else {
        window.debeInsertarLecturaLenguaje = false;
        window.bloqueLecturaGlobalParaLenguaje = "";
      }
    }

    const TITULOS_GENERICOS = [
      "pequenos exploradores de grandes ideas",
      "pequeños exploradores de grandes ideas",
      "proyecto interdisciplinario",
      "proyecto trimestral",
      "grandes ideas para aprender",
      "exploradores del conocimiento"
    ];
    const _normalizarTituloClave = (txt = "") =>
      String(txt || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const _limpiarTituloIA = (raw = "") =>
      String(raw || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/[`*_#]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^["'«»]+|["'«»]+$/g, "")
        .split(/[.\n\r]/)[0]
        .trim();
    const _esTituloGenerico = (titulo = "") => {
      const t = _normalizarTituloClave(titulo);
      if (!t || t.length < 8) return true;
      return TITULOS_GENERICOS.some((g) => t.includes(_normalizarTituloClave(g)));
    };
    const generarTituloCreativoUnico = async ({
      subtema,
      nivel,
      grado,
      tipo = "subtema",
      statusId = "",
      maxIntentos = 3
    }) => {
      window.__titulosCreativosHistorial = window.__titulosCreativosHistorial || {};
      const key = `${tipo}:${_normalizarTituloClave(subtema)}`;
      const historial = Array.isArray(window.__titulosCreativosHistorial[key])
        ? window.__titulosCreativosHistorial[key]
        : [];
      const usados = new Set(historial.map(_normalizarTituloClave));
      let ultimoValido = "";

      for (let intento = 1; intento <= maxIntentos; intento += 1) {
        const evitar = historial.slice(-8).join("; ");
        const promptTitulo = `
Genera SOLO UN título creativo, breve y motivador (máximo 8 palabras) para el ${tipo} "${formatearSubtema(subtema)}",
dirigido a alumnos de ${grado}° de ${nivel}.
Debe sonar específico del contenido, no genérico.
No usar comillas, emojis ni listas.
Debe ser diferente a estos títulos ya usados: ${evitar || "ninguno"}.
        `;
        if (statusId) {
          actualizarSpinnerProceso(statusId, `Generando título (${intento}/${maxIntentos}) para <strong>${formatearSubtema(subtema)}</strong>...`);
        }
        const resp = await enviarPrompt([{ role: "user", text: promptTitulo }]);
        const limpio = _limpiarTituloIA(resp);
        if (!limpio) continue;
        ultimoValido = limpio;
        const clave = _normalizarTituloClave(limpio);
        if (usados.has(clave) || _esTituloGenerico(limpio)) {
          usados.add(clave);
          continue;
        }
        historial.push(limpio);
        window.__titulosCreativosHistorial[key] = historial.slice(-30);
        return limpio;
      }

      const fallback = ultimoValido || `${tipo === "proyecto" ? "Proyecto" : "Exploración"} de ${formatearSubtema(subtema)}`;
      historial.push(fallback);
      window.__titulosCreativosHistorial[key] = historial.slice(-30);
      return fallback;
    };



    // ✅ CORRECCIÓN: PARA PROYECTOS, PROCESAR SOLO UNA VEZ
    if (categoria === "Proyectos") {
        const tokenProy = ++window.cancelTokenProyectos;
        window.cancelarProyectos = false;
        // ✅ INICIALIZAR CONTADORES ESPECÍFICAMENTE PARA PROYECTOS
        const contadoresProyecto = getContadoresUnidad(unidadActual);

      // Para proyectos, solo procesamos el primer subtema (debería haber solo uno)
      const subtema = subtemasDeCategoria[0];
      if (!subtema) {
        return;
      }

      const cantidad = parseInt(document.querySelector(`input[name='num_${subtema}']`)?.value || "1", 10);
      const statusId = `spinner-${categoria}-${subtema}`;
      const bloqueId = `bloque-${categoria}-${subtema}`;
      const objetivosDelSubtema = objetivos.filter(o => o.subtema === subtema);

      // Flags/checkboxes del subtema
      const generarFichas = !!document.querySelector(`input[name='ficha_${subtema}']`)?.checked;
      const generarAnexos = !!document.querySelector(`input[name='anexo_${subtema}']`)?.checked;
      const generarVideos = !!document.querySelector(`input[name='video_${subtema}']`)?.checked;
      const relacionada = !!document.querySelector(`input[name='relacion_${subtema}']`)?.checked;
      const tieneRecortable = !!document.querySelector(`input[name='recortable_${subtema}']`)?.checked;

      // ✅ AQUÍ VA EL CÓDIGO PARA GENERAR RECURSOS DE PROYECTOS
      const recursos = {
        fichas: { generado: false, clave: "" },
        anexos: { generado: false, clave: "" },
        recortables: { generado: false, clave: "" },
        videos: { generado: false, clave: "" }
      };

      // ✅ GENERAR CLAVES PARA RECURSOS DE PROYECTOS
      if (generarFichas) {
        recursos.fichas.clave = obtenerClaveProyectoFicha();
        recursos.fichas.generado = true;
      }

      if (generarAnexos) {
        recursos.anexos.clave = obtenerClaveProyectoAnexo();
        recursos.anexos.generado = true;
      }

      if (tieneRecortable) {
        recursos.recortables.clave = obtenerClaveProyectoRecortable();
        recursos.recortables.generado = true;
      }

      if (generarVideos) {
        recursos.videos.clave = obtenerClaveProyectoVideo();
        recursos.videos.generado = true;
      }

      // Si ya existe, regenerar en el mismo lugar de la categoría
      const bloqueExistente = document.getElementById(bloqueId);
      if (bloqueExistente) bloqueExistente.remove();

      contenedor.innerHTML += `
            <p id="${statusId}"><i class="fas fa-spinner fa-spin"></i> Generando proyecto para <strong>${formatearSubtema(subtema)}</strong>...</p>
            <div id="${bloqueId}"></div>
        `;

      const nivel = document.getElementById("unidadNivel")?.value || selectNivel?.value;
      const gradoTexto = document.getElementById("unidadGrado")?.value || selectGrado?.value;
      const unidadActualProyecto = document.getElementById("unidadNumero")?.value || selectUnidad?.value || "1";

      const contadoresActuales = getContadoresUnidad(unidadActualProyecto);

      // ===== Flujo especial: PROYECTOS =====
        actualizarSpinnerProceso(statusId, `Preparando título del proyecto <strong>${formatearSubtema(subtema)}</strong>...`);
        assertProyectosActivo(tokenProy);
        verificarCancelacionProyectos();
        const tituloCreativoProyecto = await generarTituloCreativoUnico({
          subtema,
          nivel,
          grado: gradoTexto,
          tipo: "proyecto",
          statusId,
          maxIntentos: 3
        });
        assertProyectosActivo(tokenProy);
        const instruccionesProyecto = window.instruccionesGeminiPorCategoria?.['Proyectos'] || '';
        const tituloLecturaRelacionada = relacionada
          ? (
            String(document.getElementById("unidadTemaTexto")?.selectedOptions?.[0]?.textContent || "").trim()
            || String(window.lecturaNuevaCoincidenteGlobal?.titulo || window.lecturaNuevaCoincidenteGlobal?.tema || "").trim()
          )
          : "";

        actualizarSpinnerProceso(statusId, `Construyendo prompt del proyecto <strong>${formatearSubtema(subtema)}</strong>...`);
        assertProyectosActivo(tokenProy);
        const packProyecto = window.construirPromptProyecto(
            objetivosDelSubtema,
            (relacionada && lecturaDisponible) ? contenidoLecturaSeguro : "",
            (relacionada && lecturaDisponible) ? preguntasComprensionSeguras : [],
            subtema,
        tituloCreativoProyecto,
        instruccionesProyecto,
        tituloLecturaRelacionada
      );

        const { prompt: promptProyecto, T_global, AE_global, C_global, P_global, metodologia } = packProyecto;

        let proyectoGeneradoOK = false;
        try {
            actualizarSpinnerProceso(statusId, `Generando contenido del proyecto <strong>${formatearSubtema(subtema)}</strong>...`);
            verificarCancelacionProyectos();
            assertProyectosActivo(tokenProy);
            window.onGeminiStatus = (msg) => actualizarSpinnerProceso(statusId, msg);
            const respuestaProyecto = await enviarPrompt([{ role: "user", text: promptProyecto }]);
            window.onGeminiStatus = null;
            assertProyectosActivo(tokenProy);
            actualizarSpinnerProceso(statusId, `Procesando respuesta del proyecto <strong>${formatearSubtema(subtema)}</strong>...`);
            let htmlProyecto = (respuestaProyecto || "").replace(/```html|```/g, "").trim();
            const clean = s => s.replace(/<\/?(html|body|head)>/gi, "").trim();
            htmlProyecto = clean(htmlProyecto);
            htmlProyecto = htmlProyecto.replace(
              /<\/table>\s*(<h3[^>]*>\s*Preguntas de comprensión\s*<\/h3>)/i,
              '</table><div style="height:14px;"></div>$1'
            );
            htmlProyecto = htmlProyecto.replace(
              /<h3>\s*Preguntas de comprensión\s*<\/h3>/i,
              '<h3 style="margin-top:24px; margin-bottom:10px;">Preguntas de comprensión</h3>'
            );
            if (htmlProyecto.length < 250) {
              // Reintento único cuando la respuesta llega incompleta (caso observado en Proyectos).
              verificarCancelacionProyectos();
              assertProyectosActivo(tokenProy);
              window.onGeminiStatus = (msg) => actualizarSpinnerProceso(statusId, msg);
              const retry = await enviarPrompt([{ role: "user", text: promptProyecto }]);
              window.onGeminiStatus = null;
              assertProyectosActivo(tokenProy);
              const retryClean = clean((retry || "").replace(/```html|```/g, "").trim());
              if (retryClean.length > htmlProyecto.length) htmlProyecto = retryClean;
            }

        // 1) Mostrar primero SOLO col-alumno; col-maestro se agrega al terminar alumno.
        const tituloProyectoParcial = tituloCreativoProyecto || "Proyecto interdisciplinario";
        const proyectoAlumnoColId = `${bloqueId}-alumno`;
        const proyectoMaestroColId = `${bloqueId}-maestro`;
        const proyectoAlumnoContenidoId = `${bloqueId}-alumno-contenido`;
        const tablaInicialProyectoHTML = !window.tablaInicialInsertada
          ? (typeof generarTablaInicialTodasCategorias === "function" ? generarTablaInicialTodasCategorias() : "")
          : "";
        document.getElementById(bloqueId).innerHTML = `
                <div class="bloque-subtema" style="display:flex; gap:20px; align-items:flex-start; margin-bottom:40px; flex-wrap:wrap;" id="${bloqueId}-layout">
                    <div id="${proyectoAlumnoColId}" class="col-alumno" style="flex:1; min-width:300px;">
                        ${tablaInicialProyectoHTML}
                        <p style="margin:0 0 6px 0; font-size:13px;"><strong>Subcategoría:</strong> ${formatearSubtema(subtema)}</p>
                        <h4>${tituloProyectoParcial}</h4>
                        <div id="${proyectoAlumnoContenidoId}"></div>
                    </div>
                </div>
            `;
        if (!window.tablaInicialInsertada) window.tablaInicialInsertada = true;
        await renderContenidoEnTiempoReal(
          document.getElementById(proyectoAlumnoContenidoId),
          htmlProyecto,
          () => window.cancelarProyectos || tokenProy !== window.cancelTokenProyectos
        );
        assertProyectosActivo(tokenProy);

        // Asegurar orden/uso único de recursos
        if (typeof asegurarSecuenciaRecursos === "function") {
          htmlProyecto = asegurarSecuenciaRecursos(htmlProyecto, { unidad: unidadActual, subtema });
        }

        actualizarSpinnerProceso(statusId, `Actualizando secuencia del proyecto <strong>${formatearSubtema(subtema)}</strong>...`);
        // === NUEVO BLOQUE: derivar T/AE/C/P de Proyectos y refrescar tabla ===
        const tituloMostrar = tituloCreativoProyecto || "Proyecto Trimestral";
        const metodologiaSeleccionada = metodologia;

        // Derivar "Tema" del proyecto (de la Pregunta detonante si existe; si no, del título)
        let temaProyecto = tituloMostrar || "Proyecto integrador trimestral";
        const mDet = htmlProyecto.match(/<h3>Pregunta detonante<\/h3>\s*<p>([^<]+)<\/p>/i);
        if (mDet && mDet[1]) {
          temaProyecto = mDet[1].trim();
        }

        // AE/C/P del proyecto: lo que realmente integra el proyecto
        const AE_proyecto = Array.isArray(AE_global) && AE_global.length
          ? AE_global.join("; ")
          : "Desarrolla habilidades de investigación, diseño, creación y evaluación.";
        const C_proyecto = Array.isArray(C_global) && C_global.length
          ? C_global.join("; ")
          : "Secuencia metodológica por fases, con productos intermedios y socialización.";
        const P_proyecto = Array.isArray(P_global) && P_global.length
          ? P_global.join("; ")
          : "Trabajo colaborativo, roles, uso de recursos y reflexión metacognitiva.";

        // Persistimos en la misma estructura plana de secuenciaActual
        secuenciaActual["Proyectos_T"] = temaProyecto;
        secuenciaActual["Proyectos_AE"] = AE_proyecto;
        secuenciaActual["Proyectos_C"] = C_proyecto;
        secuenciaActual["Proyectos_P"] = P_proyecto;

        // Refrescamos la tabla inicial (segura aunque no exista el helper)
        if (typeof refrescarTablaInicial === "function") {
          refrescarTablaInicial();
        }

        const semanasEstimadas =
          metodologiaSeleccionada === "ABP" ? 3 :
            metodologiaSeleccionada === "STEAM" ? 4 :
              metodologiaSeleccionada === "AS" ? 3 : 3;

        const htmlMaestroProyecto = construirPromptNotasMaestroProyecto(
          htmlProyecto,
          nivel,
          gradoTexto,
          tituloMostrar,
          metodologiaSeleccionada,
          semanasEstimadas,
          T_global,
          AE_global,
          C_global,
          P_global
        );

        actualizarSpinnerProceso(statusId, `Renderizando proyecto <strong>${formatearSubtema(subtema)}</strong>...`);
        const colMaestroProyecto = document.getElementById(proyectoMaestroColId);
        const layoutProyecto = document.getElementById(`${bloqueId}-layout`);
        if (layoutProyecto && !colMaestroProyecto) {
          layoutProyecto.insertAdjacentHTML("beforeend", `
                <div id="${proyectoMaestroColId}" class="col-maestro" style="flex:1; min-width:300px; border-left:2px solid #eee; padding-left:12px;">
                  <p style="margin:0 0 6px 0; font-size:13px;"><strong>Subcategoría:</strong> ${formatearSubtema(subtema)}</p>
                  <h4>${tituloMostrar || "Notas del maestro"}</h4>
                  <div id="${proyectoMaestroColId}-contenido"></div>
                </div>
              `);
        }
        await renderContenidoEnTiempoReal(
          document.getElementById(`${proyectoMaestroColId}-contenido`),
          htmlMaestroProyecto,
          () => window.cancelarProyectos || tokenProy !== window.cancelTokenProyectos
        );
        assertProyectosActivo(tokenProy);
        proyectoGeneradoOK = true;

      } catch (err) {
        if (err?.message === "CANCELADO_PROYECTOS") {
          document.getElementById(bloqueId).innerHTML = `<p style="color:#b45309;">⏹ Generación cancelada por el usuario.</p>`;
          actualizarSpinnerProceso(statusId, "⏹ Generación cancelada");
        } else {
          document.getElementById(bloqueId).innerHTML = `<p style="color:red;">❌ Error al generar el Proyecto</p>`;
          categoriaConErrores = true;
        }
        proyectoGeneradoOK = false;
      }

      finalizarSpinnerProceso(
        statusId,
        proyectoGeneradoOK,
        proyectoGeneradoOK
          ? `Proyecto ${formatearSubtema(subtema)} completado`
          : (window.cancelarProyectos ? "Generación cancelada" : `Error al generar ${formatearSubtema(subtema)}`)
      );

      // ✅ IMPORTANTE: Salir de la función después de procesar proyectos
      logVisual(`🎯 Categoría "Proyectos" TERMINADA Y RENDERIZADA!`);
      window.respuestaFinal = document.getElementById("resultadoUnidadGenerada").innerHTML;
      guardarResultadoUnidadEnStorage();
      abrirModalResultadoUnidad();
      _preguntarCopilotoTrasGeneracion(categoria);
      return; // ← ESTA ES LA CLAVE: Salir después de procesar proyectos
    }

    // === Bucle por subtema (SOLO para categorías que NO son Proyectos) ===
    for (const subtema of subtemasDeCategoria) {
      // ✅ CORRECCIÓN MEJORADA: Verificar relación con lectura para TODAS las categorías
      let relacionadaFinal = false;

      // Usa SIEMPRE el estado real del checkbox de relación.
      const chkRelacion = document.querySelector(`input[name='relacion_${subtema}']`);
      relacionadaFinal = chkRelacion ? chkRelacion.checked : false;

      let contenidoLecturaParaPrompt = "";
      let preguntasParaPrompt = [];

      if (relacionadaFinal && lecturaDisponible) {
        // ✅ 1º lectura seleccionada por el usuario
        contenidoLecturaParaPrompt = contenidoLecturaSeguro;
        preguntasParaPrompt = preguntasComprensionSeguras;
      }
      else if (relacionadaFinal && window.lecturaNuevaCoincidenteGlobal) {
        // ✅ 2º fallback automático
        contenidoLecturaParaPrompt = _obtenerContenidoLectura(window.lecturaNuevaCoincidenteGlobal);

        preguntasParaPrompt =
          window.lecturaNuevaCoincidenteGlobal.preguntasComprension || [];

      }



      const chkFicha = document.querySelector(`input[name='ficha_${subtema}']`);
      const generarFichas = !!chkFicha?.checked;

      // 🚫 Si el subtema no tiene el checkbox de ficha activado, saltar
      if (!generarFichas) {
      }

      const cantidad = parseInt(document.querySelector(`input[name='num_${subtema}']`)?.value || "1", 10);
      const statusId = `spinner-${categoria}-${subtema}`;
      const bloqueId = `bloque-${categoria}-${subtema}`;
      const objetivosDelSubtema = objetivos.filter(o => o.subtema === subtema);

      // Flags/checkboxes del subtema - AGREGAR ESTAS LÍNEAS
      const generarAnexos = !!document.querySelector(`input[name='anexo_${subtema}']`)?.checked;
      const generarVideos = !!document.querySelector(`input[name='video_${subtema}']`)?.checked;
      const tieneRecortable = !!document.querySelector(`input[name='recortable_${subtema}']`)?.checked;

      // Si existe, reemplazarlo (regeneración en sitio)
      const bloqueExistente = document.getElementById(bloqueId);
      if (bloqueExistente) {
        bloqueExistente.remove();
      }

      contenedor.innerHTML += `
            <p id="${statusId}"><i class="fas fa-spinner fa-spin"></i> Generando actividades para <strong>${formatearSubtema(subtema)}</strong>...</p>
            <div id="${bloqueId}"></div>
        `;

      const nivel = document.getElementById("unidadNivel")?.value || selectNivel?.value;
      const gradoTexto = document.getElementById("unidadGrado")?.value || selectGrado?.value;
      const unidadActual = document.getElementById("unidadNumero")?.value || selectUnidad?.value || "1";

      // IMPORTANTE: no generes clave de ficha si no está marcado (evita desordenar contadores globales)
      if (!window.clavesFichaPorUnidad) window.clavesFichaPorUnidad = {};
      if (!window.clavesFichaPorUnidad[unidadActual]) window.clavesFichaPorUnidad[unidadActual] = {};

      let claveFichaActual = "";

      // ===== Título por subtema =====
      actualizarSpinnerProceso(statusId, `Preparando título para <strong>${formatearSubtema(subtema)}</strong>...`);
      logVisual(`📌 Preparando prompt del título para: ${subtema}`);
      const tituloCreativoLimpioBase = await generarTituloCreativoUnico({
        subtema,
        nivel,
        grado: gradoTexto,
        tipo: "subtema",
        statusId,
        maxIntentos: 3
      });

      // ===== Flujo normal (otras categorías) =====
      try {
        // ✅ CORRECCIÓN MEJORADA: Lógica para contenido de lectura
        let contenidoLecturaParaPrompt = "";
        let preguntasParaPrompt = [];

        if (relacionadaFinal && lecturaDisponible) {
          contenidoLecturaParaPrompt = contenidoLecturaSeguro;
          preguntasParaPrompt = preguntasComprensionSeguras;
        }
        else if (relacionadaFinal && window.lecturaNuevaCoincidenteGlobal) {
          contenidoLecturaParaPrompt = _obtenerContenidoLectura(window.lecturaNuevaCoincidenteGlobal);

          preguntasParaPrompt =
            window.lecturaNuevaCoincidenteGlobal.preguntasComprension || [];
        }
        else {
        }

        // Obtener instrucciones adicionales para esta categoría
        const instruccionesAdicionales = window.instruccionesGeminiPorCategoria?.[categoria] || '';


        const promptCategoria = construirPromptDeCategoria(
          categoria,
          objetivosDelSubtema,
          contenidoLecturaParaPrompt,
          preguntasParaPrompt,
          [subtema],
          cantidad,
          generarFichas,
          generarAnexos,
          generarVideos,
          tituloCreativoLimpioBase,
          "", // promptTitulo
          relacionadaFinal, // ✅ Indicar explícitamente si está relacionada
          instruccionesAdicionales
        );

        actualizarSpinnerProceso(statusId, `Generando actividades para <strong>${formatearSubtema(subtema)}</strong>...`);
        const previewAlumnoId = `${bloqueId}-preview-alumno`;
        document.getElementById(bloqueId).innerHTML = `
              <div class="bloque-subtema" style="display:flex; gap:20px; align-items:flex-start; margin-bottom:40px; flex-wrap:wrap;">
                  <div class="col-alumno" style="flex:1; min-width:300px;">
                      <p style="margin:0 0 6px 0; font-size:13px;"><strong>Subcategoría:</strong> ${formatearSubtema(subtema)}</p>
                      <h4>${tituloCreativoLimpioBase}</h4>
                      <div id="${previewAlumnoId}" style="white-space:pre-wrap;"></div>
                  </div>
                  <div class="col-maestro" style="flex:1; min-width:300px; border-left:2px solid #eee; padding-left:12px;">
                      <p style="margin:0 0 6px 0; font-size:13px;"><strong>Subcategoría:</strong> ${formatearSubtema(subtema)}</p>
                      <h4>Notas del maestro</h4>
                      <p><i class="fas fa-spinner fa-spin"></i> Esperando contenido del alumno...</p>
                  </div>
              </div>
            `;
        const respuestaAlumno = await enviarPrompt([{ role: "user", text: promptCategoria }]);
        logVisual(`✅ Respuesta alumno recibida (${(respuestaAlumno || "").length} caracteres)`);
        let htmlAlumno = (respuestaAlumno || "").replace(/```html|```/g, "").trim();

        // ✅ Verificar estructura solo si la respuesta no está vacía
        if (htmlAlumno.trim()) {
          verificarEstructuraUnificada(categoria, htmlAlumno);
        }

        // Limpiar prefijos de numeración en anexos/recortables/fichas
        htmlAlumno = htmlAlumno
          .replace(/Actividad\s*\d+\.?\s*(Anexo\s+visual:)/gi, '$1')
          .replace(/Actividad\s*\d+\.?\s*(Recortable\s+[Pp]?\d+\w*:)/gi, '$1')
          .replace(/Actividad\s*\d+\.?\s*(Ficha\s+[Pp]?\d+\w*:)/gi, '$1');

        // ---- Datos del bloque (T/AE/C/P) ----
        const T = objetivosDelSubtema.find(o => o.tipo === "T")?.descripcion || "N/A";
        const AE = objetivosDelSubtema.find(o => o.tipo === "AE")?.descripcion || "N/A";
        const C = objetivosDelSubtema.find(o => o.tipo === "C")?.descripcion || "N/A";
        const P = objetivosDelSubtema.find(o => o.tipo === "P")?.descripcion || "N/A";

        // ---- Notas del Maestro ----
        const { actividadesNormales, actividadesFichas } = extraerActividades(htmlAlumno);

        // ✅ Verificación adicional solo para Artes
        if (categoria === "Artes" && Array.isArray(actividadesNormales)) {

          const actividadesNormalizadas = actividadesNormales.map(act => {
            return act.includes('class="activity"')
              ? act
              : `<div class="activity">${act}</div>`;
          });

          htmlAlumno = htmlAlumno.replace(
            actividadesNormales.join(""),
            actividadesNormalizadas.join("")
          );
        }

        const cleanHTML = html => html.replace(/<\/?(html|body|head|h2)[^>]*>/gi, "").trim();
        const htmlAlumnoLimpio = cleanHTML(htmlAlumno);

        const subtemaRelacionado = document.querySelector(`select[name='interdisciplinariedad_${subtema}']`)?.value;
        const etiquetaInterdisc = subtemaRelacionado
          ? `<div class="etiqueta-interdisciplina" style="background:#c8f7c5;color:#2d7a2d;display:inline-block;padding:4px 8px;border-radius:6px;font-size:.85rem;margin-bottom:6px;">
                    Interdisc. con el subtema ${formatearSubtema(subtemaRelacionado)}
                </div><br>`
          : "";

        // ✅ CORRECCIÓN: Ruta/Tabla global solo una vez para TODAS las categorías
        let bloqueRutaHTML = "";
        if (!window.rutaYTablaInsertadasEnNotas) {
          const todosSubtemasOrdenados = Object.keys(window.categoriaPorSubtema || {});
          bloqueRutaHTML = generarRutaSugerida(todosSubtemasOrdenados);
          bloqueRutaHTML += generarProgramaSintetico(secuenciaActual);
          window.rutaYTablaInsertadasEnNotas = true;
        }

        // ✅ CORRECCIÓN: Tabla inicial solo una vez para TODAS las categorías
        let tablaInicialHTML = "";
        if (!window.tablaInicialInsertada) {
          tablaInicialHTML = typeof generarTablaInicialTodasCategorias === "function" ? generarTablaInicialTodasCategorias() : "";
          window.tablaInicialInsertada = true;
        }

        // ✅ CORRECCIÓN MEJORADA: NO INSERTAR LECTURA EN CADA SUBTEMA
        // La lectura ya se insertó UNA SOLA VEZ al inicio de la categoría para Lenguaje
        // Para otras categorías, la lectura se usa internamente en el prompt pero no se muestra visualmente

        const esPrimerSubtemaLenguaje = (
          categoria === "Lenguaje y comunicación" &&
          subtema === subtemasDeCategoria[0] &&
          window.debeInsertarLecturaLenguaje &&
          window.bloqueLecturaGlobalParaLenguaje
        );

        const lecturaHTML = esPrimerSubtemaLenguaje ?
          `<div class="lectura-global-categoria" style="margin-bottom:30px;">
                  ${window.bloqueLecturaGlobalParaLenguaje}
              </div>` :
          "";

        // Una vez insertada, marcar como ya insertada
        if (esPrimerSubtemaLenguaje) {
          window.debeInsertarLecturaLenguaje = false; // Prevenir duplicados
        }

        // Render parcial en tiempo real: primero columna alumno.
        const colAlumnoId = `${bloqueId}-alumno`;
        const colMaestroId = `${bloqueId}-maestro`;
        const colAlumnoContenidoId = `${bloqueId}-alumno-contenido`;
        document.getElementById(bloqueId).innerHTML = `
            <div class="bloque-subtema" style="display:flex; gap:20px; align-items:flex-start; margin-bottom:40px; flex-wrap:wrap;">
                <div id="${colAlumnoId}" class="col-alumno" style="flex:1; min-width:300px;">
                    ${tablaInicialHTML}
                    <p style="margin:0 0 6px 0; font-size:13px;"><strong>Subcategoría:</strong> ${formatearSubtema(subtema)}</p>
                    <h3 style="color: #2c5aa0; border-bottom: 2px solid #2c5aa0; padding-bottom: 8px; margin-bottom: 20px;">
                        ${formatearSubtema(subtema)}
                    </h3>
                    <h4>${tituloCreativoLimpioBase}</h4>
                    <h5 style="color:#666;font-weight:normal;">${T}</h5>
                    ${etiquetaInterdisc}
                    ${lecturaHTML}
                    <div id="${colAlumnoContenidoId}"></div>
                </div>
                <div id="${colMaestroId}" class="col-maestro" style="flex:1; min-width:300px; border-left:2px solid #eee; padding-left:12px;">
                    <p style="margin:0 0 6px 0; font-size:13px;"><strong>Subcategoría:</strong> ${formatearSubtema(subtema)}</p>
                    <h3 style="color: #2c5aa0; border-bottom: 2px solid #2c5aa0; padding-bottom: 8px; margin-bottom: 20px;">
                        ${formatearSubtema(subtema)}
                    </h3>
                    <h4>${tituloCreativoLimpioBase}</h4>
                    <h5 style="color:#666;font-weight:normal;">${T}</h5>
                    ${bloqueRutaHTML}
                    <p><i class="fas fa-spinner fa-spin"></i> Generando notas del maestro...</p>
                    <div id="${colMaestroId}-contenido" style="white-space:pre-wrap;"></div>
                </div>
            </div>
          `;
        await renderContenidoEnTiempoReal(document.getElementById(colAlumnoContenidoId), htmlAlumnoLimpio);

        const promptNotas = construirPromptNotasMaestro(
          htmlAlumno,
          nivel,
          gradoTexto,
          subtema,
          tituloCreativoLimpioBase,
          claveFichaActual
        );

        actualizarSpinnerProceso(statusId, `Generando notas del maestro para <strong>${formatearSubtema(subtema)}</strong>...`);
        logVisual(`⏳ Generando notas del maestro para ${subtema}...`);
        const respuestaMaestro = await enviarPrompt([{ role: "user", text: promptNotas }]);
        logVisual(`✅ Notas del maestro listas para ${subtema}`);

        const htmlMaestro = (respuestaMaestro || "").replace(/```html|```/g, "").trim();
        const htmlMaestroLimpio = cleanHTML(htmlMaestro);

        let notasFinalesColMaestro = htmlMaestroLimpio;

        if (actividadesFichas && actividadesFichas.length > 0) {
          const bloqueNotasFicha = await generarNotasDeFichas(actividadesFichas, subtema, tituloCreativoLimpioBase);
          notasFinalesColMaestro += `
                    <hr>
                    <h3 style="margin-top:20px;">Notas adicionales para las fichas de refuerzo</h3>
                    ${bloqueNotasFicha}
                `;
        }

        actualizarSpinnerProceso(statusId, `Renderizando resultados de <strong>${formatearSubtema(subtema)}</strong>...`);
        const colMaestro = document.getElementById(colMaestroId);
        if (colMaestro) {
          colMaestro.innerHTML = `
              <p style="margin:0 0 6px 0; font-size:13px;"><strong>Subcategoría:</strong> ${formatearSubtema(subtema)}</p>
              <h3 style="color: #2c5aa0; border-bottom: 2px solid #2c5aa0; padding-bottom: 8px; margin-bottom: 20px;">
                  ${formatearSubtema(subtema)}
              </h3>
              <h4>${tituloCreativoLimpioBase}</h4>
              <h5 style="color:#666;font-weight:normal;">${T}</h5>
              ${bloqueRutaHTML}
              <div id="${colMaestroId}-contenido"></div>
            `;
          await renderContenidoEnTiempoReal(document.getElementById(`${colMaestroId}-contenido`), notasFinalesColMaestro);
        }


        // ✅ CORRECCIÓN: Limpiar duplicados específicamente para Artes
        if (categoria === "Lenguaje y comunicación" && subtema === "Artes") {
          setTimeout(() => {
            limpiarDuplicadosArtes();
          }, 500);
        }

        if (categoria === "Matemáticas") {
          const estrategiaHTML = generarEstrategiaMatematica(subtema);
          document.getElementById(bloqueId).innerHTML += estrategiaHTML;
        }

        window.notasMaestroAcumuladas = (window.notasMaestroAcumuladas || "") + notasFinalesColMaestro + "<hr>";
        logVisual(`🎉 Subtema ${subtema} renderizado completamente`);
        } catch (err) {
            if (err?.message === "CANCELADO_PROYECTOS") {
                actualizarSpinnerProceso(statusId, `⏹ Cancelado por el usuario.`);
                document.getElementById(bloqueId)?.remove();
            } else {
                document.getElementById(bloqueId).innerHTML = `<p style="color:red;">❌ Error al generar contenido para "${formatearSubtema(subtema)}"</p>`;
                categoriaConErrores = true;
            }
        }

        finalizarSpinnerProceso(statusId, true, `${formatearSubtema(subtema)} completado`);
    }

    logVisual(`🎯 Categoría "${categoria}" TERMINADA Y RENDERIZADA!`);

    window.respuestaFinal = document.getElementById("resultadoUnidadGenerada").innerHTML;
    guardarResultadoUnidadEnStorage();
    abrirModalResultadoUnidad();
    _preguntarCopilotoTrasGeneracion(categoria);
    } catch (error) {
        if (error?.message === "CANCELADO_PROYECTOS") {
            logVisual("⏹ Generación de Proyectos cancelada por el usuario.");
        } else {
            categoriaConErrores = true;
            console.error(`Error al generar categoría ${categoria}:`, error);
            alert(`❌ Ocurrió un error al generar la categoría "${categoria}".`);
        }
    } finally {
        document.getElementById(statusCategoriaId)?.remove();
        setCategoriaSpinnerUI(categoria, false);
        if (categoria === "Proyectos") {
            const stopBtn = document.getElementById("btn-detener-Proyectos");
            if (stopBtn) {
                stopBtn.style.display = "none";
                stopBtn.disabled = true;
            }
            window.cancelarProyectos = false;
            window.onGeminiStatus = null;
        }
        if (categoriaConErrores) {
            window.ultimaCategoriaFallida = categoria;
        } else {
            if (window.ultimaCategoriaFallida === categoria) {
                window.ultimaCategoriaFallida = "";
            }
            window.ultimaCategoriaExitosa = categoria;
        }
        window.categoriaEnProceso = "";
        window.generandoCategoria = null;
    }
}
// ===================== FIN FUNCIÓN CORREGIDA =====================


// ✅ FUNCIÓN PARA VERIFICAR ESTRUCTURA UNIFICADA
function verificarEstructuraUnificada(categoria, contenidoHTML) {
  const verificaciones = {
    actividad: /class=["']activity["']/i,
    instruccion: /<strong>/i,
    pasos: /<ol[^>]*class=["']steps["']/i,
    respuesta: /style=["'][^"']*color:mediumvioletred[^"']*["'][^>]*>\s*Respuesta\s*:/i
  };

  const faltantes = Object.entries(verificaciones)
    .filter(([_, regex]) => !regex.test(contenidoHTML))
    .map(([clave]) => clave);

  if (faltantes.length > 0) {
    return false;
  }

  return true;
}



function formatearSubtema(nombre) {
  const reemplazos = {
    "ExpresionOral": "Expresión oral",
    "ExpresionEscrita": "Expresión escrita",
    "ExpresiónOral": "Expresión oral",
    "ExpresiónEscrita": "Expresión escrita",
    "ComprensionLectora": "Comprensión Lectora",
    "ConvencionesLinguisticas": "Convenciones Lingüísticas",
    "Gramatica": "Gramática",
    "Ortografia": "Ortografía",
    "ConocimientoDelMedio": "Conocimiento del medio",
    "CivicaEtica": "Formación Cívica y Ética",
    "Habilidades": "Habilidades",
  };
  return reemplazos[nombre] || nombre.replace(/([a-z])([A-Z])/g, '$1 $2');
}



// ✅ Objeto global para mantener contadores por unidad y tipo
// Objeto global para contadores por unidad



// ✅ CORRECCIÓN: Sistema de contadores por unidad GLOBAL
window.contadoresPorUnidad = window.contadoresPorUnidad || {};
window.contadoresProyecto = window.contadoresProyecto || {
  fichas: 0,
  recortables: 0,
  anexos: 0,
  videos: 0
};

function getContadoresProyecto() {
  if (!window.contadoresProyecto) {
    window.contadoresProyecto = { fichas: 0, recortables: 0, anexos: 0, videos: 0 };
  }
  return window.contadoresProyecto;
}


function obtenerClaveFicha(unidad) {
  if (!unidad) unidad = selectUnidad?.value || "1";

  const contadores = getContadoresUnidad(unidad);
  const letra = String.fromCharCode(97 + contadores.fichas); // 97 = 'a'
  const clave = `Ficha ${unidad}${letra}`;


  // ✅ INCREMENTAR SOLO SI SE VA A GENERAR REALMENTE
  contadores.fichas++;
  window.claveFichaActualGlobal = clave;
  window.chkFichaActivo = true;

  return clave;
}

function obtenerClaveProyectoFicha() {
  const unidad = selectUnidad?.value || document.getElementById("unidadNumero")?.value || "1";
  const contadores = getContadoresProyecto();
  const letra = String.fromCharCode(97 + contadores.fichas);
  const clave = `Ficha p${unidad}${letra}`;
  contadores.fichas++;
  window.claveFichaActualGlobal = clave;
  window.chkFichaActivo = true;
  return clave;
}



function obtenerClaveRecortable(unidad) {
  if (!unidad) unidad = selectUnidad?.value || "1";

  const contadores = getContadoresUnidad(unidad);
  const letra = String.fromCharCode(97 + contadores.recortables);
  const clave = `Recortable ${unidad}${letra}`;


  contadores.recortables++;

  return clave;
}

function obtenerClaveProyectoRecortable() {
  const unidad = selectUnidad?.value || document.getElementById("unidadNumero")?.value || "1";
  const contadores = getContadoresProyecto();
  const letra = String.fromCharCode(97 + contadores.recortables);
  const clave = `Recortable p${unidad}${letra}`;
  contadores.recortables++;
  return clave;
}

function obtenerClaveAnexo(unidad) {
  if (!unidad) unidad = selectUnidad?.value || "1";

  const contadores = getContadoresUnidad(unidad);
  const letra = String.fromCharCode(97 + contadores.anexos);
  const clave = `Anexo ${unidad}${letra}`;


  contadores.anexos++;
  window.claveAnexoActualGlobal = clave;

  return clave;
}

function obtenerClaveProyectoAnexo() {
  const unidad = selectUnidad?.value || document.getElementById("unidadNumero")?.value || "1";
  const contadores = getContadoresProyecto();
  const letra = String.fromCharCode(97 + contadores.anexos);
  const clave = `Anexo p${unidad}${letra}`;
  contadores.anexos++;
  window.claveAnexoActualGlobal = clave;
  return clave;
}


// ✅ NUEVA: Función para numeración de videos
function obtenerClaveVideo(unidad) {
  if (!unidad) unidad = selectUnidad?.value || "1";

  const contadores = getContadoresUnidad(unidad);
  const letra = String.fromCharCode(97 + (contadores.videos || 0));
  const clave = `Video ${unidad}${letra}`;


  if (!contadores.videos) contadores.videos = 1;
  else contadores.videos++;

  return clave;
}

function obtenerClaveProyectoVideo() {
  const unidad = selectUnidad?.value || document.getElementById("unidadNumero")?.value || "1";
  const contadores = getContadoresProyecto();
  const letra = String.fromCharCode(97 + contadores.videos);
  const clave = `Video p${unidad}${letra}`;
  contadores.videos++;
  return clave;
}

// ✅ FUNCIÓN MEJORADA: Inicializar contadores de forma robusta
function inicializarContadoresUnidad(unidad) {
  if (!unidad) unidad = selectUnidad?.value || "1";

  if (!window.contadoresPorUnidad) {
    window.contadoresPorUnidad = {};
  }

  if (!window.contadoresPorUnidad[unidad]) {
    window.contadoresPorUnidad[unidad] = {
      fichas: 0,
      recortables: 0,
      anexos: 0,
      videos: 0
    };
  }

  return window.contadoresPorUnidad[unidad];
}

// ✅ FUNCIÓN MEJORADA: Obtener contadores actuales
function getContadoresUnidad(unidad) {
  if (!unidad) unidad = selectUnidad?.value || "1";

  // Siempre inicializar primero
  return inicializarContadoresUnidad(unidad);
}




// Llamar verificarUnidadActual al inicio
document.addEventListener('DOMContentLoaded', function () {
  verificarUnidadActual();
});

function generarTablaInicialTodasCategorias() {
  const categoriasOrden = [
    "Proyectos",
    "Lenguaje y comunicación",
    "Matemáticas",
    "Ciencias experimentales",
    "Ciencias sociales",
    "Formación socioemocional",
  ];

  const mapaCategoriaASubtemas = {
    "Proyectos": ["Proyectos"],
    "Lenguaje y comunicación": [
      "Artes",
      "Ortografía",
      "Gramatica",
      "ExpresionEscrita",
      "ExpresionOral",
      "Habilidades",
    ],
    "Ciencias experimentales": [
      "Naturales",
      "ConocimientoDelMedio",
      "MiLocalidad"
    ],
    "Ciencias sociales": [
      "Historia",
      "Geografia"
    ],
    "Formación socioemocional": [
      "CivicaEtica",
      "Socioemocional"
    ],
    "Matemáticas": ["Matematicas"]
  };



  const filas = [];
  categoriasOrden.forEach(cat => {
    (mapaCategoriaASubtemas[cat] || []).forEach(sub => {
      const clave = sub.replace(/\s+/g, "_");
      const T = secuenciaActual?.[`${clave}_T`] || "-";
      const AE = secuenciaActual?.[`${clave}_AE`] || "-";
      const C = secuenciaActual?.[`${clave}_C`] || "-";
      const P = secuenciaActual?.[`${clave}_P`] || "-";

      const freq = frecuenciaSemanalPorCategoria[cat] || 1;

      filas.push(`
        <tr>
          <td>${cat}</td>
          <td>${formatearSubtema(sub)}</td>
          <td>${T}</td>
          <td>${AE}</td>
          <td>${P}</td>
          <td>${C}</td>
          <td style="text-align:center;">${freq}</td>
        </tr>
      `);
    });
  });

  return `
    <div id="tabla-inicial-unidad" style="margin-bottom:16px;">
      <div style="display:flex; align-items:center; gap:10px; margin:8px 0;">
        <h3 style="margin:0;">Secuencia y alcance de la unidad (incluye Proyectos)</h3>
      </div>
      <div id="tabla-inicial-unidad-body" style="display:none;">
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px;">
        <thead style="background:#f2f2f2;">
          <tr>
            <th title="Categoría" aria-label="Categoría"><i class="fa-solid fa-tags unidad-th-icon"></i></th>
            <th title="Subtema" aria-label="Subtema"><i class="fa-solid fa-bookmark unidad-th-icon"></i></th>
            <th title="Tema" aria-label="Tema"><i class="fa-solid fa-book-open unidad-th-icon"></i></th>
            <th title="Aprendizaje esperado" aria-label="Aprendizaje esperado"><i class="fa-solid fa-bullseye unidad-th-icon"></i></th>
            <th title="Proceso" aria-label="Proceso"><i class="fa-solid fa-gears unidad-th-icon"></i></th>
            <th title="Contenido" aria-label="Contenido"><i class="fa-solid fa-layer-group unidad-th-icon"></i></th>
            <th title="Frecuencia semanal" aria-label="Frecuencia semanal"><i class="fa-solid fa-calendar-week unidad-th-icon"></i></th>
          </tr>
        </thead>
        <tbody>${filas.join("")}</tbody>
        </table>
      </div>
    </div>
  `;
}

window.toggleTablaInicialUnidad = function toggleTablaInicialUnidad() {
  const body = document.getElementById("tabla-inicial-unidad-body");
  const btn = document.getElementById("btnToggleTablaUnidad");
  if (!body || !btn) return;
  const oculto = body.style.display === "none";
  body.style.display = oculto ? "" : "none";
  const label = btn.querySelector(".unidad-btn-text");
  if (label) {
    label.textContent = oculto ? "Ocultar secuencia" : "Mostrar secuencia";
  } else {
    btn.textContent = oculto ? "Ocultar secuencia" : "Mostrar secuencia";
  }
};

function refrescarTablaInicial() {
  const cont = document.getElementById("resultadoUnidadGenerada");
  if (!cont) return;
  const tablaHTML = generarTablaInicialTodasCategorias();
  // Inserta/actualiza al inicio
  const viejo = document.getElementById("tabla-inicial-unidad");
  if (viejo) {
    viejo.outerHTML = tablaHTML;
  } else {
    cont.insertAdjacentHTML("afterbegin", tablaHTML);
  }
  const btn = document.getElementById("btnToggleTablaUnidad");
  const label = btn?.querySelector(".unidad-btn-text");
  if (label) label.textContent = "Mostrar secuencia";
  window.tablaInicialInsertada = true;
}




// ✅ Función robusta con control de rate-limit y errores
function isPreviewModel(modelo) {
  return String(modelo || "").includes("preview");
}

function getGeminiModelsFromSelect() {
  const select = document.getElementById("selectGeminiEndpoint");
  const modelos = Array.from(select?.options || [])
    .map((opt) => normalizeGeminiModel(opt?.value || ""))
    .filter(Boolean);
  return [...new Set(modelos)];
}

function buildModeloFallbackChain() {
  const preferido = normalizeGeminiModel(getSelectedModel());
  const modelosDelSelect = getGeminiModelsFromSelect();
  // Catálogo principal = lo que está en el select de la UI.
  // Si el select todavía no está listo, cae a la lista confiable interna.
  const catalogo = modelosDelSelect.length ? modelosDelSelect : GEMINI_FALLBACK_CONFIABLE;

  // Siempre respetar primero el modelo seleccionado en el UI.
  const baseOrden = isPreviewModel(preferido)
    ? [preferido, ...catalogo]
    : [preferido, ...catalogo];

  const dedup = [...new Set(baseOrden.map(normalizeGeminiModel).filter(Boolean))];

  // Mantener el preferido primero, incluso si está en cooldown (el usuario lo eligió explícitamente).
  const resto = dedup.slice(1).filter((m) => !modeloEnCooldown(m));
  const chain = [preferido, ...resto];
  return chain.length ? chain : ["gemini-2.5-flash-lite"];
}

async function ejecutarPrompt(mensajes, intentos = 0, modeloIndex = 0, chain = null) {
  if (window.cancelarProyectos) {
    throw new Error("CANCELADO_PROYECTOS");
  }

  await sleep(DELAY_ENTRE_PETICIONES);
  if (window.cancelarProyectos) {
    throw new Error("CANCELADO_PROYECTOS");
  }

  const fallbackChain = chain || buildModeloFallbackChain();
  const modeloActual = fallbackChain[modeloIndex] || "gemini-2.5-flash-lite";
  if (typeof window.onGeminiStatus === "function") {
    window.onGeminiStatus(`Modelo ${modeloActual} · intento ${intentos + 1}`);
  }

  const generationConfig = buildGenerationConfig(modeloActual);

  const controller = new AbortController();
  const requestTimeoutMs = getGeminiRequestTimeoutMs(modeloActual);
  let timeoutTriggered = false;
  const timeoutId = setTimeout(() => {
    timeoutTriggered = true;
    controller.abort();
  }, requestTimeoutMs);
  window.abortControllersGemini.add(controller);

  try {
    const {response, data} = await geminiGenerateViaApi(modeloActual, {
      contents: mensajes.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      })),
      ...(generationConfig ? { generationConfig } : {})
    }, controller.signal);
    clearTimeout(timeoutId);
    window.abortControllersGemini.delete(controller);
    if (response.ok) {
      limpiarMarcaAltaDemanda(modeloActual);
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }

    const apiMsg = String(data?.error?.message || "");
    if (response.status === 429 || response.status === 503 || /high demand/i.test(apiMsg)) {
      marcarModeloEnAltaDemanda(modeloActual, apiMsg || "alta demanda", response.status);
    } else if (response.status === 404) {
      marcarModeloEnAltaDemanda(modeloActual, "modelo no disponible", response.status);
    }

    const isRetriable = [429, 500, 503].includes(response.status);
    if (isRetriable && intentos < MAX_RETRIES_PER_MODEL) {
      const backoff = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, intentos)) + Math.floor(Math.random() * 400);
      if (typeof window.onGeminiStatus === "function") {
        window.onGeminiStatus(`Reintentando ${modeloActual} (${response.status})`);
      }
      await sleep(backoff);
      return ejecutarPrompt(mensajes, intentos + 1, modeloIndex, fallbackChain);
    }

    if (modeloIndex + 1 < fallbackChain.length) {
      const siguiente = fallbackChain[modeloIndex + 1];
      if (typeof window.onGeminiStatus === "function") {
        window.onGeminiStatus(`Cambio de ${modeloActual} a ${siguiente} (${response.status})`);
      }
      return ejecutarPrompt(mensajes, 0, modeloIndex + 1, fallbackChain);
    }

    throw new Error(`Gemini falló en todos los modelos: ${apiMsg || `HTTP ${response.status}`}`);
  } catch (err) {
    clearTimeout(timeoutId);
    window.abortControllersGemini.delete(controller);

    if (err?.message === "CANCELADO_PROYECTOS" || (err?.name === "AbortError" && window.cancelarProyectos)) {
      throw new Error("CANCELADO_PROYECTOS");
    }
    if (err?.name === "AbortError" && timeoutTriggered) {
      marcarModeloEnAltaDemanda(modeloActual, `timeout ${requestTimeoutMs}ms`, 0);
      err = new Error(`TIMEOUT_GEMINI_${modeloActual}`);
    }
    if (err?.name !== "AbortError") {
      marcarModeloEnAltaDemanda(modeloActual, "error de red", 0);
    }

    if (intentos < MAX_RETRIES_PER_MODEL) {
      const backoff = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, intentos)) + Math.floor(Math.random() * 400);
      if (typeof window.onGeminiStatus === "function") {
        window.onGeminiStatus(`Reintentando ${modeloActual} por red`);
      }
      await sleep(backoff);
      return ejecutarPrompt(mensajes, intentos + 1, modeloIndex, fallbackChain);
    }

    if (modeloIndex + 1 < fallbackChain.length) {
      const siguiente = fallbackChain[modeloIndex + 1];
      if (typeof window.onGeminiStatus === "function") {
        window.onGeminiStatus(`Cambio por error de red: ${modeloActual} -> ${siguiente}`);
      }
      return ejecutarPrompt(mensajes, 0, modeloIndex + 1, fallbackChain);
    }

    throw new Error(`No se pudo completar la petición a Gemini (${modeloActual})`);
  }
}

function enqueueGeminiTask(taskFn) {
  // Importante: evita que una falla previa deje la cola permanentemente rechazada.
  colaPrompts = colaPrompts.catch(() => null).then(taskFn);
  return colaPrompts;
}

// ✅ Siempre pasa por esta cola para no saturar el modelo
function enviarPrompt(mensajes) {
  if (window.cancelarProyectos) {
    return Promise.reject(new Error("CANCELADO_PROYECTOS"));
  }
  return enqueueGeminiTask(() => ejecutarPrompt(mensajes));
}

// ✅ Streaming via backend seguro: entrega incremental simulada con resultado final.
async function ejecutarPromptStreaming(mensajes, onPartial, intentos = 0) {
  const texto = await ejecutarPrompt(mensajes, intentos);
  if (typeof onPartial === "function") onPartial(texto);
  return texto;
}

function enviarPromptStreaming(mensajes, onPartial) {
  if (window.cancelarProyectos) {
    return Promise.reject(new Error("CANCELADO_PROYECTOS"));
  }
  return enqueueGeminiTask(() => ejecutarPromptStreaming(mensajes, onPartial));
}


// ✅ Función auxiliar para separar actividades normales y de fichas
function extraerActividades(contenidoActividades) {
  // 1️⃣ Capturar primero TODAS las fichas
  const fichasMatch = [...contenidoActividades.matchAll(
    /<div class="activity-fichas">([\s\S]*?)<\/div>/g
  )].map(m => m[1].trim());

  // 2️⃣ Eliminar las fichas del contenido para evitar confusión
  let contenidoSinFichas = contenidoActividades
    // quitar fichas
    .replace(/<div class="activity-fichas">[\s\S]*?<\/div>/g, "")


  // 3️⃣ Ahora capturar SOLO las actividades normales
  const actividadesMatch = [...contenidoSinFichas.matchAll(
    /<div class="activity">([\s\S]*?)<\/div>/g
  )].map(m => m[1].trim());

  return {
    actividadesNormales: actividadesMatch,
    actividadesFichas: fichasMatch
  };
}


function detectarTipoActividad(textoPlano) {
  const esFicha = /ficha\s*[p]?\d+/i.test(textoPlano) || textoPlano.includes('activity-fichas');
  const esAmpliacion = /recortable\s*\d+/i.test(textoPlano) || /anexo\s*\d+/i.test(textoPlano) || /video/i.test(textoPlano);

  if (esFicha) return "Refuerzo";
  if (esAmpliacion) return "Ampliación";
  return "General";
}

function construirTablaCandelarizacionMejorada(filas = [], opts = {}) {
  const titulo = opts.titulo || "Candelarización de actividades recomendada";
  if (!Array.isArray(filas) || filas.length === 0) {
    return `
      <h4 style="margin-top:10px;">${titulo}</h4>
      <p>No se detectaron actividades para calendarizar.</p>
    `;
  }

  const totalMin = filas.reduce((acc, f) => acc + (Number(f.minutos) || 0), 0);
  const sesiones = filas.length;
  const semanas = Math.max(1, Math.ceil(sesiones / 5));

  const body = filas.map(f => `
    <tr>
      <td style="border:1px solid #ccc;padding:4px 6px;">${f.semana || "Semana 1"}</td>
      <td style="border:1px solid #ccc;padding:4px 6px;">${f.sesion || "-"}</td>
      <td style="border:1px solid #ccc;padding:4px 6px;">${f.subtema || "-"}</td>
      <td style="border:1px solid #ccc;padding:4px 6px;">${f.actividad || "-"}</td>
      <td style="border:1px solid #ccc;padding:4px 6px;">${f.tipo || "General"}</td>
      <td style="border:1px solid #ccc;padding:4px 6px;">${f.modalidad || "Sin modalidad"}</td>
      <td style="border:1px solid #ccc;padding:4px 6px;">${f.minutos || 0} min</td>
      <td style="border:1px solid #ccc;padding:4px 6px;">${f.material || "Sin material complementario"}</td>
    </tr>
  `).join("");

  return `
    <h4 style="margin-top:10px;">${titulo}</h4>
    <p>Plan sugerido: <strong>${sesiones}</strong> sesiones, <strong>${totalMin} minutos</strong> totales, distribuido en <strong>${semanas}</strong> semana(s). Cada sesión cubre una subcategoría/subtema.</p>
    <table style="border-collapse:collapse;font-size:11px;width:100%;min-width:560px;margin-top:5px;">
      <thead>
        <tr style="background:#f9f9f9;">
          <th style="border:1px solid #ccc;padding:4px 6px;">Semana</th>
          <th style="border:1px solid #ccc;padding:4px 6px;">Sesión</th>
          <th style="border:1px solid #ccc;padding:4px 6px;">Subtema/Fase</th>
          <th style="border:1px solid #ccc;padding:4px 6px;">Actividad</th>
          <th style="border:1px solid #ccc;padding:4px 6px;">Tipo</th>
          <th style="border:1px solid #ccc;padding:4px 6px;">Modalidad</th>
          <th style="border:1px solid #ccc;padding:4px 6px;">Tiempo</th>
          <th style="border:1px solid #ccc;padding:4px 6px;">Material complementario</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}


// ✅ Construir notas del maestro con separación correcta de actividades
function construirPromptNotasMaestro(
  contenidoActividades,
  nivel,
  grado,
  subtema,
  tituloCreativo = "",
  tituloVideoGenerado,
  minutosTotales,
  recursosGlobales = {}
) {
  // Extraer claves de recursos del contenido HTML si no se proporcionan
  const extraerClave = (patron) => {
    const match = contenidoActividades.match(patron);
    return match ? match[0] : `(${patron.toString().replace(/\\(.)/g, '$1')} no detectado)`;
  };

  const claveFicha = extraerClave(/Ficha\s+[Pp]?\d+\w*/i) || "(Ficha no detectada)";
  const claveRecortable = extraerClave(/Recortable\s+[Pp]?\d+\w*/i) || "(Recortable no detectado)";
  const claveAnexo = extraerClave(/Anexo\s+[Pp]?\d+\w*/i) || "(Anexo no detectado)";
  const tituloVideo = extraerClave(/video\s+"([^"]+)"/i) || "(Video no detectado)";

  const categoria = categoriaPorSubtema[subtema] || "General";
  const tituloFinal = tituloCreativo || formatearSubtema(subtema);

  const { actividadesNormales, actividadesFichas } = extraerActividades(contenidoActividades);


  if (actividadesNormales.length === 0 && actividadesFichas.length === 0) {
    return "<p>❌ No se detectaron actividades para generar notas del maestro.</p>";
  }

  // ✅ detectar recurso ahora usa SIEMPRE las variables recibidas
  function detectarRecurso(textoPlano, tipo = "normal") {
    if (/ficha\s*\d+/i.test(textoPlano)) {
      return tipo === "ficha"
        ? "Esta ficha complementa la actividad principal; úsala como refuerzo después de que los alumnos hayan trabajado el tema."
        : `Usa la ${claveFichaActualGlobal} (actividad de refuerzo) durante esta actividad.`;
    }
    if (/recortable\s*\d+/i.test(textoPlano)) {
      return tipo === "ficha"
        ? "Entrega el recortable para que los alumnos lo manipulen y refuercen visualmente el aprendizaje (actividad de ampliación)."
        : `Utiliza el ${claveRecortable} como material de apoyo para ampliar el conocimiento.`;
    }
    if (/anexo\s*/i.test(textoPlano)) {
      return tipo === "ficha"
        ? "Muestra el anexo visual como apoyo complementario para facilitar la explicación del tema (actividad de ampliación)."
        : `Muestra el ${claveAnexo} para facilitar la explicación y ampliar el conocimiento.`;
    }
    if (/video/i.test(textoPlano)) {
      return tipo === "ficha"
        ? "Proyecta el video antes de la discusión grupal para contextualizar el tema y generar interés (actividad de ampliación)."
        : `Proyecta el video "${tituloVideoGenerado}" antes de comenzar para ampliar el contexto.`;
    }
    return "Actividad general del libro del alumno.";
  }

  if (actividadesFichas && actividadesFichas.length > 0) {
    const bloqueNotasFicha = generarNotasDeFichas(actividadesFichas, subtema, tituloCreativo);
  }

  // ✅ Procesar actividades normales
  const listaNormales = actividadesNormales.map((a, i) => {
    const textoPlano = a.replace(/<[^>]*>/g, "").trim();
    const tipoActividad = detectarTipoActividad(textoPlano);

    // Extraer recursos específicos
    const fichaMatch = textoPlano.match(/ficha\s+(\d+\w*)/i);
    const videoMatch = textoPlano.match(/video\s+"([^"]+)"/i);
    const recortableMatch = textoPlano.match(/recortable\s+(\d+\w*)/i);
    const anexoMatch = textoPlano.match(/anexo\s+(\d+\w*)/i);

    const modalidad = textoPlano.includes("[IC T. IND]") ? "Trabajo individual"
      : textoPlano.includes("[IC T. PAR]") ? "Trabajo en parejas"
        : textoPlano.includes("[IC T. EQUI]") ? "Trabajo en equipo"
          : "Sin modalidad";

    // Construir texto de recursos
    let recursosTexto = "";
    if (fichaMatch) recursosTexto += `\nRecurso: Usar la ${fichaMatch[0]} para reforzar el aprendizaje.`;
    if (videoMatch) recursosTexto += `\nRecurso: Proyectar el video "${videoMatch[1]}" antes de la actividad.`;
    if (recortableMatch) recursosTexto += `\nRecurso: Utilizar el ${recortableMatch[0]} como material manipulativo.`;
    if (anexoMatch) recursosTexto += `\nRecurso: Consultar el ${anexoMatch[0]} como referencia visual.`;

    const tituloCorto = textoPlano.split(".")[0];

    return `[ACTIVIDAD ${i + 1}]  
      Tipo de Actividad: ${i + 1} ${tipoActividad}
      Título: ${tituloCorto}.
      Modalidad: ${modalidad}
      ${recursosTexto}`;
  }).join("\n\n");


  // ✅ Procesar fichas
  const listaFichas = actividadesFichas.map((a, i) => {
    const textoPlano = a.replace(/<[^>]*>/g, "").trim();
    const modalidad = textoPlano.includes("[IC T. IND]") ? "Trabajo individual"
      : textoPlano.includes("[IC T. PAR]") ? "Trabajo en parejas"
        : textoPlano.includes("[IC T. EQUI]") ? "Trabajo en equipo"
          : "Sin modalidad";

    const recursoExtra = detectarRecurso(textoPlano, "ficha");

    return `
      <div style="margin-top:10px;">
        <p><strong>Ficha ${claveFichaActualGlobal} - Actividad ${i + 1}:</strong> ${textoPlano}</p>
        <p><em>Modalidad:</em> ${modalidad}</p>
        <p><em>Recomendación para el maestro:</em> Úsala como refuerzo o ampliación en la segunda mitad de la semana. ${recursoExtra}</p>
      </div>
    `;
  }).join("\n");


  // ✅ Combinar lista final
  let listaActividadesFinal = listaNormales;
  if (actividadesFichas.length > 0) {
    listaActividadesFinal += `

    --- FICHAS DETECTADAS ---
    ${listaFichas}`;
  }

  const totalActividades = actividadesNormales.length + actividadesFichas.length;

  // 🧠 Calcular tiempos estimados según dificultad
  const evaluarDificultad = txt =>
    /analiza|diseña|justifica|evalúa|construye|propón|compara|argumenta|sintetiza/i.test(txt) ? 10 :
      /explica|relaciona|ordena|interpreta|responde|elige|clasifica/i.test(txt) ? 8 : 5;

  let totalMinutosUnidad = 0;
  let bloquesPorSubtema = {};

  actividadesNormales.forEach((act, index) => {
    const texto = act.replace(/<[^>]*>/g, "").trim();

    const modalidadTrabajo =
      texto.includes("[IC T. IND]") ? "trabajo individual" :
        texto.includes("[IC T. PAR]") ? "trabajo en parejas" :
          texto.includes("[IC T. EQUI]") ? "trabajo en equipo" :
            "sin modalidad definida";

    function detectarMaterialComplementario(texto) {
      let materiales = [];

      // ✅ Si detecta ficha o activity-fichas
      if (/ficha\s*\d+/i.test(texto) || texto.includes('activity-fichas')) {
        if (claveFichaActualGlobal) materiales.push(claveFichaActualGlobal);
      }

      const fichaMatch = texto.match(/ficha\s+\d+\w*/i);
      if (fichaMatch) materiales.push(fichaMatch[0]);

      // ✅ Recortables
      if (/recortable\s*\d+/i.test(texto)) {
        if (claveRecortable) materiales.push(claveRecortable);
      }

      // ✅ Anexos
      if (/anexo\s*\d+/i.test(texto)) {
        if (claveAnexo) materiales.push(claveAnexo);
      }

      // ✅ Videos
      if (/video/i.test(texto)) {
        materiales.push(`Video "${tituloVideoGenerado}"`);
      }

      // ✅ Filtra valores vacíos o undefined para evitar comas iniciales
      materiales = materiales.filter(Boolean);

      // ✅ Si hay materiales, los une separados por coma; si no, texto por defecto
      return materiales.length ? materiales.join(", ") : "Sin material complementario";
    }


    const nombreSubtema = formatearSubtema(subtema);
    if (!bloquesPorSubtema[nombreSubtema]) bloquesPorSubtema[nombreSubtema] = [];

    const tiempo = evaluarDificultad(texto);
    totalMinutosUnidad += tiempo;

    bloquesPorSubtema[nombreSubtema].push({
      num: index + 1,
      minutos: tiempo,
      texto,
      modalidad: modalidadTrabajo,
      material: detectarMaterialComplementario(texto)
    });
  });

  // ✅ Construir candelarización mejorada con sesión, tipo y modalidad.
  const numeroUnidad = parseInt(selectUnidad?.value || "1", 10);
  const filasCalendar = [];
  let idxSesion = 0; // sesión por subtema
  Object.entries(bloquesPorSubtema).forEach(([subtemaNombre, acts]) => {
    const semanaN = numeroUnidad + Math.floor(idxSesion / 5);
    const sesionLabel = `Sesión ${idxSesion + 1}`;
    acts.forEach((a) => {
      const tipo = /ficha|refuerzo/i.test(a.texto) ? "Refuerzo" : (/anexo|recortable|video/i.test(a.texto) ? "Ampliación" : "General");
      filasCalendar.push({
        semana: `Semana ${semanaN}`,
        sesion: sesionLabel,
        subtema: subtemaNombre,
        actividad: `Actividad ${a.num}`,
        tipo,
        modalidad: a.modalidad || "Sin modalidad",
        minutos: a.minutos,
        material: a.material
      });
    });
    idxSesion += 1;
  });

  const tablaCandelarizacion = construirTablaCandelarizacionMejorada(filasCalendar);

  // ✅ Notas de fichas (solo si existen)
  let bloqueNotasFicha = "";
  if (actividadesFichas.length > 0) {
    actividadesFichas.forEach((actividad, idx) => {
      const textoPlano = actividad.replace(/<[^>]*>/g, "").trim();

      // Extraer solo propósito resumido (20 primeras palabras)
      const textoPropósito = textoPlano
        .split(" ")
        .slice(0, 20)
        .join(" ") + "...";

      // Detectar modalidad
      const modalidad = actividad.includes("[IC T. IND]") ? "Trabajo individual"
        : actividad.includes("[IC T. PAR]") ? "Trabajo en parejas"
          : actividad.includes("[IC T. EQUI]") ? "Trabajo en equipo"
            : "Sin modalidad";

      // Detectar recursos asociados
      const videoMatch = textoPlano.match(/video\s+"([^"]+)"/i);
      const recortableMatch = textoPlano.match(/recortable\s+(\d+\w*)/i);
      const anexoMatch = textoPlano.match(/anexo\s+(\d+\w*)/i);
      const fichaMatch = textoPlano.match(/ficha\s+(\d+\w*)/i) || [claveFichaActualGlobal];

      let tipoActividad = "Refuerzo";
      let recursosTexto = `Usando ${fichaMatch[0]}`;

      if (videoMatch) {
        tipoActividad = "Ampliación";
        recursosTexto += ` y el video "${videoMatch[1]}"`;
      }
      if (recortableMatch) {
        tipoActividad = "Ampliación";
        recursosTexto += ` y el ${recortableMatch[0]}`;
      }
      if (anexoMatch) {
        tipoActividad = "Ampliación";
        recursosTexto += ` y el ${anexoMatch[0]}`;
      }

      // ✅ SOLO mostramos nota de maestro, sin repetir texto literal
      bloqueNotasFicha += `
        <p><strong>Actividad ${idx + 1} (${tipoActividad})</strong></p>
        <p style="margin-bottom:10px;">
          <strong>"Desarrolle esta actividad como refuerzo durante la segunda mitad de la semana ${modalidad}, 
          ${recursosTexto} para reforzar el tema "${tituloCreativo}"." </strong>
          ${modalidad === "Trabajo individual" ? "Supervise el avance de cada estudiante de manera personalizada." : "Facilite la interacción y apoyo entre compañeros."}
        </p>
        <p style="margin-bottom:15px;"><em>Estrategia simplificada para estudiantes con barreras de aprendizaje:</em> 
          Ofrezca apoyos visuales, plantillas guiadas o permita respuestas orales. Acompañe paso a paso según sea necesario.</p>
      `;
    });
  }


  // ✅ PROMPT FINAL para maestro
  return `
  IMPORTANTE: No repitas ni reformules el texto de las actividades del alumno. SOLO describe estrategias y orientaciones para el maestro.

  <h2 style="margin-top:20px; margin-bottom:20px;">${tituloCreativo}</h2>

  Estas son las actividades detectadas para el subtema (nivel **${nivel}**, grado **${grado}**):

  ${listaNormales}

  📌 **Tu tarea como IA**  
  Genera un conjunto completo de **Notas para el Maestro**, en formato HTML, para cada actividad.  

  ✅ PARA CADA ACTIVIDAD:
    - Comienza mencionando a qué actividad corresponde: "En la actividad X..."
    - Describe cómo guiarla en el aula y materiales sugeridos
    - **Menciona explícitamente los recursos asociados (ficha, anexo, video, recortable)**
    - Ejemplo: "En la actividad 3, utilice la ${claveFichaActualGlobal} para reforzar..."
    - Incluye la modalidad de trabajo naturalmente en el texto
    - Agrega estrategia para estudiantes con barreras de aprendizaje

  📌 **Distribución del tiempo para este subtema:**  
  - Tema: "${tituloCreativo}"  
  - Actividades detectadas: ${totalActividades}  
  - Tiempo total sugerido: ${minutosTotales} minutos  

  📌 **Formato exacto de cada bloque en las Notas para el Maestro:**  

  <h1>${tituloCreativo}</h1>

  <p><strong>Actividad [General / Refuerzo / Ampliación]</strong></p>
  <p style="margin-bottom:20px;">Actividad 1, Estrategias de gestión del aula, **incluyendo modalidad** y un ejemplo/reflexión.</p>
  <p style="margin-bottom:20px;">Actividad 2, Estrategias de gestión del aula, **incluyendo modalidad** y un ejemplo/reflexión.</p>
  <p style="margin-bottom:20px;">Estrategia simplificada para estudiantes con barreras de aprendizaje.</p>



  📌 **Reflexión global al final:**  
  Una sola reflexión de cierre sobre el aprendizaje esperado de las actividades para el maestro.

  **Al final de TODAS las notas, agrega obligatoriamente esta tabla HTML sin cambios:**  
  ${tablaCandelarizacion}


  ⚠️ **Restricciones:**  
  - NO copies ni reformules las actividades del alumno.  
  - Máximo 1 párrafo por actividad, detallando al profesor lo que debe hacer para realizar la actividad y cómo llevar una correcta gestión del aula para lograr una actividad exitosa.  
  - Una sola reflexión de cierre sobre el aprendizaje esperado de las actividades para el maestro. 
  - NO elimines la tabla de candelarización.
  `;
}


// ✅ Etiqueta de fase por número (1..n)
function etiquetaFase(n, total) {
  if (n === 1) return "Exploración e indagación inicial";
  if (n === total) return "Presentación y cierre reflexivo";
  return "Desarrollo intermedio del proyecto";
}



function construirPromptNotasMaestroProyecto(
  contenidoProyecto,
  nivel,
  grado,
  nombreProyecto,
  metodologiaSeleccionada,
  semanasEstimadas = 3,
  T_global = [],
  AE_global = [],
  C_global = [],
  P_global = []
) {
  const numeroUnidad = parseInt((typeof selectUnidad !== "undefined" ? (selectUnidad?.value || "1") : "1"), 10);

  // 1) Parsear HTML con DOMParser
  const parser = new DOMParser();
  const doc = parser.parseFromString((contenidoProyecto || ""), "text/html");

  // Helpers
  const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
  const detectModalidad = (t) =>
    /\[IC\s*T\.\s*IND\]/i.test(t) ? "Trabajo individual" :
      /\[IC\s*T\.\s*PAR\]/i.test(t) ? "Trabajo en parejas" :
        /\[IC\s*T\.\s*EQUI\]/i.test(t) ? "Trabajo en equipo" : "Sin modalidad";

  const detectRecursos = (t) => {
    const recs = [];
    const mF = t.match(/ficha\s+\d+\w*/i);
    const mR = t.match(/recortable\s+\d+\w*/i);
    const mA = t.match(/anexo\s+\d+\w*/i);
    const mV = t.match(/video\s+"([^"]+)"/i);
    if (mF) recs.push(mF[0]);
    if (mR) recs.push(mR[0]);
    if (mA) recs.push(mA[0]);
    if (mV) recs.push(`Video "${mV[1]}"`);
    return recs;
  };

  const estimarMin = (t) =>
    /analiza|diseña|justifica|evalúa|construye|propón|compara|argumenta|sintetiza/i.test(t) ? 10 :
      /explica|relaciona|ordena|interpreta|responde|elige|clasifica/i.test(t) ? 8 : 6;

  // 2) Fases detectadas
  const fasesNodes = Array.from(doc.querySelectorAll(".phase"));
  const fases = fasesNodes.map((phase, idx) => {
    const h3 = phase.querySelector("h3");
    const tituloFase = text(h3) || `Fase ${idx + 1}`;
    // actividades directamente dentro (o anidadas) de esta fase
    const acts = Array.from(phase.querySelectorAll(".activity"));
    return { node: phase, tituloFase, acts };
  });

  // 3) Fallback: si alguna fase viene vacía pero hay actividades globales
  const allActs = Array.from(doc.querySelectorAll(".activity"));
  if (fases.every(f => f.acts.length === 0) && allActs.length > 0) {
    // Asignación por proximidad: se recorre el documento y se va acumulando la última fase vista
    const order = Array.from(doc.body.querySelectorAll(".phase, .activity"));
    let currentPhase = null;
    fases.forEach(f => f.acts = []); // limpia
    order.forEach(el => {
      if (el.classList.contains("phase")) {
        currentPhase = fasesNodes.indexOf(el);
      } else if (el.classList.contains("activity")) {
        const i = (currentPhase != null ? currentPhase : 0);
        fases[i].acts.push(el);
      }
    });
  }

  // 4) Extraer datos de cada actividad
  const filasCandelarizacion = [];
  const bloquesFases = [];
  fases.forEach((fase, iFase) => {
    const tituloFase = fase.tituloFase || `Fase ${iFase + 1}`;
    let bloque = `<h3 style="margin-top:18px;">Notas del maestro — ${tituloFase}</h3>`;
    if (!fase.acts || fase.acts.length === 0) {
      bloque += `<p>Sin actividades detectadas en esta fase.</p>`;
      bloquesFases.push(bloque);
      return;
    }

    fase.acts.forEach((actNode, idx) => {
      // Buscar el primer <p> con <strong> para tomar la instrucción-título
      const pConStrong = actNode.querySelector("p strong");
      const tituloActividad = text(pConStrong) || "Actividad";
      // número: del <span> que precede, si existe
      const pPrimero = actNode.querySelector("p");
      let numero = "";
      if (pPrimero) {
        const span = pPrimero.querySelector("span");
        if (span) {
          const n = text(span).replace(/\D/g, "");
          if (n) numero = n;
        }
      }
      if (!numero) numero = (idx + 1).toString();

      const plano = text(actNode);
      const modalidad = detectModalidad(plano);
      const recursos = detectRecursos(plano);
      const tipo = recursos.length ? "Ampliación" : "General";
      const mats = recursos.length ? recursos.join(", ") : "Material del proyecto, bitácora, rotafolios";

      bloque += `
        <p><strong>Actividad ${numero} [${tipo}] — ${modalidad}</strong><br>
        Oriente el propósito: <em>${tituloActividad}</em>. Explique el producto esperado con un ejemplo breve.
        Defina roles (coordinación, registro, vocería), tiempos y criterios visibles.
        Si hay recurso, introdúzcalo de forma puntual. Cierre con socialización breve y acuerdos de mejora vinculados a los AE.</p>
        <p><strong>Materiales:</strong> ${mats}.</p>
        <p><strong>Apoyos e inclusión:</strong> organizadores visuales, plantillas, andamiaje por preguntas, opciones de respuesta (oral/visual) y tiempo extendido con coevaluación asistida.</p>
      `;

      filasCandelarizacion.push({
        semana: `Semana ${numeroUnidad}`,
        sesion: `Sesión ${iFase + 1}`,
        subtema: tituloFase || nombreProyecto,
        actividad: `Actividad ${numero}`,
        tipo,
        modalidad,
        minutos: estimarMin(plano),
        material: mats
      });
    });

    bloquesFases.push(bloque);
  });

  // 5) Encabezado + Información Curricular Transversal (se mantiene)
  const infoCurricular = `
  <h3>Información Curricular Transversal (Rúbrica)</h3>
  <div class="phase-rubric" style="margin:16px 0; border:2px solid #b57cb3; border-radius:8px;">
    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:color-mix(in srgb, var(--app-bg-color,#ffffff) 82%, var(--cb-chrome-bg,#3f4d98) 18%); color:var(--app-text-color,#0f172a);">
      <strong>Rúbrica de alineación curricular</strong>
      <span style="opacity:.6;">Marca ✓ tu nivel</span>
    </div>
    <table border="1" cellpadding="10" cellspacing="0" style="width:100%; border-collapse:collapse; border-color:#b57cb3;">
      <thead>
        <tr>
          <th style="width:22%; background:color-mix(in srgb, var(--app-bg-color,#ffffff) 82%, var(--cb-chrome-bg,#3f4d98) 18%); color:var(--app-text-color,#0f172a);">Criterio</th>
          <th style="width:19%; background:color-mix(in srgb, var(--app-bg-color,#ffffff) 82%, var(--cb-chrome-bg,#3f4d98) 18%); color:var(--app-text-color,#0f172a);">Nivel 4</th>
          <th style="width:19%; background:color-mix(in srgb, var(--app-bg-color,#ffffff) 82%, var(--cb-chrome-bg,#3f4d98) 18%); color:var(--app-text-color,#0f172a);">Nivel 3</th>
          <th style="width:19%; background:color-mix(in srgb, var(--app-bg-color,#ffffff) 82%, var(--cb-chrome-bg,#3f4d98) 18%); color:var(--app-text-color,#0f172a);">Nivel 2</th>
          <th style="width:19%; background:color-mix(in srgb, var(--app-bg-color,#ffffff) 82%, var(--cb-chrome-bg,#3f4d98) 18%); color:var(--app-text-color,#0f172a);">Nivel 1</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Temas (T)</strong></td>
          <td>Alineación completa y explícita con los temas globales; coherencia sostenida.</td>
          <td>Alineación mayoritaria con conexiones claras en la mayoría de momentos.</td>
          <td>Alineación parcial con menciones generales e implementación irregular.</td>
          <td>Sin alineación observable o referencias confusas.</td>
        </tr>
        <tr>
          <td><strong>Aprendizajes esperados (AE)</strong></td>
          <td>Productos y evidencias trazables a los AE con criterios operativos verificables.</td>
          <td>Evidencias suficientes; criterios de logro claros en la mayor parte.</td>
          <td>Evidencias parciales; criterios poco definidos o inconsistentes.</td>
          <td>No se observan evidencias vinculadas a los AE.</td>
        </tr>
        <tr>
          <td><strong>Contenidos (C)</strong></td>
          <td>Selección pertinente y con profundidad; progresión didáctica clara entre fases.</td>
          <td>Contenidos pertinentes y mayormente secuenciados.</td>
          <td>Pertinentes pero superficiales o con secuenciación débil.</td>
          <td>Contenidos inadecuados o desconectados del propósito.</td>
        </tr>
        <tr>
          <td><strong>Procesos (P)</strong></td>
          <td>Actividades movilizan procesos clave con intencionalidad y evidencias.</td>
          <td>La mayoría de actividades activan procesos esperados con claridad.</td>
          <td>Activación irregular de procesos; evidencias limitadas.</td>
          <td>No se promueven procesos pertinentes o no son observables.</td>
        </tr>
      </tbody>
    </table>

  </div>
`;


  // 6) Reflexión + candelarización
  const candelarizacion = construirTablaCandelarizacionMejorada(filasCandelarizacion);

  // 7) Ensamblado final (sin “Actividades detectadas”)
  return `
    <!-- No repetir texto del alumno. Solo orientaciones al docente. -->
    <h1>${nombreProyecto}</h1>
    <p><strong>Categoría:</strong> Proyecto &nbsp; | &nbsp; <strong>Metodología:</strong> ${metodologiaSeleccionada}</p>
    <p><strong>Nivel:</strong> ${nivel} &nbsp; | &nbsp; <strong>Grado:</strong> ${grado} &nbsp; | &nbsp; <strong>Duración:</strong> ${semanasEstimadas} semana(s)</p>

    ${infoCurricular}

    ${bloquesFases.join("\n")}

    <h3>Reflexión Global del Maestro</h3>
    <p>Integre evidencias por fase, retroalimente con criterios visibles y conecte el producto final con el contexto.
    Ajuste tiempos, roles y apoyos con base en la observación y rúbricas de fase.</p>

    ${candelarizacion}
  `;
}





let respuestaFinal = "";
let agrupados = {};
let categoriasGeneradas = {}; // { "Lenguaje y comunicación": "<bloque HTML generado>" }
let primeraCategoriaConLectura = null;



// Función para guardar en localStorage
// Ayuda: verificar si un <select> tiene una opción con ese value
function selectTieneOpcion(el, value) {
  return !!(el && Array.from(el.options).some(o => o.value === value));
}

// Función para guardar en localStorage (igual que la tuya)
function setupSelectChangeListeners() {
  ["unidadNivel", "unidadGrado", "unidadTrimestre", "unidadNumero", "unidadTema", "unidadTemaASC", "unidadTemaTexto"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const save = () => {
        localStorage.setItem(`unidad_${id}`, el.value);
      };
      el.addEventListener("change", save);
      if (id === "unidadTemaTexto") el.addEventListener("input", save);
    }
  });
}

// Función para restaurar valores con manejo especial para unidadTema
function restoreSelectValues() {
  ["unidadNivel", "unidadGrado", "unidadTrimestre", "unidadNumero", "unidadTemaASC"].forEach(id => {
    const el = document.getElementById(id);
    const val = localStorage.getItem(`unidad_${id}`);
    if (el && val && selectTieneOpcion(el, val)) {
      el.value = val;
    }
  });

  // Manejo especial para unidadTema con retraso (verifica que exista la opción)
  const unidadTemaEl = document.getElementById('unidadTema');
  const unidadTemaVal = localStorage.getItem('unidad_unidadTema');
  if (unidadTemaEl && unidadTemaVal) {
    setTimeout(() => {
      if (selectTieneOpcion(unidadTemaEl, unidadTemaVal)) {
        unidadTemaEl.value = unidadTemaVal;
        _sincronizarInputTemaConSelect();
      }
    }, 1000);
  }
  const unidadTemaTextoEl = document.getElementById('unidadTemaTexto');
  const unidadTemaTextoVal = localStorage.getItem('unidad_unidadTemaTexto');
  if (unidadTemaTextoEl && unidadTemaTextoVal) {
    unidadTemaTextoEl.value = unidadTemaTextoVal;
  }
}

// Función para disparar eventos de cambio (tuya)
function triggerChangeEvents() {
  const selectNivel = document.getElementById('unidadNivel');
  const selectGrado = document.getElementById('unidadGrado');
  const selectTrimestre = document.getElementById('unidadTrimestre');


  if (selectNivel && selectNivel.value) selectNivel.dispatchEvent(new Event("change"));
  if (selectGrado && selectGrado.value) selectGrado.dispatchEvent(new Event("change"));
  if (selectTrimestre && selectTrimestre.value) selectTrimestre.dispatchEvent(new Event("change"));
  if (selectUnidad && selectUnidad.value) selectUnidad.dispatchEvent(new Event("change"));
}

// ------- Scroll suave dentro del modalGenerarUnidad -------
function setupScrollButtonsForModal({
  modalSelector = '#modalGenerarUnidad',
  contentSelector = '.modal-content',
  topBtnId,
  middleBtnId,
  bottomBtnId,
  prevCatBtnId,
  nextCatBtnId
}) {
  // Busca el modal y su contenedor de scroll
  const modal = document.querySelector(modalSelector);
  const content = modal.querySelector(contentSelector) || modal;

  // Util para hacer scroll suave
  const go = (pos) => content.scrollTo({ top: pos, behavior: 'auto' });

  // Calcula posiciones seguras
  const topPos = () => 0;
  const middlePos = () => Math.max(0, (content.scrollHeight - content.clientHeight) / 2);
  const bottomPos = () => content.scrollHeight;

  // Engancha botones si existen
  const btnTop = document.getElementById(topBtnId);
  if (btnTop) btnTop.addEventListener('click', () => go(topPos()));

  const btnMiddle = document.getElementById(middleBtnId);
  if (btnMiddle) btnMiddle.addEventListener('click', () => go(middlePos()));

  const btnBottom = document.getElementById(bottomBtnId);
  if (btnBottom) btnBottom.addEventListener('click', () => go(bottomPos()));

  // Navegación por categorías usando la columna de alumno
  const getCategoriaTargets = () => {
    const bloques = Array.from(content.querySelectorAll('.bloque-categoria'));
    return bloques
      .map(b => b.querySelector('.col-alumno') || b)
      .filter(Boolean);
  };

  const findCurrentIndex = (targets) => {
    const scrollTop = content.scrollTop;
    let closestIdx = 0;
    let minDelta = Infinity;
    targets.forEach((el, idx) => {
      const y = el.offsetTop - content.offsetTop;
      const delta = Math.abs(y - scrollTop);
      if (delta < minDelta) {
        minDelta = delta;
        closestIdx = idx;
      }
    });
    return closestIdx;
  };

  const goToCategoria = (direction) => {
    const targets = getCategoriaTargets();
    if (!targets.length) return;
    const currentIdx = findCurrentIndex(targets);
    const nextIdx = direction === 'next'
      ? Math.min(currentIdx + 1, targets.length - 1)
      : Math.max(currentIdx - 1, 0);
    const y = targets[nextIdx].offsetTop - content.offsetTop - 10;
    go(Math.max(0, y));
  };

  const btnPrevCat = prevCatBtnId ? document.getElementById(prevCatBtnId) : null;
  if (btnPrevCat) btnPrevCat.addEventListener('click', () => goToCategoria('prev'));

  const btnNextCat = nextCatBtnId ? document.getElementById(nextCatBtnId) : null;
  if (btnNextCat) btnNextCat.addEventListener('click', () => goToCategoria('next'));

  // Accesibilidad extra (teclas rápidas cuando el modal está visible)
  modal.addEventListener('keydown', (e) => {
    if (modal.style.display !== 'block') return;
    if (e.altKey && e.key === 'ArrowUp') go(topPos());
    if (e.altKey && e.key === 'ArrowDown') go(bottomPos());
    if (e.altKey && (e.key === 'm' || e.key === 'M')) go(middlePos());
    if (e.altKey && e.key === 'ArrowRight') goToCategoria('next');
    if (e.altKey && e.key === 'ArrowLeft') goToCategoria('prev');
  });
}

// Inicializa cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  // Si ya tienes otros botones (scrollTopBtn, etc.), puedes mantenerlos.
  // Aquí conectamos los de "Secundaria":
  setupScrollButtonsForModal({
    modalSelector: '#modalResultadoUnidad',
    contentSelector: '.unidad-content',
    topBtnId: 'scrollTopBtn',
    middleBtnId: 'scrollMiddleBtn',
    bottomBtnId: 'scrollBottomBtn',
    prevCatBtnId: 'scrollPrevCatBtn',
    nextCatBtnId: 'scrollNextCatBtn'
  });

  // Evita submit accidental del form (Enter/click implícito) que recarga página.
  document.getElementById("formGenerarUnidad")?.addEventListener("submit", (e) => {
    e.preventDefault();
  });
  enlazarBotonesRecursosUnidad();
});


document.getElementById("btnReiniciarFiltros")?.addEventListener("click", () => {

  // Reiniciar selects principales
  selectNivel.value = "";
  selectGrado.value = "";
  selectTrimestre.value = "";
  selectUnidad.value = "";

  // Reiniciar selects de lectura
  selectTema.innerHTML = "<option value=''>Selecciona tema</option>";
  selectTemaASC.innerHTML = "<option value=''>Selecciona lectura ASC</option>";

  // Limpiar resultado generado
  document.getElementById("resultadoUnidadGenerada").innerHTML = "";
  limpiarResultadoUnidadEnStorage();

  // Ocultar botón continuar
  const btnCont = document.getElementById("btnContinuarUnidad");
  if (btnCont) btnCont.style.display = "none";

  try {
    localStorage.removeItem(UNIDAD_SELECTS_STORAGE_KEY);
    localStorage.removeItem(UNIDAD_SELECTS_STORAGE_LEGACY_KEY);
    ["unidadNivel", "unidadGrado", "unidadTrimestre", "unidadNumero", "unidadTema", "unidadTemaASC", "unidadTemaTexto", "selectGeminiEndpoint"].forEach((id) => {
      localStorage.removeItem(`unidad_${id}`);
    });
  } catch (_) { }

});


document.getElementById("btnGuardarUnidad")?.addEventListener("click", async (e) => {
  e.preventDefault();
  const nivel = selectNivel?.value || "";
  const grado = selectGrado?.value || "";
  const trimestre = selectTrimestre?.value || "";
  const unidad = selectUnidad?.value || "";

  // lecturaId: toma el que exista de forma segura
  const lecturaId = (typeof selectTema !== "undefined" && selectTema?.value)
    ? selectTema.value
    : ((typeof selectTemaASC !== "undefined" && selectTemaASC?.value)
      ? selectTemaASC.value
      : "");

  // contenido HTML: si respuestaFinal no existe/está vacía, cae al DOM
  const htmlContenido = (
    (typeof respuestaFinal !== "undefined" && (respuestaFinal ?? "").trim()) ||
    document.getElementById("resultadoUnidadGenerada")?.innerHTML?.trim() ||
    ""
  );

  // ===========================
  // 🔍 Recuperar lectura origen
  // ===========================
  let lecturaOrigen = null;
  let origenLectura = "";
  let tituloLectura = "";
  let textoLectura = "";
  let preguntasLectura = [];

  try {
    // 👉 Desde lecturasNuevas (selectTema)
    if (typeof selectTema !== "undefined" && selectTema?.value && Array.isArray(window.lecturasNuevas)) {
      lecturaOrigen = window.lecturasNuevas.find(l => l.id === selectTema.value) || null;
      if (lecturaOrigen) {
        origenLectura = "lecturasNuevas";
      }
    }

    // 👉 O desde lecturasASC (selectTemaASC)
    if (!lecturaOrigen && typeof selectTemaASC !== "undefined" && selectTemaASC?.value && Array.isArray(window.lecturasASC || lecturasASC)) {
      const arrASC = window.lecturasASC || lecturasASC || [];
      lecturaOrigen = arrASC.find(l => l.id === selectTemaASC.value) || null;
      if (lecturaOrigen) {
        origenLectura = "lecturasASC";
      }
    }

    if (lecturaOrigen) {
      tituloLectura = lecturaOrigen.tema || lecturaOrigen.titulo || "";
      // campos típicos posibles
      textoLectura = lecturaOrigen.lectura || lecturaOrigen.texto || lecturaOrigen.contenido || "";
      preguntasLectura =
        lecturaOrigen.preguntas ||
        lecturaOrigen.preguntasComprension ||
        lecturaOrigen.preguntas_comprension ||
        [];
    }

    // ==============================
    // 🧩 Fallback: leer del DOM si no hay preguntas en Firestore
    // ==============================
    if ((!preguntasLectura || !preguntasLectura.length) && document.getElementById("preguntasComprension")) {
      const ul = document.getElementById("preguntasComprension");
      const liList = ul.querySelectorAll("li");
      const preguntasDOM = [];

      liList.forEach(li => {
        const pPregunta = li.querySelector("p strong") || li.querySelector("strong");
        const pMeta = li.querySelector("p:nth-of-type(2)");
        const pResp = Array.from(li.querySelectorAll("p")).find(p =>
          (p.getAttribute("style") || "").includes("color")
        );

        let nivelStr = "";
        let criterioStr = "";

        if (pMeta) {
          const metaText = pMeta.textContent || "";
          const mNivel = metaText.match(/Nivel:\s*([^—]+)/i);
          const mCriterio = metaText.match(/Criterio:\s*(.+)$/i);
          if (mNivel) nivelStr = mNivel[1].trim();
          if (mCriterio) criterioStr = mCriterio[1].trim();
        }

        preguntasDOM.push({
          pregunta: pPregunta ? pPregunta.textContent.trim() : li.textContent.trim(),
          nivel: nivelStr,
          criterio: criterioStr,
          respuesta: pResp ? pResp.textContent.trim() : ""
        });
      });

      if (preguntasDOM.length) {
        preguntasLectura = preguntasDOM;
      }
    }
  } catch (e) {
  }

  // Debug detallado: muestra cuáles faltan realmente
  const faltantes = [];
  if (!nivel) faltantes.push("nivel");
  if (!grado) faltantes.push("grado");
  if (!trimestre) faltantes.push("trimestre");
  if (!unidad) faltantes.push("unidad");
  if (!lecturaId) faltantes.push("lecturaId (selectTema / selectTemaASC)");
  if (!htmlContenido) faltantes.push("htmlContenido (respuestaFinal/DOM)");


  if (faltantes.length) {
    alert(`❌ Faltan datos para guardar la unidad.\n→ Revisa: ${faltantes.join(", ")}`);
    return;
  }

  try {
    const unidadDoc = {
      nivel,
      grado,
      trimestre,
      unidad,
      lecturaId,
      contenido: htmlContenido,
      // 🆕 Metadatos de la lectura
      lecturaOrigen: origenLectura || null,     // "lecturasNuevas" | "lecturasASC"
      lecturaTitulo: tituloLectura || null,
      lecturaTexto: textoLectura || null,
      preguntasLectura: preguntasLectura || [],
      timestamp: new Date()
      // Si usas Firestore serverTimestamp:
      // timestamp: serverTimestamp()
    };

    await addDoc(collection(db, "unidadesGeneradas"), unidadDoc);
    alert("✅ Unidad guardada correctamente en Firestore.");
    // Mantener el estado actual para continuar editando/regenerando sin recargar.
    guardarSelectsUnidad();
  } catch (err) {
    alert("❌ No se pudo guardar la unidad.");
  }
});




// 🔧 Limpieza suave para exportar a Word sin perder contenido importante
function limpiarHTML(html = "") {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;

  // 1) Quitar controles de interfaz que no sirven en el Word
  tmp.querySelectorAll(
    "button, input, textarea, select, .btn, .acciones-unidad, .acciones-subtema, .icono-control, .no-export"
  ).forEach(el => el.remove());

  // 2) Quitar iconos decorativos (FontAwesome, SVG)
  tmp.querySelectorAll("i.fa, i.fas, i.far, i.fab, svg").forEach(el => el.remove());

  // 3) Quitar contenteditable
  tmp.querySelectorAll("[contenteditable]").forEach(el => {
    el.removeAttribute("contenteditable");
  });

  // 4) Quitar TODAS las clases (para que no se apliquen estilos por CSS)
  tmp.querySelectorAll("*").forEach(el => {
    el.removeAttribute("class");
  });

  // 5) Quitar TODOS los estilos inline excepto el color
  tmp.querySelectorAll("*").forEach(el => {
    if (el.hasAttribute("style")) {
      const style = el.getAttribute("style");

      // Verificamos si contiene color (mayúsculas o minúsculas)
      const colorMatch = style.match(/color\s*:\s*[^;]+/i);

      if (colorMatch) {
        // Solo mantenemos la regla de color
        el.setAttribute("style", colorMatch[0]);
      } else {
        // Eliminamos cualquier otro estilo
        el.removeAttribute("style");
      }
    }
  });

  return tmp.innerHTML;
}



document.getElementById("btnDescargarWord")?.addEventListener("click", () => {
  const contenedor = document.getElementById("resultadoUnidadGenerada");
  if (!contenedor) {
    alert("⚠️ No hay contenido para exportar.");
    return;
  }

  const bloques = contenedor.querySelectorAll(".bloque-subtema");
  let htmlAlumno = "";

  bloques.forEach(bloque => {
    // Tomamos la columna del alumno completa (lado izquierdo)
    const colAlumno = bloque.querySelector(".col-alumno") || bloque.children[0];
    if (!colAlumno) return;

    // Clonamos para manipular sin tocar el DOM visible
    const clone = colAlumno.cloneNode(true);

    // Extraemos y mantenemos TODOS los elementos importantes
    const tituloNode = clone.querySelector("h4");
    const tituloSubtema = tituloNode ? tituloNode.outerHTML : "";

    // Mantenemos todo el contenido incluyendo h3, h5, actividades, etc.
    const contenidoAlumno = clone.innerHTML;

    if (contenidoAlumno.trim()) {
      htmlAlumno += `<div class="subtema-completo">${tituloSubtema}${contenidoAlumno}</div><hr>`;
    }
  });

  if (!htmlAlumno.trim()) {
    alert("❌ No hay contenido del alumno para exportar.");
    return;
  }

  // Limpieza más conservadora que no elimine contenido importante
  const htmlAlumnoLimpio = limpiarHTML(htmlAlumno);

  // Crear el documento Word directamente con estilos básicos
  const htmlCompleto = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { 
            font-family: Arial, sans-serif; 
            margin: 20px; 
            line-height: 1.6;
          }
          .activity { 
            margin-bottom: 20px; 
            padding: 10px;
            border-left: 4px solid #007bff;
            background: #f8f9fa;
          }
          .activity-fichas { 
            background: #e9ecef; 
            padding: 15px; 
            margin-bottom: 15px; 
            border-radius: 5px;
          }
          h1, h2, h3, h4, h5 { 
            color: #2c3e50; 
            margin-top: 20px;
            margin-bottom: 10px;
          }
          table { 
            border-collapse: collapse; 
            width: 100%; 
            margin: 15px 0; 
          }
          table, th, td { 
            border: 1px solid #ddd; 
          }
          th, td { 
            padding: 10px; 
            text-align: left; 
          }
          th {
            background-color: #f2f2f2;
          }
          .subtema-completo {
            margin-bottom: 30px;
            page-break-inside: avoid;
          }
          hr {
            margin: 30px 0;
            border: none;
            border-top: 2px dashed #ccc;
          }
          .answer {
            margin-top: 10px;
            padding: 8px;
            background: #fff3cd;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>${htmlAlumnoLimpio}</body>
    </html>
  `;

  // Generar y descargar el archivo Word
  try {
    const blob = window.htmlDocx.asBlob(htmlCompleto);
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blob);
    enlace.download = "Unidad_Alumno_Completa.docx";
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
  } catch (error) {
    alert("❌ Error al generar el archivo Word. Intenta nuevamente.");
  }
});


document.getElementById("btnDescargarMaestro")?.addEventListener("click", () => {
  const bloques = document.querySelectorAll(".bloque-subtema");
  let htmlMaestro = "";

  bloques.forEach(bloque => {
    const columnaDerecha = bloque.children[1]; // columna de notas del maestro
    if (columnaDerecha) {
      htmlMaestro += columnaDerecha.outerHTML + "<hr>";
    }
  });

  if (!htmlMaestro.trim()) {
    alert("❌ No hay notas del maestro para exportar.");
    return;
  }

  const htmlMaestroLimpio = limpiarHTML(htmlMaestro);

  const htmlCompleto = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body>${htmlMaestroLimpio}</body>
    </html>
  `;

  const blob = window.htmlDocx.asBlob(htmlCompleto);
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = "notas_maestro.docx";
  enlace.click();
});




// ✅ Descarga del contenido del alumno desde el editor
document.getElementById("btnDescargarWordEditor")?.addEventListener("click", () => {
  const contenedor = document.getElementById("editorUnidadContenido");
  if (!contenedor) {
    alert("⚠️ No hay contenido para exportar.");
    return;
  }

  // Clonamos el contenido para no afectar el original
  const clon = contenedor.cloneNode(true);

  // Eliminamos las columnas de maestro si existen
  const columnasMaestro = clon.querySelectorAll(".col-maestro");
  columnasMaestro.forEach(col => col.remove());

  // Obtenemos solo el contenido del alumno
  const htmlAlumno = clon.innerHTML;

  if (!htmlAlumno.trim()) {
    alert("❌ No hay contenido del alumno para exportar.");
    return;
  }

  // Limpiamos el HTML
  const htmlAlumnoLimpio = limpiarHTML(htmlAlumno);

  // Creamos el documento Word directamente sin pasar por el modal de estilos
  const htmlCompleto = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .activity { margin-bottom: 20px; }
          .activity-fichas { background: #f5f5f5; padding: 10px; margin-bottom: 15px; }
          h1, h2, h3, h4 { color: #2c3e50; }
          table { border-collapse: collapse; width: 100%; margin: 10px 0; }
          table, th, td { border: 1px solid #ddd; }
          th, td { padding: 8px; text-align: left; }
        </style>
      </head>
      <body>${htmlAlumnoLimpio}</body>
    </html>
  `;

  // Usamos la librería html-docx-js para generar el Word
  const blob = window.htmlDocx.asBlob(htmlCompleto);
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = "Unidad_Alumno.docx";
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
});


// ✅ Descarga del contenido del maestro desde el editor
document.getElementById("btnDescargarMaestroEditor")?.addEventListener("click", () => {
  const contenedor = document.getElementById("editorUnidadContenido");
  if (!contenedor) {
    alert("⚠️ No hay contenido para exportar.");
    return;
  }

  // ✅ Tomamos SOLO las columnas de maestro
  const columnasMaestro = contenedor.querySelectorAll(".col-maestro");
  if (!columnasMaestro.length) {
    alert("❌ No hay contenido del maestro (.col-maestro) para exportar.");
    return;
  }

  let htmlMaestro = "";
  columnasMaestro.forEach(col => {
    htmlMaestro += col.outerHTML + "<hr>";
  });

  const htmlMaestroLimpio = limpiarHTML(htmlMaestro);

  const htmlCompleto = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body>${htmlMaestroLimpio}</body>
    </html>
  `;

  // ✅ Generamos el archivo Word
  const blob = window.htmlDocx.asBlob(htmlCompleto);
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = "Unidad_Maestro.docx";
  enlace.click();
});


// ============================
// MENÚ CONTEXTUAL PARA EDITAR TEXTO SELECCIONADO
// ============================

// Variables globales para el menú contextual
let menuContextual = null;
let textoSeleccionadoGlobal = '';
let textoSeleccionadoHTML = '';
let rangoSeleccionadoGlobal = null;
let columnaSeleccionadaGlobal = null;

// Función específica para limpiar HTML seleccionado manteniendo estructura
function limpiarHTMLSeleccionado(html = "") {
  if (!html) return html;

  const tmp = document.createElement("div");
  tmp.innerHTML = html;

  // 1) Eliminar elementos de interfaz
  tmp.querySelectorAll(
    "button, input, textarea, select, .btn, .acciones-unidad, .acciones-subtema, .icono-control, .no-export"
  ).forEach(el => el.remove());

  // 2) Eliminar iconos
  tmp.querySelectorAll("i.fa, i.fas, i.far, i.fab, svg").forEach(el => el.remove());

  // 3) Eliminar elementos vacíos y espacios innecesarios
  const todosElementos = tmp.querySelectorAll('*');
  todosElementos.forEach(el => {
    // Remover atributos que no necesitamos
    el.removeAttribute('class');
    el.removeAttribute('id');
    el.removeAttribute('style');
    el.removeAttribute('contenteditable');

    // Si el elemento está vacío o solo tiene espacios, quitarlo
    const texto = el.textContent || '';
    const soloEspacios = /^\s*$/.test(texto);

    if (soloEspacios && ['div', 'span', 'p', 'li', 'ol', 'ul'].includes(el.tagName.toLowerCase())) {
      // Verificar si tiene hijos no vacíos
      const hijosNoVacios = Array.from(el.children).filter(child => {
        const childText = child.textContent || '';
        return !/^\s*$/.test(childText);
      });

      if (hijosNoVacios.length === 0) {
        el.remove();
      }
    }

    // Limpiar listas - eliminar <li> vacíos
    if (el.tagName.toLowerCase() === 'li') {
      const liText = el.innerHTML.replace(/<[^>]*>/g, '').trim();
      if (!liText) {
        el.remove();
      }
    }
  });

  // 4) Compactar HTML resultante
  let resultado = tmp.innerHTML
    .replace(/\n\s*\n/g, '\n')          // Múltiples saltos de línea a uno
    .replace(/\s+/g, ' ')               // Múltiples espacios a uno
    .replace(/>\s+</g, '><')            // Espacios entre tags
    .replace(/<([^>]+)>\s*<\/\1>/g, '') // Tags vacíos
    .trim();

  return resultado;
}

// Crear el menú contextual
function crearMenuContextual() {
  if (menuContextual) return menuContextual;

  menuContextual = document.createElement('div');
  menuContextual.id = 'menu-contextual-texto';
  menuContextual.style.cssText = `
        position: absolute;
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 3px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        display: none;
        z-index: 10000;
        min-width: 30px;
        min-height: 30px;
    `;

  // Botón Refresh
  const btnRefresh = document.createElement('button');
  btnRefresh.innerHTML = '<i class="fas fa-sync-alt" style="font-size: 11px;"></i>';
  btnRefresh.title = 'Modificar con IA';
  btnRefresh.style.cssText = `
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 3px;
        padding: 3px 5px;
        cursor: pointer;
        font-size: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        transition: background 0.2s ease;
    `;

  btnRefresh.addEventListener('mouseenter', () => {
    btnRefresh.style.background = '#45a049';
  });

  btnRefresh.addEventListener('mouseleave', () => {
    btnRefresh.style.background = '#4CAF50';
  });

  btnRefresh.addEventListener('click', () => {
    ocultarMenuContextual();
    abrirModalModificarTexto();
  });

  menuContextual.appendChild(btnRefresh);
  document.body.appendChild(menuContextual);

  return menuContextual;
}

// Mostrar menú contextual
function mostrarMenuContextual(x, y) {
  const menu = crearMenuContextual();

  // Ajustar posición
  const viewportWidth = window.innerWidth;

  let finalX = x;
  let finalY = y;

  if (x + 35 > viewportWidth) {
    finalX = viewportWidth - 40;
  }

  if (y - 35 < 0) {
    finalY = 5;
  }

  menu.style.left = `${finalX}px`;
  menu.style.top = `${finalY}px`;
  menu.style.display = 'flex';

  setTimeout(() => {
    document.addEventListener('click', cerrarMenuContextualExterno);
  }, 10);
}

// Ocultar menú contextual
function ocultarMenuContextual() {
  if (menuContextual) {
    menuContextual.style.display = 'none';
  }
  document.removeEventListener('click', cerrarMenuContextualExterno);
}

// Cerrar menú al hacer clic fuera
function cerrarMenuContextualExterno(e) {
  if (menuContextual && !menuContextual.contains(e.target)) {
    ocultarMenuContextual();
  }
}

// Obtener HTML seleccionado manteniendo estructura
function obtenerHTMLSeleccionado(range) {
  const container = document.createElement('div');
  const clonedSelection = range.cloneContents();
  container.appendChild(clonedSelection);

  // Limpiar pero mantener estructura
  const htmlLimpio = limpiarHTMLSeleccionado(container.innerHTML);

  // Si después de limpiar está casi vacío, usar texto simple
  const textoLimpio = htmlLimpio.replace(/<[^>]*>/g, '').trim();
  if (textoLimpio.length < 3) {
    return range.toString().trim();
  }

  return htmlLimpio;
}

// Detectar selección de texto
function configurarDetectorSeleccion() {
  document.addEventListener('mouseup', function (e) {
    const esColAlumno = e.target.closest('.col-alumno');
    const esColMaestro = e.target.closest('.col-maestro');

    if (!esColAlumno && !esColMaestro) {
      ocultarMenuContextual();
      return;
    }

    const seleccion = window.getSelection();
    const textoSeleccionado = seleccion.toString().trim();

    if (textoSeleccionado.length < 3) {
      ocultarMenuContextual();
      return;
    }

    // Guardar información
    textoSeleccionadoGlobal = textoSeleccionado;
    const range = seleccion.getRangeAt(0).cloneRange();
    rangoSeleccionadoGlobal = range;
    columnaSeleccionadaGlobal = esColAlumno ? 'alumno' : 'maestro';

    // Obtener HTML limpio
    textoSeleccionadoHTML = obtenerHTMLSeleccionado(range);

    // Posicionar menú
    const rect = seleccion.getRangeAt(0).getBoundingClientRect();
    const x = rect.left + window.scrollX + (rect.width / 2) - 13;
    const y = rect.top + window.scrollY - 30;

    mostrarMenuContextual(x, y);
  });
}

// Modal para modificar texto
function abrirModalModificarTexto() {
  let modal = document.getElementById('modal-modificar-texto');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-modificar-texto';
    modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 1px solid #ccc;
            border-radius: 6px;
            padding: 12px;
            width: 400px;
            max-width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            z-index: 10001;
            box-shadow: 0 3px 10px rgba(0,0,0,0.15);
            display: none;
            font-size: 12px;
        `;

    modal.innerHTML = `
            <div style="margin-bottom: 12px;">
                <div style="display: flex; align-items: center; margin-bottom: 4px;">
                    <i class="fas fa-edit" style="color: #4CAF50; font-size: 13px; margin-right: 5px;"></i>
                    <h3 style="margin: 0; font-size: 13px; font-weight: 600;">Editar texto seleccionado</h3>
                </div>
                
                <div style="margin-bottom: 8px;">
                    <label style="display: block; font-weight: 500; margin-bottom: 3px; font-size: 11px;">
                        <i class="fas fa-file-alt" style="margin-right: 3px;"></i> Texto original:
                    </label>
                    <div id="texto-original-preview" style="background: #f8f9fa; padding: 6px; border-radius: 3px; border: 1px solid #e9ecef; font-size: 11px; max-height: 100px; overflow-y: auto; line-height: 1.3;"></div>
                </div>
                
                <div style="margin-bottom: 8px;">
                    <label for="instrucciones-modificacion" style="display: block; font-weight: 500; margin-bottom: 3px; font-size: 11px;">
                        <i class="fas fa-comment-alt" style="margin-right: 3px;"></i> Instrucciones:
                    </label>
                    <textarea id="instrucciones-modificacion" rows="2" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 11px; resize: vertical;" placeholder="Ej: Simplificar, corregir gramática, añadir ejemplos, parafrasear..."></textarea>
                </div>
                
                <div id="resultado-modificacion" style="display: none; margin-bottom: 8px;">
                    <label style="display: block; font-weight: 500; margin-bottom: 3px; font-size: 11px;">
                        <i class="fas fa-check" style="color: #28a745; margin-right: 3px;"></i> Texto modificado:
                    </label>
                    <div id="texto-modificado-preview" style="background: #e8f5e9; padding: 6px; border-radius: 3px; border: 1px solid #c3e6cb; font-size: 11px; max-height: 100px; overflow-y: auto; line-height: 1.3;"></div>
                </div>
                
                <div style="display: flex; gap: 6px; justify-content: flex-end; padding-top: 8px; border-top: 1px solid #eee;">
                    <button id="btn-cancelar-modificacion" style="background: #6c757d; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                    <button id="btn-generar-modificacion" style="background: #4CAF50; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;">
                        <i class="fas fa-sync-alt"></i> Generar
                    </button>
                    <button id="btn-aplicar-modificacion" style="background: #2196F3; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 11px; display: none;">
                        <i class="fas fa-check"></i> Aplicar
                    </button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);

    // Configurar eventos
    document.getElementById('btn-generar-modificacion').addEventListener('click', generarTextoModificado);
    document.getElementById('btn-aplicar-modificacion').addEventListener('click', aplicarCambiosTexto);
    document.getElementById('btn-cancelar-modificacion').addEventListener('click', () => {
      modal.style.display = 'none';
    });

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') modal.style.display = 'none';
    });
  }

  // Mostrar modal
  modal.style.display = 'block';

  // Mostrar texto original
  const previewOriginal = document.getElementById('texto-original-preview');
  if (textoSeleccionadoHTML && textoSeleccionadoHTML.includes('<')) {
    previewOriginal.innerHTML = textoSeleccionadoHTML;
  } else {
    previewOriginal.textContent = textoSeleccionadoGlobal;
  }

  // Limpiar otros campos
  document.getElementById('instrucciones-modificacion').value = '';
  document.getElementById('resultado-modificacion').style.display = 'none';
  document.getElementById('btn-aplicar-modificacion').style.display = 'none';

  // Enfocar
  setTimeout(() => {
    document.getElementById('instrucciones-modificacion').focus();
  }, 50);
}

// Generar texto modificado
async function generarTextoModificado() {
  const instrucciones = document.getElementById('instrucciones-modificacion').value.trim();

  if (!instrucciones) {
    const textarea = document.getElementById('instrucciones-modificacion');
    textarea.style.borderColor = '#f44336';
    setTimeout(() => textarea.style.borderColor = '#ddd', 1000);
    return;
  }

  const btnGenerar = document.getElementById('btn-generar-modificacion');
  const btnAplicar = document.getElementById('btn-aplicar-modificacion');
  const resultadoDiv = document.getElementById('resultado-modificacion');
  const previewDiv = document.getElementById('texto-modificado-preview');

  // Estado de carga
  const originalHTML = btnGenerar.innerHTML;
  btnGenerar.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  btnGenerar.disabled = true;

  try {
    // Preparar HTML limpio para el prompt
    const htmlParaPrompt = textoSeleccionadoHTML || textoSeleccionadoGlobal;

    const prompt = `
Modifica el siguiente texto según estas instrucciones: "${instrucciones}"

**IMPORTANTE - REGLAS ESTRICTAS:**
1. Mantén EXACTAMENTE la misma estructura HTML del texto original
2. Si hay listas (<ol>, <ul>, <li>), mantenlas IGUAL - no añadas elementos vacíos ni espacios extra
3. Si hay negritas (<strong>, <b>) o cursivas (<em>, <i>), mantenlas
4. NO añadas saltos de línea, párrafos vacíos, ni elementos HTML adicionales
5. Devuelve SOLO el texto modificado, sin comentarios, explicaciones ni etiquetas de código

Texto original:
${htmlParaPrompt}

Texto modificado:`;

    const textoModificado = await enviarPrompt([{ role: "user", text: prompt }]);

    // Limpiar el resultado de Gemini
    let textoLimpio = textoModificado
      .replace(/```(?:html|json)?\n?/g, '')  // Quitar wrappers de código
      .replace(/^["']|["']$/g, '')           // Quitar comillas
      .replace(/^Texto modificado:\s*/i, '') // Quitar prefijos
      .trim();

    // Eliminar líneas que sean comentarios o metainformación
    const lineas = textoLimpio.split('\n').filter(line => {
      const linea = line.trim();
      return !(
        linea.startsWith('//') ||
        linea.startsWith('<!--') ||
        linea.includes('IMPORTANTE:') ||
        linea.includes('Instrucciones:') ||
        linea === ''
      );
    });

    textoLimpio = lineas.join('\n').trim();

    // Aplicar limpieza final
    textoLimpio = limpiarHTMLSeleccionado(textoLimpio);

    // Mostrar resultado
    previewDiv.innerHTML = textoLimpio;
    resultadoDiv.style.display = 'block';
    btnAplicar.style.display = 'block';

    window.textoModificadoGlobal = textoLimpio;

  } catch (error) {
    previewDiv.textContent = 'Error al generar. Intenta de nuevo.';
    resultadoDiv.style.display = 'block';
  } finally {
    btnGenerar.innerHTML = originalHTML;
    btnGenerar.disabled = false;
  }
}

// Insertar HTML limpio manteniendo posición
function insertarHTMLEnRango(range, html) {
  try {
    // Limpiar el rango
    range.deleteContents();

    // Crear un div temporal para parsear el HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // Mover todos los nodos del div al rango
    while (tempDiv.firstChild) {
      range.insertNode(tempDiv.firstChild);
    }

    // Obtener el último nodo insertado
    const ultimoNodo = range.endContainer;

    // Crear nuevo rango al final del contenido insertado
    const nuevoRango = document.createRange();

    if (ultimoNodo.nodeType === Node.TEXT_NODE) {
      // Si es un nodo de texto, colocar al final del texto
      nuevoRango.setStart(ultimoNodo, ultimoNodo.length);
    } else if (ultimoNodo.nodeType === Node.ELEMENT_NODE) {
      // Si es un elemento, colocar después del elemento
      nuevoRango.setStartAfter(ultimoNodo);
    } else {
      // Fallback: usar el propio rango
      nuevoRango.setStart(range.endContainer, range.endOffset);
    }

    nuevoRango.collapse(true);

    // Establecer la nueva selección
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(nuevoRango);

  } catch (error) {

    // Fallback simple: usar innerHTML en el contenedor más cercano
    try {
      const container = range.commonAncestorContainer;
      if (container.nodeType === Node.TEXT_NODE) {
        container.parentNode.innerHTML = html;
      } else {
        container.innerHTML = html;
      }
    } catch (fallbackError) {
      throw new Error('No se pudo insertar el HTML');
    }
  }
}


function insertarHTMLEnRangoSimple(range, html) {
  try {
    // Guardar referencia al padre del rango
    const parentElement = range.commonAncestorContainer;

    // Crear un marcador para mantener la posición
    const marker = document.createTextNode('');
    range.deleteContents();
    range.insertNode(marker);

    // Crear rango después del marcador
    const newRange = document.createRange();
    newRange.setStartAfter(marker);
    newRange.collapse(true);

    // Insertar el HTML
    const fragment = newRange.createContextualFragment(html);
    newRange.insertNode(fragment);

    // Remover el marcador
    marker.parentNode.removeChild(marker);

    // Colocar el cursor al final
    const sel = window.getSelection();
    sel.removeAllRanges();

    // Crear un nuevo rango al final del fragmento insertado
    const finalRange = document.createRange();

    // Encontrar el último nodo con contenido
    let lastNode = fragment;
    while (lastNode.lastChild && lastNode.lastChild.nodeType !== Node.TEXT_NODE) {
      lastNode = lastNode.lastChild;
    }

    if (lastNode.lastChild && lastNode.lastChild.nodeType === Node.TEXT_NODE) {
      finalRange.setStart(lastNode.lastChild, lastNode.lastChild.length);
    } else if (lastNode.nodeType === Node.TEXT_NODE) {
      finalRange.setStart(lastNode, lastNode.length);
    } else {
      finalRange.setStartAfter(fragment.lastChild || fragment);
    }

    finalRange.collapse(true);
    sel.addRange(finalRange);

    return true;

  } catch (error) {

    // Último recurso: usar innerHTML en el contenedor más cercano
    try {
      const container = document.querySelector('.col-alumno, .col-maestro') ||
        range.commonAncestorContainer.parentNode ||
        document.body;

      // Crear un ID temporal para encontrar y reemplazar
      const tempId = 'temp-' + Date.now();
      const tempMarker = `<span id="${tempId}"></span>`;

      // Insertar marcador temporal
      range.deleteContents();
      const tempRange = range.cloneRange();
      const tempFragment = tempRange.createContextualFragment(tempMarker);
      tempRange.insertNode(tempFragment);

      // Reemplazar el marcador con el HTML
      const markerElement = document.getElementById(tempId);
      if (markerElement && markerElement.parentNode) {
        markerElement.outerHTML = html;
      }

      return true;
    } catch (finalError) {
      alert('Error al aplicar cambios. Intenta seleccionar un texto diferente.');
      return false;
    }
  }
}

function verificarNodoValido(nodo) {
  if (!nodo) {
    return false;
  }

  if (!nodo.parentNode) {
    return false;
  }

  return true;
}

function obtenerNodoSeguroParaRango(nodo) {
  if (verificarNodoValido(nodo)) {
    return nodo;
  }

  // Buscar un nodo válido alternativo
  let current = nodo;
  while (current && !current.parentNode) {
    current = current.previousSibling || current.nextSibling;
  }

  if (current && current.parentNode) {
    return current;
  }

  // Último recurso: usar el body
  return document.body;
}



// Y en la función aplicarCambiosTexto, usa la versión simple:
function aplicarCambiosTexto() {
  if (!window.textoModificadoGlobal || !rangoSeleccionadoGlobal) {
    mostrarNotificacion('No hay texto para aplicar', 'error');
    return;
  }

  try {
    // Usar la versión simple y robusta
    insertarHTMLEnRangoSimple(rangoSeleccionadoGlobal, window.textoModificadoGlobal);

    document.getElementById('modal-modificar-texto').style.display = 'none';
    mostrarNotificacion('✓ Cambios aplicados', 'success');

    // Limpiar selección
    setTimeout(() => {
      window.getSelection().removeAllRanges();
    }, 100);

    // Limpiar variables globales
    textoSeleccionadoGlobal = '';
    textoSeleccionadoHTML = '';
    rangoSeleccionadoGlobal = null;
    columnaSeleccionadaGlobal = null;
    window.textoModificadoGlobal = null;

  } catch (error) {
    mostrarNotificacion('✗ Error al aplicar cambios', 'error');
  }
}


// Notificación simple
function mostrarNotificacion(mensaje, tipo) {
  const notif = document.createElement('div');
  notif.textContent = mensaje;
  notif.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: ${tipo === 'success' ? '#4CAF50' : '#f44336'};
        color: white;
        padding: 6px 10px;
        border-radius: 3px;
        font-size: 11px;
        z-index: 10002;
        opacity: 0;
        transition: opacity 0.3s;
    `;

  document.body.appendChild(notif);

  setTimeout(() => notif.style.opacity = '1', 10);
  setTimeout(() => {
    notif.style.opacity = '0';
    setTimeout(() => notif.remove(), 300);
  }, 2000);
}

// Inicializar
document.addEventListener('DOMContentLoaded', function () {
  // Cargar instrucciones guardadas
  cargarInstruccionesGuardadas();

  // Asegurar que FontAwesome esté disponible para los íconos
  if (!document.querySelector('link[href*="font-awesome"]')) {
    const faLink = document.createElement('link');
    faLink.rel = 'stylesheet';
    faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    document.head.appendChild(faLink);
  }

  // Escucha pasiva global: solo si comandos de voz globales están habilitados.
  setTimeout(() => {
    try {
      if (_vozGlobalHabilitadaPorConfiguracion()) iniciarEscuchaPasivaCharly();
    } catch (_) {
      // noop
    }
  }, 800);
});


function agregarBotonLimpiarInstrucciones() {
  const contenedor = document.querySelector('.contenedor-controles-seleccion');
  if (!contenedor) return;

  const btnLimpiar = document.createElement('button');
  btnLimpiar.type = 'button';
  btnLimpiar.textContent = 'Limpiar todas las instrucciones';
  btnLimpiar.style.cssText = `
        background-color: #ff9800;
        color: white;
        padding: 8px 15px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.3s;
        flex: 1;
        min-width: 150px;
    `;

  btnLimpiar.addEventListener('click', () => {
    if (confirm('¿Estás seguro de que quieres eliminar TODAS las instrucciones adicionales para todas las categorías?')) {
      window.instruccionesGeminiPorCategoria = {};

      // Limpiar localStorage
      const categorias = Object.keys(localStorage).filter(key => key.startsWith('instrucciones_gemini_'));
      categorias.forEach(key => localStorage.removeItem(key));

      alert('✅ Todas las instrucciones han sido eliminadas.');
    }
  });

  contenedor.appendChild(btnLimpiar);
}

// Luego, en verificarSecuencia, después de agregarControlesSeleccion():
setTimeout(() => {
  agregarBotonLimpiarInstrucciones();
}, 400);


// Observar nuevas columnas
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === 1 && node.querySelector?.('.col-alumno, .col-maestro')) {
      }
    }
  }
});

const resultadoContainer = document.getElementById('resultadoUnidadGenerada');
if (resultadoContainer) {
  const debouncedGuardarResultado = (() => {
    let t = null;
    return () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        adaptarTablasResultadoResponsive();
        guardarResultadoUnidadEnStorage();
      }, 280);
    };
  })();
  observer.observe(resultadoContainer, { childList: true, subtree: true });
  const observerPersist = new MutationObserver(() => debouncedGuardarResultado());
  observerPersist.observe(resultadoContainer, { childList: true, subtree: true });
  restaurarResultadoUnidadDesdeStorage();
  adaptarTablasResultadoResponsive();
  window.addEventListener("beforeunload", guardarResultadoUnidadEnStorage);
}

// Estilos
// Reemplaza el CSS anterior de los botones con este
const estiloIconos = document.createElement('style');
estiloIconos.textContent = `
    .categoria-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 12px 0;
        flex-wrap: wrap;
        padding: 10px 14px;
        background: #ffffff;
        border-radius: 12px;
        border: 1px solid #e2e8f0;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
    }
    
    .categoria-header h3 {
        margin: 0;
        display: inline-block;
        font-size: 14px;
        font-weight: 600;
        color: #0f172a;
        letter-spacing: 0.02em;
        flex-grow: 1;
        text-transform: uppercase;
    }
    
    .botones-categoria {
        display: flex;
        gap: 6px;
        align-items: center;
        padding: 4px;
        border-radius: 10px;
        border: 1px solid #e2e8f0;
    }
    
    .btn-icono-categoria {
        background-color: #ffffff !important;
        color: #334155 !important;
        padding: 8px !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 8px !important;
        cursor: pointer !important;
        font-size: 13px !important;
        transition: all 0.2s ease !important;
        width: 34px !important;
        height: 34px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06) !important;
    }
    
    .btn-icono-categoria:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 12px rgba(15, 23, 42, 0.12) !important;
        border-color: #cbd5f5 !important;
    }
    
    .btn-icono-categoria.instrucciones:hover {
        background-color: #f1f5f9 !important;
        color: #0f172a !important;
        border-color: #94a3b8 !important;
    }
    
    .btn-icono-categoria.generar:hover {
        background-color: #eef2ff !important;
        color: #1e40af !important;
        border-color: #c7d2fe !important;
    }
    
    .btn-icono-categoria.instrucciones.active {
        background-color: #0f172a !important;
        color: #ffffff !important;
        border-color: #0f172a !important;
    }
    
    .btn-icono-categoria.generar.active {
        background-color: #1e40af !important;
        color: #ffffff !important;
        border-color: #1e40af !important;
    }
    
    .btn-icono-categoria.disabled {
        opacity: 0.5 !important;
        cursor: not-allowed !important;
        transform: none !important;
    }
    
    .tooltip {
        position: relative;
        display: inline-block;
    }
    
    .tooltip .tooltiptext {
        visibility: hidden;
        width: 140px;
        background-color: #555;
        color: #fff;
        text-align: center;
        border-radius: 6px;
        padding: 5px;
        position: absolute;
        z-index: 1;
        bottom: 125%;
        left: 50%;
        margin-left: -70px;
        opacity: 0;
        transition: opacity 0.3s;
        font-size: 12px;
        font-weight: normal;
    }
    
    .tooltip .tooltiptext::after {
        content: "";
        position: absolute;
        top: 100%;
        left: 50%;
        margin-left: -5px;
        border-width: 5px;
        border-style: solid;
        border-color: #555 transparent transparent transparent;
    }
    
    .tooltip:hover .tooltiptext {
        visibility: visible;
        opacity: 1;
    }
    
    .badge-instrucciones {
        position: absolute;
        top: -5px;
        right: -5px;
        background-color: #ff4081;
        color: white;
        border-radius: 50%;
        width: 16px;
        height: 16px;
        font-size: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
    }
    
    .btn-icono-categoria.has-instructions {
        position: relative;
    }
`;
document.head.appendChild(estiloIconos);



// ============================================
// MODAL DE LECTURAS - SIMPLIFICADO AL MÁXIMO
// ============================================

// Variables globales
let todasLasLecturas = []; // Todas las lecturas cargadas
let lecturasFiltradas = []; // Solo cuando el usuario usa filtros del modal
let paginaActual = 1;
const lecturasPorPagina = 20;
let lecturaSeleccionadaModal = null;

// ============================================
// 1. INICIALIZAR
// ============================================

function inicializarModalLecturas() {

  const modal = document.getElementById('modalSeleccionarLectura');
  if (!modal) return;

  // Botón para abrir
  document.getElementById('btnAbrirModalLectura')?.addEventListener('click', (e) => {
    e.preventDefault();
    abrirModalLecturas();
  });

  // Botón confirmar
  document.getElementById('btnConfirmarSeleccion')?.addEventListener('click', (e) => {
    e.preventDefault();
    confirmarSeleccion();
  });

  // Botón cancelar
  document.getElementById('btnCancelarSeleccion')?.addEventListener('click', cerrarModalLecturas);

  // Cerrar con X
  modal.querySelector('.cerrar-modal-lecturas')?.addEventListener('click', cerrarModalLecturas);

  // Filtros del modal (solo los que están DENTRO del modal)
  const filtroBusqueda = document.getElementById('filtroBusquedaLectura');
  const filtroNivel = document.getElementById('filtroNivelLectura');
  const ordenar = document.getElementById('ordenarLecturas');
  const tipoFiltro = document.getElementById('tipoLecturaFiltro');

  if (filtroBusqueda) filtroBusqueda.addEventListener('input', aplicarFiltrosModal);
  if (filtroNivel) filtroNivel.addEventListener('change', aplicarFiltrosModal);
  if (ordenar) ordenar.addEventListener('change', aplicarFiltrosModal);
  if (tipoFiltro) tipoFiltro.addEventListener('change', aplicarFiltrosModal);

  // Paginación
  document.getElementById('btnAnteriorPagina')?.addEventListener('click', () => cambiarPagina(-1));
  document.getElementById('btnSiguientePagina')?.addEventListener('click', () => cambiarPagina(1));
}

// ============================================
// 2. ABRIR MODAL - MUESTRA TODAS LAS LECTURAS
// ============================================

async function abrirModalLecturas() {

  const modal = document.getElementById('modalSeleccionarLectura');
  if (!modal) return;

  try {
    // Mostrar carga
    const cuerpoTabla = document.getElementById('cuerpoTablaLecturas');
    if (cuerpoTabla) {
      cuerpoTabla.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Cargando todas las lecturas...</td></tr>';
    }

    // Cargar TODAS las lecturas
    await cargarTodasLasLecturas({ forceRefresh: true });

    // ✅ IMPORTANTE: NO aplicar ningún filtro automático
    // Limpiar filtros del modal
    document.getElementById('filtroBusquedaLectura').value = '';
    document.getElementById('filtroNivelLectura').value = '';
    document.getElementById('ordenarLecturas').value = 'titulo';
    document.getElementById('tipoLecturaFiltro').value = 'todas';

    // Mostrar TODAS las lecturas inicialmente
    lecturasFiltradas = [...todasLasLecturas];

    // Ordenar por título
    ordenarLecturas('titulo');

    // Resetear selección y paginación
    lecturaSeleccionadaModal = null;
    paginaActual = 1;

    // Renderizar tabla
    renderizarTabla();
    actualizarControles();

    // Mostrar modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';


    // Enfocar búsqueda
    setTimeout(() => {
      document.getElementById('filtroBusquedaLectura')?.focus();
    }, 100);

  } catch (error) {
    mostrarError('Error al cargar lecturas');
  }
}

// ============================================
// 3. CARGAR LECTURAS
// ============================================

async function cargarTodasLasLecturas(opts = {}) {
  const forceRefresh = !!opts.forceRefresh;

  try {
    // Comprobar si ya tenemos lecturas en cache
    if (!forceRefresh && window.lecturasNuevas && window.lecturasASC) {
    } else {

      // Cargar lecturas principales
      const qPrincipales = query(collection(db, "lecturasNuevas"));
      const snapPrincipales = await getDocs(qPrincipales);
      window.lecturasNuevas = snapPrincipales.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        tipo: 'principal'
      }));

      // Cargar lecturas ASC
      const qASC = query(collection(db, "lecturasASC"));
      const snapASC = await getDocs(qASC);
      window.lecturasASC = snapASC.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        tipo: 'asc'
      }));

    }

    // Combinar TODAS las lecturas
    const principales = (window.lecturasNuevas || []).map(l => ({ ...l, tipo: 'principal' }));
    const asc = (window.lecturasASC || []).map(l => ({ ...l, tipo: 'asc' }));

    todasLasLecturas = [...principales, ...asc];
    _refrescarOpcionesInputTema(inputTemaTexto?.value || "");


    // Debug: mostrar todas las lecturas cargadas
    todasLasLecturas.forEach((lectura, i) => {
    });

    return todasLasLecturas;

  } catch (error) {
    todasLasLecturas = [];
    return [];
  }
}

// ============================================
// 4. FILTRAR - SOLO LOS FILTROS DEL MODAL
// ============================================

function aplicarFiltrosModal() {
  const busqueda = document.getElementById('filtroBusquedaLectura').value.toLowerCase();
  const nivel = document.getElementById('filtroNivelLectura').value;
  const tipo = document.getElementById('tipoLecturaFiltro').value;
  const orden = document.getElementById('ordenarLecturas').value;


  // Aplicar filtros del modal
  let resultado = todasLasLecturas.filter(lectura => {
    // Filtro por tipo de lectura (modal)
    if (tipo === 'principales' && lectura.tipo !== 'principal') return false;
    if (tipo === 'asc' && lectura.tipo !== 'asc') return false;

    // Filtro por nivel (modal)
    if (nivel && lectura.nivel !== nivel) return false;

    // Filtro por búsqueda (modal)
    if (busqueda) {
      const titulo = (lectura.titulo || lectura.tema || '').toLowerCase();
      const autor = (lectura.autorReferencia || '').toLowerCase();
      const contenido = (lectura.contenidoHTML || '').toLowerCase();

      if (!titulo.includes(busqueda) && !autor.includes(busqueda) && !contenido.includes(busqueda)) {
        return false;
      }
    }

    return true;
  });


  lecturasFiltradas = resultado;
  paginaActual = 1;

  // Ordenar
  ordenarLecturas(orden);

  // Renderizar
  renderizarTabla();
  actualizarControles();
}

// ============================================
// 5. ORDENAR
// ============================================

function ordenarLecturas(criterio) {
  lecturasFiltradas.sort((a, b) => {
    switch (criterio) {
      case 'titulo':
        return (a.titulo || a.tema || '').localeCompare(b.titulo || b.tema || '');
      case 'tituloDesc':
        return (b.titulo || b.tema || '').localeCompare(a.titulo || a.tema || '');
      case 'autor':
        return (a.autorReferencia || '').localeCompare(b.autorReferencia || '');
      case 'grado':
        return (parseInt(a.grado) || 0) - (parseInt(b.grado) || 0);
      case 'unidad':
        return (parseInt(a.unidad) || 0) - (parseInt(b.unidad) || 0);
      default:
        return 0;
    }
  });
}

// ============================================
// 6. RENDERIZAR TABLA
// ============================================

function renderizarTabla() {
  const cuerpo = document.getElementById('cuerpoTablaLecturas');
  if (!cuerpo) return;

  // Limpiar tabla
  cuerpo.innerHTML = '';

  // Si no hay lecturas
  if (lecturasFiltradas.length === 0) {
    cuerpo.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center; padding:30px; color:#666;">
          <i class="fas fa-book" style="font-size:24px; margin-bottom:10px;"></i>
          <p>No se encontraron lecturas</p>
          <small>Intenta cambiar los filtros</small>
        </td>
      </tr>
    `;
    actualizarContador();
    return;
  }

  // Calcular rango de paginación
  const inicio = (paginaActual - 1) * lecturasPorPagina;
  const fin = inicio + lecturasPorPagina;
  const lecturasPagina = lecturasFiltradas.slice(inicio, fin);

  const stripHtml = (s = "") => String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const truncar = (s = "", max = 140) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
  const obtenerSinopsis = (lectura = {}) => {
    const candidata =
      lectura.sinopsis ||
      lectura.sinópsis ||
      lectura.resumen ||
      lectura.descripcion ||
      lectura.tema ||
      lectura.subtitulo ||
      lectura.contenidoPlano ||
      lectura.textoLectura ||
      lectura.lectura ||
      lectura.contenido ||
      lectura.texto ||
      "";
    return truncar(stripHtml(candidata), 95);
  };

  // Crear filas
  lecturasPagina.forEach(lectura => {
    const fila = document.createElement('tr');
    fila.dataset.id = lectura.id;

    // Marcar como seleccionada
    if (lecturaSeleccionadaModal?.id === lectura.id) {
      fila.classList.add('seleccionada');
    }

    // Radio button
    const celdaRadio = document.createElement('td');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'lecturaSeleccionada';
    radio.className = 'radio-seleccion';
    radio.checked = (lecturaSeleccionadaModal?.id === lectura.id);
    radio.addEventListener('change', () => seleccionarLectura(lectura));
    celdaRadio.appendChild(radio);

    // Título
    const celdaTitulo = document.createElement('td');
    celdaTitulo.textContent = lectura.titulo || 'Sin título';

    // Sinopsis
    const celdaSinopsis = document.createElement('td');
    const sinopsis = obtenerSinopsis(lectura);
    celdaSinopsis.textContent = sinopsis || 'Sin sinopsis';

    // Autor
    const celdaAutor = document.createElement('td');
    celdaAutor.textContent = lectura.autorReferencia || 'Sin autor';

    // Nivel
    const celdaNivel = document.createElement('td');
    celdaNivel.textContent = lectura.nivel || 'N/A';

    // Grado
    const celdaGrado = document.createElement('td');
    celdaGrado.textContent = lectura.grado || 'N/A';

    // Trimestre
    const celdaTrimestre = document.createElement('td');
    celdaTrimestre.textContent = lectura.trimestre || 'N/A';

    // Unidad
    const celdaUnidad = document.createElement('td');
    const unidad = lectura.unidad !== undefined && lectura.unidad !== null ? String(lectura.unidad) : 'N/A';
    celdaUnidad.textContent = unidad;
    if (unidad === "0") {
      celdaUnidad.style.fontWeight = "bold";
      celdaUnidad.style.color = "#2c5aa0";
    }

    // Tipo
    const celdaTipo = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge-tipo badge-${lectura.tipo === 'principal' ? 'principal' : 'asc'}`;
    badge.textContent = lectura.tipo === 'principal' ? 'PRINCIPAL' : 'ASC';
    celdaTipo.appendChild(badge);

    // Acción: ver lectura
    const celdaAccion = document.createElement('td');
    const btnVer = document.createElement('button');
    btnVer.type = 'button';
    btnVer.className = 'btn-ver-lectura-accion';
    btnVer.title = 'Ver lectura';
    btnVer.setAttribute('aria-label', 'Ver lectura');
    btnVer.innerHTML = '<i class="fas fa-eye"></i>';
    btnVer.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      abrirVistaLecturaDesdeSeleccion(lectura);
    });
    celdaAccion.appendChild(btnVer);

    // Agregar celdas a la fila
    fila.append(
      celdaRadio,
      celdaTitulo,
      celdaSinopsis,
      celdaAutor,
      celdaNivel,
      celdaGrado,
      celdaTrimestre,
      celdaUnidad,
      celdaTipo,
      celdaAccion
    );

    // Hacer fila clickeable
    fila.addEventListener('click', (e) => {
      if (e.target.type !== 'radio') {
        radio.checked = true;
        seleccionarLectura(lectura);
      }
    });

    cuerpo.appendChild(fila);
  });

  actualizarContador();
}

function abrirVistaLecturaDesdeSeleccion(lectura) {
  if (!lectura) return;
  const modalVistaLectura = document.getElementById("modalVistaLectura");
  const vistaTitulo = document.getElementById("vistaTituloLectura");
  const vistaTexto = document.getElementById("vistaTextoLectura");
  const vistaPreguntas = document.getElementById("vistaPreguntasLectura");
  const cerrarVistaLectura = document.getElementById("cerrarVistaLectura");
  if (!modalVistaLectura || !vistaTitulo || !vistaTexto || !vistaPreguntas) return;

  const titulo = lectura.titulo || lectura.tema || "Sin título";
  const contenido =
    lectura.contenidoHTML ||
    lectura.contenidoPlano ||
    lectura.textoLectura ||
    lectura.lectura ||
    lectura.contenido ||
    lectura.texto ||
    "<em>Sin contenido</em>";
  const preguntas = lectura.preguntasComprension || lectura.preguntas || [];

  vistaTitulo.textContent = titulo;
  vistaTexto.innerHTML = sanitizeHtml(contenido);
  vistaPreguntas.innerHTML = Array.isArray(preguntas) && preguntas.length
    ? preguntas.map((p, i) => {
      const pregunta = typeof p === "string" ? p : (p.texto || p.pregunta || "");
      const respuesta = typeof p === "object" ? (p.respuesta || "") : "";
      return `<li><strong>${i + 1}.</strong> ${escapeHtml(pregunta)}${respuesta ? `<br><span style="color:mediumvioletred;">${escapeHtml(respuesta)}</span>` : ""}</li>`;
    }).join("")
    : "<li><em>Sin preguntas de comprensión.</em></li>";

  modalVistaLectura.style.display = "block";

  if (cerrarVistaLectura && !cerrarVistaLectura.dataset.boundSeleccionLectura) {
    cerrarVistaLectura.dataset.boundSeleccionLectura = "1";
    cerrarVistaLectura.addEventListener("click", () => {
      modalVistaLectura.style.display = "none";
    });
  }
}

// ============================================
// 7. SELECCIONAR LECTURA
// ============================================

function seleccionarLectura(lectura) {
  lecturaSeleccionadaModal = lectura;

  // Actualizar clases
  document.querySelectorAll('#cuerpoTablaLecturas tr').forEach(fila => {
    fila.classList.toggle('seleccionada', fila.dataset.id === lectura.id);
  });

  // Habilitar botón confirmar
  document.getElementById('btnConfirmarSeleccion').disabled = false;
}

function confirmarSeleccion() {
  if (!lecturaSeleccionadaModal) return;
  _aplicarLecturaPrincipalSeleccionada(lecturaSeleccionadaModal);

  // Cerrar modal
  cerrarModalLecturas();
}

// ============================================
// 8. PAGINACIÓN
// ============================================

function actualizarContador() {
  const total = lecturasFiltradas.length;
  const inicio = (paginaActual - 1) * lecturasPorPagina + 1;
  const fin = Math.min(paginaActual * lecturasPorPagina, total);

  const contador = document.getElementById('contadorLecturas');
  if (contador) {
    contador.textContent = `Mostrando ${inicio}-${fin} de ${total} lecturas`;
  }
}

function actualizarControles() {
  const totalPaginas = Math.ceil(lecturasFiltradas.length / lecturasPorPagina);

  document.getElementById('btnAnteriorPagina').disabled = paginaActual <= 1;
  document.getElementById('btnSiguientePagina').disabled = paginaActual >= totalPaginas;

  const paginaTexto = document.getElementById('paginaActual');
  if (paginaTexto) {
    paginaTexto.textContent = `Página ${paginaActual} de ${totalPaginas || 1}`;
  }
}

function cambiarPagina(direccion) {
  const totalPaginas = Math.ceil(lecturasFiltradas.length / lecturasPorPagina);
  const nuevaPagina = paginaActual + direccion;

  if (nuevaPagina >= 1 && nuevaPagina <= totalPaginas) {
    paginaActual = nuevaPagina;
    renderizarTabla();
    actualizarControles();
  }
}

// ============================================
// 9. CERRAR MODAL
// ============================================

function cerrarModalLecturas() {

  const modal = document.getElementById('modalSeleccionarLectura');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
  }

  // Resetear
  lecturaSeleccionadaModal = null;
  document.getElementById('btnConfirmarSeleccion').disabled = true;
  if (unidadVoiceShouldRun && !unidadVoiceIsListening) {
    setTimeout(() => {
      if (unidadVoiceShouldRun && !unidadVoiceIsListening) iniciarEscuchaVozUnidad();
    }, 120);
  }
}

// ============================================
// 10. FUNCIONES DE ERROR
// ============================================

function mostrarError(mensaje) {
  const cuerpoTabla = document.getElementById('cuerpoTablaLecturas');
  if (cuerpoTabla) {
    cuerpoTabla.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center; padding:30px; color:red;">
          <i class="fas fa-exclamation-triangle"></i>
          <p>${mensaje}</p>
        </td>
      </tr>
    `;
  }
}

// ============================================
// 11. INICIALIZAR AL CARGAR
// ============================================

document.addEventListener('DOMContentLoaded', function () {
  _inicializarSincronizacionPerfilesAgentePorAuth();
  _inicializarSwitchMasterAgenteUnidad();
  const ctrl = _asegurarControladorAgenteUnidad();
  ctrl.init();
  _aplicarPerfilesAgente(_obtenerPerfilesAgente(), { persist: false, syncRemote: false });
  _inicializarModalConfigAgentes();
  inicializarModalLecturas();
  _sincronizarInputTemaConSelect();
  _refrescarOpcionesInputTema("");
});

window.addEventListener('lecturasNuevasActualizadas', () => {
  window.lecturasNuevas = null;
});

window.cbVoiceWorkflowBridge = window.cbVoiceWorkflowBridge || {};
window.cbVoiceWorkflowBridge.executeSpec = async (spec = "", options = {}) => {
  const textoNorm = String(options?.textoNorm || "").trim();
  const resultado = String(options?.resultado || "ok").trim() || "ok";
  const followNext = options?.followNext === true;
  const workflowCommandKey = String(options?.workflowCommandKey || "").trim();
  const visited = new Set();
  const output = await _ejecutarPasoWorkflowVisual(spec, {
    textoNorm,
    resultado,
    followNext,
    visited,
    workflowCommandKey
  });
  return output && typeof output === "object"
    ? output
    : { ok: !!output, code: "bridge_bool", message: "" };
};
window.cbVoiceWorkflowBridge.executeChain = async (spec = "", options = {}) => {
  const textoNorm = String(options?.textoNorm || "").trim();
  const resultado = String(options?.resultado || "ok").trim() || "ok";
  const ok = await _ejecutarCadenaPostComando(spec, textoNorm, new Set(), resultado);
  return {
    ok: !!ok,
    code: ok ? "chain_ok" : "chain_fail",
    message: ok ? "Cadena ejecutada." : "La cadena no pudo completarse."
  };
};
window.cbVoiceWorkflowBridge.ping = () => true;
window.cbVoiceWorkflowBridge.setPlaybackMode = (active = false) => {
  workflowPlayIsolationMode = !!active;
  workflowPlaySessionToken += 1;
  if (!workflowPlayIsolationMode && workflowPlayPendingResponse?.resolve) {
    const resolver = workflowPlayPendingResponse.resolve;
    workflowPlayPendingResponse = null;
    resolver({ ok: false, code: "playback_stopped", value: "" });
  }
  if (!workflowPlayIsolationMode) {
    _detenerAudioWorkflowPlay();
  }
  if (workflowPlayIsolationMode) {
    _detenerAudioWorkflowPlay();
    charlyPendingCommand = "";
    charlyPendingCommandCanon = "";
    workflowPlayLastResponseCanon = "";
    workflowPlayLastResponseAt = 0;
  }
  return true;
};
window.cbVoiceWorkflowBridge.waitForPlaybackResponse = async (options = {}) => {
  const timeoutMs = Math.max(1500, Math.min(45000, Number(options?.timeoutMs) || 25000));
  const choices = Array.isArray(options?.choices)
    ? options.choices.map((choice) => ({
      value: String(choice?.value || choice?.label || "").trim(),
      label: String(choice?.label || choice?.value || "").trim()
    })).filter((choice) => !!choice.value)
    : [];
  if (!workflowPlayIsolationMode) {
    return { ok: false, code: "playback_mode_off", value: "" };
  }
  if (workflowPlayPendingResponse?.resolve) {
    const prev = workflowPlayPendingResponse.resolve;
    workflowPlayPendingResponse = null;
    prev({ ok: false, code: "replaced", value: "" });
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!workflowPlayPendingResponse) return;
      const current = workflowPlayPendingResponse;
      workflowPlayPendingResponse = null;
      current.resolve({ ok: false, code: "timeout", value: "" });
    }, timeoutMs);
    workflowPlayPendingResponse = {
      choices,
      resolve: (payload = {}) => {
        clearTimeout(timer);
        resolve(payload && typeof payload === "object" ? payload : { ok: false, code: "invalid_payload", value: "" });
      }
    };
  });
};
window.cbVoiceWorkflowBridge.speakPlaybackPrompt = async (options = {}) => {
  const sessionToken = Number(workflowPlaySessionToken || 0);
  const nodeLabel = String(options?.nodeLabel || "").trim();
  const fallbackPrompt = String(options?.fallbackPrompt || "").trim();
  const choices = Array.isArray(options?.choices)
    ? options.choices.map((c) => ({
      value: String(c?.value || c?.label || "").trim(),
      label: String(c?.label || c?.value || "").trim()
    })).filter((c) => !!c.value)
    : [];
  const aiPrompt = await _generarPromptWorkflowPlayConGemini(nodeLabel, choices);
  const finalPrompt = aiPrompt || fallbackPrompt;
  if (finalPrompt && workflowPlayIsolationMode && Number(workflowPlaySessionToken || 0) === sessionToken) {
    hablarUnidad(finalPrompt, { cancelarPrevio: true, preferLive: true });
  }
  return { ok: !!finalPrompt, prompt: finalPrompt };
};
window.cbVoiceWorkflowBridge.stopPlaybackAudio = () => {
  _detenerAudioWorkflowPlay();
  return true;
};
