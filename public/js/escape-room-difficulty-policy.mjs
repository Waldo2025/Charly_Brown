export const DIFFICULTY_POLICY_VERSION = 3;

export function buildLanguageLearningInstruction(context = {}) {
  if (!/^(en(?:[-_]|$)|english$|ingl[eé]s$)/i.test(String(context.idioma || '').trim())) return '';
  return `PERFIL LINGÜÍSTICO: estudiantes de inglés como lengua extranjera, B1 del MCER (CEFR), en cualquier materia. Aplica a títulos, narrativa, instrucciones, lecturas, preguntas, opciones, pistas, feedback y textos de recursos. Usa inglés habitual, frases directas, referencias claras y verbos de acción. Explica brevemente los términos curriculares indispensables. Evita modismos poco frecuentes, metáforas confusas, jerga decorativa, palabras pretenciosas y narrativa innecesaria. Tono apropiado para jóvenes, sin infantilizar. Conserva la exigencia de razonamiento y los datos necesarios: B1 lingüístico no significa acertijo fácil. Antes de emitir el mismo JSON, comprueba claridad, adecuación a este público y que no revelas la solución. No añadas una llamada separada. Las etiquetas B1/B2 en bloque/trimestre son datos académicos; no anulan este perfil explícito de inglés B1.`;
}

export function getDifficultyPolicy(context = {}) {
  const level = ["guiada", "equilibrada", "desafiante"].includes(context.dificultad) ? context.dificultad : "equilibrada";
  const primary = String(context.nivel || "").toLowerCase() === "primaria";
  return {
    version: DIFFICULTY_POLICY_VERSION,
    level,
    academic: {
      nivel: context.nivel || "Secundaria", grado: context.grado || "Primero",
      materia: context.materia || "", trimestre: context.trimestre || "",
      publico: context.publico || "", objetivo: context.sourceContract?.original_objective || context.objetivo || ""
    },
    demand: {
      guiada: "Aplicar una regla enseñada a un caso nuevo; explicar el procedimiento con un ejemplo distinto y ofrecer apoyo suficiente, sin entregar la respuesta.",
      equilibrada: "Interpretar datos y aplicar una regla para distinguir alternativas plausibles. El cierre combina dos conocimientos o condiciones indispensables.",
      desafiante: "Cada pregunta exige al menos dos operaciones conectadas y necesarias. El cierre exige tres operaciones e integra al menos dos conocimientos o condiciones del currículo. Resolver casos nuevos y diagnosticar errores plausibles; ningún dato aislado resuelve el caso."
    }[level],
    gradeCalibration: primary
      ? "Usar situaciones concretas, representaciones familiares y pasos breves adecuados al grado de primaria configurado; no introducir abstracciones de secundaria para aparentar dificultad."
      : "Exigir inferencias, comparación de evidencias y aplicación a situaciones nuevas propias del grado de secundaria configurado; no reducir la actividad a reconocer una letra visible o copiar una definición.",
    operations: level === "guiada" ? 1 : level === "desafiante" ? 3 : 2
  };
}

export function getQuestionDifficulty(context = {}, index = 0, count = 1) {
  const policy = getDifficultyPolicy(context);
  const closing = count >= 2 && index === count - 1;
  const role = closing && policy.level !== "guiada"
    ? "synthesis"
    : policy.level === "guiada" ? "transfer" : ["interpretation", "diagnosis", "transfer"][index % 3];
  return { difficulty: policy.level, pedagogical_role: role, difficulty_policy_version: policy.version };
}

export function buildDifficultyInstruction(context = {}) {
  const policy = getDifficultyPolicy(context);
  return [
    `<DIFFICULTY_POLICY>${JSON.stringify(policy)}</DIFFICULTY_POLICY>`,
    buildLanguageLearningInstruction(context),
    "TODAS las preguntas deben ser ACERTIJOS CURRICULARES: plantea un problema con pistas, evidencias o condiciones suficientes para deducir una solución única aplicando el aprendizaje del brief. Nunca una pregunta de memoria, copia literal ni una consigna que entregue la respuesta. El tipo de interacción sólo define cómo responde el jugador; también verdadero/falso, opción múltiple y completar lectura deben resolver un acertijo. Usa una situación natural, no acertijos arbitrarios ni trucos de lenguaje. Ajusta los apoyos y las operaciones al modo guiada/equilibrada/desafiante.",
    "SEPARACIÓN ENTRE PISTAS Y SOLUCIÓN: answer_target, respuesta_correcta, respuestas_aceptadas, parejas y orden correcto son privados. No los conviertas en instrucciones como 'escribe X', 'la solución es X' o 'to be submitted as X'. No anticipes soluciones en títulos, enunciados, pistas, feedback incorrecto ni prompts visuales. Mostrar candidatos mezclados en opciones o un banco de palabras es válido; señalar cuál elegir o dónde colocarlo no. El feedback correcto sí puede explicar la solución después del acierto. En anagramas comprueba que las letras dadas coincidan exactamente con las de la solución; no pidas una frase completa con letras que sólo forman parte de ella.",
    "La exigencia cognitiva se aplica a TODAS las materias y TODOS los idiomas según nivel, grado y brief. Matemáticas: resolver y comparar procedimientos; Ciencias: interpretar evidencias y diagnosticar explicaciones; Historia: contrastar fuentes, causas y consecuencias; Lenguas: inferir significados y relaciones. En otras materias adapta el caso a su objetivo curricular. No impongas anagramas, claves de letras o códigos cuando no aporten al aprendizaje.",
    "En Desafiante, antes de emitir el JSON verifica en la misma solicitud que cada pregunta requiere al menos dos operaciones conectadas (tres en el cierre), que cada una cambia la solución y que los datos permiten realizarlas. Reescribe internamente los casos que se resuelvan copiando una definición, por coincidencia literal o siguiendo una correspondencia ya resuelta. No añadas llamadas de revisión separadas ni muestres esta comprobación al jugador.",
    "Profundiza sin salir del brief: en arrastre y emparejamiento clasifica casos mediante dos condiciones, en completar lectura infiere las palabras por evidencias del contexto y no por repetición literal, en multimedia combina información necesaria del recurso con una regla, en opción múltiple diagnostica errores o compara decisiones, en secuencias aplica dependencias, en verdadero/falso contrasta una afirmación con varias evidencias y en respuesta exacta calcula o infiere un resultado verificable. No conviertas la dificultad en vocabulario rebuscado.",
    "La dificultad se demuestra en operaciones necesarias para resolver el caso, no en títulos, longitud, tecnicismos ni tiempo de lectura. Las etiquetas B1/B2 del campo bloque/trimestre no CEFR: son datos académicos, independientes del perfil lingüístico explícito. Ajusta conocimientos previos, cantidad de condiciones y abstracción al nivel y grado especificados.",
    "Declara reasoning_steps como una lista breve de operaciones concretas con los datos del caso y resultados intermedios esperados; no cuentes leer, copiar, pulsar ni comprobar como pasos de razonamiento. Declara distractor_errors como errores concretos plausibles del alumnado y cómo producen alternativas incorrectas; usa [] cuando la interacción no tenga distractores. Son especificaciones de autoría privadas, nunca textos para copiar al enunciado.",
    "Materializa reasoning_steps y distractor_errors en la pregunta, sin simplificar los pasos ni revelar los resultados intermedios. Para planes antiguos que no tengan estos campos, diseña el caso siguiendo esta política sin afirmar que el plan antiguo ya fue calibrado.",
    "En esta política, redacta case_data como oraciones naturales completas con la fuente, observación y valor concreto, listas para incluirse literalmente en el enunciado. No uses etiquetas internas como Case datum o Rule evaluation ni datos que ya contengan el resultado evaluado.",
    "Las respuestas siguen siendo cerradas y verificables, aunque sean cortas. Los distractores deben tener extensión y estructura comparables y corresponder a errores plausibles, nunca alternativas absurdas. Emparejamiento y arrastre discriminan por significado o aplicación, no por coincidencias de palabras o longitudes. Drag & Drop conserva 4 a 6 fichas.",
    "En Desafiante, cada condición cuenta sólo si actúa sobre un dato presente y cambia qué solución es válida; omitirla debe poder conducir a una alternativa incorrecta. No añadas reglas decorativas (por ejemplo, una regla sobre guiones cuando no hay palabras con guion) ni dividas una extracción de iniciales en varios pasos para aparentar complejidad. Antes de responder, elimina o materializa las condiciones que no intervengan.",
    "Cada distractor debe derivarse de una operación errónea reconocible: invertir la comparación, omitir una restricción, aplicar una fracción al total equivocado o confundir parte y resto. No justifiques un número arbitrario diciendo solamente 'error de cálculo', ni inventes una suma sin relación con el procedimiento para explicar el distractor. Verifica que el error declarado produzca realmente esa opción.",
    "No llames síntesis a extraer la P visible de Preserve Our Planet ni presentes un ejemplo resuelto Save Our Seas → SOS junto al verdadero/falso que ese mismo ejemplo decide. Si reconocer iniciales es el objetivo, usa casos y decisiones adecuados al grado sin inventar una síntesis. Una actividad integradora requiere combinar conocimientos o condiciones que cambien la solución.",
    "Usa títulos naturales relacionados con la escena o contenido; no uses Synthesis, Diagnosis ni etiquetas de rol como rótulos pedagógicos. Expresa consignas naturales, sin copiar etiquetas Case datum, Target phrase o Rule evaluation.",
    "Enseña principios y significados necesarios en el briefing con otros ejemplos y aporta las observaciones del caso en el enunciado. No ocultes información ni añadas requisitos externos para aumentar dificultad. El temporizador no autoriza sustituir razonamiento por copia: reduce prosa y datos accesorios, no las operaciones esenciales."
  ].join("\n");
}
