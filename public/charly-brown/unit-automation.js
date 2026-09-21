export const AUTOMATED_RESOURCE_SELECTIONS = Object.freeze({
  fichas: true,
  anexos: true,
  recortables: true,
  videos: true
});

export function getNextAutomatedUnitValue(units = [], maxUnits = 10) {
  const used = new Set((Array.isArray(units) ? units : [])
    .map((unit) => normalizeNumericSlot(unit?.meta?.unit || unit?.unit))
    .filter(Boolean));
  for (let index = 1; index <= maxUnits; index += 1) {
    if (!used.has(String(index))) return String(index);
  }
  return "";
}

export function pickExactReadingForMeta(readings = [], meta = {}) {
  return (Array.isArray(readings) ? readings : []).find((reading) => isExactReadingMatch(reading, meta)) || null;
}

export function isExactReadingMatch(reading = {}, meta = {}) {
  const readingMeta = reading.meta || {};
  return sameText(readingMeta.nivel, meta.level)
    && sameGrade(readingMeta.grado, meta.grade)
    && sameNumericSlot(readingMeta.trimestre, meta.trimester)
    && sameNumericSlot(readingMeta.unidad, meta.unit);
}

export function buildAutomatedActivityQueue(groups = [], { unit = "" } = {}) {
  const queue = (Array.isArray(groups) ? groups : []).flatMap((group, groupIndex) => {
    const category = String(group?.category || "").trim();
    return (Array.isArray(group?.items) ? group.items : []).map((item, itemIndex) => {
      const subtopic = String(item?.subtopic || "").trim();
      if (!category || !subtopic) return null;
      return {
        category,
        subtopic,
        section: `${category} · ${formatSubtopicLabel(subtopic)}`,
        sectionId: `auto-${slug(category)}-${slug(subtopic)}`,
        description: buildDescription(item?.fields || {}),
        objective: String(item?.fields?.AE || item?.fields?.T || "").trim(),
        agentInstructions: normalizeText(subtopic) === "trazosdeletras"
          ? "Genera cuatro ejercicios progresivos de trazos: direccionalidad, repetición en renglón y dos frases breves. Usa bloques simples sin listas internas."
          : "Genera una actividad completa para este subtema respetando su secuencia y alcance.",
        order: (groupIndex * 100) + itemIndex
      };
    }).filter(Boolean);
  });
  if (normalizeNumericSlot(unit) !== "1") return queue;
  const projectIndex = queue.findIndex((item) => isProjectItem(item));
  const project = projectIndex >= 0
    ? queue.splice(projectIndex, 1)[0]
    : {
        category: "Proyectos",
        subtopic: "Proyectos",
        section: "Proyectos · Proyectos",
        sectionId: "auto-proyectos-proyectos",
        description: "Proyecto integrador trimestral alineado con la secuencia y alcance.",
        objective: "Integrar los aprendizajes de la unidad en un producto verificable.",
        agentInstructions: "Genera el proyecto trimestral completo y respeta la metodología correspondiente al trimestre.",
        order: -1
      };
  return [project, ...queue];
}

function isProjectItem(item = {}) {
  return normalizeText(item.category) === "proyectos" || normalizeText(item.subtopic) === "proyectos";
}

function buildDescription(fields = {}) {
  return [fields.T, fields.AE, fields.C, fields.P]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" · ");
}

function formatSubtopicLabel(value = "") {
  const labels = {
    Gramatica: "Gramática",
    ExpresionEscrita: "Expresión escrita",
    TrazosDeLetras: "Trazos de letras",
    ComprensionLectora: "Comprensión lectora",
    ExpresionOral: "Expresión oral",
    ConocimientoDelMedio: "Conocimiento del medio",
    MiLocalidad: "Mi localidad",
    Geografia: "Geografía",
    CivicaEtica: "Formación cívica y ética",
    Matematicas: "Matemáticas"
  };
  return labels[value] || String(value || "").replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, "$1 $2").trim();
}

function sameText(left = "", right = "") {
  const a = normalizeText(left);
  const b = normalizeText(right);
  return Boolean(a && b && a === b);
}

function sameGrade(left = "", right = "") {
  const aliases = { "1": "primero", "2": "segundo", "3": "tercero", "4": "cuarto", "5": "quinto", "6": "sexto" };
  const a = aliases[normalizeText(left)] || normalizeText(left);
  const b = aliases[normalizeText(right)] || normalizeText(right);
  return Boolean(a && b && a === b);
}

function sameNumericSlot(left = "", right = "") {
  const a = normalizeNumericSlot(left);
  const b = normalizeNumericSlot(right);
  return Boolean(a && b && a === b);
}

function normalizeNumericSlot(value = "") {
  const match = String(value ?? "").match(/\d+/);
  return match ? String(Number.parseInt(match[0], 10)) : normalizeText(value);
}

function normalizeText(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function slug(value = "") {
  return normalizeText(value) || "seccion";
}
