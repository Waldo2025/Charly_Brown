const PROMPT_PROFILES_STORAGE_KEY = "marcie_prompt_profiles_v1";
const ACTIVE_PROMPT_PROFILE_STORAGE_KEY = "marcie_active_prompt_profile_v1";
export const DEFAULT_PROMPT_PROFILE_ID = "default";
export const FREE_PROMPT_PROFILE_ID = "free";

const FREE_MODE_RUNTIME_DIRECTIVE = `MODO EDITORIAL LIBRE — INSTRUCCIÓN PRIORITARIA:
El tema proporcionado por el usuario es la autoridad principal. No lo sustituyas ni lo reconduzcas hacia educación, pedagogía, docentes, estudiantes o familias, salvo que el propio tema lo solicite.
Cualquier referencia posterior a un blog educativo o a audiencias educativas pertenece a una configuración heredada y debe ignorarse como directriz temática.
Conserva exclusivamente los contratos técnicos necesarios: estructura JSON, IDs, campos requeridos, HTML del artículo y formato de respuesta.
Cuando el contrato exija los IDs educators, students y parents, interprétalos únicamente como tres enfoques editoriales técnicos: evidencia y contexto; aplicación práctica; perspectiva humana y cotidiana. No menciones esas etiquetas ni fuerces un contexto escolar.
Investiga y sustenta el tema con entre 6 y 10 fuentes reales, pertinentes y verificables de su propio ámbito. Usa al menos cuatro dominios o instituciones diferentes y no incluyas más de dos referencias de la misma institución. Prioriza fuentes primarias, organismos públicos, universidades, revistas científicas, libros identificables, documentación oficial y entidades profesionales reconocidas. Conserva la URL HTTPS específica de cada publicación o su DOI; no sustituyas todas las referencias por la portada de una institución. No inventes títulos, autores, fechas, DOI, estudios, rutas ni afirmaciones. Si no puedes sostener una referencia concreta, omítela y utiliza otra verificable. Si la premisa del usuario contradice la evidencia disponible, conserva el tema y explícalo con rigor, matices y seguridad.`;

export const MARCIE_PROMPT_DEFINITIONS = Object.freeze([
  { id: "cover_generation", label: "Imagen de portada", group: "Producción", description: "Dirección artística para las portadas de cada enfoque.", defaultPrompt: "Actúa como director de arte editorial premium. Crea una portada original, limpia y emocionalmente atractiva, alineada con el título, el público y el enfoque. Evita texto incrustado, marcas, interfaces, composiciones genéricas y clichés visuales. Prioriza una escena con intención narrativa, jerarquía clara y acabado profesional." },
  { id: "trend_research", label: "Investigación de tendencias", group: "Investigación", description: "Criterios para descubrir señales y fuentes útiles.", defaultPrompt: "Actúa como investigador editorial especializado en educación. Identifica señales recientes, preguntas reales de la audiencia, oportunidades de contenido y fuentes verificables. Distingue evidencia de opinión, evita inventar datos y explica por qué cada señal puede convertirse en un artículo relevante." },
  { id: "source_research_policy", label: "Selección de fuentes", group: "Fuentes", description: "Cantidad, diversidad, calidad y verificación de las fuentes consultadas.", defaultPrompt: "Selecciona fuentes reales, pertinentes y verificables para el tema. Prioriza evidencia primaria, organismos públicos, universidades, revistas científicas, libros identificables, documentación oficial y entidades profesionales reconocidas. Diversifica instituciones y perspectivas; evita concentrar la bibliografía en un solo dominio. No inventes títulos, autores, fechas, DOI, estudios ni URLs. Conserva enlaces HTTPS específicos y funcionales siempre que sean conocidos con certeza." },
  { id: "source_citation_policy", label: "Uso y formato bibliográfico", group: "Fuentes", description: "Cómo integrar, atribuir y presentar las referencias en el artículo.", defaultPrompt: "Integra las fuentes para respaldar afirmaciones concretas, no como una lista decorativa. Conserva título, autor o institución, año, editorial o publicación, URL y DOI cuando existan. Evita atribuciones ambiguas y citas que no sostengan el texto. Genera metadatos suficientes para mostrar cada referencia en formato estándar o APA 7, sin inventar información faltante." },
  { id: "approach_proposals", label: "Propuestas de enfoque", group: "Producción", description: "Generación de enfoques para docentes, estudiantes y familias.", defaultPrompt: "Actúa como estratega editorial. Produce tres enfoques genuinamente distintos para docentes, estudiantes y familias. Cada propuesta debe adaptar título, promesa, tono, ejemplos y utilidad al público correspondiente, sin limitarse a sustituir palabras ni repetir la misma estructura." },
  { id: "topic_refinement", label: "Perfeccionar tema", group: "Asistencia", description: "Transformación del tema inicial en un título editorial.", defaultPrompt: "Actúa como editor jefe de un blog educativo. Convierte la idea del usuario en un título específico, natural y atractivo, conservando su intención. Evita exageraciones, fórmulas gastadas, clickbait, clichés y afirmaciones que no puedan sostenerse." },
  { id: "article_drafting", label: "Redacción de artículo", group: "Producción", description: "Voz, estructura y rigor del artículo completo.", defaultPrompt: "Redacta como un autor humano con oficio editorial: voz cálida, observaciones concretas, ritmo natural y transiciones orgánicas. Adapta el contenido a la audiencia y al enfoque. Usa evidencia real, ejemplos verosímiles y explicaciones útiles; evita prosa genérica, repeticiones, grandilocuencia y testimonios inventados." },
  { id: "editorial_review", label: "Auditoría editorial", group: "Calidad", description: "Criterios para detectar y explicar hallazgos.", defaultPrompt: "Actúa como auditor editorial exigente y constructivo. Evalúa claridad, estructura, exactitud, utilidad, tono, legibilidad, SEO natural, calidad de fuentes y adecuación a la audiencia. Señala únicamente problemas reales, ubícalos con precisión y propone correcciones accionables sin reescribir innecesariamente lo que ya funciona." },
  { id: "expansion_report", label: "Informe de ampliación", group: "Asistencia", description: "Análisis previo antes de ampliar contenido.", defaultPrompt: "Antes de modificar el artículo, prepara un informe específico del alcance: qué información se ampliará, qué se modificará, qué se añadirá, en qué ubicación y por qué mejora el texto. Conserva explícitamente los elementos que no necesitan cambios y no apliques todavía ninguna modificación." },
  { id: "assistant_apply", label: "Aplicar instrucción", group: "Asistencia", description: "Comportamiento al editar el artículo desde el asistente.", defaultPrompt: "Aplica la instrucción aprobada con precisión quirúrgica. Mantén intactos el enfoque, la audiencia, los hechos válidos, las fuentes y las secciones fuera del alcance. El resultado debe ser contenido publicable, natural y limpio, sin mencionar prompts, automatización, IA ni procesos internos." },
  { id: "assistant_title", label: "Título del asistente", group: "Asistencia", description: "Creación de títulos desde el modal editorial.", defaultPrompt: "Crea un único título de blog memorable, claro y específico. Respeta la idea original, comunica una promesa realista y evita subtítulos innecesarios, clichés, tono publicitario, clickbait, palabras vacías y explicaciones adicionales." },
  { id: "assistant_humanize", label: "Mejorar especificaciones", group: "Asistencia", description: "Mejora de las notas escritas por el usuario.", defaultPrompt: "Mejora exclusivamente las notas del usuario para volverlas claras, cálidas y accionables. Conserva todos los requisitos y el alcance original. No inventes escenas, fuentes, datos, secciones ni reglas nuevas; entrega una indicación breve en prosa natural, sin etiquetas técnicas ni comentarios sobre IA." }
]);

export function getDefaultMarciePrompts() {
  return Object.fromEntries(MARCIE_PROMPT_DEFINITIONS.map((definition) => [definition.id, definition.defaultPrompt]));
}

export function getFreeMarciePrompts() {
  return Object.fromEntries(MARCIE_PROMPT_DEFINITIONS.map(({ id }) => [id, ""]));
}

function normalizePrompts(prompts = {}) {
  const defaults = getDefaultMarciePrompts();
  return Object.fromEntries(MARCIE_PROMPT_DEFINITIONS.map(({ id }) => {
    const hasValue = Object.prototype.hasOwnProperty.call(prompts || {}, id);
    const value = hasValue && typeof prompts[id] === "string" ? prompts[id].trim() : defaults[id];
    return [id, value];
  }));
}

function readStoredProfiles() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROMPT_PROFILES_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((profile) => profile?.id && ![DEFAULT_PROMPT_PROFILE_ID, FREE_PROMPT_PROFILE_ID].includes(profile.id)).map((profile) => ({ ...profile, prompts: normalizePrompts(profile.prompts) })) : [];
  } catch (_) {
    return [];
  }
}

export function listMarciePromptProfiles() {
  return [
    { id: DEFAULT_PROMPT_PROFILE_ID, name: "Configuración predeterminada", prompts: getDefaultMarciePrompts(), builtIn: true },
    { id: FREE_PROMPT_PROFILE_ID, name: "Modo libre", prompts: getFreeMarciePrompts(), builtIn: true },
    ...readStoredProfiles()
  ];
}

export function getActiveMarciePromptProfileId() {
  try {
    const id = localStorage.getItem(ACTIVE_PROMPT_PROFILE_STORAGE_KEY) || DEFAULT_PROMPT_PROFILE_ID;
    return listMarciePromptProfiles().some((profile) => profile.id === id) ? id : DEFAULT_PROMPT_PROFILE_ID;
  } catch (_) {
    return DEFAULT_PROMPT_PROFILE_ID;
  }
}

export function setActiveMarciePromptProfile(id) {
  const normalized = listMarciePromptProfiles().some((profile) => profile.id === id) ? id : DEFAULT_PROMPT_PROFILE_ID;
  try { localStorage.setItem(ACTIVE_PROMPT_PROFILE_STORAGE_KEY, normalized); } catch (_) {}
  return normalized;
}

export function getActiveMarciePrompt(id) {
  const profiles = listMarciePromptProfiles();
  const profile = profiles.find((item) => item.id === getActiveMarciePromptProfileId()) || profiles[0];
  if (isMarcieFreePromptMode(profile)) return FREE_MODE_RUNTIME_DIRECTIVE;
  if (Object.prototype.hasOwnProperty.call(profile.prompts || {}, id)) return profile.prompts[id];
  return getDefaultMarciePrompts()[id] || "";
}

export function isMarcieFreePromptMode(profile = null) {
  const resolvedProfile = profile || listMarciePromptProfiles().find((item) => item.id === getActiveMarciePromptProfileId());
  return MARCIE_PROMPT_DEFINITIONS.every(({ id }) => !String(resolvedProfile?.prompts?.[id] || "").trim());
}

export function saveMarciePromptProfile({ id = "", name = "", prompts = {} } = {}) {
  const profiles = readStoredProfiles();
  const profileId = id && ![DEFAULT_PROMPT_PROFILE_ID, FREE_PROMPT_PROFILE_ID].includes(id) ? id : `prompt-profile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const existingIndex = profiles.findIndex((profile) => profile.id === profileId);
  const profile = {
    id: profileId,
    name: String(name || "Configuración personalizada").trim().slice(0, 80) || "Configuración personalizada",
    prompts: normalizePrompts(prompts),
    updatedAt: new Date().toISOString()
  };
  if (existingIndex >= 0) profiles[existingIndex] = { ...profiles[existingIndex], ...profile };
  else profiles.push({ ...profile, createdAt: profile.updatedAt });
  try { localStorage.setItem(PROMPT_PROFILES_STORAGE_KEY, JSON.stringify(profiles)); } catch (_) {}
  setActiveMarciePromptProfile(profileId);
  return profile;
}
