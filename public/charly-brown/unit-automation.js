export const AUTOMATED_RESOURCE_SELECTIONS = Object.freeze({
  fichas: false,
  anexos: false,
  recortables: false,
  videos: false
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
  const rawQueue = [];

  (Array.isArray(groups) ? groups : []).forEach((group, groupIndex) => {
    const category = String(group?.category || "").trim();
    if (!category) return;
    const isMath = isMathCategory(category);

    // Seis ejercicios separados comparten un único subtema visible de Matemáticas.
    if (isMath) {
      const mathItems = Array.isArray(group?.items) && group.items.length >= 6
        ? group.items
        : [
            { subtopic: "Matemáticas 1", name: "Sentido numérico y conteo", desc: "Lectura, escritura, comparación y conteo de cantidades." },
            { subtopic: "Matemáticas 2", name: "Operaciones y cálculo", desc: "Estrategias de suma, resta y cálculo mental práctico." },
            { subtopic: "Matemáticas 3", name: "Resolución de problemas", desc: "Situaciones problemáticas cotidianas y retos aplicados." },
            { subtopic: "Matemáticas 4", name: "Formas y figuras geométricas", desc: "Propiedades de figuras planas, cuerpos geométricos y trazo." },
            { subtopic: "Matemáticas 5", name: "Medida, longitud y tiempo", desc: "Estimación, comparación de medidas, uso de reloj y calendario." },
            { subtopic: "Matemáticas 6", name: "Tablas, datos y estadística", desc: "Registro en tablas de conteo, interpretación de pictogramas y gráficos." }
          ];

      mathItems.slice(0, 6).forEach((mItem, mIndex) => {
        const mathFocus = mItem.name || mItem.subtopic || `Actividad ${mIndex + 1}`;
        rawQueue.push({
          category: "Matemáticas",
          subtopic: "Matemáticas",
          section: "Matemáticas",
          sectionId: `auto-matematicas-${mIndex + 1}-${slug(mathFocus)}`,
          description: mItem.desc || buildDescription(mItem.fields || group.items?.[0]?.fields || {}),
          objective: String(mItem.fields?.AE || mItem.fields?.T || mathFocus || "Desarrollo del pensamiento matemático").trim(),
          agentInstructions: `Diseña UNA actividad matemática independiente para el subtema unificado Matemáticas. Enfócala en ${mathFocus}; incluye título propio, consigna imperativa, pasos completos y respuesta esperada en magenta. Es la actividad ${mIndex + 1} de 6.`,
          order: (groupIndex * 100) + mIndex,
          isMath: true,
          mathSingleActivity: true,
          mathGroup: "Matemáticas",
          mathIndex: mIndex,
          mathFocus,
          mathSubtopicIndex: mIndex
        });
      });
      return;
    }

    (Array.isArray(group?.items) ? group.items : []).forEach((item, itemIndex) => {
      const subtopic = String(item?.subtopic || "").trim();
      if (!subtopic) return;
      rawQueue.push({
        category,
        subtopic,
        section: `${category} · ${formatSubtopicLabel(subtopic)}`,
        sectionId: `auto-${slug(category)}-${slug(subtopic)}`,
        description: buildDescription(item?.fields || {}),
        objective: String(item?.fields?.AE || item?.fields?.T || "").trim(),
        agentInstructions: normalizeText(subtopic) === "trazosdeletras"
          ? "Genera cuatro ejercicios progresivos de trazos: direccionalidad, repetición en renglón y dos frases breves. Usa bloques simples sin listas internas."
          : "Genera una actividad completa para este subtema respetando su secuencia y alcance.",
        order: (groupIndex * 100) + itemIndex,
        isMath: false
      });
    });
  });

  let queue = rawQueue;
  if (normalizeNumericSlot(unit) === "1") {
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
          order: -1,
          isMath: false
        };
    queue = [project, ...queue];
  }

  return distributeResourcesToQueue(queue, unit);
}

function isMathCategory(category = "") {
  const norm = normalizeText(category);
  return norm.includes("matematica") || norm.includes("saberesypensamiento");
}

function isMathSubtopic(subtopic = "") {
  const norm = normalizeText(subtopic);
  return norm.includes("matematica");
}

function distributeResourcesToQueue(queue = [], unit = "1") {
  // Cada subtema recibe recursos vinculados. En Matemáticas se asignan dos
  // complementos distintos por subtema para producir una segunda tanda visual/práctica.

  let videoAssigned = false;

  queue.forEach((item, idx) => {
    item.resourceSelections = { fichas: false, anexos: false, recortables: false, videos: false };
    item.resourceTypes = [];

    const normSubtopic = normalizeText(item.subtopic);
    const normCategory = normalizeText(item.category);

    // 1. Regla específica para Matemáticas: cada ejercicio recibe su tanda completa.
    if (item.isMath || isMathCategory(item.category) || isMathSubtopic(item.subtopic)) {
      // Cada uno de los seis ejercicios genera su propia tanda completa de
      // recursos matemáticos; no compartir ni omitir anexos/recortables.
      ["worksheet", "annex", "cutout"].forEach((type) => {
        if (type === "worksheet") item.resourceSelections.fichas = true;
        if (type === "annex") item.resourceSelections.anexos = true;
        if (type === "cutout") item.resourceSelections.recortables = true;
        if (!item.resourceTypes.includes(type)) item.resourceTypes.push(type);
      });
      return;
    }

    // 2. REGLA PARA LOS DEMÁS SUBTEMAS (Lenguaje, Ciencias, Sociales, Proyectos):
    // Cada subtema recibe al menos 1 recurso (máximo 3 si así se requiere).

    // Video script (máx 1 por unidad en Proyectos o Comprensión/Narrativa):
    if (!videoAssigned && (isProjectItem(item) || /proyecto|debate|entrevista|audiovisual|video/i.test(normSubtopic))) {
      item.resourceSelections.videos = true;
      item.resourceTypes.push("video-script");
      videoAssigned = true;
    }

    // Ciencias / Geografía / Conocimiento del Medio: Anexo (infografía, mapas, esquemas) + opcional Ficha
    if (/ciencias|geografia|entorno|conocimientodelmedio|naturales|milocalidad/i.test(normCategory) || /experimento|proceso|mapa|esquema|anatomia|ciclo|paisaje/i.test(normSubtopic)) {
      if (!item.resourceSelections.anexos) {
        item.resourceSelections.anexos = true;
        item.resourceTypes.push("annex");
      }
      if (item.resourceTypes.length < 2 && /experimento|conocimiento|proceso|observacion/i.test(normSubtopic)) {
        item.resourceSelections.fichas = true;
        item.resourceTypes.push("worksheet");
      }
    }

    // Expresión oral / Artes / Trazos: Recortable (títeres, tarjetas de diálogo, dados) + opcional Ficha
    if (/expresionoral|oral|dialogo|teatro|personaje|titeres|recort|manipul|armar|asociar|artes/i.test(normSubtopic)) {
      if (!item.resourceSelections.recortables) {
        item.resourceSelections.recortables = true;
        item.resourceTypes.push("cutout");
      }
    }

    // Ortografía / Gramática / Expresión escrita / Comprensión: Ficha de trabajo
    if (/ortografia|gramatica|expresionescrita|escrita|redaccion|comprension|lectura/i.test(normSubtopic)) {
      if (!item.resourceSelections.fichas) {
        item.resourceSelections.fichas = true;
        item.resourceTypes.push("worksheet");
      }
    }

    // Civica y Ética / Socioemocional: Ficha o Anexo
    if (/civica|etica|socioemocional|emociones/i.test(normCategory + normSubtopic)) {
      if (!item.resourceSelections.fichas && !item.resourceSelections.anexos) {
        item.resourceSelections.fichas = true;
        item.resourceTypes.push("worksheet");
      }
    }

    // Habilidades: Recortable o Ficha
    if (/habilidad|cognitiv|cerebro/i.test(normSubtopic)) {
      if (!item.resourceSelections.recortables) {
        item.resourceSelections.recortables = true;
        item.resourceTypes.push("cutout");
      }
    }

    // GARANTÍA: Todo subtema debe tener AL MENOS 1 recurso (mínimo 1, máximo 3)
    if (item.resourceTypes.length === 0) {
      item.resourceSelections.fichas = true;
      item.resourceTypes.push("worksheet");
    }

    // Límite estricto de máximo 3 recursos por subtema
    if (item.resourceTypes.length > 3) {
      item.resourceTypes = item.resourceTypes.slice(0, 3);
      item.resourceSelections = {
        fichas: item.resourceTypes.includes("worksheet"),
        anexos: item.resourceTypes.includes("annex"),
        recortables: item.resourceTypes.includes("cutout"),
        videos: item.resourceTypes.includes("video-script")
      };
    }
  });

  // Dos guiones: uno matemático y uno para el mejor apoyo audiovisual
  // entre los demás subtemas. No se les aplica el mínimo de tres materiales.
  queue.forEach((item) => { item.resourceTypes = item.resourceTypes.filter(type => type !== "video-script"); });
  const videoSuitability = (item) => {
    const context = normalizeText([item.mathFocus, item.subtopic, item.description, item.objective].join(" "));
    if (item.isMath) return /geometr|figura|medida|resolucion|problema/.test(context) ? 3 : 1;
    if (/experimento|proceso|ciclo|demostracion/.test(context)) return 5;
    if (/expresionoral|debate|entrevista|teatro/.test(context)) return 4;
    if (isProjectItem(item)) return 3;
    if (/ciencias|naturales|geografia/.test(context)) return 2;
    return 1;
  };
  for (const isMath of [true, false]) {
    const target = queue.filter(item => Boolean(item.isMath) === isMath)
      .sort((a, b) => videoSuitability(b) - videoSuitability(a))[0];
    if (target) target.resourceTypes.push("video-script");
  }

  // Presupuesto compartido por toda la unidad: alterna Matemáticas y otros
  // subtemas para que ambos tengan materiales dentro del mismo límite.
  const limits = { worksheet: 6, annex: 6, cutout: 6, "video-script": 2 };
  for (const [type, limit] of Object.entries(limits)) {
    const candidates = queue.filter((item) => item.resourceTypes.includes(type));
    // Un tipo aplicable dispone de al menos tres materiales vinculados a
    // actividades distintas, siempre que haya suficientes actividades.
    if (type !== "video-script" && candidates.length && candidates.length < 3) {
      const eligible = queue.filter((item) => !candidates.includes(item))
        .sort((a, b) => Number(a.isMath) - Number(b.isMath));
      while (candidates.length < 3 && eligible.length) {
        const item = eligible.shift();
        item.resourceTypes.push(type);
        candidates.push(item);
      }
    }
    const math = candidates.filter((item) => item.isMath);
    const other = candidates.filter((item) => !item.isMath);
    const selected = new Set();
    while (selected.size < limit && (math.length || other.length)) {
      if (other.length) selected.add(other.shift());
      if (selected.size < limit && math.length) selected.add(math.shift());
    }
    candidates.forEach((item) => {
      if (!selected.has(item)) item.resourceTypes = item.resourceTypes.filter((value) => value !== type);
    });
  }
  queue.forEach((item) => {
    item.resourceSelections = {
      fichas: item.resourceTypes.includes("worksheet"),
      anexos: item.resourceTypes.includes("annex"),
      recortables: item.resourceTypes.includes("cutout"),
      videos: item.resourceTypes.includes("video-script")
    };
  });

  // Asigna códigos antes de la generación paralela para evitar fichas/anexos repetidos.
  const counters = { worksheet: 0, annex: 0, cutout: 0, "video-script": 0 };
  const labels = { worksheet: "Ficha", annex: "Anexo", cutout: "Recortable", "video-script": "Video" };
  const unitNumber = normalizeNumericSlot(unit) || "1";
  queue.forEach((item) => {
    item.resourceCodes = {};
    item.resourceTypes.forEach((type) => {
      const key = { worksheet: "fichas", annex: "anexos", cutout: "recortables", "video-script": "videos" }[type];
      if (!key) return;
      const letter = String.fromCharCode(97 + counters[type]++);
      item.resourceCodes[key] = type === "video-script" ? `Video ${item.subtopic}` : `${labels[type]} ${unitNumber}${letter}`;
    });
  });

  return queue;
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
    Ortografía: "Convenciones lingüísticas: Ortografía",
    Ortografia: "Convenciones lingüísticas: Ortografía",
    Gramatica: "Convenciones lingüísticas: Gramática",
    Gramática: "Convenciones lingüísticas: Gramática",
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

export function sameText(left = "", right = "") {
  const a = normalizeText(left);
  const b = normalizeText(right);
  return Boolean(a && b && a === b);
}

export function sameGrade(left = "", right = "") {
  const aliases = { "1": "primero", "2": "segundo", "3": "tercero", "4": "cuarto", "5": "quinto", "6": "sexto" };
  const a = aliases[normalizeText(left)] || normalizeText(left);
  const b = aliases[normalizeText(right)] || normalizeText(right);
  return Boolean(a && b && a === b);
}

export function sameNumericSlot(left = "", right = "") {
  const a = normalizeNumericSlot(left);
  const b = normalizeNumericSlot(right);
  return Boolean(a && b && a === b);
}

export function normalizeNumericSlot(value = "") {
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
