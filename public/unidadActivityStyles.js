const STYLE_ORDER = [
  "asc",
  "trazos_y_letras",
  "educativo",
  "competencial",
  "indagacion",
  "dinamico",
  "quiz",
  "diagnostico",
  "evaluacion",
  "proyecto",
  "sel",
  "estructurado",
  "hibrido",
  "ia_critica"
];

const STYLE_CATALOG = {
  asc: {
    id: "asc",
    label: "Estilo ASC",
    shortLabel: "ASC",
    summary: "Guiado, editorial, estructurado.",
    pillars: ["claridad", "secuencia", "evaluabilidad", "material editorial"],
    verbs: ["observa", "identifica", "analiza", "explica", "responde"],
    strengths: [
      "Mantiene orden y consistencia visual.",
      "Facilita generar actividades listas para libro, ficha o cuaderno.",
      "Permite respuestas esperadas claras y revisables."
    ],
    risks: [
      "Puede volverse formulaico si no se personaliza.",
      "Tiende a cerrar demasiado la exploración del alumno."
    ],
    promptDirectives: [
      "Diseña actividades guiadas, claras y con estructura editorial consistente.",
      "Cada actividad debe tener una ruta explícita de trabajo y una respuesta esperada verificable.",
      "Prioriza claridad, progresión, orden y usabilidad para material didáctico impreso o digital."
    ]
  },
  trazos_y_letras: {
    id: "trazos_y_letras",
    label: "Trazos y letras",
    shortLabel: "Trazos",
    summary: "Trazos guiados, copia visible y lectura inicial.",
    pillars: ["motricidad fina", "direccionalidad", "copia guiada", "lectura inicial"],
    verbs: ["traza", "repasa", "copia", "lee", "completa"],
    strengths: [
      "Sirve para alfabetización inicial con modelo visible y ejercicios breves.",
      "Organiza actividades tipo cuaderno de trazos sin sobrecargar con pasos internos."
    ],
    risks: [
      "No conviene usarlo como formato dominante en subtemas que requieren análisis o producción extensa.",
      "Pierde valor si se convierte en escritura libre sin apoyo visual claro."
    ],
    promptDirectives: [
      "Diseña actividades de alfabetización inicial centradas en trazo de letras, sílabas, palabras o frases muy breves.",
      "Cada actividad debe tener una instrucción directa, un modelo de escritura o renglón visible y una respuesta esperada en formato de copia o trazo.",
      "Evita subinstrucciones largas, listas internas y explicaciones abstractas; debe sentirse como cuaderno de trazos."
    ]
  },
  educativo: {
    id: "educativo",
    label: "Estilo Educativo",
    shortLabel: "Educativo",
    summary: "Comprensión guiada, correspondencia imagen-texto y lectura situada.",
    pillars: ["lectura comprensiva", "relación visual", "selección precisa", "evidencia textual"],
    verbs: ["encuentra", "relaciona", "selecciona", "compara", "justifica"],
    strengths: [
      "Convierte la comprensión lectora en tareas observables y editoriales.",
      "Sirve para ejercicios de imagen-oración, nombres propios y correspondencia exacta.",
      "Favorece lectura con evidencia concreta y no con respuestas genéricas."
    ],
    risks: [
      "Puede volverse mecánico si no se conecta con una secuencia o propósito claro.",
      "Necesita estímulos visuales o textuales concretos para evitar ambigüedad."
    ],
    promptDirectives: [
      "Diseña actividades de comprensión lectora con correspondencia imagen-texto, selección de oraciones correctas, rastreo de nombres propios o relación entre personajes y acciones.",
      "Haz que cada actividad dependa de una evidencia visible o textual concreta y no de preguntas vacías.",
      "Evita formatos genéricos; las tareas deben parecer ejercicios editoriales de lectura comprensiva, con precisión y claridad."
    ]
  },
  competencial: {
    id: "competencial",
    label: "Estilo Competencial",
    shortLabel: "Competencial",
    summary: "Transferencia, agencia, resolución.",
    pillars: ["aplicación", "decisión", "autonomía", "resolución de problemas"],
    verbs: ["resuelve", "aplica", "decide", "justifica", "transfiere"],
    strengths: [
      "Conecta el aprendizaje con situaciones reales.",
      "Promueve uso activo del conocimiento y agencia del alumno."
    ],
    risks: [
      "Si queda muy abstracto, pierde claridad operativa.",
      "Puede necesitar más andamiaje en primaria baja."
    ],
    promptDirectives: [
      "Diseña actividades donde el alumno aplique el aprendizaje a contextos nuevos o reales.",
      "Incluye toma de decisiones, justificación y resolución de situaciones concretas.",
      "Evita ejercicios puramente repetitivos o de memorización aislada."
    ]
  },
  indagacion: {
    id: "indagacion",
    label: "Estilo Indagación",
    shortLabel: "Indagación",
    summary: "Hipótesis, evidencia, análisis.",
    pillars: ["pregunta", "evidencia", "comparación", "conclusión"],
    verbs: ["formula", "investiga", "observa", "contrasta", "concluye"],
    strengths: [
      "Activa pensamiento crítico y construcción de explicaciones.",
      "Funciona muy bien para ciencias, sociales y lectura analítica."
    ],
    risks: [
      "Puede volverse difuso si no se secuencia bien.",
      "Necesita evidencias concretas para no caer en opinión vaga."
    ],
    promptDirectives: [
      "Diseña actividades basadas en preguntas, observación, evidencia y conclusión.",
      "Haz que el alumno formule hipótesis o compare datos antes de responder.",
      "Prioriza análisis, interpretación y explicación con base en evidencias."
    ]
  },
  dinamico: {
    id: "dinamico",
    label: "Estilo Dinámico",
    shortLabel: "Dinámico",
    summary: "Ejercicios ágiles, variados, ritmo alto.",
    pillars: ["ritmo", "variedad", "práctica breve", "enganche"],
    verbs: ["resuelve", "completa", "elige", "gira", "conecta"],
    strengths: [
      "Aumenta energía y participación con ejercicios rápidos y variados.",
      "Funciona bien para práctica intensiva y repaso sin monotonía."
    ],
    risks: [
      "Puede perder profundidad si todo se vuelve demasiado breve.",
      "Necesita foco para no convertirse en lista caótica de microtareas."
    ],
    promptDirectives: [
      "Diseña ejercicios breves, ágiles y diversos, con ritmo alto y cambios de dinámica.",
      "Alterna tipos de tarea como completar, elegir, relacionar, clasificar, corregir o resolver mini-retos.",
      "Evita bloques largos de explicación; prioriza acción, variedad y participación activa."
    ]
  },
  quiz: {
    id: "quiz",
    label: "Estilo Quiz - Examen",
    shortLabel: "Quiz",
    summary: "Evaluación variada: opción múltiple, abierta, falso/verdadero y relación.",
    pillars: ["evaluación", "diversidad de reactivos", "retroalimentación", "chequeo de aprendizaje"],
    verbs: ["resuelve", "elige", "responde", "conecta", "verifica"],
    strengths: [
      "Mide diferentes niveles de conocimiento (desde memoria hasta síntesis).",
      "Mantiene el interés del alumno con formatos de pregunta cambiantes."
    ],
    risks: [
      "Puede resultar confuso si no se indica bien el modo de respuesta.",
      "Requiere claves de respuesta muy precisas para preguntas abiertas."
    ],
    promptDirectives: [
      "Diseña una batería de preguntas tipo examen con formatos variados.",
      "Usa una mezcla equilibrada de: preguntas abiertas (desarrollo corto), opción múltiple (A, B, C), falso/verdadero, oraciones para completar y columnas para relacionar.",
      "Asegura que cada reactivo sea independiente y tenga una instrucción de respuesta clara.",
      "Incluye siempre la respuesta esperada o clave de corrección con detalle pedagógico."
    ]
  },
  diagnostico: {
    id: "diagnostico",
    label: "Estilo Diagnóstico",
    shortLabel: "Diagnóstico",
    summary: "Conocimientos previos, evaluación de entrada, punto de partida.",
    pillars: ["evaluación inicial", "saberes previos", "reactivos diagnósticos", "punto de partida"],
    verbs: ["responde", "identifica", "selecciona", "completa", "explica"],
    strengths: [
      "Ayuda a medir qué sabe el alumno antes de iniciar un tema.",
      "Permite ajustar el andamiaje desde evidencias reales."
    ],
    risks: [
      "Si se vuelve castigo o calificación dura, genera ansiedad innecesaria.",
      "Debe enfocarse en evidencias útiles de entrada, no en sanción."
    ],
    promptDirectives: [
      "Diseña actividades tipo examen diagnóstico de entrada para medir conocimientos previos sobre el tema.",
      "Incluye reactivos breves y claros que permitan identificar si el alumno domina, confunde o apenas reconoce el contenido.",
      "Combina preguntas directas, selección de respuesta, completar, clasificación o explicación corta para detectar punto de partida real.",
      "No presentes el diagnóstico como castigo ni como examen final; úsalo como medición inicial con evidencia clara."
    ]
  },
  evaluacion: {
    id: "evaluacion",
    label: "Estilo Evaluación",
    shortLabel: "Evaluación",
    summary: "Medición de logro, evidencia y cierre formal.",
    pillars: ["evidencia", "criterio", "logro", "cierre de aprendizaje"],
    verbs: ["demuestra", "resuelve", "argumenta", "evidencia", "verifica"],
    strengths: [
      "Sirve para medir lo aprendido con mayor formalidad y evidencia.",
      "Permite distinguir dominio, avance parcial y errores persistentes."
    ],
    risks: [
      "Si se diseña demasiado rígido, reduce el aprendizaje a nota.",
      "Puede resultar pesado si no se equilibra con claridad y variedad."
    ],
    promptDirectives: [
      "Diseña actividades tipo evaluación o examen para medir el conocimiento adquirido del tema.",
      "Incluye criterios de corrección, respuestas esperadas o niveles de logro claros.",
      "Haz que el alumno demuestre dominio, no solo reconocimiento superficial."
    ]
  },
  proyecto: {
    id: "proyecto",
    label: "Estilo Proyecto",
    shortLabel: "Proyecto",
    summary: "Producto, fases, reto real.",
    pillars: ["reto", "fases", "producto", "socialización"],
    verbs: ["diseña", "construye", "organiza", "presenta", "mejora"],
    strengths: [
      "Integra contenidos en torno a un reto auténtico.",
      "Genera evidencias visibles y sentido de propósito."
    ],
    risks: [
      "Puede ser pesado si no se dosifica por grado.",
      "Necesita una secuencia clara para no dispersarse."
    ],
    promptDirectives: [
      "Diseña actividades orientadas a un reto real o simulación auténtica.",
      "Organiza el trabajo en fases con producto parcial o final.",
      "Haz explícitos roles, recursos, evidencias y momentos de presentación o mejora."
    ]
  },
  sel: {
    id: "sel",
    label: "Estilo SEL",
    shortLabel: "SEL",
    summary: "Emociones, convivencia, reflexión.",
    pillars: ["autoconocimiento", "empatía", "convivencia", "reflexión"],
    verbs: ["reconoce", "reflexiona", "dialoga", "regula", "propone"],
    strengths: [
      "Favorece clima de aula y habilidades socioemocionales.",
      "Permite trabajar toma de decisiones éticas y convivencia."
    ],
    risks: [
      "Puede caer en discurso moralizante si no se contextualiza.",
      "Necesita casos o situaciones concretas para ser profundo."
    ],
    promptDirectives: [
      "Diseña actividades centradas en emociones, convivencia, empatía y reflexión personal o grupal.",
      "Usa situaciones concretas, dilemas o casos, no frases vacías.",
      "Promueve autorregulación, escucha, diálogo y toma de decisiones responsables."
    ]
  },
  estructurado: {
    id: "estructurado",
    label: "Estilo Estructurado",
    shortLabel: "Estructurado",
    summary: "Fundamentos, práctica, precisión.",
    pillars: ["andamiaje", "práctica", "progresión", "precisión"],
    verbs: ["calcula", "clasifica", "corrige", "practica", "verifica"],
    strengths: [
      "Muy útil para fundamentos de matemáticas y lenguaje.",
      "Favorece dominio técnico y secuencia progresiva."
    ],
    risks: [
      "Puede reducir creatividad si domina todo el diseño.",
      "Debe equilibrarse con transferencia y contexto."
    ],
    promptDirectives: [
      "Diseña actividades con progresión clara, práctica deliberada y precisión conceptual.",
      "Usa andamiaje explícito y aumenta la dificultad de forma gradual.",
      "Incluye verificación de procedimiento, corrección y consolidación de fundamentos."
    ]
  },
  hibrido: {
    id: "hibrido",
    label: "Estilo Híbrido",
    shortLabel: "Híbrido",
    summary: "Lectura + imagen + video + recurso.",
    pillars: ["multimodalidad", "conexión de recursos", "síntesis", "accesibilidad"],
    verbs: ["interpreta", "relaciona", "observa", "sintetiza", "explica"],
    strengths: [
      "Permite entradas múltiples al aprendizaje.",
      "Hace más rica la experiencia cuando los recursos sí tienen intención pedagógica."
    ],
    risks: [
      "Puede saturar de recursos si no hay foco.",
      "No todo subtema necesita todos los soportes al mismo tiempo."
    ],
    promptDirectives: [
      "Diseña actividades que integren conscientemente lectura, imagen, video o recurso anexo cuando estén disponibles.",
      "Cada recurso debe cumplir una función pedagógica distinta y no decorativa.",
      "Haz que el alumno compare, relacione o sintetice información entre varios soportes."
    ]
  },
  ia_critica: {
    id: "ia_critica",
    label: "Estilo IA Crítica",
    shortLabel: "IA Crítica",
    summary: "Co-creación responsable con IA.",
    pillars: ["criterio", "verificación", "ética", "co-creación"],
    verbs: ["compara", "verifica", "evalúa", "reformula", "argumenta"],
    strengths: [
      "Prepara para usar IA con criterio y responsabilidad.",
      "Desarrolla pensamiento crítico sobre respuestas automatizadas."
    ],
    risks: [
      "No siempre es apropiado para todos los grados o subtemas.",
      "Si se usa mal, la IA sustituye el pensamiento en vez de potenciarlo."
    ],
    promptDirectives: [
      "Diseña actividades donde la IA sea objeto de análisis, contraste o co-creación responsable.",
      "Haz explícita la necesidad de verificar, corregir o mejorar salidas generadas por IA.",
      "Promueve ética, criterio humano y revisión de calidad de la información."
    ]
  }
};

const CATEGORY_STYLE_DEFAULTS = {
  "Lenguaje y comunicación": ["asc", "competencial"],
  "Ciencias experimentales": ["indagacion", "competencial"],
  "Ciencias sociales": ["competencial", "indagacion"],
  "Formación socioemocional": ["sel", "competencial"],
  "Matemáticas": ["estructurado", "competencial"],
  "Proyectos": ["proyecto", "hibrido"]
};

const CATEGORY_STYLE_SUGGESTIONS = {
  "Lenguaje y comunicación": ["asc", "trazos_y_letras", "educativo", "competencial", "hibrido"],
  "Ciencias experimentales": ["indagacion", "competencial", "hibrido", "proyecto"],
  "Ciencias sociales": ["competencial", "indagacion", "asc", "proyecto"],
  "Formación socioemocional": ["sel", "competencial", "asc"],
  "Matemáticas": ["estructurado", "competencial", "dinamico", "quiz", "diagnostico", "evaluacion", "asc", "hibrido"],
  "Proyectos": ["proyecto", "hibrido", "competencial", "indagacion"],
  default: STYLE_ORDER
};

function normalizeStyleId(styleId = "") {
  const raw = String(styleId || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(STYLE_CATALOG, raw) ? raw : "asc";
}

function normalizeStyleIds(styleIds = []) {
  const list = Array.isArray(styleIds) ? styleIds : [styleIds];
  const seen = new Set();
  const out = [];
  list.forEach((item) => {
    const safe = normalizeStyleId(item);
    if (seen.has(safe)) return;
    seen.add(safe);
    out.push(safe);
  });
  return out.length ? out : ["asc"];
}

function getUnidadDominantStyleId(styleIds = []) {
  const active = normalizeStyleIds(styleIds);
  if (active.length === 1) return active[0];
  return active.find((id) => id !== "asc") || active[0];
}

function getUnidadStyleCatalog() {
  return STYLE_ORDER.map((id) => ({ ...STYLE_CATALOG[id] }));
}

function getUnidadStyle(styleId = "asc") {
  const safe = normalizeStyleId(styleId);
  return { ...STYLE_CATALOG[safe] };
}

function getUnidadDefaultStylesForCategory(categoria = "") {
  const safeCategory = String(categoria || "").trim();
  return normalizeStyleIds(CATEGORY_STYLE_DEFAULTS[safeCategory] || ["asc"]);
}

function getUnidadSuggestedStylesForCategory(categoria = "") {
  const safeCategory = String(categoria || "").trim();
  return normalizeStyleIds(CATEGORY_STYLE_SUGGESTIONS[safeCategory] || CATEGORY_STYLE_SUGGESTIONS.default);
}

function buildUnidadStylePromptBlock(styleId = "asc") {
  const style = getUnidadStyle(styleId);
  const verbs = Array.isArray(style.verbs) ? style.verbs.join(", ") : "";
  const pillars = Array.isArray(style.pillars) ? style.pillars.join(", ") : "";
  const directives = Array.isArray(style.promptDirectives) ? style.promptDirectives : [];
  return [
    `${style.label}: ${style.summary}`,
    pillars ? `Rasgos clave: ${pillars}.` : "",
    verbs ? `Verbos dominantes: ${verbs}.` : "",
    ...directives.map((line) => `- ${line}`)
  ].filter(Boolean).join("\n");
}

function buildUnidadCombinedStylePromptBlock(styleIds = []) {
  const safeStyleIds = normalizeStyleIds(styleIds);
  const styleLabels = safeStyleIds.map((id) => STYLE_CATALOG[id].label);
  const dominantId = getUnidadDominantStyleId(safeStyleIds);
  const dominant = STYLE_CATALOG[dominantId];
  const blocks = safeStyleIds.map((id) => buildUnidadStylePromptBlock(id));
  return [
    `ESTILOS PEDAGÓGICOS ACTIVOS: ${styleLabels.join(" + ")}.`,
    `ESTILO RECTOR DE FORMATO: ${dominant.label}.`,
    safeStyleIds.includes("asc") && safeStyleIds.length > 1
      ? "ASC se combina con los demás estilos como capa editorial: claridad, secuencia visible y evaluación verificable, pero NO monopoliza la estructura."
      : "",
    safeStyleIds.includes("asc") && safeStyleIds.length > 1
      ? "Cuando ASC se mezcle con otros estilos, el formato puede fusionar rasgos estructurales reales: pasos, bloques, retos, hipótesis, reactivos o productos, siempre que el resultado sea coherente."
      : "",
    "Combina los estilos sin mezclar sus funciones de forma caótica.",
    "Mantén coherencia metodológica en todas las actividades del bloque.",
    ...blocks
  ].filter(Boolean).join("\n\n");
}

function _isPrimerGradoValue(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return safe === "primero" || /^1\b/.test(safe) || /\bprimer\b/.test(safe);
}

function buildUnidadStyleFormatContract(styleIds = [], options = {}) {
  const active = normalizeStyleIds(styleIds);
  const dominantId = getUnidadDominantStyleId(active);
  const dominant = STYLE_CATALOG[dominantId];
  const hasAscMix = active.includes("asc") && active.length > 1;
  const isPrimerGrado = _isPrimerGradoValue(options?.grado || options?.gradoTexto || options?.grade || "");

  const firstGradeRules = isPrimerGrado ? [
    "PRIMERO: escribe instrucciones muy cortas, de una sola idea.",
    "PRIMERO: cada subinstrucción debe ser breve y directa.",
    "PRIMERO: evita explicaciones largas, dobles oraciones y texto sobrante."
  ] : [];

  const commonIntro = [
    `CONTRATO DE FORMATO OBLIGATORIO: usa ${dominant.label} como estructura rectora.`,
    "Todas las actividades deben seguir el MISMO formato rector durante este bloque.",
    "Cada actividad debe ir dentro de <div class=\"activity\">.",
    "REGLA DE NUMERACIÓN CRÍTICA: Cada actividad DEBE comenzar con su número correlativo seguido de un punto y un espacio (ej: 1. , 2. , 3. ).",
    "El número debe estar al inicio del primer párrafo (<p>) de la actividad, antes de cualquier etiqueta <strong>.",
    "REGLA DE RESPUESTA: En el bloque <div class=\"answer\">, coloca la respuesta esperada de forma clara, útil y revisable, sin sacar la solución fuera de ese bloque.",
    "REGLA DE BLOQUE DE RESPUESTA ÚNICO: NO escribas la respuesta ni la clave fuera del bloque <div class=\"answer\">. Todo lo relacionado con la solución o el criterio de evaluación debe ir EXCLUSIVAMENTE dentro de <div class=\"answer\">.",
    "Puedes variar el contenido pedagógico entre actividades, pero NO cambiar el formato rector a mitad del bloque."
  ];

  const contracts = {
    asc: [
      ...commonIntro,
      ...firstGradeRules,
      "Formato ASC obligatorio: instrucción principal + subinstrucciones + respuesta esperada.",
      "REGLA ASC CRÍTICA: NO sustituyas este formato por bloques tipo challenge, inquiry-block, quiz-block, diagnostic-block, assessment-block, project-block, sel-block, structured-block, hybrid-block o ai-block.",
      "REGLA ASC CRÍTICA: cada actividad debe conservar párrafo inicial numerado + lista <ol type=\"a\" class=\"steps\"> + bloque final <div class=\"answer\">.",
      "Usa esta plantilla exacta como referencia estructural:",
      `<div class="activity">
  <p>1. <strong>[Instrucción principal clara y exigente].</strong> [IC T. IND]</p>
  <ol type="a" class="steps">
    <li>[Subinstrucción 1]</li>
    <li>[Subinstrucción 2 opcional]</li>
    <li>[Subinstrucción 3 opcional]</li>
    <li>[Subinstrucción 4 opcional]</li>
  </ol>
  <div class="answer">
    <span style="color:mediumvioletred;">Respuesta: [respuesta esperada clara y verificable]</span>
  </div>
</div>`,
      "En ASC sí debes usar subinstrucciones y la etiqueta final EXACTA 'Respuesta:'.",
      "No cambies 'Respuesta:' por 'Respuesta esperada', 'Clave', 'Criterio' ni otras variantes cuando el estilo rector sea ASC.",
      "Si el usuario seleccionó solo ASC, TODO el bloque debe quedar en formato ASC sin excepciones."
    ],
    trazos_y_letras: [
      ...commonIntro,
      ...firstGradeRules,
      "Formato Trazos y letras obligatorio: instrucción directa + modelo de escritura o espacio de trazo + respuesta esperada como muestra visual.",
      "NO uses listas <ol>, <ul> ni subinstrucciones internas; cada actividad debe ser un bloque simple y limpio.",
      "El contenido debe sentirse como cuaderno de trazos o lectura inicial guiada.",
      "Usa esta plantilla exacta como referencia estructural:",
      `<div class="activity">
  <p>1. <strong>[Instrucción breve de trazo, copia o lectura inicial].</strong> [IC T. IND]</p>
  <div class="trace-model">[Modelo, renglón, sílaba, palabra o frase para copiar/trazar]</div>
  <div class="answer">
    <span style="color:mediumvioletred;">Respuesta: [modelo exacto que el alumno debe trazar o copiar]</span>
  </div>
</div>`,
      "Evita consignas abstractas, análisis largos o desarrollo abierto.",
      "Prioriza direccionalidad, repetición útil, legibilidad y frases muy cortas cuando corresponda."
    ],
    educativo: [
      ...commonIntro,
      ...firstGradeRules,
      "Formato Educativo obligatorio: comprensión guiada + evidencia visible o textual + respuesta comprobable.",
      "Diseña ejercicios tipo lectura editorial: relacionar oración e imagen, elegir la oración correcta, identificar nombres propios, marcar correspondencias o completar apoyos breves.",
      "No uses preguntas genéricas ni bloques largos de explicación; cada actividad debe sentirse como un ejercicio de comprensión concreta.",
      "Usa esta plantilla como guía:",
      `<div class="activity">
  <p>1. <strong>[Consigna de comprensión guiada].</strong> [IC T. IND]</p>
  <div class="educative-block"><strong>Estímulo:</strong> [imagen, texto breve, lista de oraciones o nombres]</div>
  <div class="educative-block"><strong>Acción:</strong> [relaciona, selecciona, marca, compara o completa]</div>
  <div class="answer">
    <span style="color:mediumvioletred;">Respuesta esperada (directa): [correspondencia o elección correcta]</span>
  </div>
</div>`,
      "Asegura que la consigna dependa de una evidencia observable y que la respuesta se pueda verificar sin ambigüedad."
    ],
    competencial: [
      ...commonIntro,
      ...firstGradeRules,
      "Formato Competencial obligatorio: situación o reto + decisión o resolución + evidencia + criterio de logro.",
      "NO uses el formato ASC de subinstrucciones a), b), c), d) salvo que sea indispensable en una sola actividad.",
      "Usa esta plantilla como guía:",
      `<div class="activity">
  <p>1. <strong>[Reto aplicado o situación-problema].</strong> [IC T. IND]</p>
  <div class="challenge"><strong>Situación:</strong> [contexto real o verosímil]</div>
  <ul class="task-flow">
    <li><strong>Decide:</strong> [qué debe elegir o planear el alumno]</li>
    <li><strong>Resuelve:</strong> [acción o procedimiento principal]</li>
    <li><strong>Justifica:</strong> [por qué su solución funciona]</li>
  </ul>
  <div class="answer">
    <span style="color:mediumvioletred;">Respuesta esperada (directa): [respuesta o evidencia breve]</span>
  </div>
</div>`
    ],
    indagacion: [
      ...commonIntro,
      ...firstGradeRules,
      "Formato Indagación obligatorio: pregunta guía + hipótesis + evidencias + conclusión.",
      "NO uses el formato ASC de instrucción principal con lista de subinstrucciones tradicionales.",
      "Usa esta plantilla como guía:",
      `<div class="activity">
  <p>1. <strong>[Pregunta guía investigable].</strong> [IC T. IND]</p>
  <div class="inquiry-block"><strong>Hipótesis:</strong> [anticipación razonada del alumno]</div>
  <div class="inquiry-block"><strong>Evidencias a revisar:</strong> [lectura, datos, imagen, ejemplo, experimento o fuente]</div>
  <div class="inquiry-block"><strong>Análisis:</strong> [qué debe comparar, contrastar u observar]</div>
  <div class="answer">
    <span style="color:mediumvioletred;">Respuesta esperada (directa): [conclusión breve]</span>
  </div>
</div>`
    ],
    dinamico: [
      ...commonIntro,
      ...firstGradeRules,
      "Formato Dinámico obligatorio: reto breve + secuencia rápida de ejercicios variados + comprobación ágil.",
      "NO uses bloques largos de explicación ni el molde ASC tradicional.",
      "Usa esta plantilla como guía:",
      `<div class="activity">
  <p>1. <strong>[Mini reto o consigna de entrada rápida].</strong> [IC T. IND]</p>
  <div class="dynamic-block"><strong>Activa:</strong> [consigna breve para arrancar]</div>
  <ul class="dynamic-flow">
    <li><strong>Ejercicio 1:</strong> [reactivo corto y directo]</li>
    <li><strong>Ejercicio 2:</strong> [reactivo diferente: completar, relacionar, elegir, corregir]</li>
    <li><strong>Ejercicio 3:</strong> [mini reto final opcional]</li>
  </ul>
  <div class="answer">
    <span style="color:mediumvioletred;">Respuesta esperada (directa): [respuesta breve]</span>
  </div>
</div>`
    ],
    quiz: [
      ...commonIntro,
      ...firstGradeRules,
      "Formato Quiz - Examen obligatorio: batería de reactivos variados (opción múltiple, abierta, relación, completar).",
      "Usa estos ejemplos de estructura dentro de <div class=\"activity\">:",
      `<!-- Ejemplo Opción Múltiple -->
<div class="activity">
  <p>1. <strong>[Pregunta de opción múltiple].</strong> [IC T. IND]</p>
  <ul class="quiz-flow">
    <li>A) [Opción 1]</li>
    <li>B) [Opción 2]</li>
    <li>C) [Opción 3]</li>
  </ul>
  <div class="answer">
    <span style="color:mediumvioletred;">Clave: [Letra y explicación]</span>
  </div>
</div>

<!-- Ejemplo Pregunta Abierta -->
<div class="activity">
  <p>1. <strong>[Pregunta abierta o de desarrollo corto].</strong> [IC T. IND]</p>
  <div class="quiz-space">_________________________________________________</div>
  <div class="answer">
    <span style="color:mediumvioletred;">Respuesta esperada (directa): [puntos clave breves]</span>
  </div>
</div>

<!-- Ejemplo Relación de Columnas -->
<div class="activity">
  <p>1. <strong>[Instrucción para relacionar conceptos].</strong> [IC T. IND]</p>
  <div class="quiz-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
    <div>1. [Concepto A]</div><div>( ) [Definición 1]</div>
    <div>2. [Concepto B]</div><div>( ) [Definición 2]</div>
  </div>
  <div class="answer">
    <span style="color:mediumvioletred;">Clave: 1-[X], 2-[Y]</span>
  </div>
</div>`
    ],
    diagnostico: [
      ...commonIntro,
      ...firstGradeRules,
      "Formato Diagnóstico obligatorio: reactivo de entrada + respuesta diagnóstica + lectura docente del punto de partida.",
      "Debe parecer evaluación diagnóstica o examen de conocimientos previos, NO actividad abierta genérica ni formato ASC tradicional.",
      "Cada actividad debe medir qué trae el alumno antes de enseñar el contenido, no verificar dominio final.",
      "Usa esta plantilla como guía:",
      `<div class="activity">
  <p>1. <strong>[Reactivo diagnóstico de entrada sobre el contenido].</strong> [IC T. IND]</p>
  <div class="diagnostic-block"><strong>Tipo de reactivo:</strong> [opción múltiple / completar / relación / respuesta breve]</div>
  <div class="diagnostic-block"><strong>Lectura docente:</strong> [qué indicaría dominio inicial, duda o error frecuente]</div>
  <div class="answer">
    <span style="color:mediumvioletred;">Respuesta esperada (directa): [respuesta y qué decisión pedagógica tomar]</span>
  </div>
</div>`,
      "Prioriza preguntas de entrada tipo examen breve para medir conocimientos previos, no tareas largas de desarrollo.",
      "Haz visibles errores típicos, ideas parciales y respuestas esperadas para que el docente pueda agrupar niveles de arranque."
    ],
    evaluacion: [
      ...commonIntro,
      ...firstGradeRules,
      "Formato Evaluación obligatorio: reactivo de logro + demanda cognitiva + criterio claro de corrección.",
      "NO uses el molde ASC tradicional ni lo conviertas en práctica abierta.",
      "Usa esta plantilla como guía:",
      `<div class="activity">
  <p>1. <strong>[Reactivo de evaluación o examen].</strong> [IC T. IND]</p>
  <div class="assessment-block"><strong>Demuestra:</strong> [qué dominio debe evidenciar]</div>
  <div class="assessment-block"><strong>Criterio:</strong> [qué se considera correcto, suficiente o incompleto]</div>
  <div class="assessment-block"><strong>Nivel de exigencia:</strong> [básico / intermedio / avanzado]</div>
  <div class="answer">
    <span style="color:mediumvioletred;">Respuesta esperada / criterio de calificación: [resultado o pauta clara]</span>
  </div>
</div>`
    ],
    proyecto: [
      ...commonIntro,
      ...firstGradeRules,
      "Formato Proyecto obligatorio: reto + producto o entregable + acciones de fase + evidencia.",
      "NO uses el formato ASC con subinstrucciones escolares estándar.",
      "Usa esta plantilla como guía:",
      `<div class="activity">
  <p>1. <strong>[Reto o encargo de fase].</strong> [IC T. EQUI]</p>
  <div class="project-block"><strong>Producto esperado:</strong> [qué se construirá, presentará o resolverá]</div>
  <div class="project-block"><strong>Acciones clave:</strong> [2 o 3 acciones concretas de la fase]</div>
  <div class="project-block"><strong>Evidencia:</strong> [qué debe quedar observable o documentado]</div>
  <div class="answer">
    <span style="color:mediumvioletred;">Producto esperado: [rasgos mínimos del entregable o desempeño]</span>
  </div>
</div>`
    ],
    sel: [
      ...commonIntro,
      ...firstGradeRules,
      "Formato SEL obligatorio: situación humana + reflexión personal + diálogo o acuerdo + cierre reflexivo.",
      "NO uses el formato ASC con respuesta única cerrada como si fuera ejercicio de libro.",
      "Usa esta plantilla como guía:",
      `<div class="activity">
  <p>1. <strong>[Situación emocional, social o de convivencia].</strong> [IC T. PAR]</p>
  <div class="sel-block"><strong>Piensa:</strong> [qué siente, identifica o reconoce el alumno]</div>
  <div class="sel-block"><strong>Dialoga:</strong> [qué debe conversar o escuchar]</div>
  <div class="sel-block"><strong>Propón:</strong> [acuerdo, estrategia o decisión responsable]</div>
  <div class="answer">
    <span style="color:mediumvioletred;">Cierre reflexivo esperado: [tipo de reflexión, postura o compromiso que se espera]</span>
  </div>
</div>`
    ],
    estructurado: [
      ...commonIntro,
      ...firstGradeRules,
      "Formato Estructurado obligatorio: consigna + práctica guiada + práctica autónoma + verificación.",
      "Puedes usar pasos, pero NO copies el patrón ASC literal de subinstrucciones y respuesta editorial.",
      "Usa esta plantilla como guía:",
      `<div class="activity">
  <p>1. <strong>[Consigna de fundamento o procedimiento].</strong> [IC T. IND]</p>
  <div class="structured-block"><strong>Practica guiada:</strong> [primer paso modelado o andamiado]</div>
  <div class="structured-block"><strong>Practica autónoma:</strong> [aplicación por cuenta propia]</div>
  <div class="structured-block"><strong>Verifica:</strong> [cómo comprobar el procedimiento o resultado]</div>
  <div class="answer">
    <span style="color:mediumvioletred;">Verificación: [resultado correcto, criterio de exactitud o error típico a evitar]</span>
  </div>
</div>`
    ],
    hibrido: [
      ...commonIntro,
      ...firstGradeRules,
      "Formato Híbrido obligatorio: consigna integradora + fuentes o soportes + síntesis entre recursos.",
      "NO uses el formato ASC tradicional.",
      "Usa esta plantilla como guía:",
      `<div class="activity">
  <p>1. <strong>[Consigna que obliga a cruzar varios soportes].</strong> [IC T. IND]</p>
  <div class="hybrid-block"><strong>Fuentes de trabajo:</strong> [lectura / imagen / video / anexo / recurso]</div>
  <div class="hybrid-block"><strong>Tarea de cruce:</strong> [qué debe comparar, relacionar o sintetizar entre soportes]</div>
  <div class="hybrid-block"><strong>Producto breve:</strong> [tabla, explicación, esquema, conclusión o mini evidencia]</div>
  <div class="answer">
    <span style="color:mediumvioletred;">Síntesis esperada: [qué conexión correcta debe lograr el alumno]</span>
  </div>
</div>`
    ],
    ia_critica: [
      ...commonIntro,
      ...firstGradeRules,
      "Formato IA Crítica obligatorio: respuesta inicial de IA + verificación humana + mejora + juicio final.",
      "NO uses el formato ASC tradicional.",
      "Usa esta plantilla como guía:",
      `<div class="activity">
  <p>1. <strong>[Consigna de análisis o co-creación con IA].</strong> [IC T. IND]</p>
  <div class="ai-block"><strong>Respuesta de IA:</strong> [idea, borrador o explicación inicial a revisar]</div>
  <div class="ai-block"><strong>Verifica:</strong> [qué debe comprobar el alumno en lectura, datos o secuencia]</div>
  <div class="ai-block"><strong>Mejora:</strong> [cómo corregirá o reescribirá la salida]</div>
  <div class="answer">
    <span style="color:mediumvioletred;">Juicio crítico esperado: [qué conclusión humana debe obtener]</span>
  </div>
</div>`
    ]
  };

  if (hasAscMix) {
    return [
      ...commonIntro,
      `FORMATO MIXTO OBLIGATORIO: combina la claridad editorial de ASC con la estructura principal de ${dominant.label}.`,
      "La mezcla debe ser real, no superficial: no basta con cambiar vocabulario; debe cambiar la arquitectura interna de la actividad.",
      "Puedes fusionar componentes estructurales como pasos ASC, bloques de situación, hipótesis, reactivos, producto, reflexión o verificación dentro de una misma actividad.",
      "NO dejes ASC como molde único si hay otros estilos activos; cada actividad debe evidenciar al menos 2 rasgos estructurales del estilo combinado.",
      "Mantén siempre: número correlativo, consigna clara, modalidad visible y bloque final <div class=\"answer\">.",
      "Puedes conservar listas de pasos cuando ayuden, pero también integrar bloques como <div class=\"challenge\">, <div class=\"inquiry-block\">, <div class=\"diagnostic-block\">, <div class=\"assessment-block\">, <div class=\"project-block\">, <div class=\"sel-block\">, <div class=\"structured-block\">, <div class=\"hybrid-block\"> o <div class=\"ai-block\"> según la combinación elegida.",
      "Ejemplo de mezcla válida ASC + Competencial:",
      `<div class="activity">
  <p>1. <strong>[Reto aplicado o situación-problema].</strong> [IC T. IND]</p>
  <div class="challenge"><strong>Situación:</strong> [contexto real o verosímil]</div>
  <ol type="a" class="steps">
    <li><strong>Decide:</strong> [qué debe elegir o planear el alumno]</li>
    <li><strong>Resuelve:</strong> [acción o procedimiento principal]</li>
    <li><strong>Justifica:</strong> [por qué su solución funciona]</li>
  </ol>
  <div class="answer">
    <span style="color:mediumvioletred;">Respuesta: [evidencia o solución verificable]</span>
  </div>
</div>`,
      "Ejemplo de mezcla válida ASC + Indagación:",
      `<div class="activity">
  <p>1. <strong>[Pregunta guía investigable].</strong> [IC T. IND]</p>
  <div class="inquiry-block"><strong>Hipótesis:</strong> [anticipación razonada]</div>
  <ol type="a" class="steps">
    <li>Observa o revisa la evidencia indicada.</li>
    <li>Contrasta tu hipótesis con los datos.</li>
    <li>Explica tu conclusión final.</li>
  </ol>
  <div class="answer">
    <span style="color:mediumvioletred;">Respuesta: [conclusión breve y comprobable]</span>
  </div>
</div>`
    ].join("\n");
  }

  return contracts[dominantId].join("\n");
}

function buildUnidadStyleExecutionContract(styleIds = [], options = {}) {
  const active = normalizeStyleIds(styleIds);
  const dominantId = getUnidadDominantStyleId(active);
  const hasAscMix = active.includes("asc") && active.length > 1;
  const relatedReading = options.relatedReading === true;
  const withResources = options.withResources === true;
  const isPrimerGrado = _isPrimerGradoValue(options?.grado || options?.gradoTexto || options?.grade || "");
  const lines = [
    `CONTRATO DE ESTILO: ${active.map((id) => STYLE_CATALOG[id].label).join(" + ")}.`,
    `FORMATO RECTOR INNEGOCIABLE: ${STYLE_CATALOG[dominantId].label}.`,
    "La secuencia curricular efectiva sigue siendo la fuente disciplinar obligatoria.",
    relatedReading
      ? "Si hay lectura relacionada, combínala con la secuencia curricular; nunca sustituyas una por la otra."
      : "Si no hay lectura relacionada, no inventes dependencias artificiales con lecturas.",
    withResources
      ? "Si hay recursos activos, intégralos con intención pedagógica real y no como decoración."
      : "No fuerces recursos si no forman parte del diseño.",
    active.includes("estructurado")
      ? "Asegura progresión, práctica y verificación."
      : "",
    active.includes("competencial")
      ? "Asegura transferencia, decisión o aplicación a contextos reales."
      : "",
    active.includes("indagacion")
      ? "Asegura preguntas, evidencia, contraste y conclusión."
      : "",
    active.includes("dinamico")
      ? "Asegura ejercicios ágiles, variados y de ritmo alto."
      : "",
    active.includes("quiz")
      ? "Asegura reactivos cortos, opciones claras y retroalimentación rápida."
      : "",
    isPrimerGrado
      ? "PRIMERO: usa frases muy cortas y una sola idea por instrucción."
      : "",
    isPrimerGrado
      ? "PRIMERO: reduce al mínimo las subinstrucciones y evita repeticiones."
      : "",
    active.includes("asc") && !hasAscMix
      ? "Si ASC es el formato rector, conserva exactamente la secuencia: instrucción principal + subinstrucciones + bloque final con etiqueta 'Respuesta:'."
      : "",
    active.includes("trazos_y_letras")
      ? "Asegura instrucción directa, modelo visible de escritura y respuesta esperada como trazo, copia o frase breve, sin subinstrucciones."
      : "",
    active.includes("educativo")
      ? "Asegura comprensión guiada, correspondencia imagen-texto, nombres propios o selección de la oración correcta con evidencia verificable."
      : "",
    hasAscMix
      ? "Si ASC está combinado con otros estilos, úsalo para reforzar claridad editorial, secuenciación visible y respuesta verificable, pero permite mezcla estructural real."
      : "",
    active.includes("diagnostico")
      ? "Asegura un examen diagnóstico de entrada con reactivos breves y lectura útil del punto de partida."
      : "",
    active.includes("evaluacion")
      ? "Asegura medición formal del aprendizaje logrado con criterios claros."
      : "",
    active.includes("proyecto")
      ? "Asegura reto, fases, evidencia y producto."
      : "",
    active.includes("sel")
      ? "Asegura reflexión emocional, convivencia y toma de decisiones responsables."
      : "",
    active.includes("hibrido")
      ? "Asegura conexión explícita entre lectura, imagen, video o anexos si están disponibles."
      : "",
    active.includes("ia_critica")
      ? "Asegura verificación, juicio humano y uso ético de IA."
      : "",
    active.includes("asc")
      ? "Asegura claridad editorial, estructura guiada y evaluación verificable."
      : ""
  ];
  if (dominantId !== "asc") {
    lines.push(hasAscMix
      ? "NO dejes la mezcla reducida al molde ASC tradicional; integra de verdad la estructura del estilo rector complementario."
      : "PROHIBIDO volver al molde ASC tradicional de instrucción + lista a,b,c,d + Respuesta:, salvo que el estilo rector sea ASC.");
  }
  return lines.filter(Boolean).join("\n");
}

export {
  STYLE_ORDER as UNIDAD_ACTIVITY_STYLE_ORDER,
  STYLE_CATALOG as UNIDAD_ACTIVITY_STYLE_CATALOG,
  CATEGORY_STYLE_DEFAULTS as UNIDAD_ACTIVITY_STYLE_DEFAULTS,
  CATEGORY_STYLE_SUGGESTIONS as UNIDAD_ACTIVITY_STYLE_SUGGESTIONS,
  normalizeStyleId as normalizeUnidadActivityStyleId,
  normalizeStyleIds as normalizeUnidadActivityStyleIds,
  getUnidadStyleCatalog,
  getUnidadStyle,
  getUnidadDefaultStylesForCategory,
  getUnidadSuggestedStylesForCategory,
  getUnidadDominantStyleId,
  buildUnidadStylePromptBlock,
  buildUnidadCombinedStylePromptBlock,
  buildUnidadStyleFormatContract,
  buildUnidadStyleExecutionContract
};

if (typeof window !== "undefined") {
  window.UNIDAD_ACTIVITY_STYLE_ORDER = STYLE_ORDER;
  window.UNIDAD_ACTIVITY_STYLE_CATALOG = STYLE_CATALOG;
  window.UNIDAD_ACTIVITY_STYLE_DEFAULTS = CATEGORY_STYLE_DEFAULTS;
  window.UNIDAD_ACTIVITY_STYLE_SUGGESTIONS = CATEGORY_STYLE_SUGGESTIONS;
  window.getUnidadStyleCatalog = getUnidadStyleCatalog;
  window.getUnidadStyle = getUnidadStyle;
  window.getUnidadDefaultStylesForCategory = getUnidadDefaultStylesForCategory;
  window.getUnidadSuggestedStylesForCategory = getUnidadSuggestedStylesForCategory;
  window.getUnidadDominantStyleId = getUnidadDominantStyleId;
  window.buildUnidadStylePromptBlock = buildUnidadStylePromptBlock;
  window.buildUnidadCombinedStylePromptBlock = buildUnidadCombinedStylePromptBlock;
  window.buildUnidadStyleFormatContract = buildUnidadStyleFormatContract;
  window.buildUnidadStyleExecutionContract = buildUnidadStyleExecutionContract;
}
