import { generateWithGemini } from "./gemini-client.js";
import { buildActivityContractPrompt, getProjectMethodology, getProjectPhases, isProjectSelection, normalizeActivityHtml, validateActivityHtml } from "./unit-contracts.js";
import { stripHtml } from "./ui-components.js";
import { describeSyaSelection, getFocusedSya, getSyaGroupedByCategory, hasAllSelection } from "./sya-service.js";

export function buildReadingPrompt({ meta = {}, userText = "" } = {}) {
  return `
Genera una lectura completa para Primaria.
Grado: ${meta.grade || ""}
Trimestre: ${meta.trimester || ""}
Unidad: ${meta.unit || ""}
Tema o petición del usuario: ${userText || "tema adecuado para la unidad"}

Devuelve HTML simple con un título, párrafos completos y cierre. No cortes la lectura a media oración. Incluye 5 preguntas de comprensión con respuesta esperada.
`.trim();
}

export function buildActivitiesPrompt({ session = {}, userText = "", resourceSelections = {} } = {}) {
  const meta = session.meta || {};
  const reading = session.accepted?.reading || session.reading || null;
  const sya = session.accepted?.sya || session.sya || null;
  const focusedSya = getFocusedSya(meta, sya || {});
  const groupedSya = getSyaGroupedByCategory(meta, sya || {});
  const projectRules = buildProjectRules(meta);
  const resourceBlock = buildResourceBlock(resourceSelections, session);
  const contract = buildActivityContractPrompt({
    grade: meta.grade,
    category: meta.category,
    subtopic: meta.subtopic,
    difficulty: meta.difficulty,
    relateToReading: meta.relateToReading
  });
  return `
${contract}

Datos de la unidad:
- Tipo: ${meta.mode}
- Nivel: ${meta.level}
- Grado: ${meta.grade}
- Trimestre: ${meta.trimester}
- Unidad: ${meta.unit}
- Categoría: ${meta.category || ""}
- Subtema: ${meta.subtopic || ""}
- Edición: ${meta.edition}

Lectura:
${reading ? `${reading.title || ""}\n${stripHtml(reading.html || reading.text || "")}` : "Sin lectura aprobada."}

Secuencia y alcance del subtema actual:
${buildSyaPromptBlock(meta, focusedSya, groupedSya)}

Recursos seleccionados para integrar en la propuesta:
${resourceBlock}

Regla de recursos:
- Si un recurso está activado, debes generarlo como bloque propio y visible dentro del HTML final.
- Usa rótulos claros tipo "Ficha ${resolveUnitCode(meta)}a", "Anexo ${resolveUnitCode(meta)}a", "Recortable ${resolveUnitCode(meta)}a" y "Video ${resolveUnitCode(meta)}a" según corresponda.
- Cada recurso debe poder aceptarse o rechazarse como parte de la propuesta.
- No lo escondas dentro de un párrafo genérico.
- Los recursos son complementos: nunca sustituyen la creación de activities.
- Aunque el usuario elija recursos, debes devolver al menos un bloque <div class="activity"> completo y válido.
- Presenta las activities y los recursos en bloques separados. No mezcles el HTML de un recurso dentro de la activity.
- Si incluyes recursos, menciona el material dentro de la instrucción de la activity, por ejemplo: "Usa la Ficha 1a..." o "Apóyate en el Recortable 2b...".
- Los anexos son recursos visuales y complementarios.
- Las fichas son actividades complementarias; pueden relacionarse con la lectura o con la secuencia y alcance.
- Si el recurso activado es Recortable, la activity debe invitar a usarlo de forma dinámica dentro del ejercicio, integrándolo como parte del trabajo práctico y no como una simple mención.
- Si el recurso activado es Recortable, la activity debe dejar un espacio visible debajo para que el alumno pegue o acomode el recortable en su trabajo.
- Incluye una indicación clara como "Pega aquí tu recortable" o equivalente, sin volver mecánica la actividad.
- Evita ejercicios mecánicos o aislados; prioriza propuestas divertidas, educativas y aplicadas al contenido.
- Si el recurso activado es Video, debes devolver una tabla de guión creativo del video con columnas fijas: Escena, Tiempo, Voz en off, Elemento visual, Texto en pantalla y Transición.
- La voz en off de cada escena debe tener entre 12 y 17 palabras.
- El elemento visual debe describir con precisión qué se ve en pantalla, de forma concreta y accionable.
- Cada fila del guión de video debe ser una escena distinta y completa.

Regla pedagógica:
- Antes de diseñar las activities, analiza primero esa secuencia y alcance y asegúrate de que las actividades cubran explícitamente T, AE, C y P de la selección activa.
- Si Categoría o Subtema está en "Todos", genera activities distribuidas por cada categoría/subtema visible en la secuencia y alcance filtrada.
- No cambies de tema, categoría ni subtema fuera de la selección activa.
- Si la lectura no coincide por completo, adapta las activities para seguir enseñando el S&A activo.
${projectRules}

Preferencias aprendidas:
${(session.preferences || []).map((item) => `- ${item}`).join("\n") || "- Sin preferencias."}

Petición actual:
${userText || "Genera activities útiles para esta unidad."}
`.trim();
}

export function buildRefineActivitiesPrompt({ session = {}, currentHtml = "", difficulty = "normal", userText = "" } = {}) {
  const meta = session.meta || {};
  const reading = session.accepted?.reading || session.reading || null;
  const sya = session.accepted?.sya || session.sya || null;
  const focusedSya = getFocusedSya(meta, sya || {});
  const groupedSya = getSyaGroupedByCategory(meta, sya || {});
  const projectRules = buildProjectRules(meta);
  const currentActivityCount = countActivityBlocks(currentHtml);
  const contract = buildActivityContractPrompt({
    grade: meta.grade,
    category: meta.category,
    subtopic: meta.subtopic,
    difficulty,
    relateToReading: meta.relateToReading
  });
  const difficultyGuide = difficulty === "challenging" || difficulty === "expert"
    ? [
        "Haz la misma propuesta claramente más difícil sin cambiar el tema central.",
        "Conserva el mismo subtema, el mismo aprendizaje y la misma intención didáctica.",
        "No simplifiques la estructura.",
        "Aumenta el reto con distractores plausibles, opciones múltiples con una sola respuesta correcta, comparación fina, inferencia, justificación y selección entre respuestas cercanas.",
        "Si usas opción múltiple, incluye respuestas confusas pero defendibles, manteniendo una correcta."
      ].join("\n- ")
    : [
        "Haz la misma propuesta más fácil y más guiada.",
        "Conserva el mismo subtema y aprendizaje.",
        "Reduce carga cognitiva, divide pasos y da apoyos más directos."
      ].join("\n- ");

  return `
${contract}

Tu tarea NO es crear una unidad nueva. Debes refinar la propuesta actual.

Datos de la unidad:
- Tipo: ${meta.mode}
- Nivel: ${meta.level}
- Grado: ${meta.grade}
- Trimestre: ${meta.trimester}
- Unidad: ${meta.unit}
- Categoría: ${meta.category || ""}
- Subtema: ${meta.subtopic || ""}

Lectura:
${reading ? `${reading.title || ""}\n${stripHtml(reading.html || reading.text || "")}` : "Sin lectura aprobada."}

Secuencia y alcance del subtema actual:
${buildSyaPromptBlock(meta, focusedSya, groupedSya)}

Propuesta actual a refinar:
${currentHtml}

Instrucciones de dificultad:
- ${difficultyGuide}
${projectRules}

Importante sobre el bloque actual:
- El contenido a refinar incluye ${currentActivityCount} bloque(s) .activity.
- Debes conservar TODOS los bloques existentes y refinarlos uno por uno en el mismo orden.
- No devuelvas solo la primera activity.
- No elimines fases, preguntas ni respuestas esperadas.
- Si el proyecto tiene varias fases, cada fase debe seguir presente después del refinamiento.
- Si existen recursos asociados, también deben permanecer como bloques separados y visibles.

Petición adicional:
${userText || "Refina la propuesta sin cambiar el contenido base."}

Devuelve solo el HTML final refinado.
`.trim();
}

export function buildChatPrompt({ session = {}, userText = "" } = {}) {
  const meta = session.meta || {};
  const reading = session.accepted?.reading || session.reading || null;
  const sya = session.accepted?.sya || session.sya || null;
  const messages = (session.messages || [])
    .slice(-12)
    .map((message) => `${message.role === "user" ? "Usuario" : "Asistente"}: ${stripHtml(message.text || message.html || "")}`)
    .join("\n");

  return `
Eres Charly Brown, un editor conversacional para crear unidades de Primaria.
Responde al usuario siguiendo el hilo de la conversación. No generes HTML de activities ni propuestas formales a menos que el usuario lo pida explícitamente.
Si el usuario pregunta, explica o guía. Si pide cambiar una preferencia, confirma el ajuste. Si falta contexto, pide solo el dato necesario.

Datos de sesión:
- Tipo: ${meta.mode}
- Nivel: ${meta.level}
- Grado: ${meta.grade}
- Trimestre: ${meta.trimester}
- Unidad: ${meta.unit}
- Categoría: ${meta.category || ""}
- Subtema: ${meta.subtopic || ""}
- Edición: ${meta.edition}
- Dificultad: ${meta.difficulty}
- Relacionar con lectura: ${meta.relateToReading ? "sí" : "no"}

Lectura actual:
${reading ? `${reading.title || ""}\n${stripHtml(reading.html || reading.text || "").slice(0, 8000)}` : "Sin lectura seleccionada."}

Secuencia y alcance:
${JSON.stringify(sya || {}, null, 2)}

Preferencias aprendidas:
${(session.preferences || []).map((item) => `- ${item}`).join("\n") || "- Sin preferencias."}

Conversación reciente:
${messages || "Sin mensajes previos."}

Mensaje actual del usuario:
${userText}
`.trim();
}

function buildSyaPromptBlock(meta = {}, focusedSya = {}, groupedSya = []) {
  const selection = describeSyaSelection(meta);
  const hasAll = hasAllSelection(meta.category) || hasAllSelection(meta.subtopic);
  if (!hasAll && focusedSya?.subtopic) {
    return [
      `- Selección activa: ${selection}`,
      `- Categoría activa: ${focusedSya.category || meta.category || ""}`,
      `- Subtema activo: ${focusedSya.subtopic || meta.subtopic || ""}`,
      `- Tema (T): ${focusedSya.fields?.T || "No disponible"}`,
      `- Aprendizaje esperado (AE): ${focusedSya.fields?.AE || "No disponible"}`,
      `- Contenido (C): ${focusedSya.fields?.C || "No disponible"}`,
      `- Proceso o práctica (P): ${focusedSya.fields?.P || "No disponible"}`
    ].join("\n");
  }

  const lines = groupedSya.flatMap((group) => group.items.map((item) => [
    `- ${group.category} / ${item.subtopic}`,
    `  T: ${item.fields?.T || "No disponible"}`,
    `  AE: ${item.fields?.AE || "No disponible"}`,
    `  C: ${item.fields?.C || "No disponible"}`,
    `  P: ${item.fields?.P || "No disponible"}`
  ].join("\n")));

  return [
    `- Selección activa: ${selection}`,
    lines.length ? lines.join("\n") : "- No hay S&A visible para la selección activa."
  ].join("\n");
}

function buildProjectRules(meta = {}) {
  if (!isProjectSelection(meta)) return "";
  const methodology = getProjectMethodology(meta.trimester);
  const phases = getProjectPhases(meta.trimester);
  return [
    "",
    "Reglas obligatorias para proyecto:",
    `- Como el subtema/categoría activa es Proyectos, genera un proyecto trimestral con metodología ${methodology}.`,
    `- El trimestre ${meta.trimester || "1"} corresponde a la metodología ${methodology}.`,
    `- Desarrolla el proyecto por fases en este orden: ${phases.join(" | ")}.`,
    "- Cada fase debe incluir activities con la misma estructura .activity del editor.",
    "- Integra lectura y secuencia y alcance al mismo tiempo; ninguna sustituye a la otra.",
    "- Si hay lectura disponible, reutilízala como detonante real del proyecto y no como decoración.",
    "- Mantén foco en el subtema Proyectos y en los T/AE/C/P del contexto activo."
  ].join("\n");
}

function countActivityBlocks(html = "") {
  return String(html || "").match(/class=["'][^"']*\bactivity\b[^"']*["']/gi)?.length || 0;
}

export async function generateReading({ session = {}, userText = "", model = "gemini-2.5-flash" } = {}) {
  const prompt = buildReadingPrompt({ meta: session.meta, userText });
  const html = await generateWithGemini({ model, prompt });
  return { title: extractTitle(html) || "Lectura generada", html, prompt };
}

export async function generateActivities({ session = {}, userText = "", model = "gemini-2.5-flash", resourceSelections = {} } = {}) {
  const prompt = buildActivitiesPrompt({ session, userText, resourceSelections });
  const rawHtml = await generateWithGemini({ model, prompt });
  let html = normalizeActivityHtml(rawHtml);
  let validation = validateActivityHtml(html);
  if (!validation.ok) {
    const retryPrompt = `${prompt}\n\nREINTENTO OBLIGATORIO:\n- Devuelve al menos un bloque <div class="activity"> completo y válido.\n- Conserva la estructura .activity, ol.steps.steps-numbered y .answer.\n- Si además hay recursos seleccionados, inclúyelos como bloques adicionales, pero no elimines las activities.\n- No devuelvas únicamente fichas, anexos, recortables o guiones de video.`;
    html = normalizeActivityHtml(await generateWithGemini({ model, prompt: retryPrompt }));
    validation = validateActivityHtml(html);
  }
  return {
    html,
    prompt,
    validation
  };
}

function buildResourceBlock(resourceSelections = {}, session = {}) {
  const labels = [
    ["fichas", "Fichas"],
    ["anexos", "Anexos"],
    ["recortables", "Recortables"],
    ["videos", "Guión de video"]
  ];
  const counts = buildResourceTypeCounts(session);
  const active = labels
    .filter(([key]) => Boolean(resourceSelections[key]))
    .map(([key, label]) => `- ${label} (${buildResourceCode(session.meta || {}, key, counts[key] || 0)})`);
  if (!active.length) return "- Sin recursos adicionales seleccionados.";
  return active.join("\n");
}

function buildResourceTypeCounts(session = {}) {
  const counts = { fichas: 0, anexos: 0, recortables: 0, videos: 0 };
  const accepted = Array.isArray(session.accepted?.resources) ? session.accepted.resources : [];
  accepted.forEach((resource) => {
    const type = normalizeResourceType(resource.type || resource.context || resource.title || "");
    if (type === "ficha") counts.fichas += 1;
    if (type === "anexo") counts.anexos += 1;
    if (type === "recortable") counts.recortables += 1;
    if (type === "video") counts.videos += 1;
  });
  return counts;
}

function buildResourceCode(meta = {}, resourceKey = "", count = 0) {
  const unit = resolveUnitCode(meta);
  const suffix = String.fromCharCode(97 + Math.max(0, count));
  const label = resourceKey === "anexos" ? "Anexo" : resourceKey === "recortables" ? "Recortable" : resourceKey === "videos" ? "Video" : "Ficha";
  return `${label} ${unit}${suffix}`;
}

function resolveUnitCode(meta = {}) {
  const raw = String(meta.unit || "").trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : raw || "1";
}

function normalizeResourceType(value = "") {
  const text = String(value || "").toLowerCase();
  if (text.includes("ficha")) return "ficha";
  if (text.includes("anexo")) return "anexo";
  if (text.includes("recortable")) return "recortable";
  if (text.includes("video") || text.includes("guion")) return "video";
  return "";
}

export async function refineActivities({ session = {}, currentHtml = "", difficulty = "normal", userText = "", model = "gemini-2.5-flash" } = {}) {
  const prompt = buildRefineActivitiesPrompt({ session, currentHtml, difficulty, userText });
  const rawHtml = await generateWithGemini({ model, prompt });
  let html = normalizeActivityHtml(rawHtml);
  const originalCount = countActivityBlocks(currentHtml);
  const nextCount = countActivityBlocks(html);
  if (originalCount > 1 && nextCount < originalCount) {
    const retryPrompt = `${prompt}\n\nREINTENTO OBLIGATORIO:\n- El HTML devuelto debe conservar exactamente ${originalCount} bloques .activity.\n- Reescribe todos los bloques existentes y no omitas ninguno.\n- Si hace falta, reproduce cada fase con su propia instrucción y respuestas esperadas.\n- No regreses una sola activity parcial.`;
    html = normalizeActivityHtml(await generateWithGemini({ model, prompt: retryPrompt }));
  }
  return {
    html,
    prompt,
    validation: validateActivityHtml(html)
  };
}

export async function generateChatReply({ session = {}, userText = "", model = "gemini-2.5-flash" } = {}) {
  const prompt = buildChatPrompt({ session, userText });
  const text = await generateWithGemini({ model, prompt });
  return { text, prompt };
}

export function extractTitle(html = "") {
  const match = String(html || "").match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  return match ? stripHtml(match[1]) : "";
}
