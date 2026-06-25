import { stripHtml } from "./ui-components.js";

export function buildTeacherNotesPrompt({ activities = [], context = {}, mode = "global" } = {}) {
  const safeActivities = activities.map((item, index) => {
    const html = typeof item === "string" ? item : item?.html || "";
    return `[ACTIVIDAD APROBADA ${index + 1}]\n${html}`;
  }).join("\n\n");
  const session = context.session || context.meta || {};
  const reading = context.reading || {};
  const sya = context.sya || {};
  const syaOriginal = context.syaOriginal || {};
  const usingEditedSya = !!Object.keys(syaOriginal).length && JSON.stringify(syaOriginal) !== JSON.stringify(sya);
  const preferences = Array.isArray(context.preferences) ? context.preferences : [];
  const modeLine = mode === "single"
    ? "Genera notas del maestro para la activity aprobada seleccionada."
    : "Genera notas del maestro para todas las actividades aprobadas.";

  return `
Actúa como editor pedagógico experto en Primaria.
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

Actividades aprobadas:
${safeActivities}

Estructura obligatoria:
1. Orientaciones docentes por actividad, redactadas para usted.
2. Actividad de ampliación.
3. Actividad de refuerzo.
4. Neurología aplicada.
5. Atención a la diversidad y accesibilidad.
6. Respuestas o evidencias esperadas cuando aplique, usando <div class="answer">.

Restricciones:
- No copies las activities del alumno; conviértelas en guía docente.
- Usa lectura y secuencia/alcance si están disponibles.
- Redacta en HTML básico, sin Markdown.
- Mantén tono claro, práctico y accionable.
`.trim();
}

export async function generateTeacherNotes({ activities = [], context = {}, mode = "global", model = "gemini-2.5-flash" } = {}) {
  const prompt = buildTeacherNotesPrompt({ activities, context, mode });
  const { generateWithGemini } = await import("./gemini-client.js");
  const html = await generateWithGemini({ model, prompt });
  return { html, prompt, mode };
}
