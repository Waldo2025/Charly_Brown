/**
 * Servicio de Generación y Gestión de Guiones de Video Educativos para Marcie Blog Editor.
 * Especificaciones estrictas:
 * - Cada escena dura exactamente 8 segundos (0:00–0:08, 0:08–0:16, etc.)
 * - Guion (voz en off): 14 a 17 palabras a lo mucho, oraciones completas con sentido cabal (sin cortes).
 * - Columnas: Escena, Tiempo, Guion, Descripción de escena, Texto en pantalla, Transición, Elemento visual.
 * - Redacción calibrada según el público objetivo (Docentes, Padres, Estudiantes, Coordinadores).
 */

import { parseMarcieJson } from "./marcie-json.js";

async function getGeminiClient() {
  if (typeof window !== "undefined") {
    return import("/charly-brown/gemini-client.js?v=20260923r4");
  }
  return import("../../../charly-brown/gemini-client.js");
}

export const SCENE_DURATION_SECONDS = 8;
export const MIN_VOICEOVER_WORDS = 14;
export const MAX_VOICEOVER_WORDS = 17;

export const VIDEO_AUDIENCE_OPTIONS = Object.freeze([
  {
    id: "educators",
    label: "Docentes y directivos",
    shortLabel: "Docentes",
    description: "Metodologías activas, didáctica de aula y neuroeducación práctica.",
    icon: "users",
    colorClass: "purple",
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200"
  },
  {
    id: "parents",
    label: "Padres y familias",
    shortLabel: "Padres",
    description: "Acompañamiento en el hogar, bienestar socioemocional y crianza positiva.",
    icon: "user-check",
    colorClass: "amber",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200"
  },
  {
    id: "students",
    label: "Estudiantes",
    shortLabel: "Estudiantes",
    description: "Enfoque dinámico, motivador, técnicas de estudio y aplicación cotidiana.",
    icon: "user",
    colorClass: "blue",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200"
  },
  {
    id: "coordinators",
    label: "Coordinadores académicos",
    shortLabel: "Coordinadores",
    description: "Gestión institucional, liderazgo pedagógico, seguimiento curricular y métricas.",
    icon: "network",
    colorClass: "teal",
    badgeClass: "bg-teal-50 text-teal-700 border-teal-200"
  }
]);

export function getVideoAudienceMeta(audienceId = "educators") {
  return VIDEO_AUDIENCE_OPTIONS.find((item) => item.id === audienceId) || {
    id: audienceId,
    label: "Público general",
    shortLabel: audienceId,
    description: "Contenido adaptado para la comunidad educativa.",
    icon: "users",
    colorClass: "teal",
    badgeClass: "bg-teal-50 text-teal-700 border-teal-200"
  };
}

/**
 * Formatea el rango de tiempo de una escena en segundos (cada escena dura exactamente 8 segundos).
 * Escena 1: 0:00–0:08
 * Escena 2: 0:08–0:16
 * Escena 3: 0:16–0:24, etc.
 */
export function formatSceneTime(sceneIndex = 1, duration = SCENE_DURATION_SECONDS) {
  const startSec = Math.max(0, (sceneIndex - 1) * duration);
  const endSec = sceneIndex * duration;
  const fmt = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };
  return `${fmt(startSec)}–${fmt(endSec)}`;
}

/**
 * Cuenta las palabras de un texto.
 */
export function countWords(text = "") {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Valida si el texto de la voz en off cumple con la restricción de 14 a 17 palabras.
 */
export function validateVoiceover(text = "") {
  const count = countWords(text);
  const isIdeal = count >= MIN_VOICEOVER_WORDS && count <= MAX_VOICEOVER_WORDS;
  const isTooLong = count > MAX_VOICEOVER_WORDS;
  const isTooShort = count < MIN_VOICEOVER_WORDS;

  let message = `${count} palabras (óptimo: 14–17)`;
  let status = "ideal";
  if (isTooLong) {
    message = `${count} palabras · Excede el límite de 17`;
    status = "warning-long";
  } else if (isTooShort) {
    message = `${count} palabras · Se sugiere ampliar a 14–17`;
    status = "warning-short";
  }

  return {
    count,
    isIdeal,
    isTooLong,
    isTooShort,
    message,
    status
  };
}

/**
 * Construye el prompt para Gemini asegurando las 7 columnas, estilo formal/científico/educativo y pregunta detonante.
 */
export function buildVideoScriptPrompt({
  topic = "",
  articleTitle = "",
  articleSummary = "",
  audience = "educators",
  audienceLabel = "Docentes",
  sceneCount = 8,
  preferredVocabulary = []
}) {
  const audienceInstructions = {
    educators: "Audiencia: Docentes y directivos escolares. Enfoque: Didáctica fundamentada, neurociencia del aprendizaje, metodologías activas y evaluación formativa. Tono: Rigurosamente formal, académico, científico y pedagógico. OBLIGATORIO: La Escena 1 DEBE abrir con una pregunta detonante pedagógica iniciando con '¿' y terminando con '?'. Queda prohibida cualquier informalidad o coloquialismo.",
    parents: "Audiencia: Padres y familias. Enfoque: Psicología del desarrollo humano, evidencia científica sobre autorregulación y acompañamiento formativo en el hogar. Tono: Formal, reflexivo, científico y educativo. OBLIGATORIO: La Escena 1 DEBE abrir con una pregunta detonante reflexiva iniciando con '¿' y terminando con '?'. Evita modismos casuales o condescendencia.",
    students: "Audiencia: Estudiantes. Enfoque: Procesos metacognitivos, indagación científica, pensamiento crítico y comprensión conceptual profunda. Tono: Formal, estimulante, dinámico e inquisitivo. OBLIGATORIO: La Escena 1 DEBE abrir con una pregunta detonante inquisitiva iniciando con '¿' y terminando con '?'. Evita jergas o lenguaje vulgarizado.",
    coordinators: "Audiencia: Coordinadores académicos y directores. Enfoque: Gestión curricular basada en evidencia, liderazgo pedagógico institucional y análisis científico del aprendizaje. Tono: Formal, ejecutivo, científico e institucional. OBLIGATORIO: La Escena 1 DEBE abrir con una pregunta detonante institucional iniciando con '¿' y terminando con '?'."
  };

  const audienceGuide = audienceInstructions[audience] || audienceInstructions.educators;

  const vocabularyDirective = Array.isArray(preferredVocabulary) && preferredVocabulary.length > 0
    ? `\nVOCABULARIO EDITORIAL PREFERENTE:\nTérminos clave a integrar: ${preferredVocabulary.join(", ")}.\n(Integra de forma natural y pertinente estos términos en la locución o texto en pantalla cuando el tema lo permita, respetando sin excepción el límite estricto de 14 a 17 palabras por escena).\n`
    : "";

  return `Eres un guionista y productor audiovisual educativo senior especializado en divulgación científica y pedagogía académica.
Tu tarea es redactar un GUIÓN DE VIDEO EDUCATIVO con un estilo rigurosamente FORMAL, CIENTÍFICO Y EDUCATIVO según las siguientes directrices obligatorias:

TEMA / INVESTIGACIÓN: "${articleTitle || topic}"
PÚBLICO OBJETIVO: ${audienceLabel} (${audience})
${audienceGuide}
CONTEXTO CIENTÍFICO Y EDUCATIVO: ${articleSummary || topic || "Desarrollo conceptual riguroso del tema"}
${vocabularyDirective}
REGLAS DE TONO Y ESTILO (OBLIGATORIAS):
1. PREGUNTA DETONANTE OBLIGATORIA EN LA ESCENA 1 (APLICA A TODOS LOS PÚBLICOS SIN EXCEPCIÓN):
   - La locución ("voiceover") de la Escena 1 (0:00–0:08) DEBE COMENZAR OBLIGATORIAMENTE CON EL SIGNO '¿' Y TERMINAR CON '?'.
   - ESTA REGLA APLICA RIGUROSAMENTE PARA TODAS LAS AUDIENCIAS: Docentes, Estudiantes, Coordinadores y Padres por igual.
   - PROHIBIDO TERMINANTEMENTE iniciar la Escena 1 con afirmaciones, declaraciones expositivas, definiciones o hechos (ejemplo prohibido: "La sobrecarga cognitiva reduce el aprendizaje...", "El liderazgo pedagógico institucional requiere...").
   - DEBE SER UN CUESTIONAMIENTO DIRECTO de alto nivel científico o pedagógico redactado en exactamente 14 a 17 palabras:
     * Para Docentes: "¿Cómo transformar la sobrecarga cognitiva del aula en un andamiaje didáctico perdurable para el aprendizaje?"
     * Para Coordinadores: "¿Qué indicadores institucionales demuestran con rigor si nuestras decisiones curriculares mejoran el aprendizaje escolar?"
     * Para Estudiantes: "¿Sabías que tu cerebro tiene la capacidad científica de reorganizarse ante cualquier nuevo desafío intelectual?"
     * Para Padres: "¿Cómo acompañar con evidencia científica las funciones ejecutivas de nuestros hijos sin sobreproteger su aprendizaje?"
2. ESTILO FORMAL, CIENTÍFICO Y EDUCATIVO: Emplea un registro formal, académico y pedagógico de alto nivel. Basa el discurso en conceptos claros, evidencia y rigor científico.
3. PROHIBICIÓN TOTAL DE INFORMALIDAD: No uses lenguaje coloquial, saludos informales (PROHIBIDO: "¡Hola a todos!", "¡Qué tal!", "¡Ey!", "¡Bienvenidos!"), frases de relleno casuales ni modismos superficiales.
4. ESTRUCTURA ARGUMENTAL:
   - Escena 1: Pregunta detonante obligatoria formulada con signos '¿' y '?'.
   - Escenas intermedias (2 a ${sceneCount - 1}): Desarrollo de principios científicos, evidencia explicativa y fundamentación didáctica.
   - Escena final (${sceneCount}): Síntesis conclusiva o implicación pedagógica trascendental.

ESPECIFICACIONES TÉCNICAS OBLIGATORIAS:
1. NÚMERO DE ESCENAS: Redacta exactamente ${sceneCount} escenas correlativas (del 1 al ${sceneCount}).
2. TIEMPO FIJO POR ESCENA: Cada escena dura EXACTAMENTE 8 segundos.
   - Escena 1: 0:00–0:08 (Pregunta detonante obligatoria). Inicia con '¿' y termina con '?'.
   - Escena 2: 0:08–0:16
   - Escena 3: 0:16–0:24
   - Escena 4: 0:24–0:32
   - Escena 5: 0:32–0:40
   - Escena 6: 0:40–0:48
   - Escena 7: 0:48–0:56
   - Escena 8: 0:56–1:04
3. GUION (Voz en off del locutor):
   - REQUISITO CRÍTICO DE PALABRAS: Cada escena DEBE tener estrictamente entre 14 y 17 palabras (cuenta con exactitud matemática: mínimo 14, máximo 17 palabras).
   - REQUISITO SINTÁCTICO: Oraciones completas con sentido cabal. NUNCA cortes una frase a la mitad entre escenas. Cada escena cierra una idea completa.
   - ESPAÑOL NEUTRO FORMAL: Español latinoamericano formal y culto (trato de respeto "tú" formal o "usted/ustedes", jamás "vosotros").
4. DESCRIPCIÓN DE ESCENA: Descripción precisa y sobria del encuadre, ambientación académica/científica e iluminación profesional.
5. TEXTO EN PANTALLA: Términos clave o enunciados breves en pantalla (máximo 3 a 5 palabras, conceptuales y rigurosos).
6. TRANSICIÓN: Tipo técnico de transición (ej. "Corte directo", "Disolución cruzada", "Barrido sutil").
7. ELEMENTO VISUAL: Gráficos explicativos, infografías animadas, diagramas científicos o acciones demostrativas concretas.

Devuelve EXCLUSIVAMENTE un objeto JSON válido con la siguiente estructura exacta:
{
  "title": "Título académico formal del video educativo para ${audienceLabel}",
  "audience": "${audience}",
  "audienceLabel": "${audienceLabel}",
  "totalScenes": ${sceneCount},
  "totalDurationSeconds": ${sceneCount * 8},
  "summary": "Sinopsis formal del contenido científico y educativo abordado",
  "scenes": [
    {
      "sceneNumber": 1,
      "time": "0:00–0:08",
      "voiceover": "¿Pregunta detonante formal formulada con rigor científico y exactamente entre catorce y diecisiete palabras?",
      "sceneDescription": "Descripción visual sobria y profesional de la escena, ambientación académica e iluminación natural.",
      "onScreenText": "Pregunta detonante clave",
      "transition": "Corte directo",
      "visualElement": "Infografía o demostración científica que ilustra la interrogante planteada."
    }
  ]
}`;
}

/**
 * Garantiza que la locución de la Escena 1 sea obligatoriamente una pregunta detonante
 * que inicie con '¿' y termine con '?', manteniendo estrictamente entre 14 y 17 palabras.
 */
export function ensureTriggeringQuestion(voiceover = "", audience = "educators") {
  let text = String(voiceover || "").trim();

  const audienceFallbacks = {
    educators: "¿Cómo transformar la sobrecarga cognitiva del aula en un andamiaje didáctico perdurable para el aprendizaje?",
    coordinators: "¿Qué indicadores institucionales demuestran con rigor si nuestras decisiones curriculares mejoran el aprendizaje escolar?",
    students: "¿Sabías que tu cerebro tiene la capacidad científica de reorganizarse ante cualquier nuevo desafío intelectual?",
    parents: "¿Cómo acompañar con evidencia científica las funciones ejecutivas de nuestros hijos sin sobreproteger su aprendizaje?"
  };

  if (!text) {
    return audienceFallbacks[audience] || audienceFallbacks.educators;
  }

  // Si ya es una pregunta completa con ¿ y ?
  if (text.startsWith("¿") && text.endsWith("?")) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length >= 14 && words.length <= 17) {
      return text;
    }
  }

  // Limpiar signos al final y al principio para reformular limpiamente
  let inner = text.replace(/^[¿?¡!.\s]+/, "").replace(/[¿?¡!.\s]+$/, "").trim();

  // Si la frase ya contiene palabras interrogativas al inicio
  const startsWithInterrogative = /^(cómo|qué|por qué|cuál|cuáles|cuándo|dónde|quién|quiénes|de qué manera|es posible|sabías que)\b/i.test(inner);

  let questionText = "";
  if (startsWithInterrogative) {
    questionText = `¿${inner}?`;
  } else {
    // Si era una afirmación (caso observado en docentes, estudiantes, coordinadores)
    const prefixes = {
      educators: "¿Cómo ",
      coordinators: "¿De qué manera ",
      students: "¿Sabías que ",
      parents: "¿Cómo "
    };
    const prefix = prefixes[audience] || "¿Cómo ";
    questionText = `${prefix}${inner.charAt(0).toLowerCase() + inner.slice(1)}?`;
  }

  // Ajustar el conteo de palabras para que esté estrictamente entre 14 y 17 palabras
  let words = questionText.replace(/^¿/, "").replace(/\?$/, "").trim().split(/\s+/).filter(Boolean);

  if (words.length < 14) {
    return audienceFallbacks[audience] || audienceFallbacks.educators;
  }

  if (words.length > 17) {
    const trimmed = words.slice(0, 16).join(" ");
    return `¿${trimmed}?`;
  }

  return `¿${words.join(" ")}?`;
}

/**
 * Normaliza una escena individual garantizando todos los campos y el cálculo de tiempo.
 */
export function normalizeVideoScene(scene = {}, index = 0, audience = "educators", options = {}) {
  const sceneNumber = Number(scene.sceneNumber || index + 1);
  const time = formatSceneTime(sceneNumber, SCENE_DURATION_SECONDS);
  let voiceover = String(scene.voiceover || scene.guion || "").trim();

  // Escena 1 obligatoriamente con pregunta detonante en generación o cuando se solicita explícitamente
  if ((sceneNumber === 1 || index === 0) && options.enforceTriggeringQuestion) {
    voiceover = ensureTriggeringQuestion(voiceover, audience);
  }

  const sceneDescription = String(scene.sceneDescription || scene.descripcionEscena || scene.descripcion_de_escena || "").trim();
  const onScreenText = String(scene.onScreenText || scene.textoEnPantalla || scene.texto_en_pantalla || "").trim();
  const transition = String(scene.transition || scene.transicion || "Corte directo").trim();
  const visualElement = String(scene.visualElement || scene.elementoVisual || scene.elemento_visual || "").trim();

  return {
    sceneNumber,
    time,
    voiceover,
    sceneDescription,
    onScreenText,
    transition,
    visualElement
  };
}

/**
 * Normaliza un objeto de guión de video completo.
 */
export function normalizeVideoScript(script = {}, fallbackAudience = "educators", options = {}) {
  const audience = String(script.audience || fallbackAudience || "educators");
  const meta = getVideoAudienceMeta(audience);
  const rawScenes = Array.isArray(script.scenes) ? script.scenes : [];
  const scenes = rawScenes.map((scene, i) => normalizeVideoScene(scene, i, audience, options));

  return {
    id: String(script.id || `video-script-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    audience,
    audienceLabel: String(script.audienceLabel || meta.label || "Docentes"),
    title: String(script.title || `Guión de video · ${meta.shortLabel}`).trim(),
    topic: String(script.topic || "").trim(),
    summary: String(script.summary || "").trim(),
    totalScenes: scenes.length,
    totalDurationSeconds: scenes.length * SCENE_DURATION_SECONDS,
    durationFormatted: `${scenes.length * SCENE_DURATION_SECONDS}s (${scenes.length} escenas de ${SCENE_DURATION_SECONDS}s)`,
    createdAt: script.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    scenes
  };
}

/**
 * Genera un guión de video para una audiencia específica llamando a Gemini.
 */
export async function generateVideoScriptForAudience({
  topic = "",
  article = null,
  audience = "educators",
  sceneCount = 8,
  preferredVocabulary = [],
  signal = null
}) {
  const meta = getVideoAudienceMeta(audience);
  const articleTitle = article?.title || topic || "Tema educativo";
  const articleSummary = Array.isArray(article?.blocks)
    ? article.blocks
        .filter((b) => b.type === "paragraph" || b.type === "heading")
        .slice(0, 3)
        .map((b) => b.text || b.content || "")
        .filter(Boolean)
        .join(" ")
        .slice(0, 600)
    : "";

  const prompt = buildVideoScriptPrompt({
    topic,
    articleTitle,
    articleSummary,
    audience,
    audienceLabel: meta.label,
    sceneCount,
    preferredVocabulary
  });

  const { generateWithGemini, getConfiguredGeminiModel, DEFAULT_GEMINI_MODEL } = await getGeminiClient();
  const model = getConfiguredGeminiModel() || DEFAULT_GEMINI_MODEL;
  let rawResponse = "";

  try {
    rawResponse = await generateWithGemini({
      model,
      prompt,
      signal,
      thinkingLevel: "LOW",
      payload: {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 16384,
          responseMimeType: "application/json"
        }
      }
    });
  } catch (error) {
    if (error?.finishReason === "MAX_TOKENS" || /MAX_TOKENS/i.test(error?.message || "")) {
      console.warn(`[MarcieVideoScript] MAX_TOKENS alcanzado para ${meta.shortLabel}, reintentando con 32768 tokens...`);
      try {
        rawResponse = await generateWithGemini({
          model,
          prompt,
          signal,
          thinkingLevel: "LOW",
          payload: {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 32768,
              responseMimeType: "application/json"
            }
          }
        });
      } catch (retryErr) {
        console.error(`[MarcieVideoScript] Reintento fallido para audiencia ${audience}:`, retryErr);
        throw new Error(`No se pudo generar el guión para ${meta.shortLabel}: ${retryErr.message}`);
      }
    } else {
      console.error(`[MarcieVideoScript] Error al llamar a Gemini para audiencia ${audience}:`, error);
      throw new Error(`No se pudo generar el guión para ${meta.shortLabel}: ${error.message}`);
    }
  }

  const parsed = parseMarcieJson(rawResponse);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`La respuesta de Gemini para ${meta.shortLabel} no contiene un JSON válido.`);
  }

  const script = normalizeVideoScript({
    ...parsed,
    topic,
    audience,
    audienceLabel: meta.label
  }, audience, { enforceTriggeringQuestion: true });

  return script;
}

/**
 * Genera guiones de video para múltiples audiencias de forma secuencial o paralela controlada.
 */
export async function generateVideoScriptsForAudiences({
  session = {},
  audiences = ["educators"],
  sceneCount = 8,
  preferredVocabulary = null,
  onProgress = null,
  signal = null
}) {
  if (!Array.isArray(audiences) || audiences.length === 0) {
    throw new Error("Debes seleccionar al menos un público objetivo.");
  }

  const results = [];
  const errors = [];
  const topic = session.topic || session.title || "Tema editorial";
  const activeVocab = preferredVocabulary || session.preferredVocabulary || session.sessionConfiguration?.preferredVocabulary || [];

  for (let index = 0; index < audiences.length; index += 1) {
    const audId = audiences[index];
    const meta = getVideoAudienceMeta(audId);
    const article = session.articlesByAudience?.[audId] || session.article || null;

    if (typeof onProgress === "function") {
      onProgress({
        current: index + 1,
        total: audiences.length,
        audienceId: audId,
        audienceLabel: meta.shortLabel,
        message: `Redactando guión para ${meta.shortLabel} (${index + 1} de ${audiences.length})...`
      });
    }

    try {
      const script = await generateVideoScriptForAudience({
        topic,
        article,
        audience: audId,
        sceneCount,
        preferredVocabulary: activeVocab,
        signal
      });
      results.push(script);
    } catch (err) {
      console.warn(`[MarcieVideoScript] Falló la generación para ${audId}:`, err);
      errors.push({ audience: audId, label: meta.shortLabel, error: err.message });
    }
  }

  if (results.length === 0 && errors.length > 0) {
    throw new Error(`No fue posible redactar ningún guión: ${errors.map((e) => `${e.label}: ${e.error}`).join(" | ")}`);
  }

  return {
    scripts: results,
    errors
  };
}

/**
 * Obtiene la lista de guiones de video de una sesión.
 */
export function getSessionVideoScripts(session = {}) {
  if (!session) return [];
  if (Array.isArray(session.videoScripts) && session.videoScripts.length > 0) {
    return session.videoScripts;
  }
  if (session.videoScriptsByAudience && typeof session.videoScriptsByAudience === "object") {
    return Object.values(session.videoScriptsByAudience).filter(Boolean);
  }
  return [];
}

/**
 * Guarda o actualiza un guión dentro de la sesión.
 */
export function upsertVideoScriptInSession(session = {}, script = {}) {
  if (!session || !script?.id) return session;
  const currentScripts = getSessionVideoScripts(session).filter((s) => s.id !== script.id);
  const updatedScripts = [script, ...currentScripts];

  if (!session.videoScriptsByAudience) session.videoScriptsByAudience = {};
  session.videoScriptsByAudience[script.audience || "educators"] = script;
  session.videoScripts = updatedScripts;

  return session;
}

/**
 * Elimina un guión de la sesión.
 */
export function removeVideoScriptFromSession(session = {}, scriptId = "") {
  if (!session || !scriptId) return session;
  const currentScripts = getSessionVideoScripts(session).filter((s) => s.id !== scriptId);
  session.videoScripts = currentScripts;

  if (session.videoScriptsByAudience) {
    for (const [aud, scr] of Object.entries(session.videoScriptsByAudience)) {
      if (scr?.id === scriptId) {
        delete session.videoScriptsByAudience[aud];
      }
    }
  }

  return session;
}

/**
 * Exporta el guión en formato CSV descargable con BOM para Excel.
 */
export function exportVideoScriptToCsv(script = {}) {
  const meta = getVideoAudienceMeta(script.audience);
  const escapeCsv = (str) => `"${String(str || "").replace(/"/g, '""')}"`;

  const headers = [
    "Escena",
    "Tiempo",
    "Guion (Voz en off)",
    "Descripción de escena",
    "Texto en pantalla",
    "Transición",
    "Elemento visual"
  ];

  const rows = (script.scenes || []).map((scene) => [
    escapeCsv(scene.sceneNumber),
    escapeCsv(scene.time),
    escapeCsv(scene.voiceover),
    escapeCsv(scene.sceneDescription),
    escapeCsv(scene.onScreenText),
    escapeCsv(scene.transition),
    escapeCsv(scene.visualElement)
  ]);

  const csvContent = "\uFEFF" + [headers.map(escapeCsv).join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  const safeTitle = (script.title || "guion-video").toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
  link.setAttribute("download", `guion-${meta.id}-${safeTitle}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Genera el texto en formato TSV (para pegar en Excel / Google Sheets) y texto plano.
 */
export function buildVideoScriptClipboardText(script = {}) {
  const headers = ["Escena", "Tiempo", "Guion (Voz en off)", "Descripción de escena", "Texto en pantalla", "Transición", "Elemento visual"];
  const rows = (script.scenes || []).map((scene) => [
    scene.sceneNumber,
    scene.time,
    String(scene.voiceover || "").replace(/[\t\r\n]+/g, " ").trim(),
    String(scene.sceneDescription || "").replace(/[\t\r\n]+/g, " ").trim(),
    String(scene.onScreenText || "").replace(/[\t\r\n]+/g, " ").trim(),
    String(scene.transition || "").replace(/[\t\r\n]+/g, " ").trim(),
    String(scene.visualElement || "").replace(/[\t\r\n]+/g, " ").trim()
  ]);

  const tsv = [headers.join("\t"), ...rows.map((r) => r.join("\t"))].join("\n");
  return tsv;
}

/**
 * Genera la tabla en formato HTML estructurado para que Excel, Google Sheets y Word la reconozcan como tabla con formato.
 */
export function buildVideoScriptHtmlTable(script = {}) {
  const headers = ["Escena", "Tiempo", "Guion (Voz en off)", "Descripción de escena", "Texto en pantalla", "Transición", "Elemento visual"];
  const escapeCell = (val) => String(val || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const scenes = Array.isArray(script.scenes) ? script.scenes : [];

  const rowsHtml = scenes.map((s) => `
    <tr>
      <td style="text-align:center; font-weight:bold; border:1px solid #cbd5e1; padding:6px 10px;">${s.sceneNumber}</td>
      <td style="text-align:center; font-family:monospace; border:1px solid #cbd5e1; padding:6px 10px;">${escapeCell(s.time)}</td>
      <td style="border:1px solid #cbd5e1; padding:6px 10px;">${escapeCell(s.voiceover)}</td>
      <td style="border:1px solid #cbd5e1; padding:6px 10px;">${escapeCell(s.sceneDescription)}</td>
      <td style="border:1px solid #cbd5e1; padding:6px 10px;">${escapeCell(s.onScreenText)}</td>
      <td style="border:1px solid #cbd5e1; padding:6px 10px;">${escapeCell(s.transition)}</td>
      <td style="border:1px solid #cbd5e1; padding:6px 10px;">${escapeCell(s.visualElement)}</td>
    </tr>
  `).join("");

  return `
    <table border="1" style="border-collapse:collapse; font-family:Arial, sans-serif; font-size:12px; border:1px solid #cbd5e1;">
      <thead>
        <tr style="background-color:#f1f5f9; font-weight:bold;">
          ${headers.map((h) => `<th style="border:1px solid #cbd5e1; padding:8px 10px; background-color:#f1f5f9; text-align:left;">${h}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `.trim();
}

/**
 * Copia la tabla completa al portapapeles combinando HTML enriquecido y texto TSV.
 * Esto permite pegar directamente en Excel o Google Sheets manteniendo columnas y formato.
 */
export async function copyVideoScriptTableToClipboard(script = {}) {
  const tsv = buildVideoScriptClipboardText(script);
  const html = buildVideoScriptHtmlTable(script);

  if (typeof navigator !== "undefined" && navigator.clipboard) {
    if (typeof ClipboardItem !== "undefined" && typeof navigator.clipboard.write === "function") {
      try {
        const textBlob = new Blob([tsv], { type: "text/plain" });
        const htmlBlob = new Blob([html], { type: "text/html" });
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": textBlob,
            "text/html": htmlBlob
          })
        ]);
        return true;
      } catch (err) {
        console.warn("[MarcieVideoScript] navigator.clipboard.write falló, intentando writeText:", err);
      }
    }

    if (typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(tsv);
      return true;
    }
  }

  // Fallback tradicional con textarea oculto si clipboard API no está disponible
  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.value = tsv;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (successful) return true;
  }

  throw new Error("No fue posible acceder al portapapeles.");
}
