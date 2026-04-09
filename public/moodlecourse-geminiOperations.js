import { obtenerModulo, guardarModulo } from "./moodleCourse.js";
import { authFetchJson, buildApiUrl, getAuthHeaders } from "./api-client.js";
import { firebaseWebConfig, assertFirebaseWebConfig } from "./firebase-web-config.js";
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
const GEMINI_INSTRUCTION_IMAGE_CACHE_KEY = "cb_gemini_instruction_image_cache_v1";
const MODULE_GENERATION_PENDING = new Set();
const moodleGeminiApp = getApps().length ? getApp() : initializeApp(assertFirebaseWebConfig(firebaseWebConfig));
const moodleGeminiStorage = getStorage(moodleGeminiApp);
const moodleGeminiAuth = getAuth(moodleGeminiApp);

function getGeminiEndpoint() {
  return buildApiUrl("/api/gemini/generate");
}

function getSelectedGeminiModel() {
  return String(document.getElementById("selectGeminiEndpoint")?.value || "gemini-2.5-flash-lite")
    .replace(/^models\//i, "")
    .replace(/:generateContent$/i, "")
    .trim() || "gemini-2.5-flash-lite";
}

function isGeminiRegionUnsupportedMessage(message = "") {
  return String(message || "").toLowerCase().includes("user location is not supported for the api use");
}

async function geminiGenerateRequest(payload = {}, options = {}) {
  const model = String(options?.model || getSelectedGeminiModel())
    .replace(/^models\//i, "")
    .replace(/:generateContent$/i, "")
    .trim() || "gemini-2.5-flash-lite";
  const headers = await getAuthHeaders({ "Content-Type": "application/json" }).catch(() => ({
    "Content-Type": "application/json"
  }));
  const response = await fetch(buildApiUrl("/api/gemini/generate"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      payload: payload && typeof payload === "object" ? payload : {}
    }),
    ...(options?.signal ? { signal: options.signal } : {})
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function obtenerImagenesGeminiPorModulo(moduloId = "") {
  const key = String(moduloId || "").trim();
  if (!key) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(GEMINI_INSTRUCTION_IMAGE_CACHE_KEY) || "{}");
    const scoped = parsed?.[key];
    return scoped && typeof scoped === "object" ? scoped : {};
  } catch (_) {
    return {};
  }
}

function extraerPartesMultimodalesDesdeInstrucciones(instruccionesHtml = "", moduloId = "") {
  const raw = String(instruccionesHtml || "");
  const images = [];
  const cache = obtenerImagenesGeminiPorModulo(moduloId);
  const container = document.createElement("div");
  container.innerHTML = raw;

  container.querySelectorAll("img").forEach((img) => {
    const src = String(img.getAttribute("src") || "").trim();
    const imageId = String(img.getAttribute("data-gemini-image-id") || "").trim();
    let mimeType = "";
    let data = "";

    if (src.startsWith("data:image/")) {
      const m = src.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (m && m[1] && m[2]) {
        mimeType = m[1];
        data = m[2];
      }
    } else if (imageId && cache?.[imageId]?.dataUrl) {
      const dataUrl = String(cache[imageId].dataUrl || "").trim();
      const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (m && m[1] && m[2]) {
        mimeType = m[1];
        data = m[2];
      }
    }

    if (mimeType && data) {
      images.push({ mimeType, data });
    }
    img.remove();
  });

  const richText = convertirHtmlInstruccionesARichTextPrompt(container.innerHTML);

  // Eliminar resto de tags no textuales para análisis de instrucciones.
  const textOnly = container.innerHTML
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { textOnly, richText, images };
}

function convertirHtmlInstruccionesARichTextPrompt(html = "") {
  const raw = String(html || "").trim();
  if (!raw) return "";
  const container = document.createElement("div");
  container.innerHTML = raw;

  container.querySelectorAll("strong, b").forEach((node) => {
    node.replaceWith(document.createTextNode(`**${node.textContent || ""}**`));
  });
  container.querySelectorAll("em, i").forEach((node) => {
    node.replaceWith(document.createTextNode(`*${node.textContent || ""}*`));
  });
  container.querySelectorAll("u").forEach((node) => {
    node.replaceWith(document.createTextNode(`__${node.textContent || ""}__`));
  });
  container.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((node) => {
    const level = Number(String(node.tagName || "H2").replace("H", "")) || 2;
    const prefix = "#".repeat(Math.max(1, Math.min(level, 6)));
    node.replaceWith(document.createTextNode(`${prefix} ${String(node.textContent || "").trim()}\n\n`));
  });
  container.querySelectorAll("br").forEach((node) => {
    node.replaceWith(document.createTextNode("\n"));
  });
  container.querySelectorAll("li").forEach((node) => {
    node.replaceWith(document.createTextNode(`- ${String(node.textContent || "").trim()}\n`));
  });
  container.querySelectorAll("p, div, blockquote, figure, figcaption").forEach((node) => {
    if (node.childNodes.length === 1 && node.firstChild?.nodeType === Node.TEXT_NODE) {
      node.replaceWith(document.createTextNode(`${String(node.textContent || "").trim()}\n\n`));
      return;
    }
    node.appendChild(document.createTextNode("\n\n"));
  });

  return container.textContent
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtmlToText(value = "") {
    return String(value || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

function truncateText(value = "", maxChars = 2000) {
    const clean = String(value || "").trim();
    const limit = Math.max(0, Number(maxChars) || 0);
    if (!clean || clean.length <= limit) return clean;
    return `${clean.slice(0, Math.max(0, limit - 24)).trim()}\n...[recortado]`;
}

function limpiarHtmlGraficoGenerado(html = "") {
    const raw = String(html || "").trim();
    if (!raw) return "";
    const container = document.createElement("div");
    container.innerHTML = raw;
    container.querySelectorAll(".cb-module-generated-graphic").forEach((node) => node.remove());
    return container.innerHTML.trim();
}

function extraerStoragePathGraficoGenerado(modulo = {}) {
    const directPath = String(modulo?.graficoGenerado?.storagePath || "").trim();
    if (directPath) return directPath;
    const html = String(modulo?.contenido || "").trim();
    if (!html) return "";
    const container = document.createElement("div");
    container.innerHTML = html;
    const figure = container.querySelector(".cb-module-generated-graphic");
    return String(figure?.getAttribute("data-storage-path") || "").trim();
}

function construirPromptGraficoModulo({ modulo = {}, instrucciones = "", contenido = "", idioma = { code: "es" } } = {}) {
    const idiomaLabel = String(idioma?.code || "").toLowerCase().startsWith("en") ? "English" : "Español";
    return [
        `Modulo: ${String(modulo?.nombre || "Modulo educativo").trim() || "Modulo educativo"}`,
        `Tipo: ${String(modulo?.tipo || "Modulo").trim() || "Modulo"}`,
        `Idioma: ${idiomaLabel}`,
        instrucciones ? `Instrucciones del autor: ${truncateText(stripHtmlToText(instrucciones), 1600)}` : "",
        contenido ? `Contenido generado: ${truncateText(stripHtmlToText(contenido), 2200)}` : "",
        "Genera una imagen o grafico educativo que acompañe esta actividad y ayude a analizar, observar o responder el ejercicio."
    ].filter(Boolean).join("\n");
}

function construirFiguraGraficoModulo(image = {}, modulo = {}) {
    const src = String(image?.downloadUrl || "").trim();
    if (!src) return "";
    const altBase = String(modulo?.nombre || modulo?.tipo || "Grafico del modulo").trim() || "Grafico del modulo";
    const alt = `${altBase} - grafico de apoyo`;
    const storagePath = String(image?.storagePath || "").trim();
    const mimeType = String(image?.mimeType || "image/png").trim() || "image/png";
    const model = String(image?.model || "").trim();
    return `
<figure class="cb-module-generated-graphic my-4" data-storage-path="${storagePath.replace(/"/g, "&quot;")}" data-mime-type="${mimeType.replace(/"/g, "&quot;")}" data-model="${model.replace(/"/g, "&quot;")}">
  <img src="${src.replace(/"/g, "&quot;")}" alt="${alt.replace(/"/g, "&quot;")}" class="cb-module-generated-graphic__image" loading="lazy" decoding="async">
</figure>`.trim();
}

function combinarContenidoConGrafico(image = {}, contenido = "", modulo = {}) {
    const baseHtml = limpiarHtmlGraficoGenerado(contenido);
    const figureHtml = construirFiguraGraficoModulo(image, modulo);
    if (!figureHtml) return baseHtml;
    return `${figureHtml}\n${baseHtml}`.trim();
}

function blobDesdeBase64(base64 = "", mimeType = "image/png") {
    const clean = String(base64 || "").trim();
    if (!clean) throw new Error("No se recibio base64 para la imagen.");
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mimeType || "image/png" });
}

async function blobDesdeUrl(url = "") {
    const response = await fetch(String(url || "").trim());
    if (!response.ok) {
        throw new Error(`No se pudo descargar la imagen generada (${response.status}).`);
    }
    return response.blob();
}

function obtenerExtensionMime(mimeType = "image/png") {
    const clean = String(mimeType || "").trim().toLowerCase();
    if (clean === "image/webp") return "webp";
    if (clean === "image/jpeg") return "jpg";
    return "png";
}

async function subirGraficoModuloAFirebaseStorage({ blob = null, mimeType = "image/png", cursoId = "", moduloId = "" } = {}) {
    const user = moodleGeminiAuth.currentUser;
    if (!user?.uid) {
        throw new Error("Debes iniciar sesion para guardar el grafico en Firebase Storage.");
    }
    const ext = obtenerExtensionMime(mimeType);
    const path = `images/${user.uid}/moodle-modules/${String(cursoId || "curso").trim()}/${String(moduloId || "modulo").trim()}/${Date.now()}.${ext}`;
    const ref = storageRef(moodleGeminiStorage, path);
    await uploadBytes(ref, blob, {
        contentType: mimeType || "image/png",
        customMetadata: {
            origin: "moodleCourse",
            courseId: String(cursoId || "").trim(),
            moduleId: String(moduloId || "").trim()
        }
    });
    const downloadUrl = await getDownloadURL(ref);
    return {
        downloadUrl,
        storagePath: path,
        mimeType: mimeType || "image/png",
        model: "openai-image-fallback",
        promptVersion: "moodle_graphic_storage_fallback_v1",
        updatedAt: new Date().toISOString()
    };
}

async function generarGraficoModuloConPodcasterFallback({ modulo = {}, cursoId = "", instrucciones = "", contenido = "", idioma = { code: "es" } } = {}) {
    const previousStoragePath = extraerStoragePathGraficoGenerado(modulo);
    const response = await authFetchJson("/api/podcaster/scenario-images/generate", {
        method: "POST",
        body: {
            sessionId: `moodle-${String(cursoId || "curso").trim()}`,
            scenarioId: String(modulo?.id || "modulo").trim(),
            title: String(modulo?.nombre || modulo?.tipo || "Grafico del modulo").trim() || "Grafico del modulo",
            prompt: construirPromptGraficoModulo({ modulo, instrucciones, contenido, idioma }),
            previousStoragePath,
            regenerate: Boolean(previousStoragePath)
        }
    });
    const image = response?.image && typeof response.image === "object" ? response.image : null;
    if (!image?.downloadUrl) {
        throw new Error("El backend activo no devolvio una imagen utilizable para el modulo.");
    }
    return {
        downloadUrl: String(image.downloadUrl || "").trim(),
        storagePath: String(image.storagePath || "").trim(),
        mimeType: String(image.mimeType || "image/png").trim() || "image/png",
        model: String(image.model || "podcaster-scenario-fallback").trim(),
        promptVersion: String(image.promptVersion || "podcaster_scenario_fallback_v1").trim(),
        updatedAt: String(image.updatedAt || new Date().toISOString()).trim()
    };
}

async function generarGraficoComplementarioModulo({ modulo = {}, cursoId = "", instrucciones = "", contenido = "", idioma = { code: "es" } } = {}) {
    const courseId = String(cursoId || modulo?.cursoId || window.curso?.id || "").trim();
    const moduleId = String(modulo?.id || "").trim();
    if (!courseId || !moduleId) {
        throw new Error("Falta contexto del modulo para generar el grafico.");
    }
    const previousStoragePath = extraerStoragePathGraficoGenerado(modulo);
    let response;
    try {
        response = await authFetchJson("/api/moodle/module-graphics/generate", {
            method: "POST",
            body: {
                courseId,
                moduleId,
                moduleType: String(modulo?.tipo || "").trim(),
                moduleName: String(modulo?.nombre || "").trim(),
                languageCode: String(idioma?.code || "es").trim(),
                instructions: instrucciones,
                content: contenido,
                prompt: construirPromptGraficoModulo({ modulo, instrucciones, contenido, idioma }),
                previousStoragePath,
                regenerate: Boolean(previousStoragePath)
            }
        });
    } catch (error) {
        if (Number(error?.status || 0) === 404) {
            return generarGraficoModuloConPodcasterFallback({
                modulo,
                cursoId: courseId,
                instrucciones,
                contenido,
                idioma
            });
        }
        throw error;
    }
    const image = response?.image && typeof response.image === "object" ? response.image : null;
    if (!image?.downloadUrl) {
        throw new Error("No se recibio una imagen valida para el modulo.");
    }
    return image;
}

function moduleMatchesExcludedId(moduleLike = {}, excludedIds = new Set()) {
    const rawIds = [
        String(moduleLike?.id || "").trim(),
        String(moduleLike?.docId || "").trim()
    ].filter(Boolean);

    return rawIds.some((rawId) => {
        if (excludedIds.has(rawId)) return true;
        const suffix = rawId.includes("_") ? rawId.split("_").pop() : rawId;
        return excludedIds.has(suffix);
    });
}

function estimatePayloadBytes(payload = {}) {
    try {
        return new TextEncoder().encode(JSON.stringify(payload || {})).length;
    } catch (_) {
        return Number.POSITIVE_INFINITY;
    }
}

function inferirCantidadSolicitadaParaQuizz(texto = "") {
    const normalized = String(texto || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const directMatch = normalized.match(/(?:genera|generar|crea|crear|convierte|haz|elabora|redacta)?\s*(?:exactamente\s+)?(\d{1,2})\s+(?:preguntas|reactivos|actividades)/i);
    if (directMatch) {
        const cantidad = Number(directMatch[1]);
        return Number.isFinite(cantidad) && cantidad > 0 ? cantidad : null;
    }

    const mapping = new Map([
        ["una", 1], ["un", 1],
        ["dos", 2],
        ["tres", 3],
        ["cuatro", 4],
        ["cinco", 5],
        ["seis", 6],
        ["siete", 7],
        ["ocho", 8],
        ["nueve", 9],
        ["diez", 10]
    ]);

    for (const [word, value] of mapping.entries()) {
        const rx = new RegExp(`(?:genera|generar|crea|crear|convierte|haz|elabora|redacta)?\\s*(?:exactamente\\s+)?${word}\\s+(?:preguntas|reactivos|actividades)`, "i");
        if (rx.test(normalized)) return value;
    }

    return null;
}

function inferirCantidadActividadesBase(texto = "") {
    const raw = String(texto || "");
    if (!raw.trim()) return 0;

    const explicitMatches = raw.match(/(?:^|\n)\s*actividad\s+\d+\s*:/gim);
    if (explicitMatches?.length) return explicitMatches.length;

    const genericMatches = raw.match(/(?:^|\n)\s*actividad\s*:/gim);
    if (genericMatches?.length) return genericMatches.length;

    return 0;
}

function normalizarTextoPlano(value = "") {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function detectarPreferenciasQuizz(texto = "", imageCount = 0) {
    const normalized = normalizarTextoPlano(texto);
    const pideDificultadAlta =
        /\b(mas dificil|mas dificiles|dificil|difcil|retador|retadores|complej[oa]s?)\b/i.test(normalized);
    const pideParecidoAReferencia =
        /\b(como estos|como este|basad[oa]s? en la imagen|a partir de la imagen|segun la imagen|usa la imagen|tomando en cuenta la imagen)\b/i.test(normalized)
        || imageCount > 0;

    return {
        incluirRespuestas: true,
        incluirRetroalimentacion: true,
        usarImagenComoPatron: pideParecidoAReferencia,
        exigirMayorDificultad: pideDificultadAlta
    };
}

function inferirDominioActividad(texto = "", imageCount = 0) {
    const normalized = normalizarTextoPlano(texto);
    const mathSignals = [
        /\bmatemat/i,
        /\balgebra/i,
        /\bgeometr/i,
        /\becuacion(?:es)?\b/i,
        /\bfraccion(?:es)?\b/i,
        /\boperacion(?:es)?\b/i,
        /\bresuelve\b/i,
        /\bdespeja\b/i,
        /\bcalcula\b/i,
        /\bx\^?\d*/i,
        /\by\^?\d*/i,
        /\d+\s*[+\-*/=]\s*\d+/i,
        /\bx2\s*\+\s*y2/i
    ];

    const languageSignals = [
        /\bmorfolog/i,
        /\bpalabra(?:s)?\b/i,
        /\bsufijo(?:s)?\b/i,
        /\bprefijo(?:s)?\b/i,
        /\braiz\b/i,
        /\bdesinencia\b/i,
        /\bsintaxis\b/i
    ];

    const mathScore = mathSignals.reduce((acc, rx) => acc + (rx.test(normalized) ? 1 : 0), 0);
    const languageScore = languageSignals.reduce((acc, rx) => acc + (rx.test(normalized) ? 1 : 0), 0);

    if (mathScore >= 2 || (mathScore >= 1 && imageCount > 0)) {
        return {
            code: "math",
            label: "matemáticas",
            instruction: "Todas las propuestas deben mantenerse en matemáticas y en resolución/análisis de expresiones, ecuaciones o procedimientos algebraicos."
        };
    }

    if (languageScore >= 2) {
        return {
            code: "language",
            label: "lengua y morfología",
            instruction: "Todas las propuestas deben mantenerse en análisis lingüístico y morfológico."
        };
    }

    return {
        code: "generic",
        label: "mismo dominio de la actividad original",
        instruction: "Mantén todas las propuestas dentro del mismo dominio detectado en la actividad original y no cambies de materia."
    };
}

function inferirMicrotipoActividad(texto = "", dominio = "generic", imageCount = 0) {
    const normalized = normalizarTextoPlano(texto);

    if (dominio === "math") {
        const algebraicOperationSignals = [
            /\brealiza las siguientes operaciones\b/i,
            /\boperaciones\b/i,
            /\bresuelve\b/i,
            /\becuacion(?:es)?\b/i,
            /\bexpresion(?:es)?\b/i,
            /\bfraccion(?:es)?\b/i,
            /\bx2\s*\+\s*y2/i,
            /\b1\s*\/\s*x2/i,
            /\b1\s*\/\s*x\^?2/i,
            /\b1\s*[+\-]\s*\d/i,
            /\bdespeja\b/i
        ];
        const score = algebraicOperationSignals.reduce((acc, rx) => acc + (rx.test(normalized) ? 1 : 0), 0);
        if (score >= 2 || (score >= 1 && imageCount > 0)) {
            return {
                code: "algebraic_operations",
                label: "operaciones algebraicas con expresiones o ecuaciones racionales",
                instruction: "Las propuestas deben centrarse en simplificar, transformar, comparar o resolver expresiones/ecuaciones algebraicas del mismo estilo que la referencia. No cambies a temas de cálculo, asíntotas, funciones, geometría, probabilidad ni teoría abstracta."
            };
        }

        return {
            code: "math_generic",
            label: "matemáticas del mismo subtipo de ejercicio",
            instruction: "Las propuestas deben mantenerse en el mismo subtipo matemático de la actividad original, sin saltar a otro bloque temático."
        };
    }

    return {
        code: "generic",
        label: "mismo subtipo de actividad original",
        instruction: "Las propuestas deben parecerse al subtipo de ejercicio original y no cambiar de formato cognitivo ni de contenido central."
    };
}

function extraerAnclaMatematica(texto = "") {
    const raw = String(texto || "");
    const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const candidate = lines.find((line) => {
        const normalized = normalizarTextoPlano(line);
        if (!/[=xy0-9]/i.test(line)) return false;
        if (normalized.length < 5) return false;
        return /[=]/.test(line) || /\b(?:x|y)\b/i.test(line) || /x2|y2|x\^2|y\^2/i.test(line);
    });

    if (!candidate) return null;

    const normalized = normalizarTextoPlano(candidate);
    const usesEquality = candidate.includes("=");
    const usesXY = /\bx\b/i.test(normalized) || /\by\b/i.test(normalized);
    const usesPowers = /x2|y2|x\^2|y\^2/i.test(normalized);
    const usesFractions = /\//.test(candidate) || /\bfrac\b/i.test(normalized);
    const usesParentheses = /[()]/.test(candidate);

    return {
        raw: candidate,
        usesEquality,
        usesXY,
        usesPowers,
        usesFractions,
        usesParentheses
    };
}

function normalizarNotacionMatematicaInformal(texto = "") {
    let value = String(texto || "");
    if (!value.trim()) return value;

    value = value
        .replace(/\b([xy])\s*2\b/gi, (_, variable) => `${variable.toLowerCase()}^2`)
        .replace(/\b([xy])\s*3\b/gi, (_, variable) => `${variable.toLowerCase()}^3`)
        .replace(/\b([xy])\s*4\b/gi, (_, variable) => `${variable.toLowerCase()}^4`)
        .replace(/\bX\b/g, "x")
        .replace(/\bY\b/g, "y")
        .replace(/(?<=\d)\s*(?=[xy(])/gi, " ")
        .replace(/(?<=[xy)])\s*(?=\()/gi, " ")
        .replace(/\s{2,}/g, " ")
        .trim();

    return value;
}




/* BLOQUE DE HTML SIMPLE PARA GEMINI */
const BLOQUE_FORMATO_MOODLE = `
=== FORMATO HTML OBLIGATORIO ===

- NO usar <div>, <section>, <article>, <header>, <footer>, ni estilos externos.
- <span> SOLO se permite si contiene style="color:green" o style="color:red".
- NO usar markdown, no usar backticks.
- ✅ SE PERMITEN TABLAS (<table>, <tr>, <th>, <td>) cuando sea apropiado para organizar información.
- SOLO usar: <h2>, <h3>, <h4>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <table>, <tr>, <th>, <td>, <span> (solo para retroalimentación en Quizz). AÑADIR MARGIN-BOTTOM A TODAS LAS ETIQUETAS
- Para Quizz: tablas SOLO para preguntas de emparejamiento.
- Para Página: tablas permitidas para organizar contenido cuando sea necesario.
- Retroalimentaciones (solo en Quizz):
    ✓ Correcta: <span style="color:green;">texto</span>
    ✓ Incorrecta: <span style="color:red;">texto</span>

- Mantener estructura limpia y legible.
`;

const BLOQUE_FORMATO_MARKDOWN = `
=== FORMATO MARKDOWN ESTRUCTURADO (OBLIGATORIO) ===

- Responde SOLO en markdown (sin HTML, sin etiquetas <...>).
- Usa encabezados jerárquicos con #, ##, ###.
- Usa listas con "-", "*" u "1." cuando aplique.
- Usa **negritas** para conceptos clave.
- Si se requiere comparación o matriz, usa tablas markdown:
  | Columna | Columna |
  |---|---|
  | Valor | Valor |
- No uses bloques de código \`\`\` salvo que el autor los pida explícitamente.
- No agregues comentarios meta ni explicaciones fuera del contenido.
`;



let temaActivo = null;
let subtemaActivo = null;

const LANGUAGE_PROFILES = [
    {
        code: "es",
        label: "español",
        words: [" el ", " la ", " los ", " las ", " para ", " con ", " que ", " una ", " del ", " actividad ", " estudiantes ", " aprendizaje ", " objetivo "]
    },
    {
        code: "en",
        label: "english",
        words: [" the ", " and ", " for ", " with ", " this ", " should ", " students ", " learning ", " objective ", " activity ", " lesson ", " write ", " explain "]
    },
    {
        code: "pt",
        label: "português",
        words: [" de ", " para ", " com ", " os ", " as ", " alunos ", " aprendizagem ", " objetivo ", " atividade ", " aula ", " texto "]
    },
    {
        code: "fr",
        label: "français",
        words: [" le ", " la ", " les ", " des ", " pour ", " avec ", " et ", " eleves ", " apprentissage ", " objectif ", " activite ", " cours "]
    }
];

function normalizarTextoIdioma(texto = "") {
    return ` ${String(texto)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()} `;
}

function detectarIdiomaPrincipal(texto = "") {
    const normalizado = normalizarTextoIdioma(texto);

    if (!normalizado.trim()) {
        return { code: "es", label: "español", confidence: 0 };
    }

    const scores = LANGUAGE_PROFILES.map((profile) => {
        let score = 0;
        for (const token of profile.words) {
            if (normalizado.includes(token)) score += 1;
        }
        return { ...profile, score };
    }).sort((a, b) => b.score - a.score);

    const mejor = scores[0];
    const segundo = scores[1] || { score: 0 };

    // Si no hay señal clara, mantener español por compatibilidad con el flujo actual.
    if (!mejor || mejor.score === 0 || (mejor.score - segundo.score) < 1) {
        return { code: "es", label: "español", confidence: 0.25 };
    }

    return {
        code: mejor.code,
        label: mejor.label,
        confidence: Number((mejor.score / Math.max(1, mejor.score + segundo.score)).toFixed(2))
    };
}



/* GENERAR CONTENIDO CON GEMINI */
async function generarContenidoGemini(options = {}) {
    // Obtener elementos por los IDs correctos
    const instruccionesElement = options.instruccionesDiv || document.getElementById("instruccionesSubtema");
    const resultadoElement = options.resultadoDiv || document.getElementById("resultadoGenerado");
    
    // Verificar que existan
    if (!instruccionesElement || !resultadoElement) {
        if (resultadoElement) {
            resultadoElement.innerHTML = `<p class="text-red-500 text-xs">Error: Elementos de UI no disponibles.</p>`;
        }
        return;
    }
    
    // Obtener texto de las instrucciones
    const instrucciones = instruccionesElement.innerText || instruccionesElement.textContent || "";
    
    // Obtener subtema y tema de window (donde están definidos)
    const subtema = options.subtema || window.subtemaActivo;
    const tema = options.tema || window.temaActivo;
    
    if (!subtema) {
        resultadoElement.innerHTML = `<p class="text-red-500 text-xs">No hay subtema activo seleccionado.</p>`;
        return;
    }

    if (!instrucciones.trim()) {
        resultadoElement.innerHTML = `<p class="text-red-500 text-xs">Escribe instrucciones para generar el contenido.</p>`;
        return;
    }

    const idiomaDetectado = detectarIdiomaPrincipal(instrucciones);

    resultadoElement.innerHTML = `
        <div class="flex items-center gap-2 text-blue-500">
            <i class="fas fa-spinner fa-spin"></i>
            <span class="text-xs">Generando introducción con Gemini (${idiomaDetectado.label})...</span>
        </div>
    `;

    try {
        const prompt = `
# RESET — Nueva sesión
Olvida toda memoria anterior. No conserves contexto previo.  
Eres un experto en diseño instruccional, pedagogía y creación de cursos Moodle.
Trabaja EXCLUSIVAMENTE con la información proporcionada en las instrucciones del autor.

IDIOMA DE SALIDA (OBLIGATORIO):
- Idioma detectado en INSTRUCCIONES DEL AUTOR: ${idiomaDetectado.label} (${idiomaDetectado.code}).
- Responde TODO el contenido final en ${idiomaDetectado.label}.
- Si el idioma detectado NO es español, NO traduzcas la salida al español.
- Si hay mezcla de idiomas, prioriza el idioma dominante detectado (${idiomaDetectado.label}).

OBJETIVO:
Generar UNA INTRODUCCIÓN para el subtema:
"${subtema.nombre || 'Subtema sin nombre'}"

Esta introducción DEBE:
- Contextualizar al estudiante sobre el subtema.
- Describir qué aprenderá y por qué es importante.
- Conectar con el tema general (${tema?.nombre || 'Tema general'}).
- Motivar al estudiante a avanzar.
- NO debe resumir módulos ni actividades.
- NO debe mencionar "en este curso verás" ni listar.
- NO debe resumir contenido ya existente.
- NO debe analizar los módulos generados.
- NO debe hacer síntesis académica.
- Debe ser INTRODUCCIÓN pura.

INSTRUCCIONES DEL AUTOR:
${instrucciones}

=== FORMATO ===
${BLOQUE_FORMATO_MOODLE}

- NO uses estilos, clases, atributos, colores ni decoraciones.
- SOLO usa:
  <h2>, <h3>, <h4>, <p>, <ul>, <ol>, <li>, <strong>, <em>
- NO generes HTML complejo.
- NO generes HTML con contenedores.
- NO agregues envolturas como <div class="...">.
- NO uses bloques de código como \`\`\` html.
- NO describas lo que haces. Devuelve solo HTML limpio.

Estructura recomendada:
<h2>Título</h2>
<p>Párrafo introductorio</p>
<h3>Sección</h3>
<p>Texto</p>
<ul>
  <li>Elemento</li>
  <li>Elemento</li>
</ul>
        `;

        // INTENTAR MÁXIMO 3 VECES CON BACKOFF EXPONENCIAL
let lastError;
for (let intento = 0; intento < 3; intento++) {
    try {
        const { response, data } = await geminiGenerateRequest({
            contents: [{ parts: [{ text: prompt }] }]
        });

        if (!response.ok) {
                    if (response.status === 503 && intento < 2) {
                        // Espera progresiva: 2s, 4s, 8s...
                        const waitTime = 2000 * Math.pow(2, intento);
                        
                        // Actualizar mensaje para el usuario
                        resultadoElement.innerHTML = `  // ← ¡CAMBIA AQUÍ! Usa resultadoElement, no resultado
                            <div class="flex items-center gap-2 text-yellow-600">
                                <i class="fas fa-spinner fa-spin"></i>
                                <span class="text-xs">Servidor ocupado, reintentando en ${waitTime/1000} segundos...</span>
                            </div>
                        `;
                        
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        continue;
                    }
                    throw new Error(String(data?.error?.message || data?.error || `HTTP ${response.status}: ${response.statusText}`));
                }

                const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text ||
                    "<p>No se recibió respuesta válida.</p>";

                const textoLimpio = limpiarBloquesCode(texto);

                subtema.contenidoGenerado = textoLimpio;
                resultadoElement.innerHTML = textoLimpio;  // ← ¡CAMBIA AQUÍ!

                activarAccionesEnParrafos();
                guardarCursoFirebase();
                return; // Éxito, salir de la función

            } catch (error) {
                lastError = error;
                
                if (intento < 2) {
                    const waitTime = 1000 * Math.pow(2, intento);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        }

        // Si llegamos aquí, todos los intentos fallaron
        throw lastError;

    } catch (error) {
        resultadoElement.innerHTML = `  // ← ¡CORREGIDO! Cambiar resultado por resultadoElement
            <div class="text-red-500 text-xs">
                <p>Error generando contenido: ${error.message}</p>
                <p class="mt-2">Posibles soluciones:</p>
                <ul class="list-disc pl-4 mt-1">
                    <li>Intenta nuevamente en unos segundos</li>
                    <li>Verifica tu conexión a internet</li>
                    <li>Usa un modelo diferente (gemini-2.5-flash-lite o gemini-2.5-flash)</li>
                </ul>
                <button type="button" class="mt-3 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 cb-retry-generar-contenido">
                    Reintentar
                </button>
            </div>
        `;
        resultadoElement.querySelector(".cb-retry-generar-contenido")?.addEventListener("click", () => {
            generarContenidoGemini();
        });
    }

}


/* ============================================================
   GENERAR CONTENIDO PARA MÓDULO ESPECÍFICO (QUIZ, PÁGINA, ETC)
============================================================ */
export async function generarModuloGemini(moduloId) {
    const pendingKey = String(moduloId || "").trim();
    if (pendingKey && MODULE_GENERATION_PENDING.has(pendingKey)) {
        alert("Este módulo ya se está generando.");
        return;
    }
    if (pendingKey) MODULE_GENERATION_PENDING.add(pendingKey);

    // 1. Validar curso global (variable correcta: window.curso)
    if (!window.curso) {
        if (pendingKey) MODULE_GENERATION_PENDING.delete(pendingKey);
        alert("Error interno: no hay curso activo cargado.");
        return;
    }

    // 2. Validar subtema activo
    const subtema = window.subtemaActivo;
    if (!subtema) {
        if (pendingKey) MODULE_GENERATION_PENDING.delete(pendingKey);
        alert("No hay un subtema activo seleccionado.");
        return;
    }

    // 3. Traer módulo
    const cursoIdActivo = String(window.curso?.id || "").trim() || null;
    const modulo = await obtenerModulo(moduloId, cursoIdActivo);
    if (!modulo) {
        if (pendingKey) MODULE_GENERATION_PENDING.delete(pendingKey);
        alert("No se encontró el módulo en Firebase.");
        return;
    }

    // 4. Validar instrucciones
    if (!modulo.instrucciones || modulo.instrucciones.trim() === "") {
        alert("❗ Primero debes añadir instrucciones con el ícono de comentarios.");
        return;
    }

    // 5. Spinner
    const card = document.getElementById(`modulo-${moduloId}`);
    if (card) {
        const old = card.querySelector(".modulo-contenido");
        if (old) old.remove();

        card.insertAdjacentHTML("beforeend", `
            <div class="mt-3 p-3 bg-gray-50 border border-gray-200 rounded text-blue-500 flex items-center gap-2 modulo-contenido">
                <i class="fas fa-spinner fa-spin"></i>
                <span class="text-xs">Generando contenido del módulo...</span>
            </div>
        `);
    }

    try {
        const instruccionesRaw = modulo.instrucciones || "";
        const cursoIdModulo = String(modulo.cursoId || window.curso?.id || "").trim() || null;
        const incluirInstruccionOriginalEnPropuesta = modulo.incluirInstruccionOriginalEnPropuesta === true;
        const generarGrafico = modulo.generarGrafico === true;
        const { textOnly: instruccionesSoloTexto, richText: instruccionesRichText, images: imagenesInstrucciones } =
            extraerPartesMultimodalesDesdeInstrucciones(instruccionesRaw, modulo.id || moduloId);
        const instruccionesParaPrompt = modulo.tipo === "Lectura" && String(instruccionesRichText || "").trim()
            ? instruccionesRichText
            : instruccionesSoloTexto;
        const idiomaDetectadoModulo = detectarIdiomaPrincipal(
            `${modulo?.nombre || ""}\n${instruccionesParaPrompt || ""}`
        );
        const cantidadSolicitadaQuizz = inferirCantidadSolicitadaParaQuizz(instruccionesParaPrompt);
        const cantidadActividadesBase = inferirCantidadActividadesBase(instruccionesParaPrompt);
        const preferenciasQuizz = detectarPreferenciasQuizz(
            instruccionesParaPrompt,
            imagenesInstrucciones.length
        );
        const dominioActividad = inferirDominioActividad(
            instruccionesParaPrompt,
            imagenesInstrucciones.length
        );
        const microtipoActividad = inferirMicrotipoActividad(
            instruccionesParaPrompt,
            dominioActividad.code,
            imagenesInstrucciones.length
        );
        const anclaMatematica = dominioActividad.code === "math"
            ? extraerAnclaMatematica(instruccionesParaPrompt)
            : null;
        const instruccionesMatematicasNormalizadas = dominioActividad.code === "math"
            ? normalizarNotacionMatematicaInformal(instruccionesParaPrompt)
            : instruccionesParaPrompt;

        // Detectar si autor pidió tabla
        const instrucciones = instruccionesParaPrompt.toLowerCase();
        const autorPidioTabla =
            instrucciones.includes("tabla") ||
            instrucciones.includes("table") ||
            instrucciones.includes("<table") ||
            instrucciones.includes("columnas") ||
            instrucciones.includes("en formato tabla") ||
            instrucciones.includes("organiza en tabla");


        // 🔥 NUEVO: Detectar si el usuario incluye una lectura que NO debe modificarse
        const tieneLecturaProtegida = instrucciones.includes("no modifiques") && 
                                     (instrucciones.includes("lectura") || 
                                      instrucciones.includes("texto original") ||
                                      instrucciones.includes("transcribir") ||
                                      instrucciones.includes("copia exacta"));

        const permisoTablas = autorPidioTabla
            ? `
        ===== PERMITIR TABLAS =====
        ✔ Puedes usar <table>, <tr>, <td>, <th>
        ✔ Puedes estructurar información en tabla si el autor lo pidió.
        ===========================
        `
                    : `
        ===== RESTRICCIÓN DE TABLAS =====
        ❗ No uses tablas a menos que el autor las haya pedido.
        =============================
        `;

        const bloqueContenidoProtegido = tieneLecturaProtegida ? `
        ===== INSTRUCCIÓN ESPECIAL: CONTENIDO PROTEGIDO =====
        El autor ha incluido contenido (lectura/texto) que NO debe modificarse bajo ninguna circunstancia.
        Este contenido debe ser transcrito EXACTAMENTE como está, sin cambios, sin resúmenes, sin parafrasear.
        NO interpretes, NO analices, NO resumas, NO reescribas este contenido.
        Transcríbelo literalmente manteniendo su formato original.
        El autor verificará que el contenido NO haya sido modificado.
        =========================================================
        ` : "";

        const bloqueInstruccionOriginalEnSalida = incluirInstruccionOriginalEnPropuesta ? `
        ===== FORMATO ESPECIAL REQUERIDO =====
        Debes estructurar la salida por pares, una actividad a la vez.
        ${imagenesInstrucciones.length > 0 ? `
        - Como hay imagen(es) adjunta(s), en la sección "Actividad original" debes TRANSCRIBIR también el texto, ecuaciones, operaciones o consignas visibles en la imagen cuando sean legibles.
        - Si la imagen contiene una fórmula u operación matemática, escríbela dentro de "Actividad original" usando TeX válido.
        - No omitas la información visible relevante de la imagen si forma parte de la actividad base.
        - Si alguna parte de la imagen no se alcanza a leer con certeza, conserva solo lo que sí sea claramente legible y evita inventar texto.
        ` : ""}

        ${cantidadActividadesBase <= 1 ? `
        En este caso solo existe UNA actividad base original.
        NO inventes "Actividad 2 original", "Actividad 3 original" ni similares si no aparecen en las instrucciones.
        Si el autor pidió varias preguntas o ejercicios nuevos a partir de una sola actividad base, usa este patrón:
        ## Actividad original
        [texto original de la actividad base]

        ## Propuestas derivadas
        [aquí van todas las nuevas preguntas derivadas de esa misma actividad base]
        ` : `
        Si existe una sola actividad, usa:
        ## Actividad original
        ## Propuesta actividad
        `}

        Si existen varias actividades, DEBES usar este patrón exacto y repetirlo:
        ## Actividad 1 original
        [texto original de la Actividad 1]

        ## Propuesta Actividad 1
        [propuesta nueva derivada de la Actividad 1]

        ## Actividad 2 original
        [texto original de la Actividad 2]

        ## Propuesta Actividad 2
        [propuesta nueva derivada de la Actividad 2]

        Y así sucesivamente para todas las actividades detectadas.

        Reglas obligatorias:
        - No agrupes todas las actividades originales en un solo bloque.
        - Cada actividad original debe ir inmediatamente seguida por su propuesta correspondiente.
        - Conserva el número y el orden de las actividades originales.
        - Si solo existe una actividad base, todas las propuestas nuevas deben derivarse de esa misma actividad base.
        - No inventes actividades originales inexistentes ni agregues textos como "[No hay contenido para esta actividad...]".
        - No resumas ni reescribas la instrucción original; solo límpiala lo mínimo para presentarla.
        - Si el tipo es Quizz, transforma cada propuesta en reactivos claros y bien estructurados.

        Regla crítica:
        - Primero va la actividad original correspondiente.
        - Después va la propuesta de esa misma actividad.
        - No mezcles actividades entre sí.
        ======================================
        ` : "";

        const bloqueGraficoComplementario = generarGrafico ? `
        ===== GRÁFICO COMPLEMENTARIO (NANO BANANA) =====
        - Este módulo debe quedar preparado para acompañarse con un gráfico o imagen nueva relacionada con la actividad.
        - NO generes código ni instrucciones técnicas para Nano Banana dentro de la salida final.
        - SÍ estructura el contenido para que la actividad pueda referirse de forma natural al gráfico.
        - Cuando el tipo sea Quizz o actividad guiada, puedes usar frases como:
          - "Analiza la imagen anterior y responde."
          - "Observa el gráfico anterior antes de contestar."
          - "Con base en la imagen anterior, selecciona la opción correcta."
        - La referencia a la imagen debe sentirse parte natural de la consigna, sin romper la estructura obligatoria del módulo.
        - Si el módulo es Quizz, mantén intacta la estructura de pregunta, opciones, respuesta correcta y retroalimentaciones.
        - El gráfico debe ser coherente con el tema, el idioma y el nivel pedagógico del módulo.
        ======================================
        ` : "";

        // **🔵 AQUÍ YA ESTÁ CORREGIDO — Usa window.curso**
        const excludedModuleIds = new Set([
            String(moduloId || "").trim(),
            String(modulo?.id || "").trim()
        ].filter(Boolean));
        const contextoCursoCompacto = obtenerContextoCompactoDelCurso(window.curso, 12000, excludedModuleIds);
        const contextoSubtemaCompacto = obtenerContextoCompactoDelSubtema(window.subtemaActivo, 9000, excludedModuleIds);
        const imagenesLimitadas = [];
        let totalInlineChars = 0;
        imagenesInstrucciones.slice(0, 2).forEach((img) => {
            const data = String(img?.data || "").trim();
            if (!data) return;
            if ((totalInlineChars + data.length) > 900000) return;
            totalInlineChars += data.length;
            imagenesLimitadas.push({
                mimeType: img.mimeType,
                data
            });
        });

        const prompt = `
        # CONTEXTO GLOBAL DEL CURSO
        ${contextoCursoCompacto}

        # CONTEXTO DEL SUBTEMA ESPECÍFICO
        ${contextoSubtemaCompacto}

        # GENERAR NUEVO MÓDULO
        Tipo: ${modulo.tipo}
        Nombre: ${modulo.nombre}

        ===== INSTRUCCIONES DEL AUTOR =====
        ${instruccionesParaPrompt || "(Sin instrucciones textuales. Usa la imagen adjunta como referencia principal.)"}
        ${dominioActividad.code === "math" && instruccionesMatematicasNormalizadas !== instruccionesSoloTexto ? `

        ===== NORMALIZACIÓN DE NOTACIÓN MATEMÁTICA =====
        - Interpreta la notación matemática informal del autor usando convención estándar.
        - Ejemplos: x2 => x^2, y2 => y^2.
        - Si una fórmula textual está incompleta o ambigua pero hay imagen adjunta, PRIORIZA la fórmula visible en la imagen.
        - Versión normalizada de apoyo:
        ${instruccionesMatematicasNormalizadas}
        ` : ""}

        ===== PRIORIDAD DE DOMINIO =====
        - El dominio prioritario de ESTA actividad es: ${dominioActividad.label}.
        - ${dominioActividad.instruction}
        - Si el contexto global del curso o del subtema entra en conflicto con esta actividad puntual, PRIORIZA la actividad puntual.
        - No mezcles contenidos de otras materias aunque aparezcan en el contexto del curso.
        ${dominioActividad.code === "math" ? `
        ===== FORMATO STEM OBLIGATORIO =====
        - Escribe ecuaciones, fracciones, potencias y expresiones matemáticas usando notación TeX válida.
        - Encierra expresiones inline entre $...$.
        - Encierra expresiones en bloque entre $$...$$ si ocupan línea propia.
        - Usa potencias como x^2, y^2, a^3; NO escribas x2, y2, a3.
        - Usa fracciones como \\frac{a}{b}; NO escribas 1/x2 si realmente significa 1/(x^2).
        - Si necesitas desigualdades o restricciones, usa comandos TeX válidos como \\neq, \\leq, \\geq.
        - Si el contenido incluye química, usa \\ce{...}. Si incluye unidades físicas, puedes usar \\pu{...}.
        ` : ""}

        ===== PRIORIDAD DE SUBTIPO =====
        - El subtipo prioritario de ESTA actividad es: ${microtipoActividad.label}.
        - ${microtipoActividad.instruction}
        - Si el ejemplo base muestra una operación, expresión o ecuación puntual, genera variantes del MISMO tipo de tarea, no un tema matemático distinto.
        ${anclaMatematica ? `
        ===== ANCLA DEL EJEMPLO BASE =====
        - Usa esta estructura como referencia cercana: ${anclaMatematica.raw}
        - ${anclaMatematica.usesEquality ? "Las nuevas propuestas deben seguir siendo ecuaciones o expresiones con igualdad, no sólo preguntas teóricas." : "Las nuevas propuestas deben mantener el formato operacional del ejemplo."}
        - ${anclaMatematica.usesXY ? "Mantén variables del mismo estilo algebraico, preferentemente x y/o y." : "Mantén el estilo simbólico del ejemplo."}
        - ${anclaMatematica.usesFractions ? "Mantén fracciones algebraicas o términos racionales del mismo tipo, sin pasar a temas más avanzados." : "No añadas racionalidad avanzada que no exista en el ejemplo."}
        - ${anclaMatematica.usesPowers ? "Conserva potencias/cuadrados si aparecen en el ejemplo base." : "No escales a expresiones de grado mayor si el ejemplo no lo exige."}
        - ${anclaMatematica.usesParentheses ? "Conserva una complejidad estructural similar con agrupaciones comparables." : "No aumentes la complejidad estructural sin necesidad."}
        - "Más difícil" significa un poco más de razonamiento dentro de la MISMA familia de ejercicios, no introducir técnicas nuevas como factorización cúbica, división polinómica, asíntotas, límites o funciones avanzadas.
        ` : ""}

        ${imagenesLimitadas.length > 0 ? `
        ===== ANÁLISIS VISUAL OBLIGATORIO =====
        - Hay ${imagenesLimitadas.length} imagen(es) de referencia adjunta(s).
        - Debes analizar esas imágenes antes de redactar el contenido.
        - Si las imágenes muestran ejercicios, problemas, tablas, diagramas o consignas, usa esa información visual para inferir formato, nivel, tema y tipo de actividad.
        - Mantén el MISMO dominio temático de la referencia visual. Si la imagen es de matemáticas, todas las propuestas deben seguir siendo de matemáticas.
        - No describas la imagen en la salida final, úsala para construir actividades nuevas y coherentes.
        - No copies literalmente los reactivos de la imagen; genera variantes nuevas.
        ${preferenciasQuizz.usarImagenComoPatron ? "- La salida debe parecerse al estilo pedagógico de la imagen, pero con contenido nuevo." : ""}
        ${preferenciasQuizz.exigirMayorDificultad ? "- Sube la dificultad respecto al ejemplo visual y evita opciones triviales." : ""}
        ======================================
        ` : ""}

        ${permisoTablas}
        ${bloqueContenidoProtegido}
        ${bloqueInstruccionOriginalEnSalida}
        ${bloqueGraficoComplementario}

        ===== REGLAS PEDAGÓGICAS =====
        ${promptExtraPorTipo(modulo.tipo, {
            cantidadSolicitadaQuizz,
            incluirRespuestas: preferenciasQuizz.incluirRespuestas,
            incluirRetroalimentacion: preferenciasQuizz.incluirRetroalimentacion,
            usarImagenComoPatron: preferenciasQuizz.usarImagenComoPatron,
            exigirMayorDificultad: preferenciasQuizz.exigirMayorDificultad,
            idiomaDetectado: idiomaDetectadoModulo
        })}

        ===== FORMATO DE SALIDA =====
        ${modulo.tipo === "Temario" ? BLOQUE_FORMATO_MOODLE : BLOQUE_FORMATO_MARKDOWN}

        ===== IDIOMA DE SALIDA (OBLIGATORIO) =====
        - Idioma detectado en instrucciones del módulo: ${idiomaDetectadoModulo.label} (${idiomaDetectadoModulo.code}).
        - Devuelve TODO el contenido final en ${idiomaDetectadoModulo.label}.
        - Si el idioma detectado NO es español, NO traduzcas la respuesta al español.
        - Mantén el tono natural del idioma detectado.

        ${modulo.tipo === "Temario"
            ? "DEVUELVE SOLO HTML ESTRUCTURADO PARA EL TEMARIO."
            : "DEVUELVE SOLO MARKDOWN ESTRUCTURADO."}
        ${modulo.tipo === "Temario"
            ? "No conviertas la salida a markdown. Mantén la tabla HTML final."
            : "Si alguna instrucción previa incluye ejemplos en HTML, conviértelos a markdown equivalente."}
        NO menciones que eres IA.
        ${tieneLecturaProtegida ? "⚠️ ADVERTENCIA CRÍTICA: Si el autor incluyó una lectura, NO la modifiques si el autor lo indica. Transcríbela exactamente como está." : ""}
        ${incluirInstruccionOriginalEnPropuesta ? "Debes incluir siempre pares por actividad: 'Actividad N original' y luego 'Propuesta Actividad N'." : ""}
        ${incluirInstruccionOriginalEnPropuesta && cantidadActividadesBase <= 1 ? "Como solo hay una actividad base original, debes mostrar un único bloque de 'Actividad original' y luego todas las propuestas derivadas de esa base." : ""}
        NO repitas contenido existente.
        NO hagas explicaciones.
        `;

        const buildModulePayload = ({ promptText = "", includeImages = true, minimalMode = false } = {}) => ({
            contents: [{
                parts: [
                    { text: promptText },
                    ...(includeImages ? imagenesLimitadas.map((img, index) => ({
                        text: `Imagen de referencia ${index + 1}: analiza su contenido visual y úsalo para generar el módulo.`
                    })) : []),
                    ...(includeImages ? imagenesLimitadas.map((img) => ({
                        inline_data: {
                            mime_type: img.mimeType,
                            data: img.data
                        }
                    })) : [])
                ]
            }],
            ...(minimalMode ? {
                generationConfig: {
                    temperature: 0.6
                }
            } : {})
        });

        let payload = buildModulePayload({
            promptText: prompt,
            includeImages: imagenesLimitadas.length > 0
        });
        let estimatedBytes = estimatePayloadBytes(payload);
        if (estimatedBytes > 100 * 1024) {
            payload = buildModulePayload({
                promptText: prompt,
                includeImages: false
            });
            estimatedBytes = estimatePayloadBytes(payload);
        }

        let { response: res, data } = await geminiGenerateRequest(payload);

        if (res.status === 413) {
            const promptMinimo = `
            # CONTEXTO MÍNIMO
            Tema: ${truncateText(window.temaActivo?.nombre || "Tema general", 180)}
            Subtema: ${truncateText(window.subtemaActivo?.nombre || "Subtema sin nombre", 180)}
            Tipo de módulo: ${truncateText(modulo.tipo || "Recurso", 40)}
            Nombre del módulo: ${truncateText(modulo.nombre || "Sin nombre", 180)}

            # INSTRUCCIONES DEL AUTOR
            ${truncateText(instruccionesSoloTexto || "(Sin instrucciones textuales)", 5000)}

            # REGLAS PEDAGÓGICAS
            ${promptExtraPorTipo(modulo.tipo, {
                cantidadSolicitadaQuizz,
                incluirRespuestas: preferenciasQuizz.incluirRespuestas,
                incluirRetroalimentacion: preferenciasQuizz.incluirRetroalimentacion,
                usarImagenComoPatron: preferenciasQuizz.usarImagenComoPatron,
                exigirMayorDificultad: preferenciasQuizz.exigirMayorDificultad,
                idiomaDetectado: idiomaDetectadoModulo
            })}

            ${incluirInstruccionOriginalEnPropuesta ? `
            # FORMATO ESPECIAL
            ${cantidadActividadesBase <= 1
                ? `Solo existe una actividad base original. Devuelve un único bloque:
            ## Actividad original
            ## Propuestas derivadas
            y coloca ahí todas las preguntas nuevas basadas en esa misma referencia. No inventes actividades originales extra.`
                : `Si detectas varias actividades, devuelve obligatoriamente pares por actividad:
            ## Actividad 1 original
            ## Propuesta Actividad 1
            ## Actividad 2 original
            ## Propuesta Actividad 2
            etc.
            No agrupes todas las originales en una sola sección.`}
            ` : ""}

            ${generarGrafico ? `
            # GRÁFICO COMPLEMENTARIO
            El contenido debe quedar preparado para acompañarse con un gráfico nuevo relacionado con la actividad.
            Si el módulo es Quizz, puedes referirte a la imagen de forma natural, pero sin romper la estructura del cuestionario.
            ` : ""}

            # FORMATO DE SALIDA
            ${modulo.tipo === "Temario" ? BLOQUE_FORMATO_MOODLE : BLOQUE_FORMATO_MARKDOWN}

            # IDIOMA
            Devuelve todo en ${idiomaDetectadoModulo.label} (${idiomaDetectadoModulo.code}).
            No repitas contenido existente.
            ${modulo.tipo === "Temario" ? "Devuelve solo el HTML final de la tabla." : "Devuelve solo el markdown final."}
            `;
            ({ response: res, data } = await geminiGenerateRequest(buildModulePayload({
                promptText: promptMinimo,
                includeImages: false,
                minimalMode: true
            })));
        }

        if (!res.ok) {
            let detalle = "";
            try {
                detalle = data?.error?.message || data?.error || JSON.stringify(data);
            } catch (_) {
                detalle = res.statusText || "Error desconocido del servidor";
            }
            if (res.status === 400 && isGeminiRegionUnsupportedMessage(detalle)) {
                throw new Error("Gemini rechazó la región o IP del backend. La solicitud sí llegó al servidor, pero Google no permite ese origen para la Gemini Developer API.");
            }
            throw new Error(`Gemini HTTP ${res.status}: ${detalle}`);
        }

        let texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        texto = limpiarBloquesCode(texto);
        texto = limpiarRespuestaGemini(texto);

        let contenidoParaGuardar = typeof window.normalizarContenidoModuloPersistible === "function"
            ? window.normalizarContenidoModuloPersistible(texto)
            : typeof window.renderizarContenidoModulo === "function"
                ? window.renderizarContenidoModulo(texto)
            : texto;

        let graficoGeneradoPayload = null;
        if (generarGrafico) {
            try {
                const image = await generarGraficoComplementarioModulo({
                    modulo,
                    cursoId: cursoIdModulo,
                    instrucciones: instruccionesParaPrompt,
                    contenido: contenidoParaGuardar,
                    idioma: idiomaDetectadoModulo
                });
                contenidoParaGuardar = typeof window.normalizarContenidoModuloPersistible === "function"
                    ? window.normalizarContenidoModuloPersistible(combinarContenidoConGrafico(image, contenidoParaGuardar, modulo))
                    : combinarContenidoConGrafico(image, contenidoParaGuardar, modulo);
                graficoGeneradoPayload = {
                    downloadUrl: String(image.downloadUrl || "").trim(),
                    storagePath: String(image.storagePath || "").trim(),
                    mimeType: String(image.mimeType || "image/png").trim() || "image/png",
                    model: String(image.model || "").trim(),
                    promptVersion: String(image.promptVersion || "").trim(),
                    updatedAt: String(image.updatedAt || "").trim(),
                };
            } catch (imageError) {
                console.warn("No se pudo generar el grafico complementario del modulo:", imageError);
                alert(`El contenido se generó, pero el gráfico no se pudo crear.\n${imageError?.message || ""}`);
            }
        }

        // Guardar el HTML decorado para que el estilo persista tras recargar.
        await guardarModulo(moduloId, {
            contenido: contenidoParaGuardar,
            ...(graficoGeneradoPayload ? { graficoGenerado: graficoGeneradoPayload } : {})
        }, cursoIdModulo);
        const moduloGuardado = await obtenerModulo(moduloId, cursoIdModulo);
        const contenidoPersistido = String(moduloGuardado?.contenido || "").trim();
        if (!contenidoPersistido) {
            throw new Error("El contenido generado no quedó persistido en el módulo.");
        }

        // Pintar en UI
        const cont = document.getElementById(`contenido-${moduloId}`);
        if (cont) {
            cont.innerHTML = contenidoParaGuardar;
        }

        const sp = card?.querySelector(".modulo-contenido");
        if (sp) sp.innerHTML = "<p class='text-green-600 text-xs'>✓ Contenido generado</p>";

    } catch (e) {
        console.error("Error en generarModuloGemini:", e);
        alert(`Hubo un error al generar el módulo con IA.\n${e?.message || ""}`);
    } finally {
        if (pendingKey) MODULE_GENERATION_PENDING.delete(pendingKey);
    }
}




/**
 * Llama a Gemini de forma iterativa para obtener contenido largo.
 * - Usa el promptInicial
 * - Si la respuesta se corta, genera un nuevo prompt de continuación
 * - Pega todas las partes en un solo HTML
 */
async function generarContenidoLargoConGemini(promptInicial, maxIter = 5) {
    let acumulado = "";
    let promptActual = promptInicial;

    for (let i = 0; i < maxIter; i++) {
        let response;
        let data;
        
        // INTENTAR MÁXIMO 3 VECES POR FRAGMENTO
        for (let intento = 0; intento < 3; intento++) {
            try {
                ({ response, data } = await geminiGenerateRequest({
                    contents: [{ parts: [{ text: promptActual }] }]
                }));

                // Si es 503, esperar y reintentar
                if (response.status === 503) {
                    await new Promise(resolve => setTimeout(resolve, 2000 * (intento + 1))); // Espera progresiva
                    continue;
                }

                // Si es otro error, lanzar excepción
                if (!response.ok) {
                    throw new Error(String(data?.error?.message || data?.error || `HTTP ${response.status}: ${response.statusText}`));
                }

                break; // Salir del bucle de reintentos si tuvo éxito
                
            } catch (error) {
                if (intento === 2) throw error; // Último intento, lanzar error
                await new Promise(resolve => setTimeout(resolve, 1000 * (intento + 1)));
            }
        }

        let fragmento = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";


        fragmento = limpiarBloquesCode(fragmento);
        fragmento = limpiarRespuestaGemini(fragmento);

        acumulado += (acumulado ? "\n" : "") + fragmento;

        // Si esta parte NO parece cortada, salimos del bucle
        if (!esRespuestaCortadaPorTokens(fragmento)) {
            break;
        }

        // Construir nuevo prompt para continuar
        promptActual = `
            Continúa EXACTAMENTE donde te quedaste.
            NO repitas nada.
            NO cambies el formato.
            Respeta estrictamente:

            ${BLOQUE_FORMATO_MOODLE}

            CONTENIDO HASTA AHORA:
            ${acumulado}
        `;

    }

    return acumulado;
}


async function reformularParrafoConIA(textoOriginal) {
    try {
        const prompt = `
Reformula el siguiente párrafo con un estilo claro, profesional y fluido.
Sin comentarios, sin explicaciones.
Devuelve SOLO el texto reformulado, sin HTML adicional.

=== PÁRRAFO ===
${textoOriginal}
        `;

        const { response, data } = await geminiGenerateRequest({
            contents: [{ parts: [{ text: prompt }] }]
        });
        if (!response.ok) return textoOriginal;

        // Extraer texto seguro
        const nuevo = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || textoOriginal;

        return nuevo;

    } catch (error) {
        return textoOriginal;
    }
}



function promptExtraPorTipo(tipo, options = {}) {
    const cantidadSolicitada = Number(options?.cantidadSolicitadaQuizz || 0) || null;
    const idiomaCode = String(options?.idiomaDetectado?.code || "es").toLowerCase();
    switch (tipo) {
case "Quizz": return `
Genera un CUESTIONARIO (Quizz) en markdown estructurado.

REGLAS:
- Usa secciones por pregunta con encabezado "## Pregunta X — Tipo".
- Respeta EXACTAMENTE la cantidad de preguntas/actividades/reactivos solicitada por el autor si la instrucción la especifica.
- ${cantidadSolicitada
    ? `En este módulo, debes generar EXACTAMENTE ${cantidadSolicitada} preguntas porque el autor sí indicó esa cantidad.`
    : `Si el autor NO indicó una cantidad exacta, no inventes más preguntas de las necesarias. Genera solo las mínimas y razonables según la instrucción.`}
- Solo mezcla tipos si el autor lo pide o si eso ayuda a convertir fielmente las actividades originales, sin aumentar la cantidad total.
- Si existe imagen de referencia, primero ANALIZA su contenido visual y su patrón pedagógico.
- Si la imagen contiene ejercicios de ejemplo, crea ejercicios NUEVOS inspirados en ese mismo estilo, sin copiar literalmente números, opciones ni enunciados.
- No cambies de materia, tema o dominio. Conserva el tema detectado en la referencia y en la instrucción del autor.
- Si la actividad original es matemática, todas las preguntas deben seguir siendo matemáticas aunque el curso o subtema general pertenezcan a otra materia.
- Si la referencia muestra operaciones o ecuaciones algebraicas, las preguntas nuevas deben seguir siendo de ese mismo subtipo: simplificación, equivalencia, resolución o análisis algebraico cercano.
- No escales a otros temas matemáticos más amplios como asíntotas, funciones racionales avanzadas, límites o cálculo, salvo que la actividad original los mencione explícitamente.
- "Más difícil" no significa cambiar de unidad ni introducir técnicas nuevas; significa hacer variantes un poco más retadoras dentro de la misma estructura del ejemplo base.
- Mantén el mismo nivel temático de la referencia visual, pero ${options?.exigirMayorDificultad ? "aumenta claramente la dificultad y evita respuestas obvias." : "conserva una dificultad coherente con la instrucción del autor."}
- ${options?.usarImagenComoPatron ? "La imagen de referencia tiene prioridad para inferir el tipo de ejercicio, la estructura y el nivel de abstracción." : "Usa la imagen solo si aporta contexto real al tipo de ejercicio solicitado."}
- Cada pregunta debe tener:
  - **Pregunta**
  - **Opciones** (si aplica)
  - **Respuesta correcta**
  - **Retroalimentación correcta**
  - **Retroalimentación incorrecta**
  - **Retroalimentación global**
- Cada elemento debe ir en su PROPIA línea o párrafo.
- Deja una línea en blanco entre:
  - el título de la pregunta
  - la línea "Pregunta:"
  - el bloque "Opciones:"
  - la línea "Respuesta correcta:"
  - cada retroalimentación
- Formato obligatorio para opción múltiple:
  Pregunta: ...
  Opciones:
  A) ...
  B) ...
  C) ...
  D) ...
- Formato obligatorio para emparejamiento:
  - Después de "Pregunta:" o "Instrucción:", usa una tabla markdown REAL de dos columnas.
  - La tabla DEBE tener encabezado, fila separadora y una fila por cada relación.
  - Escribe cada expresión o resultado dentro de la MISMA fila; no pongas una fórmula sola en una línea aparte.
  - Usa fórmulas inline dentro de celdas, no display math.
  - Ejemplo válido:
    | Expresión original | Forma simplificada |
    |---|---|
    | $\\frac{x^2-9}{x^2-6x+9}$ | $\\frac{x+3}{x-3}$ |
    | $\\frac{2x-4}{3x-6}$ | $\\frac{2}{3}$ |
- No pongas guiones, bullets, asteriscos ni numeración delante de A), B), C), D).
- Si usas "Verdadero" y "Falso", escríbelos en líneas simples, sin bullets.
- Si usas emparejamiento, presenta dos columnas claras en tabla markdown o lista equivalente.
- No uses HTML.
- No uses texto plano corrido; usa listas y encabezados.
- Si el módulo incluye "Actividad N original" y "Propuesta Actividad N", el encabezado de propuesta debe salir como:
  ## Propuesta Actividad N — Tipo
  y NO debes repetir después otro encabezado separado tipo "## Pregunta N — Tipo".
`;


        case "Página": return `
        Genera una PÁGINA Moodle en markdown estructurado, con contenido didáctico claro.

        CRÍTICAMENTE IMPORTANTE:
        1. Si el autor incluye una lectura con instrucciones explícitas como "no modifiques", "transcribe exactamente", "copia tal cual":
        - NO PARAFRASEES el contenido proporcionado
        - NO RESUMAS el contenido proporcionado
        - NO INTERPRETES el contenido proporcionado
        - TRANSCRIBE EXACTAMENTE el texto proporcionado
        - MANTÉN el formato original si está especificado
        - El contenido protegido debe aparecer IDÉNTICO al original

        2. Para contenido que SÍ debes generar:
        - Título principal
        - Introducción breve (contexto y propósito)
        - Desarrollo del contenido:
            - Explicación clara y concisa
            - Viñetas o listas organizadas
            - Ejemplos concretos
            - Destacar conceptos clave con subtítulos
            - ✅ SE PERMITEN TABLAS para organizar información cuando sea necesario
        - Actividades de reflexión o práctica (2 o 3)

        3. REGLAS DE FORMATO:
        - Usa títulos jerárquicos markdown (#, ##, ###)
        - Usa listas para organizar ideas y pasos
        - Puedes usar tablas markdown cuando aporten claridad
        - El contenido debe ser didáctico y profesional
        - Si hay contenido protegido, intégralo en el lugar apropiado SIN CAMBIARLO

        IMPORTANTE: Si el autor dice "transcribe esta lectura sin modificar", respeta eso completamente.
        NO intentes "mejorar" ni "reformular" el contenido protegido.
        `;

        case "Temario": return `
        Genera un TEMARIO Moodle en una TABLA HTML clara y lista para mostrar en el editor.

        OBJETIVO:
        - Presentar de forma visual el recorrido del subtema como mapa de ruta.
        - Organizar la información principal en columnas, no en párrafos extensos.
        - Permitir lectura rápida tipo syllabus/chapter overview.

        FORMATO OBLIGATORIO:
        - Devuelve SOLO HTML válido.
        - Devuelve una sola tabla principal usando <table>, <thead>, <tbody>, <tr>, <th>, <td>.
        - NO uses markdown.
        - NO uses listas fuera de la tabla.
        - Puedes usar <p> dentro de las celdas para separar ideas.
        - Puedes usar rowspan o colspan si mejora la claridad visual.
        - Si detectas un título de capítulo o unidad, colócalo antes de la tabla con <h2> o <h3>.

        ESTRUCTURA ESPERADA:
        - La tabla debe tener EXACTAMENTE 3 columnas.
        - Usa EXACTAMENTE estos encabezados:
          ${idiomaCode === "en"
            ? `CLIL | Language Arts (Grammar & Vocabulary) | Language Functions (Skills)`
            : `CLIL | Lengua y vocabulario | Funciones del lenguaje y habilidades`}
        - Identifica el tema eje o área CLIL/contenido principal y colócalo en la PRIMERA columna.
        - La primera columna debe contener solo el enfoque CLIL principal, por ejemplo: History, Science, Geography, Arte, Historia.
        - La segunda columna debe contener solo contenidos de lengua: gramática, vocabulario, estructuras, formation, expressions.
        - La tercera columna debe contener solo funciones comunicativas, habilidades o desempeños: hablar, describir, compare, explain, relate, classify.
        - No inventes encabezados alternativos ni abreviados.
        - No mezcles contenidos de gramática/vocabulario dentro de la tercera columna.
        - No mezcles funciones o habilidades dentro de la segunda columna.
        - Si recibes una lista de acciones, decide una por una en qué columna debe ir según su función pedagógica.

        REGLAS:
        - Escribe TODO en el idioma detectado del módulo.
        - Si el texto está en inglés, los encabezados deben estar EXACTAMENTE en inglés.
        - Si el texto está en español, los encabezados deben estar EXACTAMENTE en español.
        - No lo conviertas en cuestionario.
        - No lo conviertas en lectura extensa.
        - No agregues evaluación ni retroalimentaciones.
        - Resume y agrupa la información en celdas compactas, claras y reutilizables.
        - Si existe un título de chapter o chapter focus, colócalo arriba de la tabla en un solo encabezado limpio.
        - En inglés, evita títulos defectuosos como "Chapter 1 The..." si hace falta el separador; usa una forma natural como "Chapter 1 - The Greek Culture" o similar.
        - Devuelve solo el temario final en tabla, limpio y estructurado.
        `;

        case "Lectura": return `
        Genera una LECTURA Moodle en markdown estructurado.

        REGLAS CRÍTICAS:
        - NO inventes contenido nuevo.
        - NO resumas.
        - NO parafrasees.
        - NO cambies palabras ni tono del texto original.
        - NO agregues preguntas, actividades, ejercicios ni conclusiones nuevas.
        - Tu tarea es únicamente TRANSCRIBIR y ESTRUCTURAR el texto proporcionado.
        - Si el texto original ya trae **negritas**, *cursivas*, subtítulos o listas, CONSÉRVALOS.

        DEBES:
        - Conservar literalmente el contenido base.
        - Organizarlo con títulos, subtítulos y párrafos cuando la estructura sea evidente.
        - Mantener listas, tablas, citas o bloques especiales si ya existen en el texto fuente.
        - Corregir solo problemas mínimos de formato para que la lectura sea legible en Moodle.

        FORMATO:
        - Usa encabezados markdown (#, ##, ###) solo cuando correspondan a la estructura del texto original.
        - Usa párrafos limpios y separados.
        - Si el texto original no trae subtítulos, no inventes demasiados.
        - Devuelve solo la lectura estructurada final.
        `;


        case "Libro": return `
        Genera un LIBRO estilo Moodle en markdown con capítulos organizados.
        Incluye lo siguiente:

        1) Estructura:
        - Usa "## Capítulo 1", "## Capítulo 2", etc.

        2) Contenido:
        - Texto explicativo breve y didáctico hasta 3 párrafos medianos.
        - asociar con estudios científicos (si aplica).
        - Texto estructurado con **negritas**, *itálicas*, listas y subtítulos.

        3) Actividades integradas:
        - Al final de cada capítulo, añade la referencia bibliográfica en el que se basó el capítulo en formato APA.

        4) Estilo:
        - Lenguaje claro, natural y pedagógico.
        - No generar rutas alternativas (esta actividad es lineal).
        - No incluir ningún comentario extra de la ia

        Estructura de salida:
        - "## Capítulo X: Título"
        - "### Desarrollo"
        - "### Actividad sugerida"
        - "### Referencias (APA)"
        `;

        case "Lección": return `
        Genera una LECCIÓN estilo Moodle en markdown, estructurada en pantallas con navegación ramificada.
        Incluye:

        1) escenas de Contenido:
        - No hagas comentarios extras de la ia, devuelve solo lo solicitado.

        2) Rutas Alternativas:
        - Crea caminos alternos dependiendo de las decisiones del alumno.
        - Cada opción correcta debe llevar a otra escena (nombrar destino).

        3) Preguntas Interactivas:
        - Cada escena debe tener una pregunta de opción múltiple.
        - Formatos: opción múltiple, verdadero/falso o respuesta corta.
        - Para cada respuesta, especifica el salto correspondiente (ej: “Ir a: Escena 2 - Título de la escena).

        4) Rutas de Refuerzo:
        - Si el alumno se equivoca, debe enviarlo a una pantalla de retroalimentación y luego regresar al inicio.

        5) Escena Final:
        - Mensaje de cierre.
        - Botón “Terminar Lección”.

        Estructura la salida así:
        - "## Escena 1: Título"
        - "### Contenido"
        - "### Pregunta"
        - "### Opciones y salto"
        - "### Retroalimentación"
        - Repetir para escenas siguientes
        - "## Escena final"

        Usa lenguaje claro, didáctico y atractivo.
        Personaliza todo según el tema específico solicitado por el usuario.
        `;

        default: return `
Genera recurso Moodle profesional en markdown estructurado (encabezados, listas y secciones claras).
        `;
    }
}


function obtenerContextoCompletoDelCurso(curso) {
    if (!curso || !curso.temas) return "";

    let texto = "=== CONTEXTO COMPLETO DEL CURSO ===\n\n";

    curso.temas.forEach(tema => {
        texto += `\n\n[Tema: ${tema.nombre}]\n`;

        if (!tema.subtemas || tema.subtemas.length === 0) {
            texto += "  (Este tema no tiene subtemas)\n";
            return;
        }

        tema.subtemas.forEach(sub => {
            texto += `\n  • Subtema: ${sub.nombre}\n`;

            if (sub.instrucciones) {
                texto += `    Instrucciones: ${sub.instrucciones}\n`;
            }

            if (sub.contenidoGenerado) {
                texto += `    Introducción generada:\n${sub.contenidoGenerado}\n`;
            }

            if (sub.modulos && sub.modulos.length > 0) {
                texto += `    Módulos existentes:\n`;

                sub.modulos.forEach(mod => {
                    texto += `
        [${mod.tipo}] ${mod.nombre}
        Instrucciones:
        ${mod.instrucciones || "<sin instrucciones>"}

        Contenido existente:
        ${mod.contenido || "<sin contenido>"}
`;
                });
            } else {
                texto += "    (Este subtema no tiene módulos)\n";
            }
        });
    });

    texto += "\n=== FIN DEL CONTEXTO DEL CURSO ===\n\n";
    return texto;
}

function obtenerContextoCompactoDelCurso(curso, limiteTotal = 12000, excludedModuleIds = new Set()) {
    if (!curso || !Array.isArray(curso.temas)) return "";

    const bloques = ["=== CONTEXTO RESUMIDO DEL CURSO ==="];
    for (const tema of curso.temas.slice(0, 8)) {
        bloques.push(`[Tema] ${truncateText(tema?.nombre || "Sin nombre", 160)}`);
        const subtemas = Array.isArray(tema?.subtemas) ? tema.subtemas.slice(0, 8) : [];
        for (const sub of subtemas) {
            bloques.push(`- Subtema: ${truncateText(sub?.nombre || "Sin nombre", 180)}`);
            const subInstrucciones = truncateText(stripHtmlToText(sub?.instrucciones || ""), 500);
            if (subInstrucciones) bloques.push(`  Instrucciones: ${subInstrucciones}`);
            const intro = truncateText(stripHtmlToText(sub?.contenidoGenerado || ""), 700);
            if (intro) bloques.push(`  Introducción existente: ${intro}`);
            const modulos = Array.isArray(sub?.modulos) ? sub.modulos.slice(0, 4) : [];
            if (modulos.length) {
                bloques.push("  Módulos previos:");
                modulos.forEach((mod) => {
                    if (moduleMatchesExcludedId(mod, excludedModuleIds)) return;
                    const nombre = truncateText(mod?.nombre || "Sin nombre", 140);
                    const tipo = truncateText(mod?.tipo || "Sin tipo", 40);
                    const contenido = truncateText(stripHtmlToText(mod?.contenido || ""), 280);
                    bloques.push(`    - [${tipo}] ${nombre}${contenido ? ` :: ${contenido}` : ""}`);
                });
            }
        }
        const provisional = bloques.join("\n");
        if (provisional.length >= limiteTotal) break;
    }
    return truncateText(`${bloques.join("\n")}\n=== FIN DEL CONTEXTO RESUMIDO ===`, limiteTotal);
}



function obtenerContextoCompletoDelSubtema(subtema) {
    if (!subtema) return "";

    let contexto = "=== CONTEXTO COMPLETO DEL SUBTEMA ===\n\n";

    // Instrucciones generales del subtema
    contexto += `INSTRUCCIONES DEL SUBTEMA:\n${subtema.instrucciones || "<sin instrucciones>"}\n\n`;

    // Contenido generado general
    contexto += `CONTENIDO GENERAL GENERADO:\n${subtema.contenidoGenerado || "<sin contenido general>"}\n\n`;

    // Módulos
    contexto += "=== MÓDULOS EXISTENTES ===\n\n";
    const modulosSubtema = Array.isArray(subtema.modulos) ? subtema.modulos : [];
    if (modulosSubtema.length === 0) {
        contexto += "(No hay módulos cargados en memoria para este subtema)\n";
        if (Array.isArray(subtema.modulosIds) && subtema.modulosIds.length > 0) {
            contexto += `IDs de módulos en el subtema: ${subtema.modulosIds.join(", ")}\n`;
        }
        return contexto;
    }

    modulosSubtema.forEach(mod => {
        contexto += `
[Módulo: ${mod.nombre}]
Tipo: ${mod.tipo}

Instrucciones:
${mod.instrucciones || "<sin instrucciones>"}

Contenido:
${mod.contenido || "<sin contenido>"}

---------------------------------------------
`;
    });

    return contexto;
}

function obtenerContextoCompactoDelSubtema(subtema, limiteTotal = 9000, excludedModuleIds = new Set()) {
    if (!subtema) return "";

    const bloques = [
        "=== CONTEXTO RESUMIDO DEL SUBTEMA ===",
        `Subtema: ${truncateText(subtema?.nombre || "Sin nombre", 200)}`,
    ];

    const instrucciones = truncateText(stripHtmlToText(subtema?.instrucciones || ""), 1200);
    if (instrucciones) bloques.push(`Instrucciones del subtema: ${instrucciones}`);

    const contenidoGeneral = truncateText(stripHtmlToText(subtema?.contenidoGenerado || ""), 1800);
    if (contenidoGeneral) bloques.push(`Contenido general existente: ${contenidoGeneral}`);

    const modulosSubtema = Array.isArray(subtema?.modulos) ? subtema.modulos.slice(0, 6) : [];
    if (modulosSubtema.length) {
        bloques.push("Módulos existentes:");
        modulosSubtema.forEach((mod) => {
            if (moduleMatchesExcludedId(mod, excludedModuleIds)) return;
            const nombre = truncateText(mod?.nombre || "Sin nombre", 160);
            const tipo = truncateText(mod?.tipo || "Sin tipo", 40);
            const instruccionesModulo = truncateText(stripHtmlToText(mod?.instrucciones || ""), 450);
            const contenidoModulo = truncateText(stripHtmlToText(mod?.contenido || ""), 700);
            bloques.push(`- [${tipo}] ${nombre}`);
            if (instruccionesModulo) bloques.push(`  Instrucciones: ${instruccionesModulo}`);
            if (contenidoModulo) bloques.push(`  Contenido: ${contenidoModulo}`);
        });
    } else if (Array.isArray(subtema?.modulosIds) && subtema.modulosIds.length) {
        bloques.push(`IDs de módulos: ${truncateText(subtema.modulosIds.join(", "), 500)}`);
    }

    return truncateText(`${bloques.join("\n")}\n=== FIN DEL CONTEXTO RESUMIDO DEL SUBTEMA ===`, limiteTotal);
}



function limpiarBloquesCode(text = "") {
    if (!text) return "";

    // Quitar bloques tipo ```html ... ```
    return text
        .replace(/```html/gi, "")
        .replace(/```/g, "")
        .trim();
}



function limpiarRespuestaGemini(text = "") {
    if (!text) return "";

    let limpio = text;

    // 1) Limpiar bloques ``` ``` sin tocar HTML interno
    limpio = limpiarBloquesCode(limpio);

    // 2) Eliminar solo spans que NO estén dentro de tablas
    // Conservamos spans dentro de <table>, <tr>, <td>, <th>
    limpio = limpio.replace(
        /(<(?!td|th|tr|table)[^>]*)(<span(?![^>]*color:red)(?![^>]*color:green)[^>]*>)([^<]*)(<\/span>)/gi,
        "$1$3"
    );


    // Por eso filtramos SOLO elementos FUERA de tablas
    limpio = limpio.replace(
        /<(?!table|tr|td|th)(\w+)([^>]*)>/gi,
        (match, tag, attrs) => {
            // Quitar solo class/id/data- de tags no tabulares
            return `<${tag}${attrs}>`;
        }
    );

    // 5) Mantener style="color:red/green" sin tocar style dentro de tablas
    limpio = limpio.replace(
        /<(?!table|tr|td|th)(\w+)([^>]*)style="([^"]*)"/gi,
        (match, tag, attrs, styles) => {
            if (!styles.includes("color:red") && !styles.includes("color:green"))
                return `<${tag}${attrs}>`;
            return match;
        }
    );


    return limpio.trim();
}


/* ============================================================
   HELPERS PARA MANEJAR RESPUESTAS LARGAS / CORTADAS DE GEMINI
============================================================ */

/**
 * Heurística simple para detectar si una respuesta se cortó por tokens.
 */
function esRespuestaCortadaPorTokens(texto = "") {
    if (!texto) return true;

    const t = texto.trim();

    // Termina en CONTINÚA (según lo que pedimos en el prompt)
    if (/CONTINUA$|CONTINÚA$/i.test(t)) return true;

    // Termina de forma rara / incompleta
    if (t.endsWith("...") || t.endsWith(":") || t.endsWith("-")) return true;

    // Respuestas sospechosamente cortas
    if (t.split(/\s+/).length < 10) return true;

    return false;
}





// Exporta las funciones
export { 
    generarContenidoGemini, 
    geminiGenerateRequest,
    getGeminiEndpoint,
    reformularParrafoConIA,
    promptExtraPorTipo,
    obtenerContextoCompletoDelCurso,
    obtenerContextoCompletoDelSubtema,
    limpiarBloquesCode,
    limpiarRespuestaGemini,
    esRespuestaCortadaPorTokens,
    generarContenidoLargoConGemini,
};

if (typeof window !== "undefined") {
    window.generarContenidoGemini = generarContenidoGemini;
}
