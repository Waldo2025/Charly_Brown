// generarLectura.js
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import { getFirestore, doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs, deleteDoc, orderBy  } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js';
import { buildApiUrl } from "./api-client.js";
import setupImageGenerator from './imageGenerator.js';
import { sanitizeHtml, sanitizeRichText, sanitizeTextInput, escapeHtml, sanitizeAssistantHtml, setSanitizedHtml } from './security-utils.js';
import { firebaseWebConfig, assertFirebaseWebConfig } from "./firebase-web-config.js";
import { bootstrapFirebaseAppCheck } from "./firebase-app-check.js";

// Config
// Configuración Firebase
const firebaseConfig = assertFirebaseWebConfig(firebaseWebConfig);


// ✅ Inicializar Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
void bootstrapFirebaseAppCheck(app);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// ⚙️ Ejecutar el generador de imágenes
setupImageGenerator(storage);

export { auth, storage }; // ahora sí puedes exportar ambos


let currentUserId = null;
let resolveAuthReady;
const authReady = new Promise((resolve) => {
  resolveAuthReady = resolve;
});
let authInitialized = false;

function createQuestionDetailsFragment(question = {}, index = 0) {
  const fragment = document.createDocumentFragment();
  const strong = document.createElement("strong");
  strong.textContent = `${index + 1}.`;
  fragment.appendChild(strong);
  fragment.append(` ${question?.texto || "(sin pregunta)"} `);

  const details = document.createElement("div");
  details.style.marginLeft = "20px";

  const nivel = document.createElement("small");
  nivel.innerHTML = `<strong>Nivel:</strong> ${escapeHtml(question?.nivel || "No especificado")}`;
  const criterio = document.createElement("small");
  criterio.innerHTML = `<strong>Criterio:</strong> ${escapeHtml(question?.criterio || "No especificada")}`;
  const respuesta = document.createElement("small");
  respuesta.innerHTML = `<strong>Respuesta esperada:</strong> ${escapeHtml(question?.respuesta || "No especificada")}`;

  details.append(nivel, document.createElement("br"), criterio, document.createElement("br"), respuesta);
  fragment.appendChild(details);
  return fragment;
}

function appendPlainTextParagraph(container, value) {
  if (!container) return;
  const safeText = sanitizeTextInput(value, {maxLength: 20000, preserveNewlines: true});
  if (!safeText) return;
  safeText.split("\n").forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line;
    container.appendChild(p);
  });
}

function createAssistantAnalysisPanel(title, assistantHtml) {
  const wrapper = document.createElement("div");

  const heading = document.createElement("h2");
  heading.style.marginTop = "0";
  heading.textContent = title;

  const body = document.createElement("div");
  body.className = "analisisTablaLectura";
  body.style.marginTop = "20px";
  body.style.padding = "15px";
  body.style.background = "#f9f9f9";
  body.style.border = "1px solid #ccc";
  setSanitizedHtml(body, assistantHtml);

  wrapper.append(heading, body);
  return wrapper;
}

// Cargar conversación al iniciar
onAuthStateChanged(auth, async (user) => {
    currentUserId = user?.uid || null;
    if (user) {
      await cargarConversacionDesdeFirebase();
    }
    if (!authInitialized) {
      authInitialized = true;
      resolveAuthReady?.();
    }
  });

const charts = [];

const buscador = document.getElementById("buscadorTemas");
// Envío del formulario a firebase
const historialMensajes = [];



async function _geminiAuthHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error("AUTH_REQUIRED");
  const token = await user.getIdToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

const MODELOS_GEMINI_FALLBACK = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-3-pro-preview"
];

function normalizeGeminiModel(modelo = "") {
  return String(modelo || "").replace(":generateContent", "").trim() || "gemini-2.5-flash-lite";
}

function buildGeminiEndpointByModel(modelo = "") {
  const model = normalizeGeminiModel(modelo);
  return model;
}

function getGeminiEndpoint(selectId = "selectGeminiEndpoint") {
  const modelo = normalizeGeminiModel(document.getElementById(selectId)?.value || "gemini-2.5-flash-lite");
  return buildGeminiEndpointByModel(modelo);
}

function buildGeminiModelChain(selectId = "selectGeminiEndpoint2") {
  const preferido = normalizeGeminiModel(document.getElementById(selectId)?.value || "gemini-2.5-flash-lite");
  const prioridad = preferido.includes("preview")
    ? [...MODELOS_GEMINI_FALLBACK, preferido]
    : [preferido, ...MODELOS_GEMINI_FALLBACK];
  return [...new Set(prioridad.map(normalizeGeminiModel).filter(Boolean))];
}

async function postGeminiWithModelFallback({ mensajes, selectId = "selectGeminiEndpoint2", maxIntentosPorModelo = 2 }) {
  const modelos = buildGeminiModelChain(selectId);
  let ultimoError = null;

  for (const modelo of modelos) {
    const endpoint = buildGeminiEndpointByModel(modelo);
    for (let intento = 0; intento < maxIntentosPorModelo; intento += 1) {
      try {
        const headers = await _geminiAuthHeaders();
        const response = await fetch(buildApiUrl("/api/gemini/generate"), {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: endpoint,
            payload: {
              contents: (mensajes || []).map((m) => ({
                role: m?.role || "user",
                parts: [{ text: m?.text || "" }]
              }))
            }
          })
        });

        const data = await response.json().catch(() => ({}));
        if (response.ok && !data?.error) {
          const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
          return raw.replace(/```[a-zA-Z]*\s*/g, "").replace(/```/g, "").trim();
        }

        const status = Number(response.status || 0);
        const message = data?.error?.message || `HTTP ${status}`;
        const isRetriable = [429, 500, 503].includes(status) || /high demand/i.test(message);
        if (isRetriable && intento + 1 < maxIntentosPorModelo) {
          await sleep(1200 + (intento * 600));
          continue;
        }
        throw new Error(`${modelo}: ${message}`);
      } catch (err) {
        ultimoError = err;
        if (intento + 1 < maxIntentosPorModelo) {
          await sleep(1200 + (intento * 600));
          continue;
        }
      }
    }
  }

  throw new Error(`No se pudo generar contenido con Gemini (${ultimoError?.message || "sin detalle"})`);
}


// 🟢 Control de cola para peticiones a Gemini
let colaPrompts = Promise.resolve();

// 🟢 Retraso configurable para no saturar
const DELAY_ENTRE_PETICIONES = 2000; // 1.5 segundos entre requests

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Colecciones disponibles para el contexto
const COLECCIONES_DISPONIBLES = [
  { id: "lecturasASC", label: "Lecturas ASC" },
  { id: "lecturasNuevas", label: "Lecturas nuevas" },
  { id: "camposFormativos", label: "Campos formativos" },
  { id: "unidadesGeneradas", label: "Unidades generadas" },
  { id: "Unidades", label: "Unidades clásicas" },
  { id: "secuenciaAlcance", label: "Secuencia y alcance" },
  { id: "moodleCourses", label: "Cursos Moodle" },
  { id: "analisisLecturas", label: "Análisis lecturas" },
  { id: "audioTranslate", label: "Audio sesiones" },
  { id: "audioTranslateSegments", label: "Audio segmentos" },
  { id: "audioTranslateSummaries", label: "Audio resúmenes" }
];

// Por simplicidad, usa todas las colecciones; el bot preguntará si falta contexto.
const coleccionesSeleccionadas = new Set(COLECCIONES_DISPONIBLES.map(c => c.id));

async function getScopedDocs(collectionName, { allowGlobal = false } = {}) {
  await authReady;
  const colRef = collection(db, collectionName);
  const uid = currentUserId || auth.currentUser?.uid || null;
  const email = (auth.currentUser?.email || "").toLowerCase();
  const byIdKeys = ["ownerId", "userId", "uid", "createdBy"];
  const merged = new Map();

  if (uid) {
    for (const key of byIdKeys) {
      try {
        const snap = await getDocs(query(colRef, where(key, "==", uid)));
        snap.forEach((d) => merged.set(d.id, d));
      } catch (_) {}
    }
  }

  if (email) {
    try {
      const sharedSnap = await getDocs(query(colRef, where("sharedWith", "array-contains", email)));
      sharedSnap.forEach((d) => merged.set(d.id, d));
    } catch (_) {}
  }

  if (uid) {
    try {
      const sharedUidSnap = await getDocs(query(colRef, where("sharedWithUids", "array-contains", uid)));
      sharedUidSnap.forEach((d) => merged.set(d.id, d));
    } catch (_) {}
  }

  if (merged.size > 0) {
    return Array.from(merged.values());
  }

  // Fallback defensivo: en algunos flujos el owner no queda indexado en el mismo campo.
  // Si Firestore permite lectura, filtramos cliente por ownership/compartido.
  try {
    const snap = await getDocs(colRef);
    snap.forEach((d) => {
      const row = d.data() || {};
      const ownerMatch = !!uid && (
        row.userId === uid ||
        row.ownerId === uid ||
        row.uid === uid ||
        row.createdBy === uid
      );
      const sharedEmail = !!email && Array.isArray(row.sharedWith) && row.sharedWith.map(v => String(v).toLowerCase()).includes(email);
      const sharedUid = !!uid && Array.isArray(row.sharedWithUids) && row.sharedWithUids.map(String).includes(uid);
      if (ownerMatch || sharedEmail || sharedUid) {
        merged.set(d.id, d);
      }
    });
  } catch (_) {}

  if (merged.size > 0) {
    return Array.from(merged.values());
  }

  if (allowGlobal) {
    const snap = await getDocs(colRef);
    return snap.docs;
  }

  return [];
}

async function construirContextoFirebase() {
  let contexto = "";

  // 🔹 Lecturas base
  if (coleccionesSeleccionadas.has("lecturasASC")) {
    const lecturasDocs = await getScopedDocs("lecturasASC", { allowGlobal: true });
    lecturasDocs.forEach(docSnap => {
      const d = docSnap.data();
      contexto += `📖 Lectura: ${d.titulo}\nNivel: ${d.nivel}, Grado: ${d.grado}, Serie: ${d.serie}\nTexto: ${(d.textoLectura || '').replace(/<[^>]+>/g,'').slice(0,300)}...\n\n`;
    });
  }

  // 🔹 Lecturas nuevas
  if (coleccionesSeleccionadas.has("lecturasNuevas")) {
    const nuevasDocs = await getScopedDocs("lecturasNuevas");
    nuevasDocs.forEach(docSnap => {
      const d = docSnap.data();
      contexto += `📘 Lectura nueva: ${d.tema} (Nivel ${d.nivel} ${d.grado})\nAutor estilo: ${d.autorReferencia}\nContenido: ${(d.contenidoHTML || '').replace(/<[^>]+>/g,'').slice(0,300)}...\n\n`;
    });
  }

  // 🔹 Campos formativos
  if (coleccionesSeleccionadas.has("camposFormativos")) {
    const camposDocs = await getScopedDocs("camposFormativos", { allowGlobal: true });
    camposDocs.forEach(docSnap => {
      const d = docSnap.data();
      contexto += `📚 Campo: ${d.campo}, Asignatura: ${d.asignatura}\nNivel: ${d.nivel}, Trimestre: ${d.trimestre}, Unidad: ${d.unidad}\nAprendizaje esperado: ${d.aprendizajeEsperado || "—"}\n\n`;
    });
  }

  // 🔹 Unidades generadas
  if (coleccionesSeleccionadas.has("unidadesGeneradas")) {
    const unidadesDocs = await getScopedDocs("unidadesGeneradas");
    unidadesDocs.forEach((docSnap, idx) => {
      const d = docSnap.data();
      contexto += `📦 Unidad generada ${idx + 1}: ${d.nombre || d.titulo || 'Sin título'} • Materia: ${d.materia || 'N/A'} • Grado: ${d.grado || 'N/A'} • Nivel: ${d.nivel || 'N/A'}\n`;
    });
  }

  // 🔹 Unidades (editor clásico)
  if (coleccionesSeleccionadas.has("Unidades")) {
    const unidadesClasicasDocs = await getScopedDocs("Unidades");
    unidadesClasicasDocs.forEach((docSnap, idx) => {
      const d = docSnap.data();
      contexto += `🗂️ Unidad ${idx + 1}: ${d.nombreUnidad || 'Sin nombre'} • Materia: ${d.materia || 'N/A'} • Grado: ${d.grado || 'N/A'} • Nivel: ${d.nivel || 'N/A'}\n`;
    });
  }

  // 🔹 Secuencia y alcance
  if (coleccionesSeleccionadas.has("secuenciaAlcance")) {
    const secuenciaDocs = await getScopedDocs("secuenciaAlcance", { allowGlobal: true });
    secuenciaDocs.forEach((docSnap, idx) => {
      const d = docSnap.data();
      contexto += `📌 Secuencia ${idx + 1}: ${d.materia || 'Materia'} • ${d.nivel || 'Nivel'} • Grado ${d.grado || 'N/A'} • Unidad ${d.unidad || 'N/A'} • ${d.nombre || ''}\n`;
    });
  }

  // 🔹 Cursos de Moodle
  if (coleccionesSeleccionadas.has("moodleCourses")) {
    const moodleDocs = await getScopedDocs("moodleCourses");
    moodleDocs.forEach((docSnap, idx) => {
      const d = docSnap.data();
      contexto += `🎓 Curso Moodle ${idx + 1}: ${d.nombreCurso || d.titulo || 'Sin título'} • Nivel: ${d.nivel || 'N/A'} • Grado: ${d.grado || 'N/A'} • Módulos: ${(d.modulos && d.modulos.length) || d.totalModulos || 'N/A'}\n`;
    });
  }

  // 🔹 Análisis de lecturas guardados
  if (coleccionesSeleccionadas.has("analisisLecturas")) {
    const analisisDocs = await getScopedDocs("analisisLecturas");
    analisisDocs.forEach((docSnap, idx) => {
      const d = docSnap.data();
      contexto += `📑 Análisis ${idx + 1}: ${d.titulo || d.tema || 'Sin título'} • Nivel: ${d.nivel || 'N/A'} • Grado: ${d.grado || 'N/A'} • Resultado: ${(d.resultado || '').slice(0,120)}...\n`;
    });
  }

  // 🔹 Audio: sesiones, segmentos y resúmenes (resumido)
  const audioSessionIds = new Set();
  if (coleccionesSeleccionadas.has("audioTranslate")) {
    const audioDocs = await getScopedDocs("audioTranslate");
    audioDocs.forEach((docSnap, idx) => {
      const d = docSnap.data();
      audioSessionIds.add(docSnap.id);
      const segsArr = Array.isArray(d.segments) ? d.segments : [];
      let extracto = "";
      if (segsArr.length) {
        const maxChars = 1200;
        for (let i = 0; i < segsArr.length && extracto.length < maxChars; i++) {
          const s = segsArr[i];
          const txt = (s?.original_raw || s?.raw || "").replace(/<[^>]+>/g, "").trim();
          if (!txt) continue;
          extracto += (extracto ? " " : "") + txt.slice(0, 200);
        }
        if (extracto.length > maxChars) extracto = extracto.slice(0, maxChars) + "...";
      }
      contexto += `🎙️ Sesión audio ${idx + 1}: ${d.title || `Sesión ${docSnap.id}`} • Segs: ${segsArr.length || d.segmentCount || 0} • Modelo: ${d.modelUsed || 'N/A'} • Estado: ${d.status || 'N/A'}${extracto ? " • Extracto: " + extracto : ""}\n`;
    });
  }

  if (coleccionesSeleccionadas.has("audioTranslateSummaries") && audioSessionIds.size > 0) {
    const summariesById = new Map();
    for (const sessionId of audioSessionIds) {
      try {
        const q = query(collection(db, "audioTranslateSummaries"), where("sessionId", "==", sessionId));
        const snap = await getDocs(q);
        snap.forEach((docSnap) => summariesById.set(docSnap.id, docSnap));
      } catch (_) {}
    }
    Array.from(summariesById.values()).forEach((docSnap, idx) => {
      const d = docSnap.data();
      contexto += `📝 Resumen audio ${idx + 1}: ${d.type || 'tipo'} • Tono: ${d.tone || 'raw'} • Modelo: ${d.model || 'N/A'} • Texto: ${(d.text || d.content || '').slice(0,120)}...\n`;
    });
  }

  if (coleccionesSeleccionadas.has("audioTranslateSegments") && audioSessionIds.size > 0) {
    const segmentsById = new Map();
    for (const sessionId of audioSessionIds) {
      try {
        const segRef = doc(db, "audioTranslateSegments", sessionId);
        const segSnap = await getDoc(segRef);
        if (segSnap.exists()) segmentsById.set(segSnap.id, segSnap);
      } catch (_) {}
    }
    Array.from(segmentsById.values()).forEach((docSnap) => {
      const d = docSnap.data() || {};
      const segsArr = Array.isArray(d.segments) ? d.segments : [];
      const segs = segsArr.length;
      let extracto = "";
      let subtitulos = "";
      if (segs) {
        const maxChars = 1200;
        const subs = [];
        for (let i = 0; i < segsArr.length && extracto.length < maxChars; i++) {
          const s = segsArr[i];
          const txt = (s?.original_raw || s?.raw || "").replace(/<[^>]+>/g, "").trim();
          if (!txt) continue;
          extracto += (extracto ? " " : "") + txt.slice(0, 200);
          if (s?.subtitle) subs.push(s.subtitle);
        }
        if (extracto.length > maxChars) extracto = extracto.slice(0, maxChars) + "...";
        if (subs.length) subtitulos = subs.slice(0, 5).join(" | ");
      }
      contexto += `🧩 Segs sesión ${docSnap.id}: ${segs} segmentos${subtitulos ? " • Subtítulos: " + subtitulos : ""}${extracto ? " • Extracto: " + extracto : ""}\n`;
    });
  }

  return contexto;
}

async function prepararPromptConContexto(userMessage, contextoLecturasExtra = "", contextoSeleccionado = "") {
  
  const contextoFirebase = await construirContextoFirebase();

  return [
    {
      role: "user",
      text: `
Eres un asistente pedagógico experto. Tienes acceso a estos datos de Firebase:

${contextoFirebase}

${contextoLecturasExtra ? "También tienes lecturas relevantes específicas:\n" + contextoLecturasExtra : ""}
${contextoSeleccionado ? "El usuario seleccionó este contenido y quiere que lo uses como foco principal:\n" + contextoSeleccionado : ""}

Ahora responde la pregunta del usuario SOLO usando este contexto si aplica:

${userMessage}

IMPORTANTE:
- Si hay contenido seleccionado, úsalo como contexto principal antes de usar el resto.
- Devuelve TODO el contenido ÚNICAMENTE en HTML.
- Usa <strong> para negritas, <em> para cursivas.
- No uses Markdown (**texto**, _texto_, etc.).
- No incluyas bloques de código como \`\`\`html ni \`\`\`.
- Usa <h2>, <h3>, <p>, <ul>, <li>, <table>, etc. correctamente.
- Si no encuentras datos suficientes en el contexto, responde exactamente con: __INSUFFICIENT_CONTEXT__.
`
    }
  ];
}

function isInsufficientLocalAnswer(answer = "") {
  const text = String(answer || "").trim().toLowerCase();
  if (!text) return true;
  if (text.includes("__insufficient_context__")) return true;
  const patterns = [
    "no encontr",
    "no cuento con información",
    "no tengo información",
    "no hay información",
    "falta contexto",
    "contexto insuficiente",
    "insuficiente"
  ];
  return patterns.some(p => text.includes(p));
}

function sourceTagHtml(source = "local") {
  const normalized = String(source || "local").toLowerCase().trim();
  const map = {
    local: `<span class="respuesta-ia-source-tag respuesta-ia-source-tag--local inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Fuente: Local</span>`,
    model: `<span class="respuesta-ia-source-tag respuesta-ia-source-tag--model inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Fuente: Modelo IA</span>`
  };
  return map[normalized] || map.local;
}

async function resolverRespuestaCharly(userMessage, contextoLecturasExtra = "", contextoSeleccionado = "", contextoConversacion = "") {
  const localPrompt = await prepararPromptConContexto(userMessage, contextoLecturasExtra, contextoSeleccionado);
  if (contextoConversacion && localPrompt?.[0]) {
    localPrompt[0].text += `\n\nContexto de conversación previa (úsalo para continuidad):\n${contextoConversacion}`;
  }
  let localAnswer = await enviarPrompt(localPrompt);
  localAnswer = String(localAnswer || "")
    .replace(/```[a-zA-Z]*\s*/g, "")
    .replace(/```/g, "")
    .trim();

  if (!isInsufficientLocalAnswer(localAnswer)) {
    return { answer: localAnswer, source: "local" };
  }

  const modelPrompt = [
    {
      role: "user",
      text: `
Eres Charly. Responde con conocimiento general y ejemplos prácticos cuando no exista contexto local suficiente.
Devuelve SOLO HTML válido (sin Markdown ni bloques de código).

Pregunta del usuario:
${userMessage}
${contextoConversacion ? `\n\nContexto de conversación previa:\n${contextoConversacion}` : ""}
`
    }
  ];
  const modelAnswer = await enviarPrompt(modelPrompt);
  return {
    answer: String(modelAnswer || "")
      .replace(/```[a-zA-Z]*\s*/g, "")
      .replace(/```/g, "")
      .trim(),
    source: "model"
  };
}


const palabrasClavePorTema = {
    "Competencias Primaria Alta": ["competencias", "primaria alta", "cuarto", "quinto", "sexto"],
    "Competencias Primaria Baja": ["competencias", "primaria baja", "primero", "segundo", "tercero"],
    "Competencias Primaria Inglés": ["competencias inglés", "english", "primaria inglés"],
    "Escuelas Comprometidas pt.1": ["escuelas comprometidas", "pt.1"],
    "Escuelas Comprometidas pt.2": ["escuelas comprometidas", "pt.2"],
    "Escuelas Comprometidas pt.3": ["escuelas comprometidas", "pt.3"],
    "Escuelas Comprometidas pt.4": ["escuelas comprometidas", "pt.4"],
    "Escuelas Comprometidas pt.5": ["escuelas comprometidas", "pt.5"],
    "Escuelas Comprometidas pt.6": ["escuelas comprometidas", "pt.6"],
    "Escuelas Comprometidas pt.7": ["escuelas comprometidas", "pt.7"],
    "Estructura Secundaria": ["estructura secundaria", "estructura"],
    "Manual General de Primaria en Forma": ["manual", "primaria en forma"],
    "Pilares ASC": ["pilares", "fundamentos", "metodología asc"],
    "Prólogos Primaria": ["prólogo", "prólogos", "inicio"],
    "TAXONOMÍA DE BLOOM": ["bloom", "taxonomía", "verbos", "evaluación"]
  };
  

let historialConversacion = [];
let contextoMetodologia = "";
let contextoLecturas = "";

function stripHtmlToText(html = "") {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildConversationContext(limit = 10) {
  const tail = historialConversacion.slice(-limit);
  if (!tail.length) return "";
  return tail.map(msg => {
    const rol = msg.tipo === "usuario" ? "Usuario" : "Asistente";
    return `${rol}: ${String(msg.texto || "").trim()}`;
  }).filter(Boolean).join("\n");
}

function initPanelIzquierdoToggle() {
  const panel = document.getElementById("panel-izquierdo");
  const btn = document.getElementById("btnTogglePanelIzquierdo");
  if (!panel || !btn) return;
  if (btn.dataset.bound === "1") return;

  const key = "cb.panelIzquierdo.abierto";
  const saved = localStorage.getItem(key);
  const isOpen = saved === "1";
  panel.classList.toggle("is-open", isOpen);
  btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  btn.setAttribute("title", isOpen ? "Cerrar menú" : "Abrir menú");

  btn.addEventListener("click", () => {
    const open = !panel.classList.contains("is-open");
    panel.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("title", open ? "Cerrar menú" : "Abrir menú");
    localStorage.setItem(key, open ? "1" : "0");
  });

  btn.dataset.bound = "1";
}

function initStudioWorkspaceToggle() {
  const workspace = document.querySelector(".panel-analisis.studio-workspace");
  const panelChat = document.getElementById("panel-chat");
  const btn = document.getElementById("btnToggleStudioWorkspace");
  if (!workspace || !panelChat || !btn) return;
  if (btn.dataset.bound === "1") return;

  const key = "cb.chat.panel.visible";
  const icon = btn.querySelector("i");
  const notifyChatOpened = () => {
    window.dispatchEvent(new CustomEvent("cb-studio-chat-opened"));
  };

  const applyState = (isVisible) => {
    panelChat.classList.toggle("is-hidden", !isVisible);
    btn.classList.toggle("is-active", isVisible);
    btn.setAttribute("aria-pressed", isVisible ? "true" : "false");
    btn.setAttribute("title", isVisible ? "Ocultar chat" : "Mostrar chat");
    workspace.classList.remove("is-hidden");
    if (icon) {
      icon.classList.toggle("fa-comments", isVisible);
      icon.classList.toggle("fa-comment-slash", !isVisible);
    }
    if (isVisible) notifyChatOpened();
  };

  const saved = localStorage.getItem(key);
  const isVisible = saved !== "0";
  applyState(isVisible);

  btn.addEventListener("click", () => {
    const nextVisible = panelChat.classList.contains("is-hidden");
    applyState(nextVisible);
    localStorage.setItem(key, nextVisible ? "1" : "0");
  });

  window.addEventListener("cb-chat-visibility-force", (event) => {
    const forcedVisible = event?.detail?.visible;
    if (typeof forcedVisible !== "boolean") return;
    applyState(forcedVisible);
    localStorage.setItem(key, forcedVisible ? "1" : "0");
  });

  btn.dataset.bound = "1";
}

// Ejemplo: manejar envío de formulario del generador
document.addEventListener("DOMContentLoaded", () => {
  initPanelIzquierdoToggle();
  initStudioWorkspaceToggle();
  const safeShow = (el) => { if (el) el.style.display = 'block'; };
  const safeHide = (el) => { if (el) el.style.display = 'none'; };

  const btn = document.getElementById("btnGenerarLectura");
  const btnListaLecturas = document.getElementById("btnListaLecturas");
  const modalListaLecturas = document.getElementById("modalListaLecturas");
  const cerrarModalListaLecturas = document.getElementById("cerrarModalListaLecturas");
  const contenedorLecturas = document.getElementById("contenedorLecturasGuardadas");
  const buscadorLecturas = document.getElementById("buscadorLecturas");
  const modalVistaLectura = document.getElementById("modalVistaLectura");
  const cerrarVistaLectura = document.getElementById("cerrarVistaLectura");
  const vistaTitulo = document.getElementById("vistaTituloLectura");
  const vistaTexto = document.getElementById("vistaTextoLectura");
  const vistaPreguntas = document.getElementById("vistaPreguntasLectura");
  const cerrarPanelLecturasGuardadasBtn = document.getElementById("cerrarPanelLecturasGuardadasBtn");
  const cerrarModalImagenesBtn = document.getElementById("cerrarModalImagenesBtn");
  const btnToggleTablaUnidad = document.getElementById("btnToggleTablaUnidad");

  cerrarPanelLecturasGuardadasBtn?.addEventListener("click", () => {
    const panel = document.getElementById("panelLecturasGuardadas");
    if (panel) panel.style.display = "none";
  });

  cerrarModalImagenesBtn?.addEventListener("click", () => {
    const modalImagenes = document.getElementById("modalImagenes");
    if (modalImagenes) modalImagenes.style.display = "none";
  });

  btnToggleTablaUnidad?.addEventListener("click", () => {
    if (typeof window.toggleTablaInicialUnidad === "function") {
      window.toggleTablaInicialUnidad();
    }
  });



  // Mover estas funciones al inicio del archivo, fuera de cualquier event listener
    function procesarDatos(lecturas) {
        const criterios = {};
        
        lecturas.forEach(lectura => {
            (lectura.preguntas || []).forEach(pregunta => {
                const criterio = pregunta.criterio || "Sin criterios";
                const nivel = pregunta.nivel || "Sin nivel";
                
                if (!criterios[criterio]) criterios[criterio] = {};
                criterios[criterio][nivel] = (criterios[criterio][nivel] || 0) + 1;
            });
        });
        
        return criterios;
    }

    function getColor(index, opacity = 0.6) {
        const colors = [
            'rgba(75, 192, 192, OPACITY)',
            'rgba(54, 162, 235, OPACITY)',
            'rgba(255, 99, 132, OPACITY)',
            'rgba(255, 159, 64, OPACITY)',
            'rgba(153, 102, 255, OPACITY)'
        ];
        return colors[index % colors.length].replace('OPACITY', opacity);
    }

    function graficarcriteriosPorNivel(lecturas) {
        const canvas = document.getElementById("grafica1");
        if (canvas.chart) canvas.chart.destroy();
    
        const criteriosNiveles = {};
    
        // Recolectar datos
        lecturas.forEach(lectura => {
            (lectura.preguntas || []).forEach(p => {
                const criterio = p.criterio || "N/A";
                const nivel = p.nivel || "N/A";
    
                if (!criteriosNiveles[criterio]) criteriosNiveles[criterio] = {};
                if (!criteriosNiveles[criterio][nivel]) criteriosNiveles[criterio][nivel] = 0;
    
                criteriosNiveles[criterio][nivel]++;
            });
        });
    
        // Ordenar criterios por total de preguntas
        const criteriosOrdenadas = Object.entries(criteriosNiveles)
            .map(([criterio, niveles]) => ({
                criterio,
                total: Object.values(niveles).reduce((a, b) => a + b, 0),
                niveles
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);
    
        const labels = criteriosOrdenadas.map(r => r.criterio);
        const nivelesUnicos = Array.from(new Set(
            criteriosOrdenadas.flatMap(r => Object.keys(r.niveles))
        ));
    
        const datasets = nivelesUnicos.map((nivel, i) => ({
            label: nivel,
            data: criteriosOrdenadas.map(r => r.niveles[nivel] || 0),
            backgroundColor: getColor(i),
            borderColor: getColor(i, 1),
            borderWidth: 1
        }));
    
        canvas.chart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Criterios por nivel',
                        font: {
                            size: 12
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: false,
                        ticks: {
                          maxRotation: 30,
                          minRotation: 30,
                          autoSkip: false
                        }
                      },
                    y: {
                      beginAtZero: true,
                      suggestedMax: 5, // Puedes ajustarlo a tu caso
                      ticks: {
                        stepSize: 1,
                        precision: 0
                      }
                    }
                  }
                  
            }
        });
    }
    
    

    // Función para cargar datos iniciales y mostrar gráficas
    async function cargarDatosIniciales() {
        try {
            const snapshot = await getDocs(collection(db, "lecturasASC"));
            const lecturas = snapshot.docs.map(doc => doc.data());
            
            if (lecturas.length > 0) {
                graficarcriteriosPorNivel(lecturas);
            } else {
                // Opcional: mostrar gráficas de ejemplo o mensaje
            }
        } catch (error) {
        }
    }


        // Agregar al final del event listener:
        cargarDatosIniciales();

    async function cargarLecturasGuardadas() {
        contenedorLecturas.innerHTML = "<p>Cargando...</p>";
        const snapshot = await getDocs(collection(db, "lecturasASC"));
        const documentos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderizarLecturas(documentos);

        buscadorLecturas.addEventListener("input", () => {
        const texto = buscadorLecturas.value.toLowerCase();
        const filtrados = documentos.filter(doc =>
            doc.titulo?.toLowerCase().includes(texto) ||
            doc.serie?.toLowerCase().includes(texto)
        );
        renderizarLecturas(filtrados);
        });
    }

    function renderizarLecturas(lecturas) {
        contenedorLecturas.innerHTML = "";
        lecturas.sort((a, b) => (a.unidad || 0) - (b.unidad || 0));

        if (lecturas.length === 0) {
        contenedorLecturas.innerHTML = "<p>No hay lecturas guardadas.</p>";
        return;
        }
    
        const grupos = {};
        lecturas.forEach(lectura => {
        const clave = `${lectura.serie || "—"}|${lectura.nivel || "—"}|${lectura.grado || "—"}|${lectura.trimestre || "—"}`;
        if (!grupos[clave]) grupos[clave] = [];
        grupos[clave].push(lectura);
        });
    
        Object.entries(grupos).forEach(([clave, lecturasGrupo], index) => {
        const [serie, nivel, grado, trimestre] = clave.split("|");
        const groupId = `grupo-${index}`;
    
        // Contenedor del grupo (acordeón)
        const contenedorGrupo = document.createElement("div");
        contenedorGrupo.className = "grupo-lecturas";
        contenedorGrupo.style.marginBottom = "10px";
        contenedorGrupo.style.border = "1px solid #ccc";
        contenedorGrupo.style.borderRadius = "6px";
        contenedorGrupo.style.overflow = "hidden";
    
        // Botón colapsable
        const boton = document.createElement("button");
        boton.textContent = `📚 ${serie} • ${nivel} • Grado ${grado} • Trimestre ${trimestre}`;
        boton.style.width = "100%";
        boton.style.textAlign = "left";
        boton.style.padding = "10px";
        boton.style.background = "#eee";
        boton.style.border = "none";
        boton.style.fontWeight = "bold";
        boton.style.cursor = "pointer";
        boton.addEventListener("click", () => {
            cuerpoGrupo.style.display = cuerpoGrupo.style.display === "none" ? "block" : "none";
        });
    
        // Contenido del grupo (colapsable)
        const cuerpoGrupo = document.createElement("div");
        cuerpoGrupo.id = groupId;
        cuerpoGrupo.style.padding = "10px";
        cuerpoGrupo.style.display = "none";
        cuerpoGrupo.style.backgroundColor = "#fafafa";
    
        lecturasGrupo.forEach((lectura) => {
            const card = document.createElement("div");
            card.className = "card-lectura";
            card.style.display = "flex";
            card.style.justifyContent = "space-between";
            card.style.alignItems = "center";
            card.style.border = "1px solid #ccc";
            card.style.padding = "10px";
            card.style.marginBottom = "10px";
            card.style.borderRadius = "8px";
    
            const header = document.createElement("div");
            header.className = "header-lectura";
            header.style.fontSize = "0.85rem";
            header.style.marginBottom = "5px";
            header.style.color = "#555";
            header.textContent = `${lectura.nivel || "N/A"} • Grado ${lectura.grado || "N/A"} • Trimestre ${lectura.trimestre || "N/A"} • Unidad ${lectura.unidad || "N/A"}`;
    
            const titulo = document.createElement("h5");
            titulo.textContent = lectura.titulo || "Sin título";
            titulo.style.margin = "4px 0";
    
            const iconos = document.createElement("div");
            const editar = document.createElement("i");
            editar.className = "fas fa-pen";
            editar.title = "Editar";
            editar.style.marginRight = "10px";
            editar.style.cursor = "pointer";

            const eliminar = document.createElement("i");
            eliminar.className = "fas fa-trash";
            eliminar.title = "Eliminar";
            eliminar.style.cursor = "pointer";
            eliminar.style.color = "red";

            iconos.append(editar, eliminar);
    
            editar.addEventListener("click", async (e) => {
            e.stopPropagation();
            // ... tu lógica para editar lectura ...
            });
    
            eliminar.addEventListener("click", async (e) => {
            e.stopPropagation();
            const confirmar = confirm(`¿Eliminar la lectura "${lectura.titulo}"?`);
            if (confirmar) {
                await deleteDoc(doc(db, "lecturasASC", lectura.id));
                await cargarLecturasGuardadas();
            }
            });
    
            card.addEventListener("click", () => {
            vistaTitulo.textContent = lectura.titulo;
            vistaTexto.innerHTML = sanitizeHtml(lectura.textoLectura || "<em>Sin texto</em>");
            vistaPreguntas.innerHTML = "";
            lectura.preguntas?.forEach((preg, i) => {
                const li = document.createElement("li");
                li.style.marginBottom = "10px";
                li.appendChild(createQuestionDetailsFragment(preg, i));
                vistaPreguntas.appendChild(li);
            });
            modalVistaLectura.style.display = "block";
            });
    
            card.appendChild(header);
            card.appendChild(titulo);
            card.appendChild(iconos);
            cuerpoGrupo.appendChild(card);
        });
    
        contenedorGrupo.appendChild(boton);
        contenedorGrupo.appendChild(cuerpoGrupo);
        contenedorLecturas.appendChild(contenedorGrupo);
        });
    }
  
        
    
    if (btnListaLecturas && modalListaLecturas) {
  btnListaLecturas.addEventListener("click", async () => {
    safeShow(modalListaLecturas);
    await cargarLecturasGuardadas();
  });
}

// Cerrar lista de lecturas
if (cerrarModalListaLecturas) {
  cerrarModalListaLecturas.addEventListener("click", () => {
    safeHide(modalListaLecturas);
  });
}

// Cerrar vista lectura
if (cerrarVistaLectura) {
  cerrarVistaLectura.addEventListener("click", () => {
    safeHide(modalVistaLectura);
  });
}

// Click fuera para cerrar
window.addEventListener("click", (e) => {
  if (modalListaLecturas && e.target === modalListaLecturas) safeHide(modalListaLecturas);
  if (modalVistaLectura && e.target === modalVistaLectura) safeHide(modalVistaLectura);
});

// Modal lecturas ASC




    if (btn) {
        btn.addEventListener("click", async () => {
        const texto = sanitizeTextInput(document.getElementById("campoLectura")?.value || "", {maxLength: 20000, preserveNewlines: true});
        if (!texto.trim()) return alert("Texto vacío");

        const user = auth.currentUser;
        if (!user) return alert("No autenticado");

        try {
            await addDoc(collection(db, "lecturas"), {
            texto,
            userId: user.uid,
            createdAt: new Date()
            });
            alert("Lectura generada y guardada");
        } catch (err) {
        }
        });
    }


    const btnLecturasConcentradas = document.getElementById("btnLecturasConcentradas");
    const modalLecturasConcentradas = document.getElementById("modalLecturasConcentradas");
    const cerrarModalLecturasConcentradas = document.getElementById("cerrarModalLecturasConcentradas");

    if (btnLecturasConcentradas && modalLecturasConcentradas) {
      btnLecturasConcentradas.addEventListener("click", async () => {
        safeShow(modalLecturasConcentradas);
        await cargarAnalisisGuardados();
            const snapshot = await getDocs(collection(db, "lecturasASC"));
            const lecturas = snapshot.docs.map(doc => doc.data());
          
            // Agrupar lecturas
            const grupos = {};
            lecturas.forEach(lec => {
              const key = `${lec.trimestre}|${lec.unidad}|${lec.serie}|${lec.grado}`;
              if (!grupos[key]) grupos[key] = [];
          
              (lec.preguntas || []).forEach(p => {
                grupos[key].push({
                  lectura: lec.titulo || "Sin título",
                  pregunta: p.texto || "—",
                  respuesta: p.respuesta || "—",
                  nivelPregunta: p.nivel || "—",
                  criterio: p.criterio || "—",
                  nivel: lec.nivel || "—",
                  grado: lec.grado || "—",
                  trimestre: lec.trimestre || "—",
                  unidad: lec.unidad || "—",
                  serie: lec.serie || "—"
                });
              });
            });
          
            const datosAgrupados = Object.entries(grupos).map(([key, preguntas]) => {
              const [trimestre, unidad, serie, grado] = key.split("|");
              return {
                grupo: `${serie} • Grado ${grado} • Trimestre ${trimestre} • Unidad ${unidad}`,
                trimestre,
                unidad,
                serie,
                grado,
                preguntas
              };
            });
          
            // Inicializar tabla con fila expandible
            const tabla = $('#tablaLecturasConcentradas').DataTable({
              data: datosAgrupados,
              destroy: true,
              columns: [
                {
                  className: 'dt-control',
                  orderable: false,
                  data: null,
                  defaultContent: '',
                  title: '',
                },
                { data: 'grupo', title: 'Grupo' },
                { data: 'trimestre', visible: false },
                { data: 'unidad', visible: false },
                { data: 'serie', visible: false },
                { data: 'grado', visible: false },
                { data: 'preguntas', visible: false }
              ],
              order: [[1, 'asc']]
            });
          
            // Función para crear contenido al expandir
            function formatDetalle(preguntas) {
              return `<table style="width:100%; font-size:13px;">
                <thead>
                  <tr><th>Lectura</th><th>Pregunta</th><th>Respuesta esperada</th><th>Nivel</th><th>Criterio</th><th>Nivel académico</th><th>Grado</th><th>Trimestre</th><th>Unidad</th><th>Serie</th></tr>
                </thead>
                <tbody>
                  ${preguntas.map(p => `
                    <tr>
                      <td>${p.lectura}</td>
                      <td>${p.pregunta}</td>
                      <td>${p.respuesta}</td>
                      <td>${p.nivelPregunta}</td>
                      <td>${p.criterio}</td>
                      <td>${p.nivel}</td>
                      <td>${p.grado}</td>
                      <td>${p.trimestre}</td>
                      <td>${p.unidad}</td>
                      <td>${p.serie}</td>
                    </tr>`).join("")}
                </tbody>
              </table>`;
            }
          
            // Agregar funcionalidad de expandir fila
            $('#tablaLecturasConcentradas tbody').off('click').on('click', 'td.dt-control', function () {
              const tr = $(this).closest('tr');
              const row = tabla.row(tr);
          
              if (row.child.isShown()) {
                row.child.hide();
                tr.removeClass('shown');
              } else {
                row.child(formatDetalle(row.data().preguntas)).show();
                tr.addClass('shown');
              }
            });
          });
                
    }

    if (cerrarModalLecturasConcentradas && modalLecturasConcentradas) {
      cerrarModalLecturasConcentradas.addEventListener("click", () => {
        safeHide(modalLecturasConcentradas);
      });
    }



        // 🔍 Análisis con Gemini
    const btnGeminiAnalisis = document.getElementById("btnGeminiAnalisisLecturas");
        if (btnGeminiAnalisis) {
        btnGeminiAnalisis.addEventListener("click", async () => {
            const snapshot = await getDocs(collection(db, "lecturasASC"));
            const lecturas = snapshot.docs.map(doc => doc.data());

            if (!lecturas.length) {
            alert("No hay lecturas para analizar.");
            return;
            }
            document.getElementById("loadingAnalisis").style.display = "block"; // ⏳ Mostrar loading

            const resumen = lecturas.map((l, i) => {
            const textoPlano = (l.textoLectura || "").replace(/<[^>]+>/g, '');
            const preguntas = (l.preguntas || []).map((p, j) =>
                `${j + 1}. ${p.texto || ""} [Criterio: ${p.criterio || "N/A"}]`
            ).join("\n");
            return `Lectura ${i + 1}:\nTítulo: ${l.titulo}\nNivel: ${l.nivel || "N/A"}, Grado: ${l.grado || "N/A"}, Serie: ${l.serie || "N/A"}\nTexto: ${textoPlano.slice(0, 500)}...\nPreguntas:\n${preguntas}\n`;
            }).join("\n\n");

            const promptGemini = [{
            role: "user",
            text: `Eres un analista pedagógico. Con base en las siguientes lecturas educativas:

            ${resumen}

            1. Compara el análisis con la lectura original y su nivel.
            2. Identifica los géneros literarios más frecuentes.
            3. Extrae las preguntas más comunes de comprensión.
            4. Genera una tabla de frecuencia de géneros literarios thead class="frecuenciaHead" tbody class="frecuenciaBody".
                <table class="tablefrecuencia"> 
                    <thead class="frecuenciaHead">
                        <th>Tipo de Pregunta</th>
                        <th>Frecuencia</th>
                        <th>Frecuancia (en cantidad)</th>
                        <th>Ejemplos</th>
                    </thead>
                    <tbody class="frecuenciaBody">
                        <tr>
                            <td></td>
                            <td></td>
                            <td></td>
                        </tr>   
                        <tr>
                            <td></td>
                            <td></td>
                            <td></td>
                        </tr>
                        <tr>
                            <td></td>
                            <td></td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>
            5. Da recomendaciones para equilibrar los tipos de lectura.

            Responde en HTML estructurado (con títulos, listas y tabla si aplica).`
            }];

        try {
            const resultado = await enviarPrompt(promptGemini);
                const limpio = resultado.replace(/```html\s*/g, "").replace(/```/g, "").trim();
                const limpioSeguro = sanitizeAssistantHtml(limpio);
                ultimoAnalisisHTML = limpioSeguro;

                const output = createAssistantAnalysisPanel("Análisis de lecturas con Gemini", limpioSeguro);
                document.querySelector("#modalLecturasConcentradas .modal-body").prepend(output);
            } catch (err) {
                alert("Error al analizar con Gemini.");
            } finally {
                document.getElementById("loadingAnalisis").style.display = "none"; // ✅ Ocultar loading
            }
        });

    }


    window.addEventListener("click", (e) => {
      if (modalLecturasConcentradas && e.target === modalLecturasConcentradas) {
        safeHide(modalLecturasConcentradas);
      }
    });


    // Inicializar DataTable
    $(document).ready(() => {
        $('#tablaLecturasConcentradas').DataTable();
    });

    
  cargarDatosIniciales();

  let ultimoAnalisisHTML = ""; // Se guarda el análisis actual

  // Guardar análisis en Firestore
  document.getElementById("iconGuardarAnalisis").addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return alert("Debes iniciar sesión");
  
    if (!ultimoAnalisisHTML.trim()) {
      alert("No hay análisis generado para guardar.");
      return;
    }
  
    await addDoc(collection(db, "analisisLecturas"), {
      userId: user.uid,
      contenido: ultimoAnalisisHTML,
      createdAt: new Date()
    });
  
    alert("✅ Análisis guardado correctamente.");
    cargarAnalisisGuardados(); // Refrescar lista
  });
  
  // Mostrar/Ocultar tabla
  document.getElementById("iconToggleTabla").addEventListener("click", () => {
    const bloque = document.getElementById("bloqueTablaLecturas");
    bloque.style.display = (bloque.style.display === "none") ? "block" : "none";
  });
  
  // Mostrar/Ocultar lista de análisis
  document.getElementById("iconToggleAnalisis").addEventListener("click", () => {
    const cont = document.getElementById("contenedorAnalisisGuardados");
    cont.style.display = (cont.style.display === "none") ? "block" : "none";
  });
  
  // Cargar lista de análisis guardados del usuario
  async function cargarAnalisisGuardados() {
    const user = auth.currentUser;
    if (!user) return;
  
    const q = query(collection(db, "analisisLecturas"), where("userId", "==", user.uid));
    const snap = await getDocs(q);
    const lista = document.getElementById("listaAnalisisGuardados");
    lista.innerHTML = "";
  
    snap.forEach(doc => {
        const fecha = doc.data().createdAt?.toDate?.() || new Date();
        const fechaTexto = fecha.toLocaleDateString("es-MX", {
          day: "2-digit", month: "2-digit", year: "numeric"
        });
      
        const item = document.createElement("li");
        const wrapper = document.createElement("div");
        wrapper.style.padding = "10px";
        wrapper.style.marginBottom = "10px";
        wrapper.style.background = "#f1f1f1";
        wrapper.style.borderRadius = "6px";

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";

        const title = document.createElement("strong");
        title.textContent = `Análisis guardado - ${fechaTexto}`;

        const viewBtn = document.createElement("button");
        viewBtn.className = "ver-analisis-btn";
        viewBtn.dataset.html = encodeURIComponent(doc.data().contenido || "");
        viewBtn.style.border = "none";
        viewBtn.style.background = "none";
        viewBtn.style.cursor = "pointer";
        viewBtn.style.fontSize = "1em";
        viewBtn.textContent = "👁️";

        const content = document.createElement("div");
        content.className = "contenido-analisis-guardado";
        content.style.display = "none";
        content.style.marginTop = "10px";
        setSanitizedHtml(content, doc.data().contenido || "");

        row.append(title, viewBtn);
        wrapper.append(row, content);
        item.appendChild(wrapper);
        lista.appendChild(item);
      });
      document.querySelectorAll(".ver-analisis-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          const html = decodeURIComponent(btn.getAttribute("data-html"));
          const vistaAnalisis = document.getElementById("contenidoVistaAnalisis");
          setSanitizedHtml(vistaAnalisis, html);
          document.getElementById("modalVistaAnalisis").style.display = "block";
        });
      });
      
      document.getElementById("cerrarVistaAnalisis").addEventListener("click", () => {
        document.getElementById("modalVistaAnalisis").style.display = "none";
      });
  }
  
  const contenidoTexto = document.getElementById("contenidoTextoFormateado");

  document.getElementById("scrollUp").addEventListener("click", () => {
    contenidoTexto.scrollTo({ top: 0, behavior: "smooth" });
  });

  document.getElementById("scrollMiddle").addEventListener("click", () => {
    const maxScroll = Math.max(0, contenidoTexto.scrollHeight - contenidoTexto.clientHeight);
    contenidoTexto.scrollTo({ top: Math.floor(maxScroll / 2), behavior: "smooth" });
  });
  
  document.getElementById("scrollDown").addEventListener("click", () => {
    contenidoTexto.scrollTo({ top: contenidoTexto.scrollHeight, behavior: "smooth" });
  });
  
  // Configuración completa para Trumbowyg
  const opcionesTrumbowyg = {
    btns: [
      ['viewHTML'],
      ['formatting'],
      ['strong', 'em', 'underline'],
      ['fontsize'],
      ['foreColor', 'backColor'],
      ['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'],
      ['unorderedList', 'orderedList'],
      ['removeformat']
    ],
    autogrow: true
  };
  
  $('#conceptoMetodologia').trumbowyg(opcionesTrumbowyg);
  $('#comentariosMetodologia').trumbowyg(opcionesTrumbowyg);
    
});



async function cargarTemasMetodologicos() {
    contenedor.innerHTML = "<p>Cargando...</p>";
    const snapshot = await getDocs(collection(db, "metodologiaASC"));
    const documentos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    renderizarTarjetas(documentos);

    // Búsqueda
    buscador.addEventListener("input", () => {
        const texto = buscador.value.toLowerCase();
        const filtrados = documentos.filter(doc => doc.tema?.toLowerCase().includes(texto));
        renderizarTarjetas(filtrados);
    });
}

function renderizarTarjetas(docs) {
  contenedor.innerHTML = "";
  if (docs.length === 0) {
    contenedor.innerHTML = "<p>No se encontraron resultados.</p>";
    return;
  }

  docs.forEach((item) => {
    const card = document.createElement("div");
    card.style.border = "1px solid #ddd";
    card.style.borderRadius = "8px";
    card.style.padding = "10px";
    card.style.background = "#f9f9f9";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.alignItems = "flex-start";
    card.style.cursor = "pointer";

    const title = document.createElement("h5");
    title.style.margin = "0";
    title.textContent = item.tema || "Sin título";  // ← aquí estaba mal

    const iconos = document.createElement("div");
    iconos.innerHTML = `
      <i class="fas fa-pen" title="Editar" style="margin-right: 10px; cursor:pointer; color: #555;"></i>
      <i class="fas fa-trash" title="Eliminar" style="cursor:pointer; color: #d00;"></i>
    `;
    iconos.style.alignSelf = "flex-end";



  

    card.addEventListener("click", () => {
      document.getElementById("vistaTema").textContent = item.tema || "(Sin título)";
      document.getElementById("vistaConcepto").innerHTML = sanitizeHtml(item.concepto || "<em>Sin concepto</em>");
      document.getElementById("vistaComentarios").innerHTML = sanitizeHtml(item.comentarios || "<em>Sin comentarios</em>");
      document.getElementById("modalVistaPrevia").style.display = "block";
    });

    card.appendChild(title);
    card.appendChild(iconos);
    contenedor.appendChild(card);
  });
}


document.getElementById("cerrarVistaPrevia").addEventListener("click", () => {
  document.getElementById("modalVistaPrevia").style.display = "none";
});


//document.getElementById('toggleChartPanel').addEventListener('click', () => {
//    const panelCharts = document.getElementById('panel-charts');
//    panelCharts.classList.toggle('visible');
 // });



async function enviarPrompt(mensajes) {
  return postGeminiWithModelFallback({
    mensajes,
    selectId: "selectGeminiEndpoint2",
    maxIntentosPorModelo: 2
  });
}





// Cargar conversación al iniciar
let respuestaSeleccionada = null;

function extraerTextoPlano(html = "") {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function actualizarPlaceholderSeguimiento() {
  const inputEl = document.getElementById("mensajeInput");
  if (!inputEl) return;
  inputEl.placeholder = respuestaSeleccionada
    ? "Pregunta sobre el contenido seleccionado..."
    : "Escribe tu mensaje...";
}

function limpiarSeleccionSeguimiento() {
  respuestaSeleccionada = null;
  document.querySelectorAll(".icono-seguimiento").forEach(el => {
    el.classList.remove("is-selected");
  });
  actualizarPlaceholderSeguimiento();
}

function seleccionarRespuestaSeguimiento(texto, icono) {
  document.querySelectorAll(".icono-seguimiento").forEach(el => {
    el.classList.remove("is-selected");
  });
  respuestaSeleccionada = texto;
  if (icono) icono.classList.add("is-selected");
  actualizarPlaceholderSeguimiento();
}

function crearBloqueRespuestaIA(textoHTML) {
  const div = document.createElement("div");
  div.classList.add("respuesta-ia");
  const safeAssistantHtml = sanitizeAssistantHtml(textoHTML || "");

  const contenidoRespuesta = document.createElement("div");
  contenidoRespuesta.className = "respuesta-ia-contenido";
  setSanitizedHtml(contenidoRespuesta, safeAssistantHtml);
  div.appendChild(contenidoRespuesta);

  const iconContainer = document.createElement("div");
  iconContainer.style.display = "flex";
  iconContainer.style.justifyContent = "flex-end";
  iconContainer.style.gap = "10px";

  // Ícono de seguimiento
  const icono = document.createElement("i");
  icono.className = "fas fa-plus-circle icono-seguimiento";
  icono.style.cursor = "pointer";
  icono.style.marginLeft = "10px";
  if (respuestaSeleccionada && respuestaSeleccionada === safeAssistantHtml) icono.classList.add("is-selected");
  icono.title = "Responder sobre este contenido";

  icono.addEventListener("click", () => {
    const textoActual = contenidoRespuesta.innerHTML;
    if (respuestaSeleccionada && respuestaSeleccionada === textoActual) {
      limpiarSeleccionSeguimiento();
      return;
    }
    seleccionarRespuestaSeguimiento(textoActual, icono);
    const inputEl = document.getElementById("mensajeInput");
    inputEl?.focus();
  });

  // Ícono de copiar respuesta
  const iconoCopiar = document.createElement("i");
  iconoCopiar.className = "fas fa-copy";
  iconoCopiar.style.cursor = "pointer";
  iconoCopiar.style.marginLeft = "10px";
  iconoCopiar.title = "Copiar contenido";

  iconoCopiar.addEventListener("click", async () => {
    const texto = String(contenidoRespuesta.innerText || contenidoRespuesta.textContent || "").trim();
    if (!texto) return;

    let copiado = false;
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(texto);
        copiado = true;
      } catch (_) {}
    }

    if (!copiado) {
      const temp = document.createElement("textarea");
      temp.value = texto;
      temp.setAttribute("readonly", "readonly");
      temp.style.position = "absolute";
      temp.style.left = "-9999px";
      document.body.appendChild(temp);
      temp.select();
      temp.setSelectionRange(0, temp.value.length);
      try {
        copiado = document.execCommand("copy");
      } catch (_) {
        copiado = false;
      }
      document.body.removeChild(temp);
    }

    const prevTitle = iconoCopiar.title;
    const prevState = iconoCopiar.dataset.state || "";
    iconoCopiar.title = copiado ? "Copiado" : "No se pudo copiar";
    iconoCopiar.dataset.state = copiado ? "success" : "error";
    setTimeout(() => {
      iconoCopiar.title = prevTitle;
      if (prevState) iconoCopiar.dataset.state = prevState;
      else iconoCopiar.removeAttribute("data-state");
    }, 1000);
  });

  // Ícono para continuar generación
  const iconoContinuar = document.createElement("i");
  iconoContinuar.className = "fas fa-forward";
  iconoContinuar.title = "Continuar generación";
  iconoContinuar.style.cursor = "pointer";
  iconoContinuar.addEventListener("click", async () => {
    const htmlAntes = contenidoRespuesta.innerHTML;
    const textoParcial = contenidoRespuesta.innerText || contenidoRespuesta.textContent;
    const nuevoTexto = await continuarGeneracionGemini(textoParcial);
    if (!nuevoTexto || nuevoTexto.startsWith("[Error")) {
      alert("No se pudo continuar la generación. Intenta de nuevo.");
      return;
    }
    appendPlainTextParagraph(contenidoRespuesta, nuevoTexto);
    if (respuestaSeleccionada && respuestaSeleccionada === htmlAntes) {
      // Mantener contexto seleccionado actualizado solo si estaba seleccionada esta respuesta.
      seleccionarRespuestaSeguimiento(contenidoRespuesta.innerHTML, icono);
    }
  });

  iconContainer.appendChild(icono);
  iconContainer.appendChild(iconoCopiar);
  iconContainer.appendChild(iconoContinuar);
  div.appendChild(iconContainer);
  return div;
}

// Cargar conversación al iniciar
async function cargarConversacionDesdeFirebase() {
  const chat = document.getElementById("chatMensajes");
  const contenido = document.getElementById("contenidoTextoFormateado");

  chat.innerHTML = "";
  contenido.innerHTML = "";

  const q = query(collection(db, "conversacionIA"), where("userId", "==", currentUserId));
  const snap = await getDocs(q);
  const ordenados = snap.docs.map(doc => ({ ...doc.data(), id: doc.id })).sort((a, b) => a.timestamp - b.timestamp);
  historialConversacion = [];

  ordenados.forEach(msg => {
    if (msg.tipo === "usuario") {
      const div = document.createElement("div");
      div.classList.add("mensaje-usuario");
      div.textContent = `Tú: ${msg.texto}`;
      chat.appendChild(div);
      historialConversacion.push({ tipo: "usuario", texto: String(msg.texto || "") });
    } else if (msg.tipo === "asistente") {
      contenido.appendChild(crearBloqueRespuestaIA(msg.texto));
      historialConversacion.push({ tipo: "asistente", texto: stripHtmlToText(msg.texto || "") });
    }
  });

  contenido.scrollTop = contenido.scrollHeight;
  actualizarPlaceholderSeguimiento();
}

// Guardar mensaje
async function guardarMensaje(texto, tipo) {
  if (!currentUserId) return;
  await addDoc(collection(db, "conversacionIA"), {
    userId: currentUserId,
    texto: tipo === "asistente" ? sanitizeRichText(texto, {fallback: ""}) : sanitizeTextInput(texto, {maxLength: 20000, preserveNewlines: true}),
    tipo: sanitizeTextInput(tipo, {maxLength: 32}),
    timestamp: Date.now()
  });
}

// Botón para reiniciar conversación
document.getElementById("btnResetChat").addEventListener("click", async () => {
  if (!currentUserId) return;
  const q = query(collection(db, "conversacionIA"), where("userId", "==", currentUserId));
  const snap = await getDocs(q);
  for (const docu of snap.docs) {
    await deleteDoc(doc(db, "conversacionIA", docu.id));
  }
  document.getElementById("chatMensajes").innerHTML = "";
  document.getElementById("contenidoTextoFormateado").innerHTML = "";
  historialConversacion = [];
  respuestaSeleccionada = null;
  actualizarPlaceholderSeguimiento();
  alert("✅ Conversación eliminada.");
});
  
async function continuarGeneracionGemini(textoParcial) {
    const baseText = (textoParcial || "").trim();
    if (!baseText) return "[Error: texto vacío]";

    const selectId = document.getElementById("selectGeminiEndpoint2")
      ? "selectGeminiEndpoint2"
      : "selectGeminiEndpoint";

    try {
      const generated = await postGeminiWithModelFallback({
        mensajes: [{
          role: "user",
          text: `${baseText}\n\nContinúa exactamente desde donde terminó, sin repetir párrafos previos.`
        }],
        selectId,
        maxIntentosPorModelo: 2
      });
      return generated || "[Sin respuesta]";
    } catch (err) {
      console.error("Error en continuarGeneracionGemini:", err);
      return "[Error al continuar la generación]";
    }
  }
  



function detectarTemaDesdeMensaje(mensaje) {
    const texto = mensaje.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let mejorCoincidencia = null;
    let coincidencias = [];
  
    for (const [tema, palabrasClave] of Object.entries(palabrasClavePorTema)) {
      for (const palabra of palabrasClave) {
        const palabraNormalizada = palabra.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (texto.includes(palabraNormalizada)) {
          coincidencias.push({ tema, palabra });
        }
      }
    }
  
    if (coincidencias.length > 0) {
      // Prioriza el tema con más coincidencias
      const temasAgrupados = coincidencias.reduce((acc, cur) => {
        acc[cur.tema] = (acc[cur.tema] || 0) + 1;
        return acc;
      }, {});
  
      const mejor = Object.entries(temasAgrupados).sort((a, b) => b[1] - a[1])[0];
      mejorCoincidencia = mejor[0];
    }
  
    return mejorCoincidencia;
  }
  
// Evento al enviar mensaje
const input = document.getElementById("mensajeInput");
const btnEnviarMensaje = document.getElementById("enviarMensaje");

function autoResizeMensajeInput() {
  if (!input) return;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

if (input) {
  input.addEventListener("input", autoResizeMensajeInput);
  input.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      btnEnviarMensaje?.click();
    }
  });
  autoResizeMensajeInput();
}


document.getElementById("enviarMensaje").addEventListener("click", async () => {
  await authReady;
  const chat = document.getElementById("chatMensajes");
  const contenido = document.getElementById("contenidoTextoFormateado");
  const userMessage = input.value.trim();
  if (!userMessage) return;
  input.value = "";
  autoResizeMensajeInput();

  // ✅ Normalizamos para detectar intenciones
  const mensajeNormalizado = userMessage.toLowerCase();
  const mencionaSecuencia = /secuencia|alcance/.test(mensajeNormalizado);
  const mencionaLecturasNuevas = /lecturas nuevas/.test(mensajeNormalizado);
  const mencionaLecturasBase = /\blecturas\b|lecturas base/.test(mensajeNormalizado);
  const mencionaAmbasLecturas = mencionaLecturasNuevas && mencionaLecturasBase;
  const esAnalisis = /analisis|analiza|compara/.test(mensajeNormalizado);
  const contextoSeleccionado = respuestaSeleccionada
    ? extraerTextoPlano(respuestaSeleccionada).slice(0, 5000)
    : "";

  // ✅ Mostrar el mensaje del usuario
  const userDiv = document.createElement("div");
  userDiv.classList.add("mensaje-usuario");
  userDiv.textContent = `Tú: ${userMessage}`;
  chat.appendChild(userDiv);
  await guardarMensaje(userMessage, "usuario");
  historialConversacion.push({ tipo: "usuario", texto: userMessage });

  // ✅ Mostrar "Cargando..."
  const loading = document.createElement("p");
  loading.id = "loadingMensajeIA";
  loading.innerHTML = `<i class='fas fa-spinner fa-spin'></i> Consultando Firebase y analizando...`;
  contenido.appendChild(loading);

  try {
    // ✅ Si pide solo la SECUENCIA → respondemos directo con Firestore sin IA
    if (mencionaSecuencia && !esAnalisis) {
      const snapshot = await getDocs(query(collection(db, "secuenciaAlcance")));
      const categorias = {
        "Lenguaje y comunicación": ["Ortografía", "ExpresionEscrita", "ExpresionOral", "Gramatica"],
        "Ciencias sociales": ["Historia", "Geografia"],
        "Ciencias experimentales": ["Naturales"],
        "Formación socioemocional": ["CivicaEtica", "Socioemocional"],
        "Matemáticas": ["Matematicas"]
      };
      let html = "";
      snapshot.forEach(doc => {
        const d = doc.data();
        html += `<h3>Grado ${d.grado}, Unidad ${d.unidad}, Trimestre ${d.trimestre}</h3>`;
        for (const [cat, temas] of Object.entries(categorias)) {
          html += `<h4>${cat}</h4><ul>`;
          temas.forEach(t => {
            html += `<li><strong>${t}</strong><ul>`;
            html += `<li><strong>T:</strong> ${d[`${t}_T`] || "—"}</li>`;
            html += `<li><strong>AE:</strong> ${d[`${t}_AE`] || "—"}</li>`;
            html += `<li><strong>C:</strong> ${d[`${t}_C`] || "—"}</li>`;
            html += `<li><strong>P:</strong> ${d[`${t}_P`] || "—"}</li>`;
            html += `</ul></li>`;
          });
          html += `</ul>`;
        }
      });
      document.getElementById("loadingMensajeIA").remove();
      const div = crearBloqueRespuestaIA(sanitizeRichText(html, {fallback: "<p>Sin contenido.</p>"}));
      contenido.appendChild(div);
      await guardarMensaje(html, "asistente");
      historialConversacion.push({ tipo: "asistente", texto: stripHtmlToText(html) });
      contenido.scrollTop = contenido.scrollHeight;
      return; // ✅ Fin aquí, no llama a Gemini
    }

    // ✅ Si pide lecturas específicas → las cargamos para contexto extra
    let contextoLecturas = "";
    if (mencionaLecturasNuevas && !mencionaLecturasBase) {
      const snap = await getDocs(collection(db, "lecturasNuevas"));
      contextoLecturas = snap.docs.map((doc, i) => {
        const d = doc.data();
        return `Lectura Nueva ${i + 1}:\n${d.titulo}\n${(d.texto || "").replace(/<[^>]+>/g, '')}`;
      }).join("\n\n");
    } else if (mencionaLecturasBase && !mencionaLecturasNuevas) {
      const snap = await getDocs(collection(db, "lecturasASC"));
      contextoLecturas = snap.docs.map((doc, i) => {
        const d = doc.data();
        return `Lectura Base ${i + 1}:\n${d.titulo}\n${(d.textoLectura || "").replace(/<[^>]+>/g, '')}`;
      }).join("\n\n");
    } else if (mencionaAmbasLecturas || /todas las lecturas/.test(mensajeNormalizado)) {
      const [asc, nuevas] = await Promise.all([
        getDocs(collection(db, "lecturasASC")),
        getDocs(collection(db, "lecturasNuevas"))
      ]);
      const docs = [...asc.docs, ...nuevas.docs];
      contextoLecturas = docs.map((doc, i) => {
        const d = doc.data();
        const texto = d.textoLectura || d.texto || "";
        return `Lectura ${i + 1}:\n${d.titulo}\n${texto.replace(/<[^>]+>/g, '')}`;
      }).join("\n\n");
    }

    // ✅ Resolver con prioridad local y fallback al modelo cuando el contexto interno no alcance.
    const contextoConversacion = buildConversationContext(12);
    const result = await resolverRespuestaCharly(userMessage, contextoLecturas, contextoSeleccionado, contextoConversacion);
    const respuestaIA = `${sourceTagHtml(result.source)}<div class="mt-2">${sanitizeAssistantHtml(result.answer)}</div>`;

    // ✅ Mostramos resultado
    document.getElementById("loadingMensajeIA").remove();
    const respuestaDiv = crearBloqueRespuestaIA(respuestaIA);
    contenido.appendChild(respuestaDiv);
    await guardarMensaje(respuestaIA, "asistente");
    historialConversacion.push({ tipo: "asistente", texto: stripHtmlToText(result.answer || "") });
    contenido.scrollTop = contenido.scrollHeight;

  } catch (err) {
    document.getElementById("loadingMensajeIA")?.remove();
    alert("No se pudo generar la respuesta del asistente.");
  }
});

  

async function obtenerImagenComoBase64(urlImagen) {
  const response = await fetch(urlImagen);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(",")[1];
      resolve({ base64, mimeType: blob.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}



document.getElementById("imprimirAnalisis").addEventListener("click", () => {
    const contenido = sanitizeHtml(document.getElementById("contenidoVistaAnalisis").innerHTML);

    const ventana = window.open("", "", "width=800,height=600");
    if (!ventana) return;

    const printDoc = ventana.document;
    printDoc.open();

    const htmlEl = printDoc.documentElement || printDoc.appendChild(printDoc.createElement("html"));
    const head = printDoc.head || htmlEl.appendChild(printDoc.createElement("head"));
    const body = printDoc.body || htmlEl.appendChild(printDoc.createElement("body"));
    const title = printDoc.createElement("title");
    title.textContent = "Imprimir Análisis";

    const style = printDoc.createElement("style");
    style.textContent = `
        body { font-family: 'Inter', sans-serif; padding: 20px; }
        h1, h2, h3, h4, h5 { margin-top: 1rem; }
        ul, ol { margin-left: 2rem; }
        table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        .respuesta-ia { font-size: 14px; line-height: 1.6; }
    `;

    head.textContent = "";
    body.textContent = "";
    head.appendChild(title);
    head.appendChild(style);
    setSanitizedHtml(body, contenido);
    ventana.document.close();
    ventana.focus();
    ventana.print();
    ventana.close();
});




document.querySelectorAll('.close-modal').forEach(btn => {
  btn.addEventListener('click', e => {
    const modal = e.target.closest('.modal-normal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = 'auto';
    }
  });
});


document.addEventListener('DOMContentLoaded', () => {
  const btnListaLecturas = document.getElementById('btnListaLecturasNuevas');
  const modalLista = document.getElementById('modalListaLecturasNuevas');
  const cerrarLista = document.getElementById('cerrarModalListaLecturas');


  if (cerrarLista && modalLista) {
    cerrarLista.addEventListener('click', () => {
      modalLista.style.display = 'none';
      document.body.style.overflow = 'auto';
    });
  }
  const listaLecturasUl = document.getElementById('listaLecturasNuevas');

  const modalVer = document.getElementById('modalVerLecturaCompleta');
  const cerrarVer = document.getElementById('cerrarModalLecturaCompleta');
  const contenidoLectura = document.getElementById('contenidoLecturaCompleta');

  const modalEditar = document.getElementById('modalEditarLectura');
  const cerrarEditar = document.getElementById('cerrarModalEditarLectura');
  const editorLectura = document.getElementById('editarPreview') || document.getElementById('editorLectura');

  let lecturaEditandoId = null;
  let debounceTimeout = null;


  // Cierre de modales
  if (cerrarLista) {
    cerrarLista.addEventListener('click', () => {
      modalLista.style.display = 'none';
      document.body.style.overflow = 'auto';
    });
  }
  cerrarVer?.addEventListener('click', () => {
    modalVer.style.display = 'none';
    document.body.style.overflow = 'auto';
  });
  cerrarEditar?.addEventListener('click', () => {
    modalEditar.style.display = 'none';
    document.body.style.overflow = 'auto';
    lecturaEditandoId = null;
  });

  // Cerrar al hacer clic fuera del modal
  [modalLista, modalVer, modalEditar].filter(Boolean).forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        lecturaEditandoId = null;
      }
    });
  });

  // Guardado automático (debounced) al editar
  editorLectura?.addEventListener('input', () => {
    if (!lecturaEditandoId) return;
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(async () => {
      const nuevoHTML = sanitizeRichText(editorLectura.innerHTML);
      try {
        await updateDoc(doc(db, 'lecturasNuevas', lecturaEditandoId), {
          contenidoHTML: nuevoHTML
        });
        editorLectura.innerHTML = nuevoHTML;
      } catch (err) {
      }
    }, 1000);
  });

  const modalCompartir = document.getElementById('modalCompartirLectura');
const cerrarCompartir = document.getElementById('cerrarModalCompartirLectura');
const listaUsuariosCompartir = document.getElementById('listaUsuariosCompartir');
const btnConfirmarCompartir = document.getElementById('btnConfirmarCompartir');

let lecturaParaCompartir = null;

// Cerrar modal compartir
cerrarCompartir?.addEventListener('click', () => {
  modalCompartir.style.display = 'none';
  document.body.style.overflow = 'auto';
});

// Acción al hacer clic en "Compartir"
listaLecturasUl?.querySelectorAll('.icon-compartir').forEach(icon => {
  icon.addEventListener('click', async e => {
    e.stopPropagation();
    const idLectura = e.target.dataset.id;
    lecturaParaCompartir = idLectura;

    const docRef = doc(db, 'lecturasNuevas', idLectura);
    const docSnap = await getDoc(docRef);
    const lectura = docSnap.exists() ? docSnap.data() : null;
    if (!lectura) return;
    document.getElementById('materiaSeleccionada').value = lectura.materia || '';

    const usuariosSnap = await getDocs(collection(db, 'users'));
    listaUsuariosCompartir.innerHTML = '';
    usuariosSnap.forEach(userDoc => {
      const user = userDoc.data();
      const isChecked = lectura.sharewith?.includes(userDoc.id);
      const row = document.createElement("div");
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = userDoc.id;
      checkbox.checked = Boolean(isChecked);
      const displayName = String(user.nombre || user.email || userDoc.id || "").trim() || userDoc.id;
      label.append(checkbox, document.createTextNode(` ${displayName}`));
      row.appendChild(label);
      listaUsuariosCompartir.appendChild(row);
    });

    modalCompartir.style.display = 'block';
    document.body.style.overflow = 'hidden';
  });
});

// Confirmar compartir
btnConfirmarCompartir?.addEventListener('click', async () => {
  const checkboxes = listaUsuariosCompartir.querySelectorAll('input[type="checkbox"]:checked');
  const seleccionados = Array.from(checkboxes).map(cb => cb.value);

  if (lecturaParaCompartir) {
    await updateDoc(doc(db, 'lecturasNuevas', lecturaParaCompartir), {
      sharewith: seleccionados,
      estatusLectura: "Compartido",
      materia: document.getElementById("materiaSeleccionada").value || ""
    });
    alert('✅ Compartido correctamente.');
  }

  modalCompartir.style.display = 'none';
  document.body.style.overflow = 'auto';
});


});



document.getElementById("btnDescargarEditorLectura")?.addEventListener("click", () => {
  const editor = document.getElementById("editarPreview") || document.getElementById("editorLectura");
  const html = editor?.innerHTML?.trim();

  if (!html || html === "<p>Sin contenido.</p>") {
    alert("⚠️ No hay contenido para exportar.");
    return;
  }

  const nombreArchivo = "lectura_editada.docx";

  const htmlCompleto = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body>${html}</body>
    </html>
  `;

  const blob = window.htmlDocx.asBlob(htmlCompleto);
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombreArchivo;
  enlace.click();
});
