export const PRIMARY_CATEGORIES = {
  "Proyectos": ["Proyectos"],
  "Lenguaje y comunicación": ["Artes", "Ortografía", "Gramatica", "ExpresionEscrita", "TrazosDeLetras", "ComprensionLectora", "ExpresionOral", "Habilidades"],
  "Ciencias experimentales": ["Naturales", "ConocimientoDelMedio", "MiLocalidad"],
  "Ciencias sociales": ["Historia", "Geografia"],
  "Formación socioemocional": ["CivicaEtica", "Socioemocional"],
  "Matemáticas": ["Matematicas"]
};

export const ALL_OPTION = "Todos";

export const GRADES_BY_LEVEL = {
  "Preescolar": ["Primero", "Segundo", "Tercero"],
  "Primaria": ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto"],
  "Secundaria": ["Primero", "Segundo", "Tercero"]
};

export const DIFFICULTY_LEVELS = [
  { id: "easy", label: "Más fácil", prompt: "Hazlo más fácil, concreto, con menos carga cognitiva y frases cortas." },
  { id: "normal", label: "Normal", prompt: "Mantén dificultad adecuada para el grado." },
  { id: "challenging", label: "Más retador", prompt: "Aumenta el reto con análisis, relación y justificación sin perder claridad." },
  { id: "expert", label: "Experto", prompt: "Eleva el reto para estudiantes avanzados con transferencia, argumentación y síntesis." }
];

export const PROJECT_METHODOLOGY_BY_TRIMESTER = {
  "1": "ABP",
  "2": "STEAM",
  "3": "AS"
};

export const PROJECT_PHASES_BY_METHODOLOGY = {
  ABP: ["Indagar", "Recolectar", "Formular el problema", "Organizar la experiencia", "Vivir la experiencia", "Resultados y análisis"],
  STEAM: ["Fase 1 Análisis del contexto y diagnóstico", "Fase 2 Diseño del proyecto e indagación", "Fase 3 Organización de la información", "Fase 4 Presentación de resultados", "Fase 5 Reflexión y evaluación"],
  AS: ["Punto de partida", "Lo que sé y quiero saber", "Organicemos", "Creatividad en marcha", "Compartimos y evaluamos"]
};

export const ACTIVITY_HTML_CONTRACT = `
<div class="activity">
  <p><strong>Lee con atención el texto.</strong> Subraya las ideas principales y comenta una evidencia. [IC T. IND]</p>
  <ol class="steps steps-numbered">
    <li>Subinstrucción<div class="answer"><span style="color:mediumvioletred;">Respuesta: respuesta esperada.</span></div></li>
  </ol>
</div>`;

const IMPERATIVE_VERBS = [
  "lee", "observa", "subraya", "resuelve", "explica", "escribe", "completa", "ordena",
  "colorea", "marca", "identifica", "relaciona", "compara", "dibuja", "recorta", "pega",
  "encierra", "clasifica", "argumenta", "justifica", "localiza", "traza", "representa",
  "anota", "separa", "elige", "construye", "organiza", "describe", "menciona", "revisa"
];

export function getDifficultyPrompt(id = "normal") {
  return DIFFICULTY_LEVELS.find((item) => item.id === id)?.prompt || DIFFICULTY_LEVELS[1].prompt;
}

export function getCategoriesForGrade(grade = "") {
  const safeGrade = String(grade || "").trim();
  const out = JSON.parse(JSON.stringify(PRIMARY_CATEGORIES));
  if (!["Primero", "Segundo"].includes(safeGrade)) {
    out["Lenguaje y comunicación"] = out["Lenguaje y comunicación"].filter((item) => item !== "TrazosDeLetras");
  }
  return out;
}

export function getGradesForLevel(level = "Primaria") {
  return [...(GRADES_BY_LEVEL[String(level || "").trim()] || GRADES_BY_LEVEL.Primaria)];
}

export function isProjectSelection({ category = "", subtopic = "" } = {}) {
  return String(category || "").trim() === "Proyectos" || String(subtopic || "").trim() === "Proyectos";
}

export function getWorkModeLabel({ category = "", subtopic = "" } = {}) {
  return isProjectSelection({ category, subtopic }) ? "proyecto" : "activities";
}

export function getProjectMethodology(trimester = "") {
  return PROJECT_METHODOLOGY_BY_TRIMESTER[String(trimester || "").trim()] || "ABP";
}

export function getProjectPhases(trimester = "") {
  const methodology = getProjectMethodology(trimester);
  return [...(PROJECT_PHASES_BY_METHODOLOGY[methodology] || PROJECT_PHASES_BY_METHODOLOGY.ABP)];
}

export function validateActivityHtml(html = "") {
  const source = String(html || "").trim();
  const errors = [];
  if (!source) errors.push("La actividad está vacía.");
  if (!/\bclass=["'][^"']*\bactivity\b/i.test(source)) errors.push("Falta el bloque .activity.");
  if (!/<strong\b/i.test(source)) errors.push("Falta instrucción principal en negritas.");
  if (!/<ol\b[^>]*class=["'][^"']*\bsteps\b[^"']*\bsteps-numbered\b/i.test(source)) errors.push("Falta lista de subinstrucciones ol.steps.steps-numbered.");
  if (!/\bclass=["'][^"']*\banswer\b/i.test(source)) errors.push("Faltan respuestas esperadas .answer.");
  if (!/<li\b/i.test(source)) errors.push("Faltan subinstrucciones en <li>.");
  const lead = extractFirstInstructionText(source);
  if (!lead) {
    errors.push("Falta el párrafo principal de la activity.");
  } else {
    if (!/[.!?]$/.test(lead)) errors.push("La instrucción en negritas debe cerrar su primera oración.");
    if (!startsWithImperativeVerb(lead)) errors.push("La instrucción principal debe comenzar con verbo imperativo.");
  }
  return { ok: errors.length === 0, errors };
}

export function normalizeActivityHtml(html = "") {
  const source = String(html || "").trim();
  if (!source || typeof DOMParser === "undefined") return source;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${source}</div>`, "text/html");
  const activities = Array.from(doc.querySelectorAll(".activity"));
  if (!activities.length) return source;

  activities.forEach((activity) => {
    const firstParagraph = activity.querySelector(":scope > p");
    if (!firstParagraph) return;

    const plainText = String(firstParagraph.textContent || "").replace(/\s+/g, " ").trim();
    if (!plainText) return;

    const badgeMatch = plainText.match(/(\[IC[^\]]+\])\s*$/i);
    const badge = badgeMatch?.[1] || "";
    const contentWithoutBadge = badge ? plainText.replace(/\[IC[^\]]+\]\s*$/i, "").trim() : plainText;
    const splitMatch = contentWithoutBadge.match(/^([\s\S]*?[.!?])\s*([\s\S]*)$/);
    const boldPart = String(splitMatch?.[1] || contentWithoutBadge).replace(/\s+/g, " ").trim();
    const restPart = String(splitMatch?.[2] || "").replace(/\s+/g, " ").trim();
    if (!boldPart) return;

    firstParagraph.innerHTML = [
      `<strong>${escapeHtmlText(boldPart)}</strong>`,
      restPart ? escapeHtmlText(restPart) : "",
      badge ? escapeHtmlText(badge) : ""
    ].filter(Boolean).join(" ");
  });

  return doc.body.innerHTML.replace(/^<div>|<\/div>$/g, "");
}

export function buildActivityContractPrompt({ grade = "", category = "", subtopic = "", difficulty = "normal", relateToReading = true } = {}) {
  const categories = getCategoriesForGrade(grade);
  const useAllCategories = !category || category === ALL_OPTION;
  const focusedCategories = !useAllCategories && categories[category]
    ? { [category]: subtopic && subtopic !== ALL_OPTION && categories[category].includes(subtopic) ? [subtopic] : categories[category] }
    : categories;
  return [
    "Genera actividades de Primaria con libertad pedagógica, pero conserva estrictamente la estructura HTML indicada.",
    `Dificultad: ${getDifficultyPrompt(difficulty)}`,
    relateToReading ? "Relaciona las actividades con la lectura cuando haya lectura disponible." : "No obligues relación con la lectura; usa la lectura solo como contexto opcional.",
    useAllCategories ? "Categoría objetivo: todas las categorías visibles del formulario." : `Categoría objetivo: ${category}`,
    !subtopic || subtopic === ALL_OPTION ? "Subtema objetivo: todos los subtemas visibles dentro de la selección actual." : `Subtema objetivo: ${subtopic}`,
    "Categorías y subtemas disponibles:",
    JSON.stringify(focusedCategories, null, 2),
    "Contrato obligatorio por actividad:",
    ACTIVITY_HTML_CONTRACT,
    "La instrucción principal debe empezar con un verbo en imperativo dirigido al alumno, por ejemplo: Lee, Observa, Resuelve, Escribe, Subraya, Dibuja o Compara.",
    "Solo la primera oración de la instrucción principal va dentro de <strong> y debe cerrar con punto. El resto del párrafo va en texto normal dentro del mismo <p>.",
    "El identificador [IC T. IND], [IC T. PAR] o [IC T. EQUI] debe quedar al final del mismo párrafo principal, fuera del <strong>.",
    "Cada subinstrucción debe incluir su propia respuesta esperada dentro de .answer.",
    isProjectSelection({ category, subtopic })
      ? "Si el subtema activo es Proyectos, organiza la secuencia como proyecto trimestral por fases, manteniendo la misma estructura .activity en cada fase."
      : "Si no es proyecto, mantén formato de actividades regulares del subtema seleccionado.",
    "No expliques el contrato al usuario; devuelve bloques HTML utilizables."
  ].join("\n\n");
}

function extractFirstInstructionText(source = "") {
  const match = String(source || "").match(/<p[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>/i);
  return match ? decodeHtmlEntities(match[1]).replace(/\s+/g, " ").trim() : "";
}

function startsWithImperativeVerb(text = "") {
  const firstWord = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/^[a-zñü]+/)?.[0] || "";
  return IMPERATIVE_VERBS.includes(firstWord);
}

function decodeHtmlEntities(text = "") {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function escapeHtmlText(text = "") {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
