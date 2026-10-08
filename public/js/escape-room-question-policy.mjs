import { experience } from "./escape-room-experience.mjs?v=20260924-coordinate-grid-v12";
import { experienceAuthoringInstruction } from "./escape-room-experience-authoring.mjs?v=20260924-coordinate-grid-v13";
// Generation policy only: existing projects and manually edited questions keep their data.
export const CLOSED_ANSWER_SUBTYPES = ["palabra", "frase_corta", "letra", "numero", "codigo_corto"];
export const DRAG_DROP_AUTHORING_TEMPLATE = `PLANTILLA DRAG & DROP (aplica sólo a drag_drop):
1. Diseña primero, en privado, exactamente 6 correspondencias inequívocas bajo un mismo criterio curricular. izquierda = destino; derecha = ficha. Cada destino y ficha debe ser distinto; no inventes compartimentos arbitrarios cuya relación sólo conozca el autor.
2. Contexto público: presenta observaciones y datos de un caso que aplica principios del brief enseñados en el briefing. No inventes nuevas reglas o asociaciones. No nombres juntos un elemento y su destino correcto ni copies answer_target. Si una relación requiere conocimientos no enseñados o sólo puede resolverse dando la pareja, rediseña el caso dentro del contenido disponible antes de responder.
3. reto = contexto + UNA pregunta de aplicación en el idioma del juego. Modelo de forma, no de contenido: “El registro describe las propiedades de los materiales y los requisitos de los contenedores. ¿Qué contenedor corresponde a cada material según esas propiedades?”. Sustituye esa referencia genérica por los datos concretos necesarios. No repitas instrucciones de interfaz: PigPen ya explica cómo arrastrar.
4. Planificación: application, case_data e instruction_outline contienen únicamente contexto y tarea sin resolver. answer_target conserva las relaciones privadas. Generación: titulo y reto no contienen la clave; parejas contiene las soluciones. No conviertas la lista privada en prosa pública.
5. pista y feedback incorrecto orientan al criterio, no a una pareja. Sólo el feedback correcto puede explicar correspondencias tras el acierto. Antes de emitir el mismo JSON, comprueba internamente que cada pareja sea deducible, que ninguna esté revelada y que el reto formule una pregunta; no emitas esta comprobación ni solicites otra llamada.`;
export const QUESTION_DIVERSITY_INSTRUCTION = "Sólo actividades de respuesta cerrada y comprobable: nunca opinión, reflexión libre ni cualquier texto no vacío. Define una solución exacta y sus variantes válidas. Cada pregunta evalúa un concepto específico, caso y solución distintos; cambiar interfaz, personajes o redacción no crea una actividad distinta. Puedes compartir vocabulario temático, pero no volver a evaluar el mismo concepto, caso, resultado o conjunto de relaciones. Verdadero/falso puede compartir el booleano, nunca la afirmación evaluada. Si necesitas una explicación, plantea opciones cerradas con una solución inequívoca.";

export const QUESTION_BRIEF_GROUNDING = `BASE CURRICULAR OBLIGATORIA: brief original → curriculum_inventory → conocimiento enseñado en contexto/datos_clave → caso de aplicación → solución privada. La narrativa no autoriza nuevos conocimientos evaluables. Puedes inventar observaciones, cantidades o situaciones de transferencia, pero no reglas, significados ni asociaciones arbitrarias. En generación de sala, enseña primero los principios del inventario en el briefing con ejemplos diferentes; después plantea preguntas que los apliquen. En regeneración, el briefing existente está bloqueado: utiliza sólo los principios que ya enseña. El enunciado puede recordar una regla enseñada y debe aportar los datos concretos del caso, no introducir otro objetivo curricular para justificar una solución. Mantén knowledge/evidence como trazabilidad privada y answer_target como clave privada; nunca copies la solución en application, instruction_outline, reto o pista. Comprueba esta cadena dentro de la misma respuesta, sin llamadas adicionales.`;

export const QUESTION_AUTHORING_TEMPLATES = Object.freeze({
  texto: 'Respuesta exacta: reto = contexto mínimo + pregunta concreta con una única respuesta verificable. respuesta_correcta = palabra, frase corta, letra, número o código; respuestas_aceptadas = variantes equivalentes, nunca otras soluciones. No solicites opiniones ni elegir opciones. Mantén frase_corta cuando corresponda.',
  opcion_multiple: 'Opción múltiple: reto = datos del caso + pregunta de aplicación. opciones = cuatro alternativas distintas, homogéneas y plausibles; respuesta_correcta coincide literalmente con una única opción. Cada distractor representa un error curricular concreto. No señales la solución por longitud, estilo o pistas del enunciado.',
  relacion_columnas: 'Relación de columnas: reto = contexto + pregunta que explicita un único criterio curricular de correspondencia. parejas contiene las relaciones privadas; ambas columnas tienen elementos distintos y cada relación es inequívoca a partir del briefing y los datos. opciones contiene exactamente 2 distractores plausibles para la columna derecha: pertenecen a la misma categoría y representan errores curriculares creíbles, pero no corresponden a ninguna fila. No dupliques soluciones ni uses distractores absurdos, genéricos o distinguibles por formato. No listes parejas resueltas en textos públicos ni mezcles criterios.',
  drag_drop: DRAG_DROP_AUTHORING_TEMPLATE,
  verdadero_falso: 'Verdadero/Falso: reto = contexto necesario + una afirmación completa y comprobable; no hace falta convertirla en pregunta interrogativa. respuesta_correcta = booleano. Evita dobles negaciones, opiniones y afirmaciones parcialmente verdaderas. pista y feedback incorrecto no anticipan el booleano ni la afirmación corregida.',
  ordenar_secuencia: 'Ordenar secuencia: reto = situación + criterio temporal, causal o procedimental enseñado + solicitud de ordenar. elementos contiene en privado el único orden correcto; el juego los mezcla. El reto no enumera, parafrasea ni describe los elementos en su orden correcto: no uses Log Entry A/B/C, Step 1/2/3, primero/después/finalmente ni una oración consecutiva por cada paso. Si el contexto necesita mencionar los sucesos, preséntalos deliberadamente desordenados o aporta sólo evidencias y la regla para deducirlos; la interfaz ya mostrará las fichas mezcladas. No publiques el orden resuelto ni números que lo revelen. Si varias secuencias son válidas, redefine el caso antes de emitirlo; respeta el mechanic_contract cuando exista.',
  completar_espacio: 'Completar lectura con fichas arrastrables: texto_con_hueco contiene una frase o lectura completa con uno o varios marcadores literales ___, uno por hueco. Usa siempre exactamente ___; no los numeres ni escribas variantes como ___1___, ___2___ o [___1___]. reto es contexto adicional opcional, nunca repite la lectura ni pide escribir. parejas es la clave privada ordenada: {izquierda:"1", derecha:"respuesta breve del primer hueco", pista:""}, etc., una ficha por hueco numerada consecutivamente desde 1. derecha puede ser una palabra o una expresión curricular breve como "MILKY WAY". PigPen muestra destinos vacíos dentro de la lectura y mezcla las fichas debajo. Se permiten respuestas repetidas cuando la lectura lo requiere. opciones contiene sólo distractores adicionales, distintos entre sí y de las soluciones: incluye al menos uno si hay un único hueco; en lecturas con varios huecos son opcionales. Cada hueco tiene una solución gramatical y curricular inequívoca. No reveles soluciones en lectura ni pistas. respuesta_correcta="", respuestas_aceptadas=[], elementos=[]. No es respuesta escrita ni columnas.',
  multimedia: 'Multimedia · Opción múltiple: recurso visual, audio o video imprescindible + reto con contexto y pregunta sobre evidencia del recurso + cuatro opciones distintas. respuesta_correcta coincide literalmente con una opción. El alumno selecciona, no escribe. El recurso no muestra la solución explícita; prompt y alt describen el recurso pero no sustituyen su disponibilidad final. No inventes URLs.'
});

export function buildQuestionAuthoringTemplate(type = 'texto') {
  return experienceAuthoringInstruction(type) || QUESTION_AUTHORING_TEMPLATES[type] || QUESTION_AUTHORING_TEMPLATES.texto;
}

export function normalizeFillBlankMarkers(value = '') {
  return String(value ?? '')
    .replace(/_{3,}\s*(?:\[\s*)?\d+(?:\s*\])?\s*_{3,}/gu, '___')
    .replace(/\[\s*___\s*\]/gu, '___')
    .replace(/_{3,}/gu, '___');
}

const key = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const genericAnswer = (value) => /^(true|false|verdadero|falso|vrai|faux|verdadeiro|yes|no|si|oui|non|sim|a|b|c|d|1|0)$/.test(value);
const relationshipKey = (value) => String(value ?? "").split(/[;|\n]+/).map(key).filter(Boolean).sort().join("|");

export function findRepeatedQuestionPlans(plans = [], previous = []) {
  const seen = previous.map((plan) => ({ plan, index: -1 }));
  const issues = [];
  plans.forEach((plan, index) => {
    const collisions = seen.map(({ plan: other }) => {
      const fields = [];
      const sameKnowledge = !!key(plan.knowledge) && key(plan.knowledge) === key(other.knowledge);
      const dataKey = value => Array.isArray(value) ? value.map(key).filter(Boolean).sort().join('|') : '';
      const caseA = dataKey(plan.case_data), caseB = dataKey(other.case_data);
      const reasoningA = dataKey(plan.reasoning_steps), reasoningB = dataKey(other.reasoning_steps);
      const sameCase = !!caseA && caseA === caseB;
      const sameReasoning = !!reasoningA && reasoningA === reasoningB;
      // A curriculum principle is reusable. Accept its transfer only when both
      // plans supply different concrete evidence and different reasoning.
      const distinctAssessment = !!caseA && !!caseB && !sameCase
        && !!reasoningA && !!reasoningB && !sameReasoning
        && !!key(plan.application) && !!key(other.application)
        && key(plan.application) !== key(other.application)
        && !!key(plan.answer_target) && !!key(other.answer_target);
      if (sameKnowledge && !distinctAssessment) fields.push("knowledge");
      if (key(plan.application) && key(plan.application) === key(other.application)) fields.push("application");
      if (sameCase) fields.push("case_data");
      if (sameKnowledge && sameReasoning) fields.push("reasoning_steps");
      if (key(plan.answer_target) && !genericAnswer(key(plan.answer_target))
        && relationshipKey(plan.answer_target) === relationshipKey(other.answer_target)) fields.push("answer_target");
      return { other, fields };
    }).filter(({ fields }) => fields.length);
    if (collisions.length) {
      const labels = { knowledge: "concepto evaluado", application: "caso", answer_target: "solución", case_data: "datos del caso", reasoning_steps: "razonamiento" };
      const conflicts = collisions.map(({ other, fields }) => ({
        previousPlanId: other.plan_id,
        fields,
        values: Object.fromEntries(fields.map((field) => [field, plan[field]]))
      }));
      issues.push({
        index, previousPlanId: conflicts[0].previousPlanId, conflicts,
        message: conflicts.map(({ previousPlanId, fields, values }) =>
          `Repite ${fields.map((field) => `${labels[field]} «${String(values[field]).slice(0, 180)}»`).join(", ")} de ${previousPlanId}`).join(" · ")
      });
    }
    seen.push({ plan, index });
  });
  return issues;
}

export function closeGeneratedAnswer(question = {}, interaction = "texto", requireAnswer = false) {
  if (experience.get(interaction)) return { ...question, interaction_contract_version: 1, subtipo_respuesta: "frase_corta", respuesta_correcta: "", respuestas_aceptadas: [], opciones: [], parejas: [], elementos: [], texto_con_hueco: "" };
  const result = { ...question, interaction_contract_version: ['relacion_columnas', 'completar_espacio'].includes(interaction) ? 2 : 1 };
  // Shared by full generation and individual regeneration; inactive fields
  // cannot leak an answer or leave a second, contradictory interaction behind.
  if (!["opcion_multiple", "multimedia", "relacion_columnas", "completar_espacio"].includes(interaction)) result.opciones = [];
  if (!["relacion_columnas", "drag_drop", "completar_espacio"].includes(interaction)) result.parejas = [];
  if (interaction !== "ordenar_secuencia") result.elementos = [];
  if (interaction !== "completar_espacio") result.texto_con_hueco = "";
  if (["relacion_columnas", "drag_drop", "ordenar_secuencia"].includes(interaction)) {
    result.respuesta_correcta = "";
    result.respuestas_aceptadas = [];
  }
  if (interaction === 'completar_espacio') {
    result.respuesta_correcta = '';
    result.respuestas_aceptadas = [];
    return result;
  }
  if (interaction === "multimedia") result.subtipo_respuesta = "frase_corta";
  if (!CLOSED_ANSWER_SUBTYPES.includes(result.subtipo_respuesta)) result.subtipo_respuesta = "frase_corta";
  if (["texto", "opcion_multiple", "multimedia", "completar_espacio"].includes(interaction)) {
    const answer = String(result.respuesta_correcta ?? "").trim();
    if (!answer && requireAnswer) throw new Error("La pregunta necesita una respuesta cerrada concreta; no se admite respuesta libre.");
    result.respuestas_aceptadas = [...new Set([answer, ...(Array.isArray(result.respuestas_aceptadas) ? result.respuestas_aceptadas : [])].filter(Boolean))];
  }
  return result;
}

export function matchingPromptIssues(question = {}) {
  if (!['drag_drop', 'relacion_columnas'].includes(question.tipo_interaccion)) return [];
  const pairs = Array.isArray(question.parejas) ? question.parejas : [];
  const fields = ['titulo', 'reto', 'pista', 'retroalimentacion_incorrecta', 'imagen_prompt', 'imagen_alt'];
  return fields.flatMap(field => {
    // Inspect individual clauses, not an entire inventory: listing both banks is not a solution.
    const clauses = String(question[field] || '').split(/[.;!?\n]+|,(?=\s*(?:and\s+|y\s+)?[\p{L}])/u);
    const leaked = pairs.some(pair => {
      const left = key(pair?.izquierda), right = key(pair?.derecha);
      if (!left || !right) return false;
      const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      const destination = escaped(left), tile = escaped(right);
      const direct = new RegExp(
        `(?:${tile})\\s+(?:goes|belongs|matches|corresponds|is|va|pertenece|corresponde|es)\\s+(?:into|onto|to|in|en|al|con)?\\s*(?:${destination})|`
        + `(?:place|put|drag|coloca|arrastra|ubica)\\s+(?:${tile})\\s+(?:into|onto|to|in|en|al)\\s+(?:(?:the|a|an|el|la|los|las)\\s+)?(?:${destination})|`
        + `(?:${tile})\\s+(?:into|onto|to|in|en|al)\\s+(?:(?:the|a|an|el|la|los|las)\\s+)?(?:${destination})|`
        + `(?:${tile})\\s*(?:→|=|=>)\\s*(?:${destination})|(?:${destination})\\s*(?:→|=|=>)\\s*(?:${tile})`, "iu"
      );
      return clauses.some(clause => direct.test(key(clause)) || direct.test(String(clause)));
    });
    return leaked ? [`${field} revela una pareja correcta. Reescribe ese campo como contexto y pregunta de aplicación, sin indicar qué ficha corresponde a qué destino. Conserva las soluciones únicamente en parejas y aporta las propiedades necesarias para deducirlas.`] : [];
  });
}

export function answerDisclosureIssues(question = {}) {
  const type = question.tipo_interaccion;
  const answers = [question.respuesta_correcta, ...(question.respuestas_aceptadas || []),
    ...(question.parejas || []).map(pair => pair.derecha),
    ...(type === 'ordenar_secuencia' ? [(question.elementos || []).join(' ')] : [])]
    .filter(value => ['string','number','boolean'].includes(typeof value)).map(key).filter(Boolean);
  const issues = [];
  // Do not reject candidate lists or factual premises merely containing a value.
  // Detect explicit directions giving the answer across all interaction types.
  {
    for (const field of ['titulo','reto','pista','retroalimentacion_incorrecta','imagen_prompt','imagen_alt']) {
      const text = key(question[field]);
      const leaked = answers.some(answer => {
        if (field === 'titulo' && answer.length > 3 && text === answer) return true;
        const haystack = ' ' + text + ' ', needle = ' ' + answer + ' ';
        for (let position = haystack.indexOf(needle); position >= 0; position = haystack.indexOf(needle, position + 1)) {
          const before = text.slice(0, position).slice(-100);
          if (/(?:answer is|solution is|correct answer|correct option is|correct order is|to be submitted as|(?:blank|hueco) \d+ (?:is|es)|enter|write|type|submit|respuesta es|soluci[oó]n es|respuesta correcta|orden correcto es|opci[oó]n correcta es|escribe|introduce|ingresa)\s+(?:(?:the|la|el|full|complete|target|designation|word|name|code|palabra|nombre|c[oó]digo)\s+)*$/u.test(before + ' ')) return true;
        }
        return false;
      });
      if (leaked) issues.push(`${field}: revela explícitamente la respuesta; aporta pistas y una pregunta sin indicar la solución.`);
    }
  }
  if (type === 'texto' && /unscrambl|scrambl|anagram|rearrang|anagrama|reordena.*letras/i.test(question.reto || '')) {
    const letters = String(question.reto || '').match(/\b([A-Za-z](?:[-–]\s*[A-Za-z]){3,})\b/);
    const answer = key(question.respuesta_correcta).replace(/ /g,'');
    if (letters && answer && [...letters[1].toLowerCase().replace(/[^a-z]/g,'')].sort().join('') !== [...answer].sort().join('')) {
      issues.push('El anagrama no contiene exactamente las letras de la solución solicitada.');
    }
  }
  return issues;
}

// Narrow local repair: only a terminal entry instruction that supplies the
// literal answer. Keep the factual case, candidate lists and private key intact.
export function repairAnswerEntryInstruction(text, answers = []) {
  let result = String(text || '');
  for (const answer of answers) {
    if (typeof answer !== 'string' || !answer.trim()) continue;
    const literal = answer.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const pattern = new RegExp(
      `(^|[.!?\\n]\\s*)(enter|write|type|submit|escribe|introduce|ingresa)\\s+`
      + `(?:(?:the|la|el|full|complete|target|designation|word|name|code|palabra|nombre|código|codigo|completa|completo)\\s+)*`
      + `["'“‘]?${literal}["'”’]?(?=\\s*(?:[.!?]|$))`, 'gimu');
    result = result.replace(pattern, (_match, boundary, verb) => {
      const spanish = /^(escribe|introduce|ingresa)$/i.test(verb);
      return boundary + verb + (spanish ? ' la respuesta que dedujiste' : ' the answer you deduced');
    });
  }
  return result;
}

export function coordinateRiddleIssues(question = {}) {
  if (question.tipo_interaccion !== 'respuesta_coordenadas') return [];
  const data = question.interaction_data || {};
  const text = [question.titulo, question.reto, data.instructions].filter(Boolean).join(' ');
  if (!/\b(?:desplaz|muev|avanz|recorr|trayector|ruta|movimiento|move|shift|advance|route|path)\w*/iu.test(text)) return [];

  const issues = [];
  const start = data.options?.find(option => option.id === data.start_option);
  if (!start) issues.push('Coordenadas: marca una casilla inicial y di desde dónde comienza el recorrido.');
  else {
    const pair = new RegExp(`(?:\\(\\s*${start.x}\\s*[,;]\\s*${start.y}\\s*\\)|x\\s*=\\s*${start.x}\\s*[,;]\\s*y\\s*=\\s*${start.y})`, 'iu');
    if (!pair.test(text)) issues.push('Coordenadas: indica las coordenadas iniciales en el orden (x, y).');
  }

  const amount = '(?:\\d+|un|una|uno|dos|tres|cuatro|cinco|one|a|an|two|three|four|five)';
  const unit = '(?:columnas?|filas?|casillas?|pasos?|unidades?)';
  const direction = (directions) => new RegExp(
    `(?:\\b${amount}\\s+${unit}\\s+(?:(?:hacia|a)\\s+)?(?:la\\s+)?(?:${directions})\\b|\\b(?:${directions})\\b[^.!?]{0,28}\\b${amount}\\s+${unit}\\b)`,
    'iu'
  );
  const horizontal = direction('derecha|izquierda|right|left');
  const vertical = direction('arriba|abajo|up|down');
  const horizontalUnchanged = /\b(?:x|eje\s+horizontal)\b[^.!?]{0,24}\b(?:no\s+cambia|se\s+mantiene|permanece\s+igual|sin\s+cambio)\b/iu.test(text);
  const verticalUnchanged = /\b(?:y|eje\s+vertical)\b[^.!?]{0,24}\b(?:no\s+cambia|se\s+mantiene|permanece\s+igual|sin\s+cambio)\b/iu.test(text);
  if (!horizontal.test(text) && !horizontalUnchanged) issues.push('Coordenadas: especifica cuántas columnas se mueve x y hacia qué dirección, o indica que x no cambia.');
  if (!vertical.test(text) && !verticalUnchanged) issues.push('Coordenadas: especifica cuántas filas se mueve y y hacia qué dirección, o indica que y no cambia.');
  return issues;
}

export function questionInteractionIssues(question, { requireMedia = false, generated = false } = {}) {
  if (experience.get(question.tipo_interaccion)) {
    const issues = (generated ? experience.authoringIssues : experience.structuralIssues)(question.tipo_interaccion, question.interaction_data);
    if (generated && question.tipo_interaccion === 'respuesta_coordenadas') issues.push(...coordinateRiddleIssues(question));
    return [...new Set(issues)];
  }
  const issues = generated ? [...matchingPromptIssues(question), ...answerDisclosureIssues(question)] : [];
  if (question.tipo_interaccion === 'relacion_columnas' && (generated || question.interaction_contract_version === 2)) {
    const answers = new Set((question.parejas || []).map(pair => key(pair?.derecha)).filter(Boolean));
    const distractors = (question.opciones || []).map(key);
    if (distractors.length !== 2 || distractors.some(value => !value)
      || new Set(distractors).size !== distractors.length
      || distractors.some(value => answers.has(value))) {
      issues.push('Relación de columnas necesita exactamente 2 distractores distintos, plausibles y diferentes de todas las respuestas correctas.');
    }
  }
  if (generated && question.tipo_interaccion === 'drag_drop') {
    const pairs = Array.isArray(question.parejas) ? question.parejas : [];
    const left = pairs.map(pair => key(pair?.izquierda));
    const right = pairs.map(pair => key(pair?.derecha));
    if (pairs.length !== 6 || left.some(value => !value) || right.some(value => !value)
      || new Set(left).size !== 6 || new Set(right).size !== 6) {
      issues.push('Drag & Drop necesita exactamente 6 correspondencias completas y distintas.');
    }
  }
  if (question.tipo_interaccion === 'completar_espacio' && (question.interaction_contract_version === 2 || generated)) {
    const count = (normalizeFillBlankMarkers(question.texto_con_hueco).match(/___/g) || []).length;
    const pairs = Array.isArray(question.parejas) ? question.parejas : [];
    if (!count || pairs.length !== count) issues.push('Completar lectura necesita uno o varios marcadores ___ y exactamente una ficha de respuesta en parejas por hueco.');
    if (pairs.some((pair, index) => String(pair.izquierda).trim() !== String(index + 1) || !String(pair.derecha || '').trim())) issues.push('Numera parejas.izquierda desde 1 en orden de los huecos; derecha contiene la palabra o expresión breve de cada hueco.');
    const distractors = (question.opciones || []).map(key);
    if (distractors.some(word => !word || pairs.some(pair => key(pair.derecha) === word)) || new Set(distractors).size !== distractors.length) issues.push('Las palabras distractoras deben ser distintas entre sí y no duplicar las soluciones.');
    if (generated && count === 1 && !distractors.length) issues.push('Con un único hueco, añade al menos una palabra distractora en opciones para ofrecer varias fichas.');
    if (/\b(?:escribe|escribir|write|type|typing)\b/i.test(question.reto || '')) issues.push('Completar lectura se resuelve arrastrando palabras, no escribiendo.');
    return issues;
  }
  if (question.interaction_contract_version !== 1) return issues;
  const type = question.tipo_interaccion;
  if (question.subtipo_respuesta === "frase_libre") issues.push("Define una respuesta exacta; no se admite frase libre.");
  if (type === "multimedia") {
    const options = (question.opciones || []).map(value => String(value).trim());
    if (options.length !== 4 || options.some(value => !value) || new Set(options.map(key)).size !== 4
      || options.filter(value => value === question.respuesta_correcta).length !== 1) issues.push("Multimedia requiere cuatro opciones distintas y la solución literal en una única opción.");
    if (requireMedia && !question.media?.url && !question.imagen) issues.push("Multimedia necesita un recurso disponible; el prompt y el texto alternativo no lo sustituyen.");
  }
  if (type === "completar_espacio") {
    if ((String(question.texto_con_hueco || "").match(/___/g) || []).length !== 1) issues.push("Completar espacio necesita exactamente un marcador ___.");
    if (!String(question.respuesta_correcta || "").trim()) issues.push("El hueco necesita una solución exacta.");
  }
  if (["texto", "completar_espacio"].includes(type)
    && /(?:elige|selecciona|choose|select)\s+(?:una?\s+|the\s+)?(?:opci[oó]n|option)|(?:^|\n)\s*[A-D][).]/im.test(question.reto || "")) issues.push("Esta pregunta requiere escribir; elimina las instrucciones de opción múltiple.");
  return issues;
}
