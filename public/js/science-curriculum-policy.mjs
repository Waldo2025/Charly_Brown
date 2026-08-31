export const CURRICULUM_POLICY_VERSION = 2;

export const BIOLOGY_ALLOWED_QUESTION_TYPES = Object.freeze([
  "multiple",
  "image-multiple",
  "matching",
  "keyword",
  "fill-blank",
  "sequence-order",
  "timeline-order",
  "numeric-answer"
]);

export const BIOLOGY_FORBIDDEN_QUESTION_TYPES = Object.freeze([
  "equation-build",
  "graph-plot",
  "exponent-placement",
  "chemical-balance",
  "number-line-placement"
]);

const BIOLOGY_FORBIDDEN_MATH_TEXT = /(?:%|por\s*ciento|porcentaje|ecuaci[oó]n|f[oó]rmula|variable\s+[a-z]|despeja|potencia|exponente|ra[ií]z\s+cuadrada|notaci[oó]n\s+cient[ií]fica|gr[aá]fic[ao]|coordenada|factoriz|polinom|binomio|trinomio|par[aá]bola|velocidad|aceleraci[oó]n|trayectoria|voltaje|corriente\s+el[eé]ctrica|\bx\s*[=+\-*/²^])/i;
const STOP_WORDS = new Set([
  "para", "como", "desde", "hasta", "sobre", "entre", "donde", "cuando", "porque",
  "esta", "este", "estos", "estas", "cada", "debe", "deben", "hacer", "realizar",
  "crear", "juego", "actividad", "experiencia", "alumno", "alumna", "estudiante"
]);

function normalizedWords(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
}

function meaningfulAnchors(value) {
  return [...new Set(normalizedWords(value).filter((word) => word.length >= 5 && !STOP_WORDS.has(word)))];
}

function anchorVariants(anchor) {
  const variants = new Set([anchor]);
  // La redacción generada puede usar singular aunque el tema configurado esté
  // en plural (por ejemplo, "Ecosistemas" -> "ecosistema árido").
  if (anchor.endsWith("s") && anchor.length > 5) variants.add(anchor.slice(0, -1));
  return [...variants];
}

function sourceMentionsAnchor(source, anchor) {
  return anchorVariants(anchor).some((variant) => source.includes(variant));
}

export function usesCurriculumPolicy(activity = {}) {
  return Number(activity?.generation?.curriculumPolicyVersion || 0) >= CURRICULUM_POLICY_VERSION;
}

export function questionTypesForActivity(activity = {}, defaultTypes = []) {
  if (activity.subject === "biology" && usesCurriculumPolicy(activity)) {
    return [...BIOLOGY_ALLOWED_QUESTION_TYPES];
  }
  return [...defaultTypes];
}

export function isQuestionTypeAllowed(activity = {}, type = "") {
  if (activity.subject !== "biology" || !usesCurriculumPolicy(activity)) return true;
  return BIOLOGY_ALLOWED_QUESTION_TYPES.includes(String(type));
}

export function isSimpleBiologyNumericAssessment(activity = {}, assessment = {}) {
  if (activity.subject !== "biology" || !usesCurriculumPolicy(activity) || assessment.type !== "numeric-answer") return true;
  const value = Number(assessment.correctValue);
  const tolerance = Number(assessment.tolerance || 0);
  const text = [assessment.context, assessment.prompt, assessment.goal, assessment.feedback, assessment.solution].filter(Boolean).join(" ");
  return Number.isInteger(value)
    && value >= 0
    && value <= 30
    && tolerance === 0
    && !BIOLOGY_FORBIDDEN_MATH_TEXT.test(text);
}

export function isAssessmentDifficultyCompatible(activity = {}, assessment = {}) {
  if (!usesCurriculumPolicy(activity) || activity.difficulty !== "guided") return true;
  const prompt = String(assessment.prompt || "").trim();
  const goal = String(assessment.goal || "").trim();
  const context = String(assessment.context || "").trim();
  const promptWords = prompt.split(/\s+/).filter(Boolean).length;
  const goalWords = goal.split(/\s+/).filter(Boolean).length;
  const contextWords = context.split(/\s+/).filter(Boolean).length;
  const multiStep = /(?:primero.{0,100}(?:despu[eé]s|luego)|despu[eé]s.{0,80}luego|posteriormente|varios pasos|dos pasos|tres pasos)/i;
  return promptWords <= 32
    && goalWords <= 22
    && contextWords <= 90
    && !multiStep.test([prompt, goal, context].join(" "));
}

export function isAssessmentGroundedInActivity(activity = {}, assessmentText = "") {
  if (!usesCurriculumPolicy(activity)) return true;
  const source = String(assessmentText || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const topicAnchors = meaningfulAnchors(activity.topic);
  const experienceAnchors = meaningfulAnchors(activity.experiencePrompt);
  const learningAnchors = meaningfulAnchors(activity.expectedLearnings);
  const mentionsTopic = !topicAnchors.length || topicAnchors.some((anchor) => sourceMentionsAnchor(source, anchor));
  const mentionsExperience = !experienceAnchors.length || experienceAnchors.some((anchor) => sourceMentionsAnchor(source, anchor));
  const mentionsExpectedLearning = !learningAnchors.length || learningAnchors.some((anchor) => sourceMentionsAnchor(source, anchor));
  return mentionsTopic && mentionsExperience && mentionsExpectedLearning;
}

export function isCurriculumContentCompatible(activity = {}, content = "") {
  if (!usesCurriculumPolicy(activity)) return true;
  if (activity.subject === "biology" && BIOLOGY_FORBIDDEN_MATH_TEXT.test(String(content || ""))) return false;
  return isAssessmentGroundedInActivity(activity, content);
}

export function buildCurriculumGenerationContract(activity = {}) {
  const subject = String(activity.subject || "");
  const topic = String(activity.topic || "el tema seleccionado");
  const grade = String(activity.grade || "secundaria");
  const difficulty = String(activity.difficulty || "balanced");
  const experience = String(activity.experiencePrompt || "un contexto cotidiano elegido por el docente");
  const expectedLearnings = String(activity.expectedLearnings || "los aprendizajes correspondientes al tema y grado seleccionados");
  const rules = [
    `CONTRATO DE CONTENIDO OBLIGATORIO: la materia fija el límite disciplinar; ${topic} es el tema articulador y los aprendizajes esperados indican los conceptos y procedimientos relacionados que deben cubrirse.`,
    `Materia: ${subject}. Tema articulador: ${topic}. Grado máximo: ${grade}. Aprendizajes esperados: ${expectedLearnings}. Experiencia obligatoria: ${experience}.`,
    "La experiencia aporta el escenario, los objetos, las acciones y el problema aplicado; no sustituye ni amplía por sí sola el currículo.",
    "Combina materia, tema, aprendizajes y experiencia sin introducir otra materia, contenidos no solicitados ni conocimientos de grados posteriores.",
    "Distribuye los aprendizajes entre niveles y preguntas; cada elemento debe trabajar al menos uno de forma reconocible dentro de la experiencia.",
    "Todo objetivo, ejemplo, pregunta, respuesta, retroalimentación e imagen debe conservar el tema y materializar elementos concretos de la experiencia.",
    "Los títulos deben ser breves pero formar frases completas. Nunca los cortes, resumas ni termines con puntos suspensivos."
  ];
  if (subject === "biology") {
    rules.push(
      `En Biología sólo se permiten estas mecánicas: ${BIOLOGY_ALLOWED_QUESTION_TYPES.join(", ")}.`,
      `Están prohibidas estas mecánicas: ${BIOLOGY_FORBIDDEN_QUESTION_TYPES.join(", ")}.`,
      "No conviertas procesos biológicos en ecuaciones. Si una respuesta es numérica, usa un conteo directo, un solo paso, enteros pequeños de 0 a 30, sin porcentajes, fórmulas, variables, potencias ni notación científica."
    );
  }
  if (difficulty === "guided") {
    rules.push(
      "DIFICULTAD FÁCIL OBLIGATORIA: enseña y evalúa un solo concepto por pregunta, con lenguaje directo, datos explícitos y como máximo un paso de razonamiento.",
      "Evita trampas, datos irrelevantes, prerequisitos no explicados y distractores absurdos. En Matemáticas, Física o Química sólo admite una ecuación sencilla cuando sea esencial para el tema y el grado."
    );
  } else {
    rules.push(`La dificultad ${difficulty} nunca puede superar los conocimientos correspondientes a ${grade}.`);
  }
  return rules.join("\n");
}
