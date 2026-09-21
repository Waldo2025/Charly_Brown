import {
  isSingleWordAnswer,
  normalizeAcceptedAnswers,
  normalizeBaseText,
  normalizePairList,
  normalizeSequenceItems,
  normalizeTextList
} from "./escape-room-creator-model.mjs?v=20260912-jigsaw-v63";

function clean(value = "") {
  return String(value ?? "").trim();
}

function tokens(value = "") {
  const normalized = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ");
  return new Set(normalized.split(/\s+/).filter((token) => token.length > 3));
}

function similarity(first = "", second = "") {
  const a = tokens(first);
  const b = tokens(second);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach((token) => { if (b.has(token)) shared += 1; });
  return shared / Math.min(a.size, b.size);
}

function normalizeLetters(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}]/gu, "");
}

function letterBag(value = "") {
  return [...normalizeLetters(value)].sort().join("");
}

function distinctLetters(value = "") {
  return [...new Set(normalizeLetters(value))].sort().join("");
}

function extractSpelledLetterRuns(value = "") {
  const matches = String(value ?? "").match(/(?:\p{L}\s*[-–—]\s*){2,}\p{L}/gu) || [];
  return matches.map((raw) => ({ raw, letters: normalizeLetters(raw) }));
}

function requestsAnagram(value = "") {
  return /\b(?:anagram|scrambl(?:e|ed)|unscrambl(?:e|ed)|rearrang(?:e|ed)|jumbled?)\b/i.test(String(value ?? ""));
}

const BRIEFING_DEPENDENCY_PATTERN = /\b(?:according\s+to|as\s+(?:stated|described|explained|shown)\s+in)\s+(?:the\s+)?(?:briefing|brief|reading|investigation\s+board|context)|\bseg[uú]n\s+(?:el\s+)?(?:briefing|brief|expediente|lectura|contexto)|\bcomo\s+(?:se\s+)?(?:indica|explica|menciona|dice)\s+en\s+(?:el\s+)?(?:briefing|expediente|lectura|contexto)|\bd['’]apr[eè]s\s+(?:le\s+)?(?:briefing|texte|contexte)|\bde\s+acordo\s+com\s+(?:o\s+)?(?:briefing|texto|contexto)\b/iu;

function isSecondaryProject(project = {}) {
  return /^(?:secundaria|secondary|secondaire|secund[aá]rio)$/i.test(clean(project.nivel));
}

function questionSolutionValues(question = {}) {
  const type = clean(question.tipo_interaccion);
  if (["relacion_columnas", "drag_drop"].includes(type)) {
    return normalizePairList(question.parejas || [])
      .flatMap((pair) => [pair.izquierda, pair.derecha]);
  }
  if (type === "ordenar_secuencia") return normalizeSequenceItems(question.elementos || []);
  if (type === "verdadero_falso") return [question.reto, question.respuesta_correcta === true ? "true" : "false"];
  return [question.respuesta_correcta, ...normalizeAcceptedAnswers(question.respuestas_aceptadas || [])];
}

function solutionConceptText(question = {}) {
  return [...new Set(questionSolutionValues(question).map(clean).filter(Boolean))].join(" ");
}

function solutionValueSet(question = {}) {
  return new Set(questionSolutionValues(question)
    .map(normalizeBaseText)
    .filter((value) => value && !["true", "false", "verdadero", "falso"].includes(value)));
}

function questionsShareSolutionFamily(firstQuestion = {}, secondQuestion = {}) {
  const first = solutionValueSet(firstQuestion);
  const second = solutionValueSet(secondQuestion);
  if (!first.size || !second.size) return false;
  let shared = 0;
  first.forEach((value) => { if (second.has(value)) shared += 1; });
  const smallerSize = Math.min(first.size, second.size);
  return smallerSize === 1 ? shared === 1 : shared >= 2 && shared / smallerSize >= 0.66;
}

function coverageAnchorContent(anchor = "") {
  return clean(anchor).replace(/\b(?:evidencia|conocimiento|operaci[oó]n|familia\s+de\s+respuesta)\s*:/giu, " ");
}

function hasSubstantialTokenOverlap(first = "", second = "", threshold = 0.62) {
  const a = tokens(first);
  const b = tokens(second);
  if (!a.size || !b.size) return false;
  let shared = 0;
  a.forEach((token) => { if (b.has(token)) shared += 1; });
  return shared >= 2 && shared / Math.min(a.size, b.size) >= threshold;
}

function likelyIntendedAnagramTarget(run = "", candidates = []) {
  const source = normalizeLetters(run);
  if (source.length < 3) return "";
  const sourceDistinct = distinctLetters(source);
  return candidates
    .map(clean)
    .filter(Boolean)
    .find((candidate) => {
      const target = normalizeLetters(candidate);
      return target.length >= 3
        && Math.abs(target.length - source.length) <= 2
        && distinctLetters(target) === sourceDistinct;
    }) || "";
}

function scalarAnswer(question = {}) {
  if (question.tipo_interaccion === "verdadero_falso") return "";
  if (["relacion_columnas", "drag_drop", "ordenar_secuencia"].includes(question.tipo_interaccion)) return "";
  return normalizeBaseText(question.respuesta_correcta || normalizeAcceptedAnswers(question.respuestas_aceptadas || [])[0] || "");
}

function questionComparisonText(question = {}) {
  return [question.titulo, question.reto, question.respuesta_correcta]
    .map(clean)
    .filter(Boolean)
    .join(" ");
}

function questionCoverageText(question = {}) {
  return [
    questionComparisonText(question),
    question.pista,
    ...(question.opciones || []),
    ...(question.elementos || []),
    ...(question.parejas || []).flatMap((pair) => [pair?.izquierda, pair?.derecha])
  ].map(clean).filter(Boolean).join(" ");
}

export function assignBriefingCoverageAnchors(mission = {}) {
  const questions = Array.isArray(mission.preguntas) ? mission.preguntas : [];
  const contextEvidence = [mission.contexto, mission.historia]
    .map(clean)
    .filter(Boolean)
    .flatMap((value) => value.split(/(?<=[.!?])\s+/u))
    .map(clean)
    .filter((value) => value.length >= 20);
  const evidence = [...new Set([
    ...normalizeTextList(mission.datos_clave || []),
    ...contextEvidence
  ].map(clean).filter(Boolean))];
  const used = new Set();
  const usedEvidence = new Set();
  let inferred = 0;
  const issues = [];

  questions.forEach((question, questionIndex) => {
    const explicit = clean(question?._coverage_anchor);
    const explicitKey = normalizeBaseText(explicit);
    if (explicitKey && !used.has(explicitKey)) {
      used.add(explicitKey);
      return;
    }
    const comparison = questionCoverageText(question);
    const available = evidence
      .map((value, evidenceIndex) => ({
        value,
        evidenceIndex,
        score: similarity(comparison, value)
      }))
      .sort((first, second) => second.score - first.score || first.evidenceIndex - second.evidenceIndex);
    const selected = available.find((item) => (
      item.score > 0 && !usedEvidence.has(normalizeBaseText(item.value))
    )) || available.find((item) => item.score > 0) || available.find((item) => (
      !usedEvidence.has(normalizeBaseText(item.value))
    )) || available[0];
    if (!selected) {
      issues.push({
        code: "missing_coverage_anchor",
        message: "No hay un principio, regla o dato del briefing disponible para sustentar esta pregunta.",
        roomIndex: null,
        questionIndex,
        field: "_coverage_anchor"
      });
      return;
    }
    const knowledge = clean(question.titulo || question.reto || selected.value);
    const operation = clean(question.tipo_interaccion || "aplicación");
    const answerFamily = solutionConceptText(question) || clean(question.subtipo_respuesta || operation);
    const inferredAnchor = `evidencia: ${selected.value} | conocimiento: ${knowledge} | operación: ${operation} | familia de respuesta: ${answerFamily}`;
    const inferredKey = normalizeBaseText(inferredAnchor);
    question._coverage_anchor = inferredKey && !used.has(inferredKey)
      ? inferredAnchor
      : `${inferredAnchor} · ${questionIndex + 1}`;
    used.add(normalizeBaseText(question._coverage_anchor));
    usedEvidence.add(normalizeBaseText(selected.value));
    inferred += 1;
  });

  return { mission, inferred, issues };
}

function collectionFingerprint(question = {}) {
  if (question.tipo_interaccion === "opcion_multiple") {
    return normalizeTextList(question.opciones || []).map(normalizeBaseText).sort().join("|");
  }
  if (["relacion_columnas", "drag_drop"].includes(question.tipo_interaccion)) {
    return normalizePairList(question.parejas || [])
      .map((pair) => `${normalizeBaseText(pair.izquierda)}=${normalizeBaseText(pair.derecha)}`)
      .sort()
      .join("|");
  }
  if (question.tipo_interaccion === "ordenar_secuencia") {
    return normalizeSequenceItems(question.elementos || []).map(normalizeBaseText).sort().join("|");
  }
  return "";
}

function addIssue(issues, code, message, roomIndex = null, questionIndex = null, field = "") {
  issues.push({ code, message, roomIndex, questionIndex, field });
}

export function auditMissionChallengeIntro(mission = {}, roomIndex = null) {
  const issues = [];
  const challenge = clean(mission.reto);
  if (!challenge) {
    addIssue(issues, "missing_challenge_intro", "El Challenge necesita una introducción declarativa al conjunto de preguntas.", roomIndex, null, "reto");
    return issues;
  }
  const sentenceCount = challenge.split(/(?<=[.!])\s+/u).map(clean).filter(Boolean).length;
  if (sentenceCount < 2 || sentenceCount > 3) {
    addIssue(issues, "challenge_intro_length", "El Challenge debe ser una introducción declarativa de dos o tres frases.", roomIndex, null, "reto");
  }
  if (/[¿?]/u.test(challenge)) {
    addIssue(issues, "challenge_is_question", "El Challenge parece una pregunta adicional; debe introducir el bloque de preguntas sin formular otra actividad evaluable.", roomIndex, null, "reto");
  }
  const questions = Array.isArray(mission.preguntas) ? mission.preguntas : [];
  const duplicateQuestionIndex = questions
    .findIndex((question) => similarity(challenge, questionComparisonText(question)) >= 0.7);
  if (duplicateQuestionIndex >= 0) {
    addIssue(issues, "challenge_duplicates_question", `El Challenge duplica el contenido de la pregunta ${duplicateQuestionIndex + 1}.`, roomIndex, null, "reto");
  }
  return issues;
}

export function collectForbiddenAnswerTerms(project = {}, mission = null, question = null) {
  const questions = question
    ? [question]
    : mission
      ? (mission.preguntas || [])
      : (project.misiones || []).flatMap((item) => item.preguntas || []);
  const values = [project.clave_final];
  questions.forEach((item) => {
    if (item.tipo_interaccion === "verdadero_falso") return;
    values.push(item.respuesta_correcta, ...(item.respuestas_aceptadas || []));
    if (item.tipo_interaccion === "opcion_multiple") values.push(item.respuesta_correcta);
    if (["relacion_columnas", "drag_drop"].includes(item.tipo_interaccion)) {
      normalizePairList(item.parejas || []).forEach((pair) => values.push(pair.derecha));
    }
    if (item.tipo_interaccion === "ordenar_secuencia") values.push(...normalizeSequenceItems(item.elementos || []));
  });
  return [...new Set(values.map(clean).filter(Boolean))];
}

export function auditEscapeRoomText(project = {}) {
  const issues = [];
  const locale = clean(project.idioma || "es-419").toLowerCase();
  const topicText = clean(project.tema_curricular || project.tema || project.titulo);
  const instructions = clean(project.instrucciones);
  if (!instructions || instructions.length < 45) {
    addIssue(issues, "generic_instructions", "Las instrucciones son demasiado genéricas o breves.", null, null, "instrucciones");
  } else if (locale.startsWith("en") && topicText && similarity(instructions, topicText) === 0) {
    addIssue(issues, "unrelated_instructions", "Las instrucciones en inglés no se relacionan con el topic.", null, null, "instrucciones");
  }

  const previousQuestions = [];
  (project.misiones || []).forEach((mission, roomIndex) => {
    issues.push(...auditMissionChallengeIntro(mission, roomIndex));
    const briefing = [mission.historia, mission.contexto, ...(mission.datos_clave || [])].map(clean).join(" ");
    if (clean(mission.contexto).length < 120) {
      addIssue(issues, "briefing_too_short", "El briefing no contiene suficiente información para sustentar preguntas variadas.", roomIndex, null, "contexto");
    }
    const questions = Array.isArray(mission.preguntas) ? mission.preguntas : [];
    const seenAnswers = new Map();
    const seenCollections = new Map();
    questions.forEach((question, questionIndex) => {
      const answer = scalarAnswer(question);
      const comparison = questionComparisonText(question);
      if (BRIEFING_DEPENDENCY_PATTERN.test(clean(question.reto))) {
        addIssue(
          issues,
          "briefing_dependent_question",
          "El enunciado depende de recordar el briefing; debe incluir por sí mismo el contexto mínimo necesario sin revelar la respuesta.",
          roomIndex,
          questionIndex,
          "preguntas"
        );
      }
      if (isSecondaryProject(project) && requestsAnagram(`${question.reto || ""} ${question.pista || ""}`)) {
        const shortTarget = questionSolutionValues(question)
          .map(normalizeLetters)
          .find((value) => value.length >= 3 && value.length <= 7);
        if (shortTarget) {
          addIssue(
            issues,
            "short_secondary_anagram",
            "En secundaria, un anagrama corto no debe mostrar todas las letras como único reto; conviértelo en una deducción autosuficiente con contexto y pistas de posición.",
            roomIndex,
            questionIndex,
            "preguntas"
          );
        }
      }
      if (question.tipo_interaccion === "opcion_multiple") {
        const normalizedAnswer = normalizeBaseText(question.respuesta_correcta);
        const normalizedOptions = normalizeTextList(question.opciones || []).map(normalizeBaseText);
        if (!normalizedAnswer || !normalizedOptions.includes(normalizedAnswer)) {
          addIssue(
            issues,
            "multiple_choice_answer_missing",
            "La respuesta correcta debe coincidir exactamente con una de las opciones.",
            roomIndex,
            questionIndex,
            "respuesta_correcta"
          );
        }
      }
      if (requestsAnagram(`${question.reto || ""} ${question.pista || ""}`)) {
        const answerCandidates = [question.respuesta_correcta, ...(question.respuestas_aceptadas || [])];
        extractSpelledLetterRuns(question.reto).forEach((run) => {
          const target = likelyIntendedAnagramTarget(run.letters, answerCandidates);
          if (target) {
            if (letterBag(run.letters) !== letterBag(target)) {
              addIssue(
                issues,
                "anagram_letter_mismatch",
                `El anagrama '${run.raw}' no contiene exactamente las letras necesarias para formar '${target}'.`,
                roomIndex,
                questionIndex,
                "reto"
              );
            } else if (normalizeLetters(run.letters) === normalizeLetters(target)) {
              addIssue(
                issues,
                "anagram_not_scrambled",
                `La secuencia '${run.raw}' ya está en el mismo orden que '${target}' y no funciona como anagrama.`,
                roomIndex,
                questionIndex,
                "reto"
              );
            }
          }
        });
        if (["relacion_columnas", "drag_drop"].includes(question.tipo_interaccion)) {
          normalizePairList(question.parejas || []).forEach((pair) => {
            const runs = extractSpelledLetterRuns(pair.izquierda);
            if (!runs.length) return;
            const source = runs.map((run) => run.letters).join("");
            if (letterBag(source) !== letterBag(pair.derecha)) {
              addIssue(
                issues,
                "anagram_pair_mismatch",
                `La ficha '${pair.izquierda}' no contiene exactamente las letras de '${pair.derecha}'.`,
                roomIndex,
                questionIndex,
                "parejas"
              );
            } else if (normalizeLetters(source) === normalizeLetters(pair.derecha)) {
              addIssue(
                issues,
                "anagram_pair_not_scrambled",
                `La ficha '${pair.izquierda}' ya está en el mismo orden que '${pair.derecha}' y no funciona como anagrama.`,
                roomIndex,
                questionIndex,
                "parejas"
              );
            }
          });
        }
      }
      if (["texto", "multimedia", "completar_espacio"].includes(question.tipo_interaccion)
        && question.subtipo_respuesta === "palabra") {
        const rawAnswers = [question.respuesta_correcta, ...(question.respuestas_aceptadas || [])].map(clean).filter(Boolean);
        if (!rawAnswers.length || rawAnswers.some((value) => !isSingleWordAnswer(value))) {
          addIssue(issues, "invalid_word_answer", "Una respuesta de tipo palabra admite una o dos palabras formadas solo por letras; no debe contener números.", roomIndex, questionIndex, "respuesta_correcta");
        }
      }
      if (answer) {
        if (seenAnswers.has(answer)) {
          addIssue(issues, "repeated_answer", `La respuesta repite la de la pregunta ${seenAnswers.get(answer) + 1}.`, roomIndex, questionIndex, "respuesta_correcta");
        } else {
          seenAnswers.set(answer, questionIndex);
        }
      }
      const collection = collectionFingerprint(question);
      if (collection) {
        if (seenCollections.has(collection)) {
          addIssue(issues, "repeated_activity_content", `La actividad reutiliza el contenido de la pregunta ${seenCollections.get(collection) + 1}.`, roomIndex, questionIndex, "preguntas");
        } else {
          seenCollections.set(collection, questionIndex);
        }
      }
      for (let previousIndex = 0; previousIndex < questionIndex; previousIndex += 1) {
        if (similarity(comparison, questionComparisonText(questions[previousIndex])) >= 0.7) {
          addIssue(issues, "repeated_question", `La pregunta se parece demasiado a la pregunta ${previousIndex + 1}.`, roomIndex, questionIndex, "preguntas");
          break;
        }
      }
      const solutionText = solutionConceptText(question);
      const anchor = clean(question._coverage_anchor);
      const repeatedTarget = previousQuestions.find((previous) => (
        questionsShareSolutionFamily(question, previous.question)
        || (solutionText && hasSubstantialTokenOverlap(solutionText, previous.solutionText))
        || (anchor && previous.anchor && similarity(coverageAnchorContent(anchor), coverageAnchorContent(previous.anchor)) >= 0.72)
      ));
      if (repeatedTarget) {
        addIssue(
          issues,
          "repeated_learning_target",
          `La pregunta reutiliza el mismo conocimiento o familia de respuestas que la sala ${repeatedTarget.roomIndex + 1}, pregunta ${repeatedTarget.questionIndex + 1}; cambiar la mecánica no crea un reto diferente.`,
          roomIndex,
          questionIndex,
          "preguntas"
        );
      }
      if (briefing && clean(question.pista) && similarity(question.pista, `${briefing} ${question.reto}`) === 0) {
        addIssue(issues, "unrelated_hint", "La pista no utiliza ningún término concreto del briefing o la pregunta.", roomIndex, questionIndex, "pista");
      }
      previousQuestions.push({
        roomIndex,
        questionIndex,
        question,
        solutionText,
        anchor
      });
    });
  });
  return { approved: issues.length === 0, issues };
}

export function formatContentAuditIssues(issues = []) {
  return issues.map((issue) => {
    const location = issue.roomIndex == null
      ? "General"
      : `Sala ${issue.roomIndex + 1}${issue.questionIndex == null ? "" : ` · Pregunta ${issue.questionIndex + 1}`}`;
    return `${location} · ${issue.field || "contenido"}: ${issue.message}`;
  });
}

export function mergeFoundationWithQuestions(foundation = {}, generated = {}) {
  const generatedMissions = Array.isArray(generated.misiones) ? generated.misiones : [];
  return {
    ...generated,
    ...foundation,
    instrucciones: clean(foundation.instrucciones || generated.instrucciones),
    misiones: (foundation.misiones || []).map((mission, index) => {
      const generatedMission = generatedMissions.find((item) => item.id && item.id === mission.id) || generatedMissions[index] || {};
      return { ...generatedMission, ...mission, preguntas: generatedMission.preguntas || [] };
    })
  };
}
