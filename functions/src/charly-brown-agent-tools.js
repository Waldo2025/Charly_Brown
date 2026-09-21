const crypto = require("node:crypto");

const ACTIVITY_SECTION_DEFINITIONS = Object.freeze([
  { id: "projects", name: "Proyectos", description: "Producto integrador y trabajo por fases.", objective: "Integrar aprendizajes en un producto concreto, colaborativo y verificable.", agentInstructions: "Diseña un proyecto con propósito, fases, producto final, evidencias y criterios de logro.", levels: [], grades: [] },
  { id: "language-communication", name: "Lenguaje y comunicación", description: "Comprensión, expresión oral y escrita.", objective: "Fortalecer la comprensión y la comunicación en situaciones significativas.", agentInstructions: "Propón lectura, conversación, escritura o producción oral con una consigna clara y evidencia observable.", levels: [], grades: [] },
  { id: "experimental-sciences", name: "Ciencias experimentales", description: "Observación, indagación y explicación de fenómenos.", objective: "Construir explicaciones a partir de observaciones, preguntas y evidencia.", agentInstructions: "Incluye una pregunta investigable, observación o experiencia segura, registro y explicación de resultados.", levels: [], grades: [] },
  { id: "social-sciences", name: "Ciencias sociales", description: "Historia, geografía y análisis del entorno.", objective: "Comprender procesos sociales, espaciales e históricos desde evidencia y contexto.", agentInstructions: "Trabaja con fuentes, mapas, líneas del tiempo, comparación de perspectivas o análisis del entorno.", levels: [], grades: [] },
  { id: "social-emotional", name: "Formación socioemocional", description: "Convivencia, autorregulación y ciudadanía.", objective: "Practicar decisiones, convivencia y reconocimiento de emociones en contextos reales.", agentInstructions: "Plantea una situación concreta, reflexión guiada y una acción observable; evita moralejas genéricas.", levels: [], grades: [] },
  { id: "arts", name: "Artes", description: "Producción y apreciación artística.", objective: "Explorar recursos artísticos para observar, interpretar y producir una obra propia.", agentInstructions: "Integra apreciación, experimentación, producción y una breve conversación sobre decisiones expresivas.", levels: [], grades: [] },
  { id: "skills", name: "Habilidades", description: "Pensamiento crítico, colaboración y toma de decisiones.", objective: "Aplicar estrategias de pensamiento y colaboración a una tarea con propósito.", agentInstructions: "Incluye un reto, decisiones justificadas, colaboración con roles claros y reflexión breve sobre la estrategia.", levels: [], grades: [] },
  { id: "mathematics", name: "Matemáticas", description: "Resolución de problemas y razonamiento matemático.", objective: "Resolver problemas, representar procedimientos y justificar resultados.", agentInstructions: "Parte de una situación concreta, permite más de una estrategia y solicita explicar o comprobar el resultado.", levels: [], grades: [] }
]);
const ACTIVITY_SECTIONS = Object.freeze(ACTIVITY_SECTION_DEFINITIONS.map((section) => section.name));

const RESOURCE_LABELS = {
  activity: "Actividad",
  worksheet: "Ficha",
  annex: "Anexo",
  cutout: "Recortable",
  "video-script": "Video"
};

const PROJECT_DEFINITIONS_BY_TRIMESTER = Object.freeze({
  "1": Object.freeze({
    methodology: "ABP",
    fullName: "Aprendizaje Basado en Problemas",
    phases: Object.freeze(["Indagar", "Recolectar", "Formular el problema", "Organizar la experiencia", "Vivir la experiencia", "Resultados y análisis"])
  }),
  "2": Object.freeze({
    methodology: "STEAM",
    fullName: "Proyecto STEAM",
    phases: Object.freeze(["Fase 1 Análisis del contexto y diagnóstico", "Fase 2 Diseño del proyecto e indagación", "Fase 3 Organización de la información", "Fase 4 Presentación de resultados", "Fase 5 Reflexión y evaluación"])
  }),
  "3": Object.freeze({
    methodology: "AS",
    fullName: "Aprendizaje de Servicios",
    phases: Object.freeze(["Punto de partida", "Lo que sé y quiero saber", "Organicemos", "Creatividad en marcha", "Compartimos y evaluamos"])
  })
});

function getProjectDefinition(trimester = "") {
  return PROJECT_DEFINITIONS_BY_TRIMESTER[String(trimester || "").trim()] || PROJECT_DEFINITIONS_BY_TRIMESTER["1"];
}

function isProjectActivity(unit = {}, activity = {}) {
  return [activity.sectionId, activity.section, unit.meta?.category, unit.meta?.subtopic, unit.meta?.unit]
    .some((value) => /^(projects?|proyectos?)$/i.test(clean(value)));
}

function buildProjectPromptContext(unit = {}, activity = {}) {
  if (!isProjectActivity(unit, activity)) return "";
  const definition = getProjectDefinition(unit.meta?.trimester);
  const reading = unit.accepted?.reading || unit.reading;
  const readingText = stripTags(reading?.html || reading?.text || "").slice(0, 8000);
  return `CONTRATO OBLIGATORIO DE PROYECTO TRIMESTRAL:
- Trimestre ${unit.meta?.trimester || "1"}: metodología ${definition.methodology} (${definition.fullName}). No uses la metodología de otro trimestre.
- Desarrolla exactamente estas fases y en este orden: ${definition.phases.join(" | ")}.
- Abre con una pregunta detonante concreta y contextualizada.
${readingText ? `- Usa la lectura aprobada como detonante real sin sustituir la secuencia curricular: ${readingText}` : "- Si no existe lectura aprobada, plantea un contexto generador breve; no inventes una lectura extensa."}
- Integra los T/AE/C/P pertinentes de toda la secuencia y alcance del grado, trimestre y unidad.
- Cada fase debe contener de 2 a 3 bloques <div class="activity">. Cada actividad conserva instrucción principal, ol.steps.steps-numbered y respuestas .answer.
- Después de las actividades de cada fase incluye <div class="phase-meta"> con producto, recursos, roles, tiempo y evaluación.
- Inmediatamente después incluye una rúbrica de cuatro niveles dentro de <div class="phase-rubric">.
- Cierra con criterios de evaluación global dentro de <section class="project-evaluation">.
- Los recursos vinculados se mencionan de forma pedagógica, pero fichas, anexos, recortables y videos se generan como recursos separados.
- Devuelve además projectMethodology="${definition.methodology}" y projectPhases con los nombres exactos de las fases.`;
}

function validateProjectArtifact(artifact = {}, unit = {}, activity = {}) {
  if (!isProjectActivity(unit, activity)) return { ok: true, errors: [], methodology: "", phases: [] };
  const definition = getProjectDefinition(unit.meta?.trimester);
  const html = String(artifact.html || "");
  const phases = Array.isArray(artifact.projectPhases) ? artifact.projectPhases.map((item) => clean(item)) : [];
  const errors = [];
  if (clean(artifact.projectMethodology).toUpperCase() !== definition.methodology) errors.push(`La metodología debe ser ${definition.methodology}.`);
  if (JSON.stringify(phases) !== JSON.stringify(definition.phases)) errors.push("Las fases no corresponden al trimestre o están fuera de orden.");
  definition.phases.forEach((phase) => {
    if (!normalizeComparable(html).includes(normalizeComparable(phase))) errors.push(`Falta la fase: ${phase}.`);
  });
  const activityCount = html.match(/class=["'][^"']*\bactivity\b[^"']*["']/gi)?.length || 0;
  const phaseMetaCount = html.match(/class=["'][^"']*\bphase-meta\b[^"']*["']/gi)?.length || 0;
  const rubricCount = html.match(/class=["'][^"']*\bphase-rubric\b[^"']*["']/gi)?.length || 0;
  if (activityCount < definition.phases.length * 2) errors.push("Cada fase necesita al menos dos actividades.");
  if (phaseMetaCount < definition.phases.length) errors.push("Faltan metadatos de fase.");
  if (rubricCount < definition.phases.length) errors.push("Falta una rúbrica por fase.");
  if (!/class=["'][^"']*\bproject-evaluation\b/i.test(html)) errors.push("Faltan los criterios de evaluación global.");
  return { ok: errors.length === 0, errors, methodology: definition.methodology, phases: [...definition.phases] };
}

function normalizeWorkflow(value = {}, reading = null) {
  const mode = ["existing", "chat", "none"].includes(value.readingMode) ? value.readingMode : (reading ? "existing" : "chat");
  const status = (key, fallback = "pending") => {
    const raw = value.stages?.[key];
    const current = typeof raw === "string" ? raw : raw?.status;
    return ["pending", "proposed", "approved", "skipped", "blocked"].includes(current) ? current : fallback;
  };
  const skip = mode === "none";
  return {
    readingMode: mode,
    stages: {
      reading: { status: status("reading", skip ? "skipped" : reading ? "approved" : "pending") },
      synonyms: { status: status("synonyms", skip ? "skipped" : reading?.sections?.synonyms?.length ? "approved" : "pending") },
      comprehension: { status: status("comprehension", skip ? "skipped" : (reading?.questions?.length || reading?.sections?.questions?.length) ? "approved" : "pending") }
    },
    activitySections: Array.isArray(value.activitySections) ? value.activitySections : [],
    resources: Array.isArray(value.resources) ? value.resources : []
  };
}

function nextWorkflowStep(workflow = {}) {
  const normalized = normalizeWorkflow(workflow);
  for (const kind of ["reading", "synonyms", "comprehension"]) {
    const current = normalized.stages[kind].status;
    if (!["approved", "skipped"].includes(current)) return { kind, status: current };
  }
  if (!normalized.activitySections.length) return { kind: "activity-selection", status: "pending" };
  const next = normalized.activitySections.find((item) => !["approved", "skipped"].includes(item.status));
  return next ? { kind: "activity", section: next.section, status: next.status } : { kind: "resources", status: "pending" };
}

function formatApa7(value = {}) {
  const authors = normalizeAuthors(value.authors || value.author || value.autor);
  const author = authors.length ? joinAuthors(authors) : "Autor no identificado";
  const year = String(value.year || value.date || value.fecha || "").match(/\b(19|20)\d{2}\b/)?.[0] || "s. f.";
  const title = clean(value.title || value.titulo || "Fuente sin título");
  const publication = clean(value.publication || value.journal || value.publisher || value.siteName || "");
  const volume = clean(value.volume || "");
  const issue = clean(value.issue || value.number || "");
  const pages = clean(value.pages || "");
  const doi = clean(value.doi || "").replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  const url = clean(value.url || (doi ? `https://doi.org/${doi}` : ""));
  return `${author} (${year}). ${/[.!?]$/.test(title) ? title : `${title}.`}${publication ? ` ${publication}` : ""}${volume ? `, ${volume}${issue ? `(${issue})` : ""}` : ""}${pages ? `, ${pages}` : ""}.${doi ? ` https://doi.org/${doi}` : url ? ` ${url}` : ""}`.replace(/\.\./g, ".").trim();
}

function normalizeCitation(value = {}, links = {}) {
  const doi = clean(value.doi || "").replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  return {
    sourceId: clean(value.sourceId || value.id || ""),
    authors: normalizeAuthors(value.authors || value.author || value.autor),
    year: String(value.year || value.date || value.fecha || "").match(/\b(19|20)\d{2}\b/)?.[0] || "",
    title: clean(value.title || value.titulo || "Fuente sin título"),
    publication: clean(value.publication || value.journal || value.publisher || value.siteName || ""),
    volume: clean(value.volume || ""), issue: clean(value.issue || value.number || ""), pages: clean(value.pages || ""),
    doi, url: clean(value.url || (doi ? `https://doi.org/${doi}` : "")),
    verificationStatus: clean(value.verificationStatus || value.status || ""),
    ...links,
    apa: formatApa7({ ...value, doi })
  };
}

function collectUnitCitations(unit = {}) {
  const content = [unit.accepted?.reading, ...(unit.accepted?.activities || []), ...(unit.accepted?.resources || [])].filter(Boolean);
  const dedupe = new Map();
  content.forEach((item) => (item.citations || []).forEach((citation) => {
    const normalized = normalizeCitation(citation, { unitId: unit.id, contentId: item.id, activityId: item.activityId || "", researchRunIds: item.researchRunIds || [] });
    const key = normalized.doi ? `doi:${normalized.doi.toLowerCase()}` : normalized.url ? `url:${normalized.url.toLowerCase().replace(/\/$/, "")}` : `meta:${normalized.authors.join("|")}:${normalized.title}:${normalized.year}`;
    if (!dedupe.has(key)) dedupe.set(key, normalized);
  }));
  return Array.from(dedupe.values());
}

function validateResourceArtifact(artifact = {}, type = "annex") {
  const errors = [];
  const warnings = [];
  if (!clean(artifact.title)) errors.push("Falta el título editorial.");
  if (!clean(artifact.html) && type !== "cutout") errors.push("Falta el contenido estructurado.");
  if (type !== "activity" && !clean(artifact.activityId)) errors.push("Falta vincular el recurso con una actividad.");
  if (type === "worksheet") errors.push(...validateWorksheetActivityStructure(artifact.html).errors);
  if (type === "cutout") {
    const document = artifact.cutoutDocument || artifact.document || {};
    const pieces = Array.isArray(document.pieces) ? document.pieces : [];
    if (!pieces.length) errors.push("El recortable no contiene piezas.");
    pieces.forEach((piece, index) => {
      if (!clean(piece.label)) errors.push(`La pieza ${index + 1} no tiene contenido.`);
      if (!clean(piece.interactionRole)) errors.push(`La pieza ${index + 1} no tiene función pedagógica.`);
      if (!clean(piece.targetId)) errors.push(`La pieza ${index + 1} no tiene destino verificable.`);
    });
    if (!clean(document.instructions)) errors.push("Faltan instrucciones de recorte y uso.");
    if (pieces.length > 24) warnings.push("La cantidad de piezas puede ser alta para una sola hoja.");
  }
  return { ok: errors.length === 0, errors, warnings };
}

function validateWorksheetActivityStructure(html = "") {
  const source = String(html || "");
  const errors = [];
  if (!/class=["'][^"']*\bactivity\b/i.test(source)) errors.push("La ficha debe contener un bloque .activity.");
  if (!/<strong\b/i.test(source)) errors.push("La ficha necesita una instrucción principal en negritas.");
  if (!/<ol\b[^>]*class=["'][^"']*\bsteps\b[^"']*\bsteps-numbered\b/i.test(source)) errors.push("La ficha debe usar ol.steps.steps-numbered.");
  if (!/<li\b/i.test(source)) errors.push("La ficha necesita subinstrucciones en elementos li.");
  if (!/class=["'][^"']*\banswer\b/i.test(source)) errors.push("La ficha debe incluir respuestas esperadas dentro de .answer.");
  return { ok: errors.length === 0, errors };
}

function normalizeCutoutDocument(input = {}) {
  const pieces = (Array.isArray(input.pieces) ? input.pieces : []).slice(0, 24).map((piece, index) => ({
    id: clean(piece.id || `piece-${index + 1}`),
    label: clean(piece.label || `Pieza ${index + 1}`),
    interactionRole: clean(piece.interactionRole || piece.role || "clasificar"),
    targetId: clean(piece.targetId || `target-${index + 1}`),
    shape: ["rectangle", "circle", "jigsaw", "strip"].includes(piece.shape) ? piece.shape : "rectangle",
    hint: clean(piece.hint || "")
  }));
  return {
    version: 1,
    title: clean(input.title || "Recortable"),
    format: input.format === "A4" ? "A4" : "Letter",
    orientation: input.orientation === "landscape" ? "landscape" : "portrait",
    type: clean(input.type || "classification"),
    instructions: clean(input.instructions || "Recorta las piezas por la línea punteada y colócalas en el espacio correspondiente."),
    pieces,
    answerKey: Array.isArray(input.answerKey) ? input.answerKey : pieces.map((piece) => ({ pieceId: piece.id, targetId: piece.targetId }))
  };
}

function renderCutoutSvg(input = {}) {
  const document = normalizeCutoutDocument(input);
  const landscape = document.orientation === "landscape";
  const base = document.format === "A4" ? { width: 210, height: 297 } : { width: 215.9, height: 279.4 };
  const width = landscape ? base.height : base.width;
  const height = landscape ? base.width : base.height;
  const margin = 12;
  const gap = 6;
  const columns = landscape ? 4 : 3;
  const cellWidth = (width - margin * 2 - gap * (columns - 1)) / columns;
  const cellHeight = 38;
  const startY = 42;
  const pieces = document.pieces.map((piece, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = margin + col * (cellWidth + gap);
    const y = startY + row * (cellHeight + gap);
    const label = escapeXml(piece.label);
    return `<g data-piece-id="${escapeXml(piece.id)}"><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cellWidth.toFixed(2)}" height="${cellHeight}" rx="2" fill="#fff" stroke="#202938" stroke-width="0.35" stroke-dasharray="2.5 1.5"/><text x="${(x + cellWidth / 2).toFixed(2)}" y="${(y + 17).toFixed(2)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="4" fill="#182033">${label}</text><text x="${(x + cellWidth / 2).toFixed(2)}" y="${(y + 27).toFixed(2)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="2.7" fill="#68738a">${escapeXml(piece.interactionRole)}</text></g>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">${escapeXml(document.title)}</title><desc id="desc">${escapeXml(document.instructions)}</desc><rect width="100%" height="100%" fill="#fff"/><text x="${margin}" y="16" font-family="Arial, sans-serif" font-size="7" font-weight="700" fill="#182033">${escapeXml(document.title)}</text><text x="${margin}" y="26" font-family="Arial, sans-serif" font-size="3.4" fill="#4b5565">${escapeXml(document.instructions)}</text><line x1="${margin}" y1="33" x2="${width - margin}" y2="33" stroke="#dfe5ef" stroke-width="0.4"/>${pieces}<text x="${margin}" y="${height - 7}" font-family="Arial, sans-serif" font-size="2.6" fill="#68738a">Línea punteada: cortar. Conserva todas las piezas hasta terminar la actividad.</text></svg>`;
  return { document, svg, widthMm: width, heightMm: height };
}

async function renderCutoutPdf(input = {}) {
  const rendered = renderCutoutSvg(input);
  try {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(`<html><head><style>@page{size:${rendered.document.format} ${rendered.document.orientation};margin:0}html,body{margin:0}svg{display:block}</style></head><body>${rendered.svg}</body></html>`);
      const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
      return { ...rendered, pdfBase64: pdf.toString("base64"), pdfMimeType: "application/pdf" };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return { ...rendered, pdfBase64: "", pdfMimeType: "application/pdf", pdfError: String(error.message || error) };
  }
}

function buildSyaPromptContext(unit = {}) {
  const source = unit.accepted?.sya || unit.sya;
  if (!source || typeof source !== "object") return "";
  return Object.entries(source)
    .filter(([key, value]) => !String(key).startsWith("__") && value !== null && value !== undefined && typeof value !== "object" && String(value).trim())
    .map(([key, value]) => `${clean(key)}: ${clean(Array.isArray(value) ? value.join(" | ") : value)}`)
    .join("\n")
    .slice(0, 18000);
}

function buildActivityReadingContext(unit = {}) {
  const reading = unit.accepted?.reading || unit.reading || null;
  if (!reading) return { title: "", narrative: "Sin lectura aprobada.", supportingMaterial: "Sin material complementario." };
  const sections = reading.sections || {};
  const fallbackHtml = String(reading.html || "")
    .replace(/<table\b[^>]*class=["'][^"']*lectura-tabla-sinonimos[^"']*["'][^>]*>[\s\S]*?<\/table>/gi, " ")
    .replace(/<h[1-6]\b[^>]*>\s*(?:tabla de )?(?:sin[oó]nimos|glosario|vocabulario|preguntas de comprensi[oó]n)\s*<\/h[1-6]>[\s\S]*$/i, " ");
  const narrativeSource = sections.narrativeHtml || reading.narrativeHtml || reading.text || fallbackHtml;
  const synonyms = Array.isArray(sections.synonyms)
    ? sections.synonyms.map((item) => typeof item === "string" ? item : `${item.palabra || item.word || ""}: ${item.sinonimo || item.synonym || ""}`).filter(Boolean).join(" | ")
    : stripTags(sections.synonymsHtml || "");
  const questions = Array.isArray(sections.questions || reading.questions)
    ? (sections.questions || reading.questions).map((item) => typeof item === "string" ? item : item.texto || item.pregunta || item.prompt || item.text || "").filter(Boolean).join(" | ")
    : stripTags(sections.questionsHtml || "");
  const supportingMaterial = [synonyms && `Sinónimos: ${synonyms}`, questions && `Preguntas de comprensión: ${questions}`].filter(Boolean).join("\n");
  return {
    title: clean(reading.title || "Lectura de la unidad"),
    narrative: stripTags(narrativeSource).slice(0, 18000) || "La lectura no contiene texto narrativo utilizable.",
    supportingMaterial: supportingMaterial.slice(0, 5000) || "Sin material complementario."
  };
}

const REFERENCE_EDITORIAL_ACTIVITY_PROFILE = `Perfil editorial derivado del análisis estructural de unidades de referencia (aplica el patrón, nunca copies su contenido):
- Abre cada ejercicio con una consigna breve en modo imperativo y un verbo observable, por ejemplo leer, observar, escribir, analizar, identificar, completar, comparar, registrar, explicar o reflexionar.
- Distingue con claridad título, instrucción principal, subinstrucciones, espacio o tabla de trabajo y respuesta esperada. No mezcles la solución dentro de la consigna.
- Organiza la experiencia en una progresión útil: activar u observar; ejecutar o registrar; explicar, justificar o compartir. Incluye solo los pasos que la tarea realmente necesite.
- Usa tablas cuando ayuden a clasificar, comparar, calcular o registrar evidencia; usa listas cuando exista una secuencia real. Evita adornos y apartados de relleno.
- Redacta con tono de libro escolar mexicano: directo, concreto, profesional y adecuado a la edad. Varía la sintaxis y evita introducciones genéricas, moralejas y frases típicas de asistente.
- La respuesta esperada debe ser breve y verificable; cuando la respuesta sea personal u oral, indícalo sin inventar una contestación única.
- Conserva la identidad disciplinar: lenguaje trabaja lectura y producción; matemáticas procedimiento y comprobación; ciencias observación, registro y conclusión; áreas sociales y socioemocionales reflexión sustentada y diálogo; proyectos fases, producto y evidencia final.
- Produce HTML semántico con un único <div class="activity">, encabezados concisos, párrafos de instrucción, listas o tablas cuando correspondan y <p class="answer"> solo para la respuesta esperada.`;

function buildActivityPrompt({ unit, activity, sectionDefinition = {}, brief = "", memory = [], structureMode = "default", structureInstructions = "", resourceTypes = [] }) {
  const sya = buildSyaPromptContext(unit);
  const reading = buildActivityReadingContext(unit);
  const projectContext = buildProjectPromptContext(unit, activity);
  const requestedStructure = String(structureInstructions || "").trim();
  const customStructure = structureMode === "custom" && Boolean(requestedStructure);
  const tracingLetters = !customStructure && isTracingLettersActivity(unit, activity, sectionDefinition, brief);
  const tracingLettersRules = tracingLetters ? `
Contrato específico obligatorio para Trazos de letras:
- Es un bloque de alfabetización inicial para Primero o Segundo; no lo conviertas en redacción general, ortografía abstracta ni comprensión lectora.
- Identifica la letra objetivo en T, AE, C y P de la secuencia y alcance.
- Devuelve exactamente cuatro <div class="activity"> en este orden: presentación de mayúscula/minúscula y direccionalidad; repetición o completado en renglón; lectura y trazo de una frase muy corta; lectura y trazo de otra frase breve.
- Cada actividad debe contener una sola instrucción directa, un <div class="trace-model"> con el modelo visible y un <div class="answer"><span style="color:magenta;">Respuesta: ...</span></div> con el modelo exacto.
- No uses <ol>, <ul>, <li>, pasos ni subinstrucciones internas.
- Usa vocabulario familiar, trazos legibles y frases muy cortas; el resultado debe parecer una página de cuaderno de trazos.
` : "";
  const customStructureRules = customStructure ? `
Contrato estructural solicitado explícitamente por el usuario:
${requestedStructure}
- Sigue esta estructura en lugar del molde HTML predeterminado.
- No fuerces <div class="activity">, <ol class="steps steps-numbered"> ni <div class="answer"> salvo que las instrucciones personalizadas los pidan.
- Usa HTML semántico, válido y accesible; conserva consignas claras, evidencias verificables y separación entre instrucciones y soluciones.
- Cambia únicamente la presentación y organización. Conserva sin alteraciones el nivel, el aprendizaje, T, AE, C, P, la lectura pertinente y el propósito de la sección.
` : "";
  const editorialProfile = customStructure
    ? "Aplica el perfil editorial general solo al tono, claridad, accesibilidad y adecuación al grado. El contrato personalizado tiene prioridad estructural."
    : tracingLetters
      ? "Aplica el perfil editorial general solo en tono, claridad y adecuación al grado; la estructura específica siguiente tiene prioridad absoluta."
      : REFERENCE_EDITORIAL_ACTIVITY_PROFILE;
  const htmlExample = customStructure
    ? "[HTML que cumpla exactamente la estructura solicitada]"
    : tracingLetters
      ? "<div class=\"activity\">...</div><div class=\"activity\">...</div><div class=\"activity\">...</div><div class=\"activity\">...</div>"
      : "<div class=\"activity\">...</div>";
  const embeddedResourceRules = buildEmbeddedActivityResourceRules(unit, resourceTypes);
  return `Diseña una actividad escolar para ${unit.meta?.level || "Primaria"}, ${unit.meta?.grade || ""}, trimestre ${unit.meta?.trimester || "no indicado"}, unidad ${unit.meta?.unit || "no indicada"}, sección ${activity.section}.
Descripción de la sección: ${sectionDefinition.description || "Actividad curricular."}
Propósito pedagógico: ${sectionDefinition.objective || "Aplicar el aprendizaje de la unidad."}
Indicaciones editoriales: ${sectionDefinition.agentInstructions || "Crea una consigna clara, pasos y evidencia observable."}
${editorialProfile}
${customStructureRules}
${tracingLettersRules}
${embeddedResourceRules}
Fuente principal y obligatoria, lectura narrativa completa:
${reading.title ? `${reading.title}\n` : ""}${reading.narrative}
Material complementario de la lectura (úsalo solo como apoyo, no como eje de la actividad):
${reading.supportingMaterial}
- Vuelve a leer la narración completa antes de diseñar la actividad.
- Basa las consignas, preguntas, evidencias y respuestas principalmente en hechos, personajes, ideas, situaciones o vocabulario contextualizado de la narración.
- No conviertas la tabla de sinónimos ni las preguntas de comprensión existentes en la fuente principal de la actividad.
Secuencia y alcance vigente para esta unidad${unit.syaContextKey ? ` (${unit.syaContextKey})` : ""}:
${sya || "No hay una secuencia y alcance disponible. No inventes aprendizajes curriculares; limita la propuesta a la petición confirmada por el usuario."}
Usa como instrucciones curriculares obligatorias los contenidos, aprendizajes esperados, criterios, progresiones o indicaciones pertinentes de la secuencia y alcance. No los contradigas ni agregues objetivos ajenos.
Petición adicional: ${brief || "ninguna"}.
Enseñanzas editoriales aplicables: ${memory.map((item) => item.rule).filter(Boolean).join(" | ") || "ninguna"}.
${projectContext}
Devuelve SOLO JSON {"title":"...","html":"${htmlExample}${resourceTypes.length ? "[bloques de recursos seleccionados]" : ""}","citations":[],"projectMethodology":"","projectPhases":[],"structureMode":"${customStructure ? "custom" : tracingLetters ? "tracing-letters" : "default"}"}.`;
}

function buildEmbeddedActivityResourceRules(unit = {}, resourceTypes = []) {
  const definitions = {
    worksheet: { label: "Ficha", type: "ficha", className: "resource-ficha" },
    annex: { label: "Anexo", type: "anexo", className: "resource-anexo" },
    cutout: { label: "Recortable", type: "recortable", className: "resource-recortable" },
    "video-script": { label: "Video", type: "video", className: "resource-video" }
  };
  const selected = [...new Set(resourceTypes)].map((type) => ({ type, ...definitions[type] })).filter((item) => item.label);
  if (!selected.length) return "No generes recursos adicionales en esta propuesta.";
  const unitNumber = String(unit.meta?.unit || "1").replace(/\D+/g, "") || "1";
  const rows = selected.map((item, index) => ({ ...item, code: `${item.label} ${unitNumber}${String.fromCharCode(97 + index)}` }));
  return `Recursos obligatorios que deben generarse junto con la actividad:
${rows.map((item) => `- ${item.code}: crea un bloque independiente <section class="${item.className}" data-resource-type="${item.type}" data-resource-code="${item.code}"> con título, instrucciones y contenido completo listo para usar.${item.type === "worksheet" ? " Dentro de este section, usa exactamente la estructura de una actividad: <div class=\"activity\"><p><strong>Consigna imperativa.</strong></p><ol class=\"steps steps-numbered\"><li>Subinstrucción<div class=\"answer\"><span style=\"color:magenta;\">Respuesta: ...</span></div></li></ol></div>." : ""}` ).join("\n")}
- Dentro de la instrucción principal de la actividad menciona por nombre cada recurso (${rows.map((item) => item.code).join(", ")}) e indica el paso o momento exacto en que se utiliza.
- Usa una redacción natural como "Con ayuda de la Ficha 2a...", adaptada al tipo de recurso; no agregues una lista administrativa de materiales.
- La actividad y cada recurso deben poder entenderse y aprobarse por separado. Coloca primero todos los bloques .activity y después los recursos.
- El recurso debe desarrollar contenido concreto de la lectura y del subtema; no entregues plantillas vacías ni descripciones de lo que podría contener.
- Para Video, presenta el producto final con escenas, tiempo, voz en off, elemento visual, texto en pantalla y transición. Nunca lo llames guion.`;
}

function validateEmbeddedActivityResources(html = "", resourceTypes = []) {
  const definitions = {
    worksheet: { label: "Ficha", type: "ficha" },
    annex: { label: "Anexo", type: "anexo" },
    cutout: { label: "Recortable", type: "recortable" },
    "video-script": { label: "Video", type: "video" }
  };
  const selected = [...new Set(resourceTypes)].map((type) => definitions[type]).filter(Boolean);
  if (!selected.length) return { ok: true, errors: [] };
  const source = String(html || "");
  const activityHtml = source.split(/<section\b[^>]*data-resource-type=/i)[0];
  const errors = [];
  selected.forEach(({ label, type }) => {
    if (!new RegExp(`data-resource-type=["']${type}["']`, "i").test(source)) errors.push(`Falta el bloque independiente de ${label}.`);
    if (!new RegExp(label, "i").test(stripTags(activityHtml))) errors.push(`La actividad no indica dónde usar ${label}.`);
    if (type === "ficha") {
      const worksheetHtml = source.match(/<section\b[^>]*data-resource-type=["']ficha["'][^>]*>[\s\S]*?<\/section>/i)?.[0] || "";
      errors.push(...validateWorksheetActivityStructure(worksheetHtml).errors);
    }
  });
  return { ok: errors.length === 0, errors };
}

function isTracingLettersActivity(unit = {}, activity = {}, sectionDefinition = {}, brief = "") {
  const context = [unit.meta?.subtopic, activity.section, activity.title, sectionDefinition.name, brief]
    .map((value) => normalizeComparable(value).replace(/[^a-z0-9]+/g, ""))
    .join(" ");
  return context.includes("trazosdeletras");
}

function buildResourcePrompt({ type, unit, activity, brief = "", memory = [] }) {
  const label = RESOURCE_LABELS[type] || "Recurso";
  const sya = buildSyaPromptContext(unit);
  const projectContext = buildProjectPromptContext(unit, activity);
  const specialized = type === "cutout"
    ? "Devuelve además cutoutDocument con type, format, orientation, instructions, pieces[{id,label,interactionRole,targetId,shape,hint}] y answerKey. Cada pieza debe tener función pedagógica y destino."
    : type === "video-script"
      ? "Presenta el video como producto final listo para producir y utilizar en la actividad. El HTML debe describir su título, propósito, duración, contenido audiovisual por escenas, voz en off, elementos visuales, texto en pantalla y transiciones. No lo nombres ni lo presentes como guion, borrador o documento intermedio: en todo el contenido visible llámalo únicamente Video."
      : type === "worksheet"
        ? "La ficha debe tener la misma estructura editorial que una actividad. Devuelve un contenedor <section class=\"resource-ficha\" data-resource-type=\"ficha\"> con título y, dentro, <div class=\"activity\">, una consigna imperativa dentro de <strong>, <ol class=\"steps steps-numbered\"> con subinstrucciones <li> y respuestas esperadas dentro de <div class=\"answer\"><span style=\"color:magenta;\">Respuesta: ...</span></div>. No uses una tabla o párrafos sueltos como estructura principal."
        : "El HTML debe ser utilizable directamente por el alumno y contener instrucciones, contenido y respuesta o clave docente cuando corresponda.";
  return `Diseña un ${label.toLowerCase()} editorial académico para ${unit.meta?.level || "Primaria"}, ${unit.meta?.grade || ""}, trimestre ${unit.meta?.trimester || "no indicado"}, unidad ${unit.meta?.unit || "no indicada"}.
Unidad: ${unit.title}. Sección: ${activity.section || unit.meta?.category || ""}.
Actividad vinculada (${activity.id}): ${clean(activity.title)} ${stripTags(activity.html).slice(0, 5000)}
Secuencia y alcance vigente:
${sya || "No disponible."}
El recurso debe apoyar la actividad y respetar las instrucciones curriculares pertinentes de la secuencia y alcance.
Petición: ${brief || "Crear un recurso pertinente y listo para usar."}
Enseñanzas editoriales aplicables: ${memory.map((item) => item.rule).filter(Boolean).join(" | ") || "ninguna"}.
${projectContext ? `Contexto del proyecto vinculado:\n${projectContext}` : ""}
${specialized}
Devuelve SOLO JSON válido: {"title":"...","html":"...","citations":[],"cutoutDocument":null}. No agregues Markdown.`;
}

function buildTeacherNotesPrompt({ unit = {}, items = [], mode = "global", brief = "" } = {}) {
  const reading = unit.accepted?.reading || unit.reading || null;
  const sya = buildSyaPromptContext(unit);
  const sourceLabel = mode === "resource" ? "RECURSO APROBADO" : "ACTIVIDAD APROBADA";
  const approvedHtml = (Array.isArray(items) ? items : []).map((item, index) => [
    `[${sourceLabel} ${index + 1}]`,
    `Título: ${clean(item?.title || item?.section || item?.code || sourceLabel)}`,
    String(item?.html || item?.text || "")
  ].join("\n")).join("\n\n");
  const scopeInstruction = mode === "resource"
    ? "Crea notas para preparar y utilizar únicamente el recurso seleccionado."
    : mode === "single"
      ? "Crea notas para la actividad seleccionada."
      : "Crea notas integrales para todas las actividades aprobadas de la unidad, organizadas por actividad.";
  const resourceMap = buildTeacherNotesResourceMap({ unit, items, mode });
  const resourceContext = resourceMap.length
    ? resourceMap.map((entry, index) => [
        `[VÍNCULO ${index + 1}]`,
        `Actividad: ${entry.activityLabel}`,
        `Recurso: ${entry.resourceLabel}`,
        `Tipo: ${entry.resourceType}`,
        `Contenido del recurso: ${entry.resourceExcerpt || "Sin contenido descriptivo."}`
      ].join("\n")).join("\n\n")
    : "No hay recursos aprobados vinculados a las actividades seleccionadas.";

  return `Actúa como editor pedagógico experto y redacta notas del maestro listas para incorporarse a una guía docente.
${scopeInstruction}

Contexto académico:
- Nivel: ${unit.meta?.level || "Primaria"}
- Grado: ${unit.meta?.grade || ""}
- Trimestre: ${unit.meta?.trimester || ""}
- Unidad: ${unit.meta?.unit || ""}
- Categoría: ${unit.meta?.category || ""}
- Subtema: ${unit.meta?.subtopic || ""}
- Edición: ${unit.meta?.edition || ""}

Lectura aprobada:
${reading ? `${clean(reading.title)}\n${stripTags(reading.html || reading.text || "").slice(0, 12000)}` : "Sin lectura aprobada."}

Secuencia y alcance vigente:
${sya || "No disponible."}

Contenido aprobado de origen:
${approvedHtml}

Mapa obligatorio de uso de recursos por actividad:
${resourceContext}

Estructura obligatoria:
1. Orientaciones docentes concretas, redactadas para usted.
2. Actividad de ampliación.
3. Actividad de refuerzo.
4. Neurología aplicada.
5. Atención a la diversidad y accesibilidad.
6. Respuestas o evidencias esperadas cuando aplique, dentro de <div class="answer">.
7. Uso de recursos por actividad. Para CADA vínculo del mapa, menciona literalmente el nombre del recurso y el nombre de la actividad, e indica:
   - en qué momento de la actividad se entrega o utiliza;
   - cómo debe prepararlo y presentarlo el docente;
   - qué debe hacer el estudiante con él;
   - qué evidencia debe observar el docente;
   - qué adaptación puede aplicarse si el recurso no está disponible.

Restricciones:
- No copies literalmente la actividad o el recurso; conviértelo en guía docente práctica.
- Relaciona lectura, secuencia y alcance cuando estén disponibles.
- No agrupes los recursos en una recomendación genérica. Cada recurso debe quedar dentro de la actividad a la que está vinculado.
- No inventes vínculos: usa únicamente las parejas actividad-recurso incluidas en el mapa obligatorio.
- Usa HTML básico sin Markdown, sin introducciones genéricas ni conclusiones de relleno.
- Mantén tono profesional, natural y accionable de un docente mexicano con experiencia.
${brief ? `- Petición adicional: ${brief}` : ""}

Devuelve SOLO JSON válido con {"title":"Notas del maestro","html":"..."}.`;
}

function buildTeacherNotesResourceMap({ unit = {}, items = [], mode = "global" } = {}) {
  const activities = Array.isArray(unit.accepted?.activities) ? unit.accepted.activities : [];
  const allResources = Array.isArray(unit.accepted?.resources) ? unit.accepted.resources : [];
  const selectedIds = new Set((Array.isArray(items) ? items : []).map((item) => String(item?.id || "")).filter(Boolean));
  const resources = mode === "resource"
    ? allResources.filter((resource) => selectedIds.has(String(resource.id || "")))
    : allResources.filter((resource) => mode === "global" || selectedIds.has(String(resource.activityId || "")));

  return resources.map((resource, index) => {
    const activity = activities.find((item) => String(item.id || "") === String(resource.activityId || "")) || null;
    return {
      resourceId: String(resource.id || ""),
      resourceLabel: clean(resource.code || resource.title || `${resource.type || "Recurso"} ${index + 1}`),
      resourceType: clean(resource.type || "recurso"),
      resourceExcerpt: stripTags(resource.html || resource.text || "").slice(0, 1800),
      activityId: String(activity?.id || resource.activityId || ""),
      activityLabel: clean(activity?.title || activity?.section || `Actividad ${resource.activityId || "sin vínculo"}`)
    };
  });
}

function validateTeacherNotesResourceReferences(html = "", resourceMap = []) {
  const text = normalizeComparable(stripTags(html));
  const missing = [];
  (Array.isArray(resourceMap) ? resourceMap : []).forEach((entry) => {
    const resourceLabel = normalizeComparable(entry.resourceLabel);
    const activityLabel = normalizeComparable(entry.activityLabel);
    const missingParts = [];
    const resourceIndex = resourceLabel ? text.indexOf(resourceLabel) : -1;
    if (resourceLabel && resourceIndex < 0) missingParts.push(`recurso “${entry.resourceLabel}”`);
    if (activityLabel && !text.includes(activityLabel)) missingParts.push(`actividad “${entry.activityLabel}”`);
    if (resourceIndex >= 0) {
      const context = text.slice(Math.max(0, resourceIndex - 500), resourceIndex + resourceLabel.length + 1400);
      if (activityLabel && !context.includes(activityLabel)) missingParts.push(`vínculo cercano con la actividad “${entry.activityLabel}”`);
      if (!containsAny(context, ["inicio", "desarrollo", "cierre", "antes", "durante", "después", "momento", "entreg", "al registrar"])) missingParts.push("momento de uso");
      if (!containsAny(context, ["prepare", "imprima", "recorte", "proyecte", "presente", "distribuya", "organice", "entregue", "entréguela"])) missingParts.push("preparación o entrega docente");
      if (!containsAny(context, ["estudiante", "alumno", "complete", "registre", "anote", "use", "recorte", "pegue", "observe", "resuelva"])) missingParts.push("acción del estudiante");
      if (!containsAny(context, ["evidencia", "observe", "revise", "verifique", "respuesta", "producto", "precisión", "desempeño"])) missingParts.push("evidencia observable");
      if (!containsAny(context, ["adaptación", "alternativa", "si no", "no está disponible", "cuaderno", "oral", "apoyo", "sustituya"])) missingParts.push("adaptación o alternativa");
    }
    if (missingParts.length) missing.push({ resourceId: entry.resourceId, activityId: entry.activityId, missing: missingParts });
  });
  return { ok: missing.length === 0, missing };
}

function containsAny(text = "", terms = []) {
  return terms.some((term) => text.includes(normalizeComparable(term)));
}

function fallbackArtifact({ type, activity, unit }) {
  const label = RESOURCE_LABELS[type] || "Recurso";
  const title = `${label}: ${activity.section || activity.title || unit.title}`;
  if (type === "cutout") {
    const cutoutDocument = normalizeCutoutDocument({
      title,
      type: "classification",
      instructions: "Recorta cada tarjeta y pégala en el espacio que corresponda según la actividad.",
      pieces: [1, 2, 3, 4, 5, 6].map((number) => ({ id: `piece-${number}`, label: `Elemento ${number}`, interactionRole: "clasificar y justificar", targetId: `group-${number % 2 ? "a" : "b"}` }))
    });
    return { title, html: `<section><h3>${escapeHtml(title)}</h3><p>${escapeHtml(cutoutDocument.instructions)}</p></section>`, cutoutDocument, citations: [] };
  }
  if (type === "worksheet") {
    return { title, html: `<section class="resource-ficha" data-resource-type="ficha"><h3>${escapeHtml(title)}</h3><div class="activity"><p><strong>Completa la ficha siguiendo la consigna.</strong></p><ol class="steps steps-numbered"><li>Resuelve el ejercicio con información de la lectura.<div class="answer"><span style="color:magenta;">Respuesta: respuesta sustentada en la lectura.</span></div></li></ol></div></section>`, citations: [] };
  }
  return { title, html: `<section><h3>${escapeHtml(title)}</h3><p>Completa este recurso siguiendo las indicaciones de la actividad.</p></section>`, citations: [] };
}

function normalizeAuthors(value) {
  if (Array.isArray(value)) return value.map((item) => clean(typeof item === "object" ? item.name || [item.family, item.given].filter(Boolean).join(", ") : item)).filter(Boolean);
  return clean(value).split(/\s*;\s*|\s+and\s+|\s+y\s+/i).filter(Boolean);
}

function joinAuthors(authors) {
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`;
  return `${authors.slice(0, -1).join(", ")}, & ${authors.at(-1)}`;
}

function stripTags(value = "") { return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function clean(value = "") { return String(value || "").replace(/\s+/g, " ").trim(); }
function escapeXml(value = "") { return clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function escapeHtml(value = "") { return escapeXml(value); }
function normalizeComparable(value = "") { return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }

module.exports = {
  ACTIVITY_SECTION_DEFINITIONS,
  ACTIVITY_SECTIONS,
  PROJECT_DEFINITIONS_BY_TRIMESTER,
  REFERENCE_EDITORIAL_ACTIVITY_PROFILE,
  RESOURCE_LABELS,
  buildActivityPrompt,
  buildActivityReadingContext,
  buildEmbeddedActivityResourceRules,
  buildProjectPromptContext,
  buildResourcePrompt,
  buildTeacherNotesPrompt,
  buildTeacherNotesResourceMap,
  buildSyaPromptContext,
  collectUnitCitations,
  fallbackArtifact,
  formatApa7,
  getProjectDefinition,
  id,
  isProjectActivity,
  nextWorkflowStep,
  normalizeCitation,
  normalizeCutoutDocument,
  normalizeWorkflow,
  renderCutoutPdf,
  renderCutoutSvg,
  validateProjectArtifact,
  validateEmbeddedActivityResources,
  validateWorksheetActivityStructure,
  validateTeacherNotesResourceReferences,
  validateResourceArtifact
};
