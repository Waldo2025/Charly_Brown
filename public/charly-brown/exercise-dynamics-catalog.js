/**
 * Catálogo de 18 Dinámicas Visuales y Tipos de Ejercicios de Charly Brown.
 * Permite configurar qué estilos de ejercicios se proponen y utilizan en actividades
 * manuales (chat) y automatizadas.
 */

export const EXERCISE_DYNAMICS_CATALOG = Object.freeze([
  {
    id: "banco_palabras",
    label: "Banco de palabras o números en caja",
    category: "Vocabulario & Lectura",
    icon: "fa-box-archive",
    desc: "Caja contenedora estilizada con palabras o números clave para consulta y resolución.",
    htmlSnippet: '<div class="cb-activity-bank"><span class="cb-bank-item">palabra1</span><span class="cb-bank-item">palabra2</span></div>',
    defaultEnabled: true
  },
  {
    id: "rellenar_espacios",
    label: "Rellenar espacios en blanco",
    category: "Gramática & Ortografía",
    icon: "fa-pen-to-square",
    desc: "Frases u oraciones con líneas de completado para el alumno.",
    htmlSnippet: '<p>En la época medieval <span class="cb-fill-blank"></span> castillos que se <span class="cb-fill-blank"></span> en fortalezas.</p>',
    defaultEnabled: true
  },
  {
    id: "sopa_letras",
    label: "Sopa de letras con cuadrícula editorial",
    category: "Lúdico & Memoria",
    icon: "fa-table-cells",
    desc: "Matriz rectangular centrada de 10 columnas por fila para localizar palabras ocultas.",
    htmlSnippet: '<div class="cb-word-search-wrap"><div class="cb-word-search-grid" style="grid-template-columns: repeat(10, 28px);"><span>p</span><span>e</span>...</div></div>',
    defaultEnabled: true
  },
  {
    id: "emparejamiento",
    label: "Relación de columnas / Emparejamiento",
    category: "Asociación & Lógica",
    icon: "fa-arrows-left-right",
    desc: "Dos columnas paralelas con puntos conectores (tripas de gato) para unir conceptos y definiciones.",
    htmlSnippet: '<div class="cb-matching-columns"><div class="cb-match-col cb-match-col-left"><div class="cb-match-item"><span>Concepto</span><span class="cb-match-dot"></span></div></div><div class="cb-match-col cb-match-col-right"><div class="cb-match-item"><span class="cb-match-dot"></span><span>Definición</span></div></div></div>',
    defaultEnabled: true
  },
  {
    id: "opcion_multiple",
    label: "Preguntas de opción múltiple",
    category: "Comprensión & Evaluación",
    icon: "fa-list-check",
    desc: "Preguntas estructuradas con incisos rotulados y clave en color magenta.",
    htmlSnippet: '<div class="cb-mc-group"><p class="cb-mc-question">¿Cuál es...?</p><div class="cb-mc-options"><label class="cb-mc-option">( <span style="color:#e6007e;">a</span> ) Opción A</label><label class="cb-mc-option">( ) Opción B</label></div></div>',
    defaultEnabled: true
  },
  {
    id: "cuadro_sinoptico",
    label: "Cuadro sinóptico con llaves",
    category: "Estructuración & Esquemas",
    icon: "fa-diagram-project",
    desc: "Organizador visual con llave tipográfica '{' y ramificaciones jerárquicas.",
    htmlSnippet: '<div class="cb-synoptic-chart"><div class="cb-synoptic-root">Tema</div><div class="cb-synoptic-brace">{</div><div class="cb-synoptic-branches"><div class="cb-synoptic-node"><strong>Idea</strong><div class="cb-write-line"></div></div></div></div>',
    defaultEnabled: true
  },
  {
    id: "instruccion_directa",
    label: "Instrucción simple directa con etiqueta",
    category: "Consignas Claras",
    icon: "fa-tag",
    desc: "Consigna encabezada por una etiqueta llamativa (Lee, Comparte, Contesta) en texto corrido sin columnas.",
    htmlSnippet: '<div class="cb-simple-instruction"><span class="cb-instruction-tag">Lee</span> <strong>Con atención el texto.</strong> [IC. T. IND]</div>',
    defaultEnabled: true
  },
  {
    id: "subrayar_colores",
    label: "Subrayar con códigos de color",
    category: "Lectura Analítica",
    icon: "fa-highlighter",
    desc: "Consigna que solicita identificar elementos destacándolos con rojo y azul.",
    htmlSnippet: '<p><strong>Subraya con <span class="cb-color-red">rojo</span> las causas y con <span class="cb-color-blue">azul</span> las consecuencias.</strong> [IC. T. IND]</p>',
    defaultEnabled: true
  },
  {
    id: "pasaje_lectura",
    label: "Pasaje de lectura en caja de contraste",
    category: "Comprensión Lectora",
    icon: "fa-book-open",
    desc: "Recuadro con borde punteado suave para lecturas breves o textos de análisis.",
    htmlSnippet: '<div class="cb-reading-passage"><h4 class="cb-passage-title">Título</h4><p>Texto breve...</p></div>',
    defaultEnabled: true
  },
  {
    id: "lineas_pauta",
    label: "Preguntas abiertas con líneas de pauta",
    category: "Expresión Escrita",
    icon: "fa-grip-lines",
    desc: "Preguntas de reflexión con líneas horizontales pautadas según el grado escolar.",
    htmlSnippet: '<div class="cb-question-item"><p class="cb-question-text">¿Por qué...?</p><div class="cb-writing-lines"><div class="cb-write-line"></div></div></div>',
    defaultEnabled: true
  },
  {
    id: "tabla_datos",
    label: "Tablas de registro y datos",
    category: "Organización & Tablas",
    icon: "fa-table",
    desc: "Tabla escolar con encabezados y filas para completar información.",
    htmlSnippet: '<table class="cb-activity-table"><thead><tr><th>Categoría</th><th>Ejemplo</th></tr></thead><tbody><tr><td>Dato</td><td><div class="cb-write-line"></div></td></tr></tbody></table>',
    defaultEnabled: true
  },
  {
    id: "linea_tiempo",
    label: "Líneas de tiempo cronológicas",
    category: "Historia & Secuencia",
    icon: "fa-timeline",
    desc: "Pasos numerados cronológicos con año o fecha y descripción del hito.",
    htmlSnippet: '<div class="cb-timeline"><div class="cb-timeline-step"><span class="cb-timeline-marker">1</span><span class="cb-timeline-year">1521</span><p>Acontecimiento...</p></div></div>',
    defaultEnabled: true
  },
  {
    id: "indicador_cuaderno",
    label: "Indicador de trabajo en cuaderno",
    category: "Vinculación",
    icon: "fa-book-bookmark",
    desc: "Insignia que señala actividades o reflexiones para desarrollar en el cuaderno del alumno.",
    htmlSnippet: '<span class="cb-notebook-badge"><i class="fas fa-book"></i> En tu cuaderno</span>',
    defaultEnabled: true
  },
  {
    id: "matematicas_fracciones",
    label: "Matemáticas: fracciones y cuadrículas 10x10",
    category: "Pensamiento Matemático",
    icon: "fa-calculator",
    desc: "Modelado de fracciones, cajas de estrategia y cuadrículas decimales/porcentuales.",
    htmlSnippet: '<span class="cb-fraction"><span class="num">3</span><span class="den">4</span></span>, <div class="cb-strategy-box"></div>, <div class="cb-math-grid-10x10"></div>',
    defaultEnabled: true
  },
  {
    id: "juego_practico",
    label: "Sección 'Juego y practico' multicolor",
    category: "Lúdico & Dinámicas",
    icon: "fa-dice",
    desc: "Encabezado lúdico con letras multicolores para retos ortográficos y juegos rápidos.",
    htmlSnippet: '<div class="cb-game-section"><div class="cb-game-header"><span class="c1">J</span><span class="c2">u</span><span class="c3">e</span><span class="c4">g</span><span class="c5">o</span>...</div><h4 class="cb-game-title">Reto</h4></div>',
    defaultEnabled: true
  },
  {
    id: "imagenes_comparativas",
    label: "Tarjetas de imágenes comparativas",
    category: "Observación Visual",
    icon: "fa-images",
    desc: "Tarjetas visuales para comparar grados (positivo, comparativo, superlativo) o estados.",
    htmlSnippet: '<div class="cb-image-cards-grid"><div class="cb-image-card"><strong>Grado positivo</strong><ol class="cb-card-list"><li>Ejemplo</li></ol></div></div>',
    defaultEnabled: true
  },
  {
    id: "recoleccion_investigacion",
    label: "Caja de investigación y asamblea",
    category: "Proyectos & Comunidad",
    icon: "fa-magnifying-glass-chart",
    desc: "Caja con fases destacadas para indagación, entrevistas y acuerdos comunitarios.",
    htmlSnippet: '<div class="cb-research-box"><span class="cb-badge-step">Fase 1: Recolección</span><p>Consigna de indagación...</p></div>',
    defaultEnabled: true
  },
  {
    id: "dictado",
    label: "Sección de dictado pautado",
    category: "Ortografía & Caligrafía",
    icon: "fa-pen-fancy",
    desc: "Lista numerada limpia con plecas adaptadas al grado (caja caligráfica en 1°-2°, línea en 3°-6°).",
    htmlSnippet: '<ol class="steps steps-numbered cb-dictado-list"><li><div class="cb-response-line"><div class="answer"><span class="cb-teacher-resp" style="color:#e6007e;">palabra</span></div></div></li></ol>',
    defaultEnabled: true
  }
]);

const STORAGE_KEY = "charly_enabled_exercise_dynamics";
export const EXERCISE_DYNAMICS_VERSION = 1;
const knownIds = new Set(EXERCISE_DYNAMICS_CATALOG.map((item) => item.id));

export function normalizeExerciseDynamics(ids, { defaultToAll = true } = {}) {
  if (!Array.isArray(ids)) return defaultToAll ? EXERCISE_DYNAMICS_CATALOG.map((item) => item.id) : [];
  return [...new Set(ids.filter((id) => knownIds.has(id)))];
}

export function detectExerciseDynamics(html = "") {
  const source = String(html || "");
  return EXERCISE_DYNAMICS_CATALOG.filter((item) => {
    const classes = [...item.htmlSnippet.matchAll(/class="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/));
    const marker = classes.find((name) => /^cb-(?:activity-bank|fill-blank|word-search-wrap|matching-columns|mc-group|synoptic-chart|simple-instruction|color-red|reading-passage|question-item|activity-table|timeline|notebook-badge|fraction|game-section|image-cards-grid|research-box|dictado-list)$/.test(name));
    return marker && new RegExp(`\\b${marker}\\b`).test(source);
  }).map((item) => item.id);
}

export function getStoredExerciseDynamics() {
  if (typeof localStorage === "undefined") {
    return EXERCISE_DYNAMICS_CATALOG.map((item) => item.id);
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EXERCISE_DYNAMICS_CATALOG.map((item) => item.id);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return normalizeExerciseDynamics(parsed);
    return EXERCISE_DYNAMICS_CATALOG.map((item) => item.id);
  } catch (_) {
    return EXERCISE_DYNAMICS_CATALOG.map((item) => item.id);
  }
}

export function saveStoredExerciseDynamics(ids = []) {
  if (typeof localStorage === "undefined") return;
  try {
    const clean = normalizeExerciseDynamics(ids, { defaultToAll: false });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch (_) {}
}

export function isExerciseDynamicEnabled(id = "") {
  const current = getStoredExerciseDynamics();
  return current.includes(id);
}

export function buildExerciseDynamicsDirective(enabledIds = null) {
  const ids = Array.isArray(enabledIds) ? normalizeExerciseDynamics(enabledIds) : getStoredExerciseDynamics();
  const activeItems = EXERCISE_DYNAMICS_CATALOG.filter((item) => ids.includes(item.id));
  if (!activeItems.length) return "";

  return [
    "DINÁMICAS Y TIPOS DE EJERCICIOS ACTIVOS PARA ESTA UNIDAD (Configuración del catálogo editorial):",
    "Utiliza y propón preferentemente las siguientes mecánicas didácticas con sus plantillas HTML exactas:",
    ...activeItems.map((item, idx) => `  ${idx + 1}. ${item.label}: ${item.htmlSnippet}`)
  ].join("\n");
}
