import { stripHtml } from "./ui-components.js";
import { buildVocabularyPromptDirective } from "./vocabulary-service.js";
import { getInternalPrompts } from "./prompts-service.js";

export function buildTeacherNotesPrompt({ activities = [], context = {}, mode = "global" } = {}) {
  const itemLabel = mode === "resource" ? "RECURSO APROBADO" : "ACTIVIDAD APROBADA";
  const safeActivities = activities.map((item, index) => {
    const html = typeof item === "string" ? item : item?.html || "";
    return `[${itemLabel} ${index + 1}]\n${html}`;
  }).join("\n\n");
  const session = context.session || context.meta || {};
  const reading = context.reading || {};
  const sya = context.sya || {};
  const syaOriginal = context.syaOriginal || {};
  const usingEditedSya = !!Object.keys(syaOriginal).length && JSON.stringify(syaOriginal) !== JSON.stringify(sya);
  const preferences = Array.isArray(context.preferences) ? context.preferences : [];
  const modeLine = mode === "resource"
    ? `Genera notas del maestro para el recurso aprobado seleccionado (${context.resourceType || "recurso"}).`
    : mode === "single"
      ? "Genera notas del maestro para la actividad aprobada seleccionada."
      : "Genera notas del maestro para todas las actividades aprobadas.";

  const vocabDirective = buildVocabularyPromptDirective({ target: "teacher" });
  const teacherNotesDirective = getInternalPrompts().teacherNotes;

  return `
Actúa como editor pedagógico experto en Primaria y redacta las Notas del Maestro para la guía docente.
${modeLine}

Contexto de unidad:
- Tipo: ${session.mode || "Maestro"}
- Nivel: ${session.level || "Primaria"}
- Grado: ${session.grade || ""}
- Trimestre: ${session.trimester || ""}
- Unidad: ${session.unit || ""}
- Categoría: ${session.category || ""}
- Subtema: ${session.subtopic || ""}
- Edición: ${session.edition || ""}

Lectura disponible:
Título: ${reading.title || "Sin lectura aprobada"}
Contenido: ${stripHtml(reading.html || reading.text || "") || "Sin lectura aprobada"}

Secuencia y alcance disponible:
${usingEditedSya ? "La sesión tiene una secuencia editada por el usuario. Usa esa versión como fuente principal y conserva la original solo como referencia secundaria.\n" : ""}
${JSON.stringify(sya || {}, null, 2)}
${usingEditedSya ? `\nSecuencia original de referencia:\n${JSON.stringify(syaOriginal || {}, null, 2)}` : ""}

Preferencias aprendidas de esta sesión:
${preferences.length ? preferences.map((item) => `- ${item}`).join("\n") : "- Sin preferencias adicionales."}

Contenido curricular aprobado:
${safeActivities}

REDACCIÓN Y ESTILO OBLIGATORIO:
- Escribe en segunda persona dirigida al docente (usted) con verbos de acción directos (ej. "Anime", "Guíe", "Pida", "Observe", "Modele", "Explique").
- PROHIBIDO redactar en tercera persona. No uses fórmulas como "el maestro...", "la maestra..." o "el docente...".
- Tono profesional, práctico, natural y accionable de un docente mexicano con experiencia. Evita frases de asistente y conclusiones de relleno.
- Genera HTML limpio y semántico usando exclusivamente encabezados <h3>, párrafos <p>, negritas <strong> y <div class="answer"> cuando aplique evidencia o respuestas.
- PROHIBIDO incluir etiquetas HTML de iconos (como <i> o similares) o etiquetas de tokens [IC ...].

${vocabDirective ? `${vocabDirective}\n` : ""}
${teacherNotesDirective ? `DIRECTRICES INTERNAS CONFIGURABLES:\n${teacherNotesDirective}\n` : ""}
TÍTULO Y ESTRUCTURA OBLIGATORIOS:
- Cada nota debe llevar como único encabezado <h3> el título exacto de la actividad del alumno correspondiente. Si comienza con "Actividad:" o "Actividad 1:", elimina solo ese prefijo; conserva el resto del título sin inventar palabras.
- Para notas de recurso, usa el título del recurso aprobado como único encabezado.
- No uses encabezados genéricos o inventados como "Orientaciones metodológicas por actividad", "Actividad General", "Actividad de ampliación" ni "Actividad de refuerzo".
- Bajo ese único encabezado, integra en párrafos continuos la presentación, modelado, desarrollo guiado, verificación del aprendizaje, ampliación y refuerzo que apliquen. No añadas subtítulos ni etiquetas para estas partes.
- Si la actividad incluye recursos complementarios (anexo, recortable o video), indica de forma natural en qué momento se usan y cómo se median.
- REGLA DE RECORTABLES: Si la actividad cuenta con un recortable asignado, integra dentro de los párrafos de esta misma nota del maestro las orientaciones pedagógicas del recortable (momento de recortar, técnica manipulativa, mediación para pegar las piezas en la actividad y la verificación o producto esperado). NUNCA crees una nota del maestro separada para recortables.
- No incluyas la sección "Notas pedagógicas exclusivas para Fichas (una ficha por página)" en la nota de actividad.
- Para una solicitud global, entrega una sección por actividad aprobada y conserva sus títulos exactos y su orden.

Entrega exclusivamente el código HTML con las secciones indicadas, sin Markdown ni bloques de código de triple comilla.
`.trim();
}

function normalizeTeacherNotesHeadings(html = "", activities = []) {
  if (typeof DOMParser === "undefined") return String(html || "");
  const doc = new DOMParser().parseFromString(`<div>${String(html || "")}</div>`, "text/html");
  const root = doc.body.firstElementChild || doc.body;
  const approvedTitles = new Set(activities.map((item) => {
    if (typeof item === "string") return "";
    const title = String(item?.title || "").replace(/^Actividad(?:\s+\d+)?\s*[:\-–—]\s*/i, "").trim();
    return title.toLocaleLowerCase("es");
  }).filter(Boolean));

  // El título exacto de la actividad es el único encabezado permitido en cada nota.
  root.querySelectorAll("h1, h2, h4, h5, h6").forEach((heading) => heading.remove());
  root.querySelectorAll("h3").forEach((heading) => {
    const title = heading.textContent.replace(/\s+/g, " ").trim().toLocaleLowerCase("es")
      .replace(/^actividad(?:\s+\d+)?\s*[:\-–—]\s*/i, "");
    const generic = /^(orientaciones?|notas?|gu[ií]a|desarrollo|preparaci[oó]n|modelado|verificaci[oó]n|ampliaci[oó]n|refuerzo)(\b|\s)/i.test(title);
    if (generic || (approvedTitles.size && !approvedTitles.has(title))) heading.remove();
  });
  return root.innerHTML;
}

export async function generateTeacherNotes({ activities = [], context = {}, mode = "global", model = "gemini-3.8-flash" } = {}) {
  const prompt = buildTeacherNotesPrompt({ activities, context, mode });
  const { generateWithGemini } = await import("./gemini-client.js");
  const draftHtml = await generateWithGemini({ model, prompt, thinkingLevel: "HIGH" });
  const { reviewGeneratedContent } = await import("./unit-generator.js");
  const reviewedHtml = await reviewGeneratedContent({ html: draftHtml, model });
  const html = normalizeTeacherNotesHeadings(reviewedHtml, activities);
  return { html, prompt, mode, styleReview: { applied: html !== draftHtml, voice: "docente-mexicano-natural" } };
}
