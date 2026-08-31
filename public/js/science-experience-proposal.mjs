const GENERIC_EXPERIENCE_WORDS = new Set([
  "actividad", "alumno", "alumnos", "aprender", "aprendizaje", "comprender", "concepto",
  "decision", "decisiones", "docente", "educativa", "educativo", "equipo", "escuela",
  "estudiante", "estudiantes", "evidencia", "experiencia", "juego", "mision", "objetivo",
  "propuesta", "resultado", "resultados", "reto", "secundaria", "situacion", "tema",
  "utiliza", "utilizar", "variable", "variables", "videojuego"
]);

const SPANISH_STOP_WORDS = new Set([
  "algo", "ante", "bajo", "cada", "como", "con", "contra", "cual", "cuando", "desde",
  "donde", "durante", "entre", "esta", "este", "estos", "estas", "hacia", "hasta", "para",
  "pero", "porque", "puede", "pueden", "segun", "sobre", "solo", "tiene", "tienen", "todo",
  "tras", "usar", "usando"
]);

const BIOLOGY_CONCEPT_TERMS = [
  "adn", "arn", "asfixia", "atp", "biotecnologia", "cloroplasto", "cultivo", "cromosoma",
  "energia", "fermentacion", "fotosintesis", "gasto energetico", "glucosa", "metabolismo",
  "mitocondria", "nutrientes", "oxigeno", "respiracion celular", "ribosoma", "supervivencia"
];

function normalizedWords(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function anchorKey(token) {
  if (/^\d+$/.test(token) || token.length <= 4) return token;
  return token.slice(0, 5);
}

export function parseExpectedLearningStatements(source, limit = 16) {
  const normalized = String(source || "").replace(/\r/g, "\n").trim();
  if (!normalized) return [];
  const lines = normalized
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])/u)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 12);
  return [...new Set(lines)].slice(0, Math.max(1, limit));
}

export function experienceLearningCoverage(expectedLearnings, candidate) {
  const statements = parseExpectedLearningStatements(expectedLearnings);
  if (!statements.length) return { valid: true, coverage: 1, matched: [], missing: [] };
  const candidateKeys = new Set(extractExperienceAnchors(candidate, 220).map(({ key }) => key));
  const scored = statements.map((statement, index) => {
    const anchors = extractExperienceAnchors(statement, 24);
    const matches = anchors.filter(({ key }) => candidateKeys.has(key));
    const required = Math.max(1, Math.ceil(Math.min(anchors.length, 6) * .34));
    return { index: index + 1, statement, matched: matches.length >= required };
  });
  const matched = scored.filter((item) => item.matched);
  const missing = scored.filter((item) => !item.matched);
  const coverage = matched.length / statements.length;
  return { valid: coverage >= .8, coverage, matched, missing };
}

export function experienceDesignQuality({ candidate = "", situation = "", mission = "", stages = [], finalProduct = "", finalDecision = "", expectedLearningCount = 0 } = {}) {
  const issues = [];
  const normalizedCandidate = String(candidate).replace(/\s+/g, " ").trim();
  if (String(situation).trim().length < 70) issues.push("situación poco específica");
  if (String(mission).trim().length < 35) issues.push("misión insuficiente");
  if (!Array.isArray(stages) || stages.length < 2) issues.push("faltan etapas");
  if ((stages || []).some((stage) => String(stage?.studentAction || "").trim().length < 28 || String(stage?.evidence || "").trim().length < 20)) {
    issues.push("acciones o evidencias incompletas");
  }
  if (String(finalProduct).trim().length < 20) issues.push("falta producto final");
  if (String(finalDecision).trim().length < 20) issues.push("falta decisión final");
  if (/\b(?:slider|control deslizante|panel de control|interfaz|ajusta(?:r)? el valor de x|modifica(?:r)? el coeficiente|cambia(?:r)? la constante)\b/i.test(normalizedCandidate)) {
    issues.push("controles técnicos dentro de la narrativa");
  }
  if (/\b(?:comprender el tema|aprender de forma divertida|situación de la vida real|realizar un experimento)\b/i.test(normalizedCandidate)) {
    issues.push("redacción genérica");
  }
  const maximumLength = Math.min(4800, 2400 + Math.max(0, Number(expectedLearningCount || 0) - 5) * 400);
  if (normalizedCandidate.length < 280 || normalizedCandidate.length > maximumLength) issues.push("extensión inadecuada");
  const blockingIssues = issues.filter((issue) => [
    "faltan etapas",
    "controles técnicos dentro de la narrativa",
    "redacción genérica"
  ].includes(issue));
  return { valid: issues.length === 0, usable: blockingIssues.length === 0, issues, blockingIssues, maximumLength };
}

export function repairExperienceProposalLanguage(value = "") {
  return String(value)
    .replace(/\bcomprender el tema\b/gi, "resolver el problema planteado")
    .replace(/\baprender de forma divertida\b/gi, "comprobar los resultados mediante evidencia")
    .replace(/\bsituaci[oó]n de la vida real\b/gi, "situación cotidiana descrita")
    .replace(/\brealizar un experimento\b/gi, "registrar y comparar evidencia")
    .replace(/\bpanel de control\b/gi, "registro de datos")
    .replace(/\b(?:la|una) interfaz\b/gi, "los recursos disponibles")
    .replace(/\bsliders?\b/gi, "ajustes")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractExperienceAnchors(source, limit = 60) {
  const anchors = [];
  const seen = new Set();
  normalizedWords(source).forEach((token) => {
    if (token.length < 4 || SPANISH_STOP_WORDS.has(token) || GENERIC_EXPERIENCE_WORDS.has(token)) return;
    const key = anchorKey(token);
    if (seen.has(key)) return;
    seen.add(key);
    anchors.push({ token, key });
  });
  return anchors.slice(0, Math.max(1, limit));
}

export function experienceSourcePreservation(source, candidate) {
  const anchors = extractExperienceAnchors(source);
  if (!String(source || "").trim()) {
    return { valid: true, coverage: 1, anchors: [], matched: [], missing: [] };
  }
  if (!anchors.length) {
    const sourceWords = normalizedWords(source);
    const candidateWords = new Set(normalizedWords(candidate));
    const matchedWords = sourceWords.filter((word) => candidateWords.has(word));
    const coverage = sourceWords.length ? matchedWords.length / sourceWords.length : 0;
    return { valid: coverage >= .5, coverage, anchors: sourceWords, matched: matchedWords, missing: sourceWords.filter((word) => !candidateWords.has(word)) };
  }
  const candidateKeys = new Set(normalizedWords(candidate).map(anchorKey));
  const matched = anchors.filter(({ key }) => candidateKeys.has(key)).map(({ token }) => token);
  const missing = anchors.filter(({ key }) => !candidateKeys.has(key)).map(({ token }) => token);
  const coverage = matched.length / anchors.length;
  const requiredCount = anchors.length <= 2 ? anchors.length : Math.ceil(anchors.length * .75);
  return {
    valid: matched.length >= requiredCount,
    coverage,
    anchors: anchors.map(({ token }) => token),
    matched,
    missing
  };
}

export function experienceAdaptationAddsValue(source, candidate) {
  const preservation = experienceSourcePreservation(source, candidate);
  if (!String(source || "").trim()) {
    return { valid: true, preservation, novel: [], requiredNovel: 0 };
  }
  const sourceKeys = new Set(extractExperienceAnchors(source, 120).map(({ key }) => key));
  const novel = extractExperienceAnchors(candidate, 160)
    .filter(({ key }) => !sourceKeys.has(key))
    .map(({ token }) => token);
  const requiredNovel = Math.min(6, Math.max(3, Math.ceil(sourceKeys.size * .2)));
  const sourceLength = String(source).replace(/\s+/g, " ").trim().length;
  const candidateLength = String(candidate).replace(/\s+/g, " ").trim().length;
  const enoughDevelopment = candidateLength >= Math.max(180, Math.min(sourceLength + 70, Math.ceil(sourceLength * 1.08)));
  return {
    valid: preservation.valid && novel.length >= requiredNovel && enoughDevelopment,
    preservation,
    novel,
    requiredNovel,
    enoughDevelopment
  };
}

export function findUnrequestedBiologyConcepts(source, candidate) {
  const normalizedSource = ` ${normalizedWords(source).join(" ")} `;
  const normalizedCandidate = ` ${normalizedWords(candidate).join(" ")} `;
  return BIOLOGY_CONCEPT_TERMS.filter((term) => {
    const normalizedTerm = normalizedWords(term).join(" ");
    return normalizedCandidate.includes(` ${normalizedTerm} `)
      && !normalizedSource.includes(` ${normalizedTerm} `);
  });
}
