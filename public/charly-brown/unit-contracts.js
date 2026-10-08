import { buildExerciseDynamicsDirective, getStoredExerciseDynamics } from "./exercise-dynamics-catalog.js";

export const PRIMARY_CATEGORIES = {
  "Proyectos": ["Proyectos"],
  "Lenguaje y comunicación": ["Artes", "Ortografía", "ComprensionLectora", "Gramatica", "ExpresionEscrita", "ExpresionOral", "Habilidades", "Dictado"],
  "Ciencias experimentales": ["Naturales", "ConocimientoDelMedio", "MiLocalidad"],
  "Ciencias sociales": ["Historia", "Geografia", "CivicaEtica"],
  "Formación socioemocional": ["Socioemocional"],
  "Matemáticas": ["Matematicas"]
};

export const ALL_KNOWN_SUBTOPICS_BY_CATEGORY = Object.freeze({
  "Proyectos": ["Proyectos"],
  "Lenguaje y comunicación": ["Artes", "Ortografía", "Gramatica", "ExpresionEscrita", "TrazosDeLetras", "ComprensionLectora", "ExpresionOral", "Habilidades", "Dictado"],
  "Ciencias experimentales": ["ConocimientoDelMedio", "Naturales"],
  "Ciencias sociales": ["Historia", "Geografia", "MiLocalidad", "CivicaEtica"],
  "Formación socioemocional": ["Socioemocional"],
  "Matemáticas": ["Matematicas"]
});

export const GRADE_CATEGORY_DEFAULTS = Object.freeze({
  "Primero": {
    "Proyectos": ["Proyectos"],
    "Lenguaje y comunicación": ["Artes", "Ortografía", "TrazosDeLetras", "ComprensionLectora", "ExpresionOral", "Habilidades", "Dictado"],
    "Ciencias experimentales": ["ConocimientoDelMedio"],
    "Ciencias sociales": ["CivicaEtica"],
    "Formación socioemocional": ["Socioemocional"],
    "Matemáticas": ["Matematicas"]
  },
  "Segundo": {
    "Proyectos": ["Proyectos"],
    "Lenguaje y comunicación": ["Artes", "Ortografía", "TrazosDeLetras", "ComprensionLectora", "ExpresionOral", "Habilidades", "Dictado"],
    "Ciencias experimentales": ["ConocimientoDelMedio"],
    "Ciencias sociales": ["CivicaEtica"],
    "Formación socioemocional": ["Socioemocional"],
    "Matemáticas": ["Matematicas"]
  },
  "Tercero": {
    "Proyectos": ["Proyectos"],
    "Lenguaje y comunicación": ["Artes", "Ortografía", "Gramatica", "ExpresionEscrita", "ComprensionLectora", "ExpresionOral", "Habilidades", "Dictado"],
    "Ciencias experimentales": [],
    "Ciencias sociales": ["MiLocalidad", "CivicaEtica"],
    "Formación socioemocional": ["Socioemocional"],
    "Matemáticas": ["Matematicas"]
  },
  "Cuarto": {
    "Proyectos": ["Proyectos"],
    "Lenguaje y comunicación": ["Artes", "Ortografía", "Gramatica", "ExpresionEscrita", "ComprensionLectora", "ExpresionOral", "Habilidades", "Dictado"],
    "Ciencias experimentales": ["Naturales"],
    "Ciencias sociales": ["Historia", "Geografia", "CivicaEtica"],
    "Formación socioemocional": ["Socioemocional"],
    "Matemáticas": ["Matematicas"]
  },
  "Quinto": {
    "Proyectos": ["Proyectos"],
    "Lenguaje y comunicación": ["Artes", "Ortografía", "Gramatica", "ExpresionEscrita", "ComprensionLectora", "ExpresionOral", "Habilidades", "Dictado"],
    "Ciencias experimentales": ["Naturales"],
    "Ciencias sociales": ["Historia", "Geografia", "CivicaEtica"],
    "Formación socioemocional": ["Socioemocional"],
    "Matemáticas": ["Matematicas"]
  },
  "Sexto": {
    "Proyectos": ["Proyectos"],
    "Lenguaje y comunicación": ["Artes", "Ortografía", "Gramatica", "ExpresionEscrita", "ComprensionLectora", "ExpresionOral", "Habilidades", "Dictado"],
    "Ciencias experimentales": ["Naturales"],
    "Ciencias sociales": ["Historia", "Geografia", "CivicaEtica"],
    "Formación socioemocional": ["Socioemocional"],
    "Matemáticas": ["Matematicas"]
  }
});

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

export const PROJECT_DETAILS_BY_TRIMESTER = Object.freeze({
  "1": {
    methodology: "ABP",
    title: "Aprendizaje Basado en Problemas (ABP)",
    phases: ["Indagar", "Recolectar", "Formular el problema", "Organizar la experiencia", "Vivir la experiencia", "Resultados y análisis"]
  },
  "2": {
    methodology: "STEAM",
    title: "Proyecto STEAM",
    phases: ["Fase 1 Análisis del contexto y diagnóstico", "Fase 2 Diseño del proyecto e indagación", "Fase 3 Organización de la información", "Fase 4 Presentación de resultados", "Fase 5 Reflexión y evaluación"]
  },
  "3": {
    methodology: "AS",
    title: "Aprendizaje de Servicios (AS)",
    phases: ["Punto de partida", "Lo que sé y quiero saber", "Organicemos", "Creatividad en marcha", "Compartimos y evaluamos"]
  }
});

export const ACTIVITY_HTML_CONTRACT = `
<h2 class="cb-activity-title" style="font-family: 'Fredoka', 'Quicksand', 'Nunito', system-ui, sans-serif; font-size: 1.55rem; font-weight: 600; line-height: 1.25; margin-bottom: 0.75rem;">[Título temático del subtema]</h2>
<div class="activity">
  <p><strong>Lee con atención el texto.</strong> Subraya las ideas principales y comenta una evidencia. [IC. T. IND]</p>
  <ol class="steps steps-numbered">
    <li>Subinstrucción<div class="answer"><span class="cb-teacher-resp" style="color:#e6007e;">Respuesta personal: respuesta esperada.</span></div></li>
  </ol>
</div>`;

export const TRACING_LETTERS_HTML_CONTRACT = `
<div class="activity">
  <p><strong>Traza la letra siguiendo la dirección indicada.</strong> [IC. T. IND]</p>
  <div class="trace-model">[modelo de letra, sílaba, palabra o frase breve]</div>
  <div class="answer"><span class="cb-teacher-resp" style="color:#e6007e;">[modelo exacto que se debe trazar]</span></div>
</div>`;

export const DICTATION_HTML_CONTRACT = `
<h2 class="cb-activity-title" style="font-family: 'Fredoka', 'Quicksand', 'Nunito', system-ui, sans-serif; font-size: 1.55rem; font-weight: 600; line-height: 1.25; margin-bottom: 0.75rem;">Dictado</h2>
<div class="activity">
  <p><strong>Escribe en cada renglón la palabra que te dicte tu maestro.</strong> [IC. T. IND]</p>
  <ol class="steps steps-numbered cb-dictado-list">
    <li><div class="cb-response-line"><div class="answer"><span class="cb-teacher-resp" style="color:#e6007e;">[palabra 1]</span></div></div></li>
    <li><div class="cb-response-line"><div class="answer"><span class="cb-teacher-resp" style="color:#e6007e;">[palabra 2]</span></div></div></li>
    <li><div class="cb-response-line"><div class="answer"><span class="cb-teacher-resp" style="color:#e6007e;">[palabra 3]</span></div></div></li>
    <li><div class="cb-response-line"><div class="answer"><span class="cb-teacher-resp" style="color:#e6007e;">[palabra 4]</span></div></div></li>
    <li><div class="cb-response-line"><div class="answer"><span class="cb-teacher-resp" style="color:#e6007e;">[palabra 5]</span></div></div></li>
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

const GRADE_CUSTOM_STORAGE_PREFIX = "charly_custom_subtopics_";

export function getCustomGradeCategories(grade = "") {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(`${GRADE_CUSTOM_STORAGE_PREFIX}${String(grade || "").trim()}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
}

export function saveCustomGradeCategories(grade = "", config = {}) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(`${GRADE_CUSTOM_STORAGE_PREFIX}${String(grade || "").trim()}`, JSON.stringify(config || {}));
  } catch (error) {
    console.warn("[unit-contracts] Error saving custom grade categories:", error);
  }
}

export function resetCustomGradeCategories(grade = "") {
  try {
    if (typeof localStorage === "undefined") return;
    if (grade) {
      localStorage.removeItem(`${GRADE_CUSTOM_STORAGE_PREFIX}${String(grade || "").trim()}`);
    } else {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(GRADE_CUSTOM_STORAGE_PREFIX)) localStorage.removeItem(key);
      });
    }
  } catch (error) {
    console.warn("[unit-contracts] Error resetting custom grade categories:", error);
  }
}

export function getDefaultCategoriesForGrade(grade = "") {
  const safeGrade = String(grade || "").trim();
  if (GRADE_CATEGORY_DEFAULTS[safeGrade]) {
    return JSON.parse(JSON.stringify(GRADE_CATEGORY_DEFAULTS[safeGrade]));
  }
  const out = JSON.parse(JSON.stringify(PRIMARY_CATEGORIES));
  if (["Primero", "Segundo"].includes(safeGrade)) {
    out["Lenguaje y comunicación"] = ["Artes", "Ortografía", "TrazosDeLetras", "ComprensionLectora", "ExpresionOral", "Habilidades", "Dictado"];
  }
  return out;
}

export function getCategoriesForGrade(grade = "") {
  const safeGrade = String(grade || "").trim();
  const custom = getCustomGradeCategories(safeGrade);
  const categories = custom && Object.keys(custom).length > 0
    ? JSON.parse(JSON.stringify(custom))
    : getDefaultCategoriesForGrade(safeGrade);
  if (safeGrade === "Tercero") {
    categories["Ciencias experimentales"] = (categories["Ciencias experimentales"] || []).filter((item) => item !== "MiLocalidad");
    categories["Ciencias sociales"] = Array.from(new Set([...(categories["Ciencias sociales"] || []), "MiLocalidad"]));
  }
  // Cívica y Ética corresponde al trabajo social y ciudadano de todos los grados.
  categories["Formación socioemocional"] = (categories["Formación socioemocional"] || []).filter((item) => item !== "CivicaEtica");
  categories["Ciencias sociales"] = Array.from(new Set([...(categories["Ciencias sociales"] || []), "CivicaEtica"]));
  return categories;
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

export function isTracingLettersSelection({ subtopic = "", section = "" } = {}) {
  return normalizeKey(subtopic || section) === "trazosdeletras";
}

export function isDictationSelection({ subtopic = "", section = "" } = {}) {
  return normalizeKey(subtopic || section) === "dictado";
}

export function validateActivityHtml(html = "", { subtopic = "", section = "" } = {}) {
  const source = String(html || "").trim();
  const errors = [];
  const isTracingLetters = isTracingLettersSelection({ subtopic, section });
  const isDictation = isDictationSelection({ subtopic, section });
  if (!source) errors.push("La actividad está vacía.");
  if (!/\bclass=["'][^"']*\bactivity\b/i.test(source)) errors.push("Falta el bloque .activity.");
  if (!/<strong\b/i.test(source)) errors.push("Falta instrucción principal en negritas.");
  if (!/\bclass=["'][^"']*\banswer\b/i.test(source)) errors.push("Faltan respuestas esperadas .answer.");
  if (isTracingLetters) {
    const activityCount = countClassOccurrences(source, "activity");
    if (activityCount !== 4) errors.push("Trazos de letras requiere exactamente cuatro actividades progresivas.");
    if (/<(?:ol|ul|li)\b/i.test(source)) errors.push("Trazos de letras no debe contener listas ni subinstrucciones internas.");
    if (countClassOccurrences(source, "trace-model") < 4) errors.push("Cada actividad de trazos debe mostrar su modelo de escritura.");
    if (countClassOccurrences(source, "answer") < 4) errors.push("Cada actividad de trazos debe incluir su respuesta modelo.");
    const highlightedAnswers = source.match(/style=["'][^"']*color\s*:\s*(?:magenta|mediumvioletred)/gi)?.length || 0;
    if (highlightedAnswers < 4) errors.push("Cada modelo de respuesta debe mostrarse en color magenta.");
  } else if (isDictation) {
    if (!/<ol\b[^>]*class=["'][^"']*(?:steps\b[^"']*\bsteps-numbered\b|cb-dictado-list\b)/i.test(source)) {
      errors.push("Dictado requiere una lista numerada ol.steps.steps-numbered o ol.cb-dictado-list.");
    }
    if (!/<li\b/i.test(source)) errors.push("Dictado requiere elementos de lista <li>.");
  } else {
    if (!/<ol\b[^>]*class=["'][^"']*\bsteps\b[^"']*\bsteps-numbered\b/i.test(source)) errors.push("Falta lista de subinstrucciones ol.steps.steps-numbered.");
    if (!/<li\b/i.test(source)) errors.push("Faltan subinstrucciones en <li>.");
  }
  const lead = extractFirstInstructionText(source);
  if (!lead) {
    errors.push("Falta el párrafo principal de la activity.");
  } else {
    if (!/[.!?]$/.test(lead)) errors.push("La instrucción en negritas debe cerrar su primera oración.");
    if (!startsWithImperativeVerb(lead)) errors.push("La instrucción principal debe comenzar con verbo imperativo.");
  }
  return { ok: errors.length === 0, errors };
}

export function normalizeIcTokensAndPlacement(rawHtml = "") {
  let source = String(rawHtml || "").trim();
  if (!source || (!source.includes("[IC") && !source.includes("cb-ic-badge"))) return source;

  // 1. Desarmar tablas con celda separada para [IC...]
  source = source.replace(/<td\b([^>]*)>([\s\S]*?)<\/td>\s*<td\b[^>]*>\s*(\[IC\.[^\]]+\])\s*<\/td>/gi, (_match, attrs, content, ic) =>
    `<td${attrs}>${content.trim()} ${ic.trim()}</td>`
  );

  // 2. Si la tabla era solo un contenedor de 1 fila y 1 celda para la instrucción, convertirla a párrafo
  source = source.replace(/<table\b[^>]*>\s*(?:<tbody>\s*)?<tr>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<\/tr>\s*(?:<\/tbody>\s*)?<\/table>/gi, (_match, content) =>
    `<p>${content.trim()}</p>`
  );

  // 3. Desarmar contenedores flex/grid con space-between o 2 elementos para la instrucción e IC
  source = source.replace(/<(?:div|p)\b[^>]*style=["'][^"']*(?:justify-content\s*:\s*space-between|display\s*:\s*flex)[^"']*["'][^>]*>\s*<(?:span|p|div)\b[^>]*>([\s\S]*?)<\/(?:span|p|div)>\s*<(?:span|p|div)\b[^>]*>\s*(\[IC\.[^\]]+\])\s*<\/(?:span|p|div)>\s*<\/(?:div|p)>/gi, (_match, content, ic) =>
    `<p>${content.trim()} ${ic.trim()}</p>`
  );

  // 4. Eliminar float: right en tokens IC
  source = source.replace(/(<span\b[^>]*)\bstyle=["'][^"']*float\s*:\s*right;?[^"']*["']([^>]*>[\s\S]*?\[IC\.[^\]]+\][\s\S]*?<\/span>)/gi, "$1$2");

  // 5. Eliminar saltos <br> antes de [IC...]
  source = source.replace(/<br\s*\/?>\s*(\[IC\.[^\]]+\])/gi, " $1");

  // 6. Si hay párrafos sueltos que solo contienen [IC...], unirlos con el párrafo previo
  source = source.replace(/<\/p>\s*<p>\s*(\[IC\.[^\]]+\])\s*<\/p>/gi, " $1</p>");

  // 7. En cb-simple-instruction, asegurar que [IC...] quede inmediatamente junto a strong sin dividir en columnas
  source = source.replace(/<div\b([^>]*)class=["']([^"']*\bcb-simple-instruction\b[^"']*)["']([^>]*)>\s*(<span\b[^>]*class=["'][^"']*cb-instruction-tag[^"']*["'][^>]*>[\s\S]*?<\/span>)?\s*(<strong\b[^>]*>[\s\S]*?<\/strong>)\s*(?:<br\s*\/?>)?\s*(?:<(?:div|span|p)[^>]*>)?\s*(\[IC\.[^\]]+\])\s*(?:<\/(?:div|span|p)>)?\s*([\s\S]*?)<\/div>/gi,
    `<div$1class="$2"$3>$4 $5 $6 $7</div>`
  );

  // 8. Si después del token [IC...] hay texto en la misma fila, hacer punto y aparte con <br class="cb-ic-break">
  source = source.replace(/(\[IC\.[^\]]+\])(\s*)([^\s<][^<]*)/gi, "$1<br class=\"cb-ic-break\">\n$3");

  // 9. Desanidar badges cb-ic-badge anidados recursivamente
  while (/<span\b[^>]*class=["'][^"']*\bcb-ic-badge\b[^"']*["'][^>]*>\s*<span\b[^>]*class=["'][^"']*\bcb-ic-badge\b[^"']*["'][^>]*>/i.test(source)) {
    source = source.replace(/<span\b([^>]*)class=["']([^"']*\bcb-ic-badge\b[^"']*)["']([^>]*)>\s*<span\b[^>]*class=["'][^"']*\bcb-ic-badge\b[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*<\/span>/gi,
      `<span$1class="$2"$3>$4</span>`
    );
  }

  if (typeof DOMParser === "undefined") return source;

  try {
    const doc = new DOMParser().parseFromString(`<div>${source}</div>`, "text/html");
    const root = doc.body.firstElementChild || doc.body;

    // Desanidar cualquier badge .cb-ic-badge que esté dentro de otro .cb-ic-badge
    root.querySelectorAll(".cb-ic-badge .cb-ic-badge").forEach((innerBadge) => {
      innerBadge.replaceWith(...innerBadge.childNodes);
    });

    // Normalizar cb-simple-instruction para que no divida en columnas
    root.querySelectorAll(".cb-simple-instruction").forEach((instructionEl) => {
      instructionEl.style.display = "block";
      const ic = instructionEl.querySelector(".cb-ic-badge, [class*='cb-ic']");
      const strong = instructionEl.querySelector("strong");
      if (ic && strong && strong.nextSibling !== ic) {
        strong.insertAdjacentElement("afterend", ic);
      }
    });

    // Asegurar punto y aparte tras cb-ic-badge--modality si hay texto o elementos siguientes
    root.querySelectorAll(".cb-ic-badge--modality, [class*='cb-ic-badge--modality']").forEach((badge) => {
      let next = badge.nextSibling;
      while (next && next.nodeType === 3 && !next.textContent.trim()) {
        next = next.nextSibling;
      }
      if (next && next.nodeName !== "BR") {
        const br = doc.createElement("br");
        br.className = "cb-ic-break";
        badge.insertAdjacentElement("afterend", br);
      }
    });

    // Desarmar cualquier tabla residual
    const cells = Array.from(root.querySelectorAll("td, th"));
    cells.forEach((cell) => {
      const text = cell.textContent.trim();
      if (/^\[IC\.[^\]]+\]$/i.test(text)) {
        const prev = cell.previousElementSibling;
        if (prev) {
          prev.innerHTML = `${prev.innerHTML.trim()} ${escapeHtmlText(text)}`;
          cell.remove();
        }
      }
    });

    root.querySelectorAll("table").forEach((table) => {
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length === 1) {
        const remaining = rows[0].querySelectorAll("td, th");
        if (remaining.length === 1) {
          const p = doc.createElement("p");
          p.innerHTML = remaining[0].innerHTML;
          table.parentNode?.replaceChild(p, table);
        }
      }
    });

    root.querySelectorAll("p, div:not(.answer):not(.cb-response-line)").forEach((el) => {
      const text = el.textContent.trim();
      if (/^\[IC\.[^\]]+\]$/i.test(text)) {
        const prev = el.previousElementSibling;
        if (prev && (prev.tagName === "P" || prev.tagName === "LI" || prev.tagName === "DIV")) {
          prev.innerHTML = `${prev.innerHTML.trim()} ${text}`;
          el.remove();
        }
      }
    });

    return root.innerHTML;
  } catch (_) {
    return source;
  }
}

export function normalizeActivityHtml(html = "") {
  let source = String(html || "").trim();
  if (!source || typeof DOMParser === "undefined") return source;
  source = normalizeIcTokensAndPlacement(source);

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${source}</div>`, "text/html");
  doc.querySelectorAll(".cb-cintillo-axis, .cb-detonador-block, .header-tag, [class*='cintillo'], [class*='detonad']").forEach((node) => node.remove());
  const activities = Array.from(doc.querySelectorAll(".activity"));
  if (!activities.length) return doc.body.innerHTML.replace(/^<div>|<\/div>$/g, "");

  activities.forEach((activity) => {
    const firstParagraph = activity.querySelector(":scope > p");
    if (!firstParagraph) return;

    const plainText = String(firstParagraph.textContent || "").replace(/\s+/g, " ").trim();
    if (!plainText) return;

    const badgeMatch = plainText.match(/(\[IC[^\]]+\]|👤|👥👥|👥|🎙️|✏️|✂️|🧠|🟨)\s*$/u);
    const badge = badgeMatch?.[1] || "";
    const contentWithoutBadge = badge ? plainText.slice(0, plainText.lastIndexOf(badge)).trim() : plainText;
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

  doc.querySelectorAll(".cb-word-search-grid").forEach((grid) => {
    const spans = grid.querySelectorAll("span");
    const count = spans.length;
    if (!count) return;
    const styleAttr = grid.getAttribute("style") || "";
    const match = styleAttr.match(/repeat\(\s*(\d+)/i);
    let cols = match ? parseInt(match[1], 10) : 0;
    if (!cols || cols < 3) {
      if (count % 10 === 0) cols = 10;
      else if (count % 12 === 0) cols = 12;
      else if (count % 8 === 0) cols = 8;
      else if (count % 14 === 0) cols = 14;
      else cols = Math.round(Math.sqrt(count)) || 10;
    }
    grid.style.setProperty("--cb-grid-cols", String(cols));
    grid.style.setProperty("grid-template-columns", `repeat(${cols}, 28px)`);
  });

  return doc.body.innerHTML.replace(/^<div>|<\/div>$/g, "");
}

export function integrateResourceUsageIntoActivityHtml(html = "", resource = {}) {
  let source = String(html || "").trim();
  if (!source || !resource) return source;

  const type = String(resource.type || "").toLowerCase();
  const code = String(resource.code || resource.title || "Recurso 1a").trim();

  // Si ya menciona el código o título del recurso, no duplicar
  if (source.toLowerCase().includes(code.toLowerCase())) {
    return source;
  }

  const isCutout = type.includes("cutout") || type.includes("recort");
  const isAnnex = type.includes("annex") || type.includes("anexo");
  const isWorksheet = type.includes("worksheet") || type.includes("ficha");
  const isVideo = type.includes("video");

  const pasteAreaHtml = isCutout
    ? `<div class="cb-cutout-paste-area" style="margin: 10px 0; padding: 14px; border: 1.5px dashed #3b82f6; border-radius: 10px; text-align: center; background: rgba(59, 130, 246, 0.04); color: #1d4ed8; font-weight: 600; font-size: 13px;"><i class="fas fa-scissors" style="margin-right: 6px;"></i>Pega aquí las piezas de ${code}</div>`
    : "";

  const formatAdaptedLead = (originalLead = "") => {
    let clean = String(originalLead || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[0-9]+[.)\-]\s*/, "")
      .replace(/[.:;]+$/, "")
      .trim();

    if (!clean) clean = "Realiza los ejercicios planteados";
    const lowerLead = clean.charAt(0).toLowerCase() + clean.slice(1);

    if (isCutout) {
      if (/clasifica|pega|arma|coloca|recorta|organiza/i.test(clean)) {
        return `Recorta las piezas de ${code} y ${lowerLead} pegándolas en el espacio asignado`;
      }
      return `Recorta las piezas de ${code} y pégalas para ${lowerLead}`;
    }
    if (isAnnex) {
      if (/consulta|observa|lee|analiza|revisa/i.test(clean)) {
        return `Consulta el ${code} y ${lowerLead}`;
      }
      return `Consulta el ${code} para ${lowerLead}`;
    }
    if (isWorksheet) {
      if (/resuelve|completa|practica|escribe/i.test(clean)) {
        return `Resuelve la ${code} y ${lowerLead}`;
      }
      return `Resuelve la ${code} como apoyo para ${lowerLead}`;
    }
    if (isVideo) {
      return `Observa el video ${code} y ${lowerLead}`;
    }
    return `Utiliza el material ${code} para ${lowerLead}`;
  };

  // 1. Si la actividad tiene lista de ejercicios/pasos <ol...> con <li>
  const liMatches = [...source.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi)];
  if (liMatches.length > 0) {
    let bestIndex = 0;
    let bestScore = -1;

    for (let i = 0; i < liMatches.length; i++) {
      const content = liMatches[i][2];
      const text = content.replace(/<[^>]+>/g, " ").toLowerCase();
      let score = 0;

      if (isCutout) {
        if (/pega|clasifica|arma|coloca|recorta|organiza/i.test(text)) score += 15;
        if (/cuaderno|espacio|recuadro|tabla|columna/i.test(text)) score += 8;
        if (i >= 1) score += 4;
      } else if (isAnnex) {
        if (/consulta|observa|lee|analiza|informacion|infografia|mapa|texto/i.test(text)) score += 15;
        if (/responde|tabla|esquema|preguntas/i.test(text)) score += 8;
        if (i === 0 || i === 1) score += 4;
      } else if (isWorksheet) {
        if (/resuelve|ejercicio|completa|practica|escribe|preguntas|problema/i.test(text)) score += 15;
        if (i >= 1) score += 4;
      } else if (isVideo) {
        if (/observa|video|comenta|plenaria|dialoga|reflexiona/i.test(text)) score += 15;
        if (i === 0) score += 4;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    const chosen = liMatches[bestIndex];
    const fullLi = chosen[0];
    const liAttrs = chosen[1];
    const innerContent = chosen[2];

    let adaptedInner = "";
    const strongMatch = innerContent.match(/^([\s\S]*?<strong\b[^>]*>)([\s\S]*?)(<\/strong>)([\s\S]*)$/i);
    if (strongMatch) {
      const adaptedLead = formatAdaptedLead(strongMatch[2]);
      adaptedInner = `${strongMatch[1]}${adaptedLead}.${strongMatch[3]}${strongMatch[4]}${pasteAreaHtml ? `\n    ${pasteAreaHtml}` : ""}`;
    } else {
      const firstSentence = innerContent.match(/^([^.!?:]+[.!?:]?)([\s\S]*)$/);
      if (firstSentence) {
        const adaptedLead = formatAdaptedLead(firstSentence[1]);
        adaptedInner = `<strong>${adaptedLead}.</strong>${firstSentence[2]}${pasteAreaHtml ? `\n    ${pasteAreaHtml}` : ""}`;
      } else {
        const adaptedLead = formatAdaptedLead(innerContent);
        adaptedInner = `<strong>${adaptedLead}.</strong>${pasteAreaHtml ? `\n    ${pasteAreaHtml}` : ""}`;
      }
    }

    return source.replace(fullLi, `<li${liAttrs}>${adaptedInner}</li>`);
  }

  // 2. Si no tiene <li>, buscar la consigna en <p><strong>...</strong></p>
  const pStrongMatch = source.match(/<p\b([^>]*)>\s*<strong\b[^>]*>([\s\S]*?)<\/strong>([\s\S]*?)<\/p>/i);
  if (pStrongMatch) {
    const fullP = pStrongMatch[0];
    const pAttrs = pStrongMatch[1];
    const oldLead = pStrongMatch[2];
    const restOfP = pStrongMatch[3];
    const adaptedLead = formatAdaptedLead(oldLead);
    const newP = `<p${pAttrs}><strong>${adaptedLead}.</strong>${restOfP}</p>${pasteAreaHtml ? `\n${pasteAreaHtml}` : ""}`;
    return source.replace(fullP, newP);
  }

  // 3. Si no tiene estructura reconocible, complementar al inicio dentro de activity
  if (/<div\b[^>]*class=["'][^"']*\bactivity\b[^"']*["'][^>]*>/i.test(source)) {
    const defaultInstruction = `<p><strong>${formatAdaptedLead("Realiza la actividad")}.</strong></p>${pasteAreaHtml ? `\n${pasteAreaHtml}` : ""}`;
    return source.replace(/(<div\b[^>]*class=["'][^"']*\bactivity\b[^"']*["'][^>]*>)/i, `$1\n  ${defaultInstruction}`);
  }

  return `${source}\n<p><strong>${formatAdaptedLead("Realiza la actividad")}.</strong></p>${pasteAreaHtml ? `\n${pasteAreaHtml}` : ""}`;
}

export function buildActivityContractPrompt({ grade = "", category = "", subtopic = "", difficulty = "normal", relateToReading = true, mathSingleActivity = false, enabledExerciseDynamics = null } = {}) {
  const categories = getCategoriesForGrade(grade);
  const useAllCategories = !category || category === ALL_OPTION;
  const focusedCategories = !useAllCategories && categories[category]
    ? { [category]: subtopic && subtopic !== ALL_OPTION && categories[category].includes(subtopic) ? [subtopic] : categories[category] }
    : categories;
  const isTracingLetters = isTracingLettersSelection({ subtopic });
  if (isTracingLetters) {
    return [
      "Genera exactamente cuatro actividades de Trazos de letras para alfabetización inicial.",
      `Grado: ${grade || "Primero o Segundo"}. Dificultad: ${getDifficultyPrompt(difficulty)}`,
      relateToReading ? "Puedes tomar palabras o frases breves de la lectura, siempre que correspondan a la letra objetivo." : "No dependas de una lectura externa para resolver los trazos.",
      "Obtén la letra objetivo de los campos T, AE, C y P de la secuencia y alcance. No elijas una letra ajena al contenido curricular.",
      "Orden obligatorio: 1) presenta mayúscula y minúscula y muestra la direccionalidad; 2) trabaja repetición o completado en renglón; 3) lee y traza una frase muy corta con la letra; 4) lee y traza otra frase breve del mismo nivel.",
      "Cada ejercicio debe ser un bloque .activity independiente con una sola instrucción directa. No uses <ol>, <ul>, <li>, pasos ni subactividades internas.",
      "Cada bloque debe incluir .trace-model con el modelo visible y .answer con exactamente la letra, sílaba, palabra o frase que el alumno debe trazar, resaltada en color magenta.",
      "Prioriza direccionalidad, repetición útil, legibilidad, vocabulario familiar y frases muy cortas. El resultado debe sentirse como un cuaderno de trazos, no como redacción, ortografía abstracta ni comprensión lectora.",
      "Contrato obligatorio para cada uno de los cuatro bloques:",
      TRACING_LETTERS_HTML_CONTRACT,
      "No expliques el contrato; devuelve únicamente los cuatro bloques HTML en el orden indicado."
    ].join("\n\n");
  }
  const isDictation = isDictationSelection({ subtopic });
  if (isDictation) {
    return [
      "Genera la actividad de Dictado para la unidad.",
      `Grado: ${grade || "Primaria"}. Dificultad: ${getDifficultyPrompt(difficulty)}`,
      "CONTRATO ESTRICTO PARA DICTADO:",
      "1. Devuelve un encabezado temático <h2 class=\"cb-activity-title\">Dictado</h2> y un único bloque <div class=\"activity\">.",
      "2. Instrucción principal concisa en <p><strong>Escribe en cada renglón la palabra que te dicte tu maestro.</strong> [IC. T. IND]</p>.",
      "3. La actividad consiste ÚNICAMENTE en la lista numerada <ol class=\"steps steps-numbered cb-dictado-list\"> con los elementos <li> correspondientes.",
      "4. Cada <li> consta exclusivamente de su número y su línea de respuesta (<div class=\"cb-response-line\"><div class=\"answer\"><span class=\"cb-teacher-resp\" style=\"color:#e6007e;\">palabra</span></div></div>).",
      "5. En 1° y 2° la línea de respuesta se representará como caja caligráfica pautada; a partir de 3° como línea horizontal continua.",
      "6. Las palabras del dictado deben ser exactamente las palabras propuestas por la actividad o por el vocabulario/sinónimos sobresalientes de la unidad. No inventes palabras desconectadas ni agregues textos distractores ni subinstrucciones.",
      "Contrato obligatorio de Dictado:",
      DICTATION_HTML_CONTRACT,
      "No expliques el contrato; devuelve únicamente el HTML de Dictado listo para usar."
    ].join("\n\n");
  }
  const isMath = /matem[aá]t|saberes y pensamiento/i.test(`${category} ${subtopic}`);
  const isMathSingleActivity = isMath && mathSingleActivity === true;
  const isGrade1 = /primero|^1\b/i.test(grade);
  const isGrade6 = /sexto|^6\b/i.test(grade);
  const gradeLengthInstruction = isGrade1
    ? "REGLA DE EXTENSIÓN PARA PRIMERO DE PRIMARIA: Las actividades deben ser MUCHO MÁS CORTAS, con consignas muy breves de 1 renglón (10-14 palabras), frases simples (4-6 palabras), ejercicios de alfabetización inicial (encerrar, unir, ordenar 3-4 palabras familiares, trazar, colorear) y respuestas esperadas muy concisas."
    : isGrade6
      ? "REGLA DE EXTENSIÓN PARA SEXTO DE PRIMARIA: Las actividades deben ser MUCHO MÁS LARGAS, profundas y estructuradas, con redacción de varios párrafos, contraste y análisis crítico de evidencias, debates fundamentados y justificación detallada."
      : "Ajusta la extensión y vocabulario de las consignas al grado correspondiente.";

  return [
    "Genera actividades de Primaria con libertad pedagógica, pero conserva estrictamente la estructura HTML indicada.",
    ...(isMath ? (mathSingleActivity ? [
      "CONTRATO DE EJERCICIO MATEMÁTICO INDIVIDUAL: devuelve exactamente un h2 general y un bloque <div class=\"activity\"> sin h3 adicional. La consigna comienza directamente en <p><strong>, con la mecánica necesaria y respuesta o evidencia verificable en magenta. No repitas el título ni generes seis actividades dentro de este bloque.",
    ] : [
      "CONTRATO ESPECIAL PARA MATEMÁTICAS: genera exactamente 6 actividades completas e independientes para este subtema. Mantén un único <h2 class=\"cb-activity-title\"> para el subtema y, dentro de él, crea exactamente seis bloques <div class=\"activity\">.",
      "Cada uno de los seis bloques debe tener su propio título breve <h3>, una consigna imperativa en <p><strong>, una lista propia <ol class=\"steps steps-numbered\"> con pasos de resolución y respuestas verificables dentro de .answer en magenta. Varía entre representación, cálculo, explicación y problemas contextualizados de acuerdo con T, AE, C, P y el grado.",
      "No conviertas las seis actividades en seis <li> de una sola actividad. No omitas títulos, instrucciones, pasos ni respuestas en ningún bloque."
    ]) : []),
    `Dificultad: ${getDifficultyPrompt(difficulty)}`,
    gradeLengthInstruction,
    relateToReading ? "Relaciona las actividades con la lectura cuando haya lectura disponible." : "No obligues relación con la lectura; usa la lectura solo como contexto opcional.",
    useAllCategories ? "Categoría objetivo: todas las categorías visibles del formulario." : `Categoría objetivo: ${category}`,
    !subtopic || subtopic === ALL_OPTION ? "Subtema objetivo: todos los subtemas visibles dentro de la selección actual." : `Subtema objetivo: ${subtopic}`,
    "Categorías y subtemas disponibles:",
    JSON.stringify(focusedCategories, null, 2),
    isMathSingleActivity ? "Plantilla obligatoria para este ejercicio matemático: <h2 class=\"cb-activity-title\">Título único</h2><div class=\"activity\"><p><strong>Consigna imperativa.</strong></p><ol class=\"steps steps-numbered\"><li>Paso o acción <div class=\"answer\"><span style=\"color:#e6007e;\">Respuesta verificable.</span></div></li></ol></div>" : isMath ? "Plantilla obligatoria por cada actividad matemática (repetir seis veces dentro del subtema): <div class=\"activity\"><h3>Título breve</h3><p><strong>Consigna imperativa.</strong></p><ol class=\"steps steps-numbered\"><li>Paso de resolución <div class=\"answer\"><span style=\"color:#e6007e;\">Respuesta verificable.</span></div></li></ol></div>" : "Contrato obligatorio por actividad:",
    ...(isMath ? [] : [ACTIVITY_HTML_CONTRACT]),
    "Estructura centralizada y homogénea para todos los subtemas: instrucción principal con la primera frase completa en negritas (<strong>...</strong>) hasta el primer punto y seguido (.) o dos puntos (:), seguida de pasos o preguntas si aplica.",
    "El subtema debe iniciar directamente con un encabezado <h2 class=\"cb-activity-title\"> con un único título temático creativo, sugerente y breve (2 a 4 palabras), con tipografía rounded (Fredoka/Quicksand). NUNCA uses el nombre genérico de la materia como título.",
    "La instrucción principal debe empezar obligatoriamente con un verbo en imperativo dirigido al alumno, por ejemplo: Lee, Observa, Resuelve, Escribe, Subraya, Dibuja, Ordena o Compara. NUNCA comiences la actividad con una pregunta; la pregunta puede ir después de la primera frase de instrucción.",
    "Si mencionas un recurso, utiliza estrictamente su código según la unidad: 'Ficha 1a', 'Ficha 1b', 'Anexo 1a', 'Recortable 1a', 'Video \"[Nombre]\"'.",
    "La primera frase completa de la instrucción va en <strong> hasta el primer punto o dos puntos; lo posterior va en tipografía normal.",
    "El identificador de modalidad didáctica o acción debe indicarse en texto entre corchetes ([IC. T. IND], [IC. T. PAR], [IC. T.EQ], [IC. EXPRESION ORAL], [IC. OBSERVA VIDEO], [IC. Lee], [IC. Escribe], [IC. Dibuja], [IC. Recorta], [IC. Comenta]) al final del mismo párrafo principal, fuera del <strong>. PROHIBIDO usar emojis en las instrucciones o actividades.",
    "Respuestas en paréntesis o corchetes: En reactivos con paréntesis ( ) o corchetes [ ] (ej. opción múltiple, ordenar con letras/números), la respuesta magenta va DIRECTAMENTE DENTRO del paréntesis o corchete: ( <span style=\"color:#e6007e;\">a</span> ) o [ <span style=\"color:#e6007e;\">X</span> ], como si el alumno la hubiera contestado. NO generes una caja .answer adicional para estos incisos.",
    "Plecas de respuesta escolares: En preguntas abiertas, la respuesta magenta se monta directamente sobre la línea sin escribir 'Respuesta esperada'. Las respuestas cortas usan una caja corta; las largas se derivan a una Hoja de trabajo o Ficha. En 1° y 2° la pleca es una caja caligráfica con dos guías azules punteadas centradas verticalmente: el texto queda entre ambas guías. Cada frase que ocupe dos renglones se divide en dos bloques .cb-response-line completos; nunca se deja texto largo envuelto dentro de una sola caja. A partir de 3° es solo una línea horizontal azul claro por renglón.",
    "VARIEDAD OBLIGATORIA: alterna observar sin escribir, unir, circular, colorear, clasificar, ordenar, trazar, dialogar, construir y registrar en hoja de trabajo. No uses preguntas con plecas como mecánica dominante ni repitas el mismo tipo de actividad dentro de la unidad.",
    isProjectSelection({ category, subtopic })
      ? "Si el subtema activo es Proyectos, organiza la secuencia como proyecto trimestral por fases, manteniendo la misma estructura .activity en cada fase."
      : "Si no es proyecto, mantén formato de actividades regulares del subtema seleccionado.",
    buildExerciseDynamicsDirective(enabledExerciseDynamics),
    "No expliques el contrato al usuario; devuelve bloques HTML utilizables."
  ].join("\n\n");
}

function countClassOccurrences(source = "", className = "") {
  const pattern = new RegExp(`class=["'][^"']*\\b${className}\\b[^"']*["']`, "gi");
  return String(source || "").match(pattern)?.length || 0;
}

function normalizeKey(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
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
