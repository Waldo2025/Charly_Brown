import { generateWithGemini } from "./gemini-client.js";
import { buildActivityContractPrompt, getProjectMethodology, getProjectPhases, isProjectSelection, isTracingLettersSelection, normalizeActivityHtml, validateActivityHtml } from "./unit-contracts.js";
import { stripHtml } from "./ui-components.js";
import { describeSyaSelection, getFocusedSya, getSyaGroupedByCategory, hasAllSelection } from "./sya-service.js";
import { getInternalPrompts } from "./prompts-service.js";
import { buildVocabularyPromptDirective } from "./vocabulary-service.js";

export function buildActivityReadingContext(reading = null) {
  if (!reading) return { title: "", narrative: "Sin lectura aprobada.", supportingMaterial: "Sin material complementario." };
  const sections = reading.sections || {};
  const narrativeSource = sections.narrativeHtml || reading.narrativeHtml || reading.text || reading.html || "";
  const synonyms = Array.isArray(sections.synonyms)
    ? sections.synonyms.map((item) => typeof item === "string" ? item : `${item.palabra || item.word || ""}: ${item.sinonimo || item.synonym || ""}`).filter(Boolean).join(" | ")
    : stripHtml(sections.synonymsHtml || "");
  const questions = Array.isArray(sections.questions || reading.questions)
    ? (sections.questions || reading.questions).map((item) => typeof item === "string" ? item : item.texto || item.pregunta || item.prompt || item.text || "").filter(Boolean).join(" | ")
    : stripHtml(sections.questionsHtml || "");
  return {
    title: String(reading.title || "Lectura de la unidad").trim(),
    narrative: stripHtml(narrativeSource).slice(0, 18000) || "La lectura no contiene texto narrativo utilizable.",
    supportingMaterial: [synonyms && `Sinónimos: ${synonyms}`, questions && `Preguntas de comprensión: ${questions}`].filter(Boolean).join("\n").slice(0, 5000) || "Sin material complementario."
  };
}

export function buildReadingPrompt({ meta = {}, userText = "", readingStage = "reading", reading = null } = {}) {
  const internalPrompts = getInternalPrompts();
  const base = `
Nivel: ${meta.level || "Primaria"}
Grado: ${meta.grade || ""}
Trimestre: ${meta.trimester || ""}
Unidad: ${meta.unit || ""}
Tema o petición del usuario: ${userText || "tema adecuado para la unidad"}
`.trim();
  if (readingStage === "synonyms") return `
Prepara únicamente la tabla de sinónimos para la lectura siguiente.
${base}

LECTURA:
${stripHtml(reading?.html || reading?.text || "")}

${internalPrompts.synonymsProfile || ""}
`.trim();
  if (readingStage === "comprehension") return `
Prepara únicamente las preguntas de comprensión para la lectura siguiente.
${base}

LECTURA:
${stripHtml(reading?.html || reading?.text || "")}

${internalPrompts.comprehensionProfile || ""}
`.trim();
  return `
Genera la lectura narrativa para un libro escolar.
${base}
${internalPrompts.readingProfile || ""}

Devuelve un solo bloque HTML con el título y los párrafos narrativos completos. No generes ni incrustes ilustraciones, SVG, canvas o imágenes en este HTML; al aprobar la lectura se adjuntará una imagen raster creada por el modelo de imagen de Gemini. No incluyas sinónimos ni preguntas de comprensión; se trabajarán en etapas posteriores. No cortes la lectura a media oración.
`.trim();
}

export function buildActivitiesPrompt({ session = {}, userText = "", resourceSelections = {}, resourceCodes = {} } = {}) {
  const meta = session.meta || {};
  const reading = session.accepted?.reading || session.reading || null;
  const readingContext = buildActivityReadingContext(reading);
  const sya = session.accepted?.sya || session.sya || null;
  const focusedSya = getFocusedSya(meta, sya || {});
  const groupedSya = getSyaGroupedByCategory(meta, sya || {});
  const projectRules = buildProjectRules(meta);
  const internalPrompts = getInternalPrompts();
  const vocabularyDirective = buildVocabularyPromptDirective({ target: "student" });
  const resourceBlock = buildResourceBlock(resourceSelections, session, resourceCodes);
  const contract = buildActivityContractPrompt({
    grade: meta.grade,
    category: meta.category,
    subtopic: meta.subtopic,
    difficulty: meta.difficulty,
    relateToReading: meta.relateToReading,
    mathSingleActivity: meta.mathSingleActivity === true
  });
  return `
${contract}

Directrices configurables del contrato de actividad:
${internalPrompts.activityContractProfile || ""}

Directrices editoriales y perfil de actividades:
${internalPrompts.activityProfile || ""}
${meta.mathSingleActivity ? "INSTRUCCIÓN PRIORITARIA DE ESTA TAREA AUTOMATIZADA: devuelve exactamente UN ejercicio matemático autónomo en un bloque .activity; el lote tiene seis ejercicios hermanos dentro del mismo subtema y cada uno se genera por separado." : ""}

${vocabularyDirective ? `Vocabulario preferente para el alumno:\n${vocabularyDirective}` : ""}

Datos de la unidad:
- Tipo: ${meta.mode}
- Nivel: ${meta.level}
- Grado: ${meta.grade}
- Trimestre: ${meta.trimester}
- Unidad: ${meta.unit}
- Categoría: ${meta.category || ""}
- Subtema: ${meta.subtopic || ""}
- Edición: ${meta.edition}

Fuente principal y obligatoria, lectura narrativa completa:
${readingContext.title ? `${readingContext.title}\n` : ""}${readingContext.narrative}

Si la lectura incluye una ilustración, úsala como apoyo visual de consulta solo en las actividades para las que resulte pertinente. No inventes que existe una imagen si la lectura no la incluye.

Material complementario de la lectura (solo como apoyo):
${readingContext.supportingMaterial}

Secuencia y alcance del subtema actual:
${buildSyaPromptBlock(meta, focusedSya, groupedSya)}

Recursos seleccionados para integrar en la propuesta:
${resourceBlock}

Regla de recursos:
- Si un recurso está activado, debes generarlo como bloque propio y visible dentro del HTML final.
- Usa obligatoriamente estos contenedores exactos: <section class="resource-ficha" data-resource-type="ficha">, <section class="resource-anexo" data-resource-type="anexo">, <section class="resource-recortable" data-resource-type="recortable"> y <section class="resource-video" data-resource-type="video">.
- Usa rótulos claros tipo "Ficha ${resolveUnitCode(meta)}a", "Anexo ${resolveUnitCode(meta)}a", "Recortable ${resolveUnitCode(meta)}a" y "Video ${resolveUnitCode(meta)}a" según corresponda.
- Cada recurso debe poder aceptarse o rechazarse como parte de la propuesta.
- No lo escondas dentro de un párrafo genérico.
- Los recursos son complementos: nunca sustituyen la creación de activities.
- Aunque el usuario elija recursos, debes devolver al menos un bloque <div class="activity"> completo y válido.
- Presenta las activities y los recursos en bloques separados. No mezcles el HTML de un recurso dentro de la activity.
- Si incluyes recursos, menciona el material dentro de la instrucción de la activity, por ejemplo: "Usa la Ficha 1a..." o "Apóyate en el Recortable 2b...".
- Los anexos son recursos visuales y complementarios.
- Las fichas son actividades complementarias; pueden relacionarse con la lectura o con la secuencia y alcance.
- Cada Ficha debe usar internamente la misma estructura HTML de una activity: <div class="activity">, consigna imperativa dentro de <strong>, <ol class="steps steps-numbered"> con <li> y soluciones dentro de <div class="answer"><span style="color:magenta;">...</span></div>. Muestra directamente la respuesta en magenta, sin las etiquetas “Respuesta” o “Respuesta esperada”. No diseñes la ficha como una tabla o como párrafos sueltos.
- Si el recurso activado es Recortable, la activity debe invitar a usarlo de forma dinámica dentro del ejercicio, integrándolo como parte del trabajo práctico y no como una simple mención.
- Si el recurso activado es Recortable, la activity debe dejar un espacio visible debajo para que el alumno pegue o acomode el recortable en su trabajo.
- Incluye una indicación clara como "Pega aquí tu recortable" o equivalente, sin volver mecánica la actividad.
- Evita ejercicios mecánicos o aislados; prioriza propuestas divertidas, educativas y aplicadas al contenido.
- Si el recurso activado es Video, preséntalo únicamente como Video y como producto final. Incluye su contenido audiovisual en una tabla con Escena, Tiempo, Voz en off, Elemento visual, Texto en pantalla y Transición.
- La voz en off de cada escena debe tener entre 12 y 17 palabras.
- El elemento visual debe describir con precisión qué se ve en pantalla, de forma concreta y accionable.
- Cada fila del guión de video debe ser una escena distinta y completa.

Regla pedagógica:
- Vuelve a leer la narración completa antes de diseñar las activities y básalas principalmente en su contenido.
- Usa hechos, personajes, ideas, situaciones y vocabulario contextualizado de la narración para las consignas y respuestas esperadas.
- No uses la tabla de sinónimos ni las preguntas existentes como fuente principal de la actividad.
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
  const readingContext = buildActivityReadingContext(reading);
  const sya = session.accepted?.sya || session.sya || null;
  const focusedSya = getFocusedSya(meta, sya || {});
  const groupedSya = getSyaGroupedByCategory(meta, sya || {});
  const projectRules = buildProjectRules(meta);
  const internalPrompts = getInternalPrompts();
  const vocabularyDirective = buildVocabularyPromptDirective({ target: "student" });
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

Directrices configurables del contrato de actividad:
${internalPrompts.activityContractProfile || ""}

Directrices editoriales y perfil de actividades:
${internalPrompts.activityProfile || ""}

Tu tarea NO es crear una unidad nueva. Debes refinar la propuesta actual.
${internalPrompts.refinementProfile || ""}

Datos de la unidad:
- Tipo: ${meta.mode}
- Nivel: ${meta.level}
- Grado: ${meta.grade}
- Trimestre: ${meta.trimester}
- Unidad: ${meta.unit}
- Categoría: ${meta.category || ""}
- Subtema: ${meta.subtopic || ""}

Fuente principal y obligatoria, lectura narrativa completa:
${readingContext.title ? `${readingContext.title}\n` : ""}${readingContext.narrative}

Material complementario de la lectura (solo como apoyo):
${readingContext.supportingMaterial}

Secuencia y alcance del subtema actual:
${buildSyaPromptBlock(meta, focusedSya, groupedSya)}

Propuesta actual a refinar:
${currentHtml}

Instrucciones de dificultad:
- ${difficultyGuide}
${projectRules}

Importante sobre el bloque actual:
- Vuelve a leer la narración completa y reconstruye la actividad a partir de ella.
- La tabla de sinónimos y las preguntas existentes son material secundario; no deben definir el enfoque de la actividad.
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
  const internalPrompts = getInternalPrompts();
  const meta = session.meta || {};
  const reading = session.accepted?.reading || session.reading || null;
  const sya = session.accepted?.sya || session.sya || null;
  const messages = (session.messages || [])
    .slice(-12)
    .map((message) => `${message.role === "user" ? "Usuario" : "Asistente"}: ${stripHtml(message.text || message.html || "")}`)
    .join("\n");

  return `
Eres Charly Brown, un editor conversacional para crear unidades de Primaria.
${internalPrompts.chatProfile || ""}
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

export async function generateReading({ session = {}, userText = "", model = "gemini-3.8-flash", readingStage = "reading" } = {}) {
  const reading = session.accepted?.reading || session.reading || null;
  const prompt = buildReadingPrompt({ meta: session.meta, userText, readingStage, reading });
  const draftHtml = await generateWithGemini({ model, prompt });
  const html = await reviewGeneratedContent({ html: draftHtml, model });
  const fallbackTitle = readingStage === "synonyms" ? "Tabla de sinónimos" : readingStage === "comprehension" ? "Preguntas de comprensión" : "Lectura generada";
  return { title: extractTitle(html) || reading?.title || fallbackTitle, html, prompt, readingStage, styleReview: { applied: html !== draftHtml, voice: "docente-mexicano-natural" } };
}

export async function generateActivities({ session = {}, userText = "", model = "gemini-3.8-flash", resourceSelections = {}, resourceCodes = {} } = {}) {
  const activityContext = {
    subtopic: session.meta?.subtopic,
    section: session.meta?.category,
    isMath: /matem[aá]t|saberes y pensamiento/i.test(`${session.meta?.category || ""} ${session.meta?.subtopic || ""}`),
    mathSingleActivity: session.meta?.mathSingleActivity === true
  };
  const isTracingLetters = isTracingLettersSelection(activityContext);
  const prompt = buildActivitiesPrompt({ session, userText, resourceSelections, resourceCodes });
  const rawHtml = await generateWithGemini({ model, prompt });
  let html = normalizeActivityHtml(rawHtml);
  let validation = validateGeneratedActivity(html, activityContext, resourceSelections);
  if (!validation.ok) {
    const structureReminder = isTracingLetters
      ? "- Devuelve exactamente cuatro bloques .activity, cada uno con instrucción directa, .trace-model y .answer en magenta.\n- No uses ol, ul, li, pasos ni subinstrucciones internas."
      : activityContext.isMath && !activityContext.mathSingleActivity
        ? "- Devuelve exactamente seis bloques .activity independientes, cada uno con título h3, consigna principal en negritas, su propia lista ol.steps.steps-numbered con pasos y respuesta .answer en magenta."
        : activityContext.isMath
          ? "- Devuelve exactamente un h2 general y un bloque .activity sin h3 adicional; inicia directamente con la consigna y no repitas el título."
        : "- Devuelve al menos un bloque <div class=\"activity\"> completo y válido.\n- Conserva la estructura .activity, ol.steps.steps-numbered y .answer.";
    const retryPrompt = `${prompt}\n\nREINTENTO OBLIGATORIO:\n${structureReminder}\n- Corrige estos incumplimientos: ${(validation.errors || []).join(" | ")}\n- Si además hay recursos seleccionados, inclúyelos como bloques adicionales, pero no elimines las activities.\n- No devuelvas únicamente fichas, anexos, recortables o videos.`;
    html = normalizeActivityHtml(await generateWithGemini({ model, prompt: retryPrompt }));
    validation = validateGeneratedActivity(html, activityContext, resourceSelections);
  }
  const reviewedHtml = normalizeActivityHtml(await reviewGeneratedContent({ html, model }));
  const reviewedValidation = validateGeneratedActivity(reviewedHtml, activityContext, resourceSelections);
  return {
    html: reviewedValidation.ok ? reviewedHtml : html,
    prompt,
    validation: reviewedValidation.ok ? reviewedValidation : validation,
    styleReview: { applied: reviewedValidation.ok && reviewedHtml !== html, voice: "docente-mexicano-natural" }
  };
}

function buildResourceBlock(resourceSelections = {}, session = {}, resourceCodes = {}) {
  const labels = [
    ["fichas", "Fichas", "worksheet"],
    ["anexos", "Anexos", "annex"],
    ["recortables", "Recortables", "cutout"],
    ["videos", "Video", "videoScript"]
  ];
  const internalPrompts = getInternalPrompts();
  const vocabularyDirective = buildVocabularyPromptDirective({ target: "student" });
  const counts = buildResourceTypeCounts(session);
  const active = labels
    .filter(([key]) => Boolean(resourceSelections[key]))
    .map(([key, label, promptKey]) => {
      const code = resourceCodes[key] || buildResourceCode(session.meta || {}, key, counts[key] || 0);
      const guidelines = internalPrompts[promptKey] ? `\n  Directrices editoriales específicas para ${label}:\n  ${internalPrompts[promptKey]}` : "";
      return `- ${label} (${code})${guidelines}${vocabularyDirective ? `\n  Vocabulario y claridad para el alumno:\n  ${vocabularyDirective}` : ""}`;
    });
  if (!active.length) return "- Sin recursos adicionales seleccionados.";
  return active.join("\n\n");
}

function validateGeneratedActivity(html = "", activityContext = {}, resourceSelections = {}) {
  const activityHtml = stripGeneratedResourceBlocks(html);
  const activityValidation = validateActivityHtml(activityHtml, activityContext);
  const generatedTypes = getGeneratedResourceTypes(html);
  const expectedTypes = [
    ["fichas", "ficha"],
    ["anexos", "anexo"],
    ["recortables", "recortable"],
    ["videos", "video"]
  ].filter(([key]) => Boolean(resourceSelections[key])).map(([, type]) => type);
  const missing = expectedTypes.filter((type) => !generatedTypes.has(type));
  const worksheetErrors = resourceSelections.fichas ? validateWorksheetResourceStructure(html) : [];
  const mathErrors = activityContext.isMath ? validateMathActivitySet(activityHtml, activityContext.mathSingleActivity ? 1 : 6) : [];
  const errors = [...(activityValidation.errors || []), ...mathErrors, ...missing.map((type) => `Falta el recurso ${type} como bloque independiente con data-resource-type="${type}".`), ...worksheetErrors];
  return { ...activityValidation, ok: errors.length === 0, errors, missingResources: missing };
}

function validateMathActivitySet(html = "", expectedCount = 6) {
  if (typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(`<main>${String(html || "")}</main>`, "text/html");
  const activities = Array.from(doc.querySelectorAll("main .activity"));
  const errors = [];
  if (activities.length !== expectedCount) errors.push(`Matemáticas requiere exactamente ${expectedCount} actividades completas en este bloque; se encontraron ${activities.length}.`);
  activities.forEach((activity, index) => {
    if (expectedCount > 1 && !activity.querySelector(":scope > h3, :scope > h4")) errors.push(`La actividad matemática ${index + 1} no tiene título propio.`);
    if (expectedCount === 1 && activity.querySelector(":scope > h3, :scope > h4")) errors.push("La actividad matemática individual repite el título con un subtítulo innecesario.");
    if (!activity.querySelector(":scope > p strong")) errors.push(`La actividad matemática ${index + 1} no tiene consigna principal.`);
    if (!activity.querySelector("ol.steps-numbered li, ol.steps li")) errors.push(`La actividad matemática ${index + 1} no tiene pasos.`);
    if (!activity.querySelector(".answer")) errors.push(`La actividad matemática ${index + 1} no incluye una respuesta esperada.`);
  });
  return errors;
}

function validateWorksheetResourceStructure(html = "") {
  let source = "";
  if (typeof DOMParser === "undefined") {
    source = String(html || "").match(/<section\b[^>]*data-resource-type=["']ficha["'][^>]*>[\s\S]*?<\/section>/i)?.[0] || "";
  } else {
    const doc = new DOMParser().parseFromString(`<div>${String(html || "")}</div>`, "text/html");
    source = doc.querySelector('[data-resource-type="ficha"], .resource-ficha')?.outerHTML || "";
  }
  const errors = [];
  if (!/class=["'][^"']*\bactivity\b/i.test(source)) errors.push("La ficha debe contener un bloque .activity.");
  if (!/<strong\b/i.test(source)) errors.push("La ficha necesita una instrucción principal en negritas.");
  if (!/<ol\b[^>]*class=["'][^"']*\bsteps\b[^"']*\bsteps-numbered\b/i.test(source)) errors.push("La ficha debe usar ol.steps.steps-numbered.");
  if (!/<li\b/i.test(source)) errors.push("La ficha necesita subinstrucciones en elementos li.");
  if (!/class=["'][^"']*\banswer\b/i.test(source)) errors.push("La ficha debe incluir respuestas esperadas dentro de .answer.");
  return errors;
}

function getGeneratedResourceTypes(html = "") {
  if (typeof DOMParser === "undefined") {
    return new Set(Array.from(String(html || "").matchAll(/data-resource-type=["'](ficha|anexo|recortable|video)["']/gi), (match) => match[1].toLowerCase()));
  }
  const doc = new DOMParser().parseFromString(`<div>${String(html || "")}</div>`, "text/html");
  return new Set(Array.from(doc.querySelectorAll("[data-resource-type]")).map((node) => normalizeResourceType(node.getAttribute("data-resource-type") || "")).filter(Boolean));
}

function stripGeneratedResourceBlocks(html = "") {
  if (typeof DOMParser === "undefined") {
    return String(html || "").replace(/<section\b[^>]*data-resource-type=["'](?:ficha|anexo|recortable|video)["'][^>]*>[\s\S]*?<\/section>/gi, "");
  }
  const doc = new DOMParser().parseFromString(`<div>${String(html || "")}</div>`, "text/html");
  doc.querySelectorAll("[data-resource-type], [data-resource-section='true'], .resource-ficha, .resource-anexo, .resource-recortable, .resource-video, .guion-video").forEach((node) => node.remove());
  return doc.body.innerHTML.replace(/^<div>|<\/div>$/g, "");
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

export async function refineActivities({ session = {}, currentHtml = "", difficulty = "normal", userText = "", model = "gemini-3.8-flash" } = {}) {
  const prompt = buildRefineActivitiesPrompt({ session, currentHtml, difficulty, userText });
  const rawHtml = await generateWithGemini({ model, prompt });
  let html = normalizeActivityHtml(rawHtml);
  const originalCount = countActivityBlocks(currentHtml);
  const nextCount = countActivityBlocks(html);
  if (originalCount > 1 && nextCount < originalCount) {
    const retryPrompt = `${prompt}\n\nREINTENTO OBLIGATORIO:\n- El HTML devuelto debe conservar exactamente ${originalCount} bloques .activity.\n- Reescribe todos los bloques existentes y no omitas ninguno.\n- Si hace falta, reproduce cada fase con su propia instrucción y respuestas esperadas.\n- No regreses una sola activity parcial.`;
    html = normalizeActivityHtml(await generateWithGemini({ model, prompt: retryPrompt }));
  }
  const reviewedHtml = normalizeActivityHtml(await reviewGeneratedContent({ html, model }));
  const activityContext = { subtopic: session.meta?.subtopic, section: session.meta?.category };
  const reviewedValidation = validateActivityHtml(reviewedHtml, activityContext);
  return {
    html: reviewedValidation.ok ? reviewedHtml : html,
    prompt,
    validation: reviewedValidation.ok ? reviewedValidation : validateActivityHtml(html, activityContext),
    styleReview: { applied: reviewedValidation.ok && reviewedHtml !== html, voice: "docente-mexicano-natural" }
  };
}

export async function reviewGeneratedContent({ html = "", model = "gemini-3.8-flash" } = {}) {
  const source = String(html || "").trim();
  if (!source) return source;
  try {
    const editorPrompt = getInternalPrompts().contentReview || "Actúa como editor escolar. Conserva los hechos y la estructura; devuelve únicamente el HTML revisado.";
    const reviewed = await generateWithGemini({ model, prompt: `${editorPrompt}\n\nHTML A REVISAR:\n${source}`, thinkingLevel: "MEDIUM" });
    return String(reviewed || "").replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim() || source;
  } catch (_) {
    return source;
  }
}

export async function generateChatReply({ session = {}, userText = "", model = "gemini-3.8-flash" } = {}) {
  const prompt = buildChatPrompt({ session, userText });
  const text = await generateWithGemini({ model, prompt });
  return { text, prompt };
}

export function extractTitle(html = "") {
  const match = String(html || "").match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  return match ? stripHtml(match[1]) : "";
}
