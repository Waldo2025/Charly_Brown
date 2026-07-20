const DEFAULT_TEXT_SUBTYPE = "palabra";
const TEXT_SUBTYPES = new Set(["palabra", "letra", "numero", "codigo_corto", "frase_corta", "frase_libre"]);
const INTERACTION_TYPES = new Set(["texto", "opcion_multiple", "relacion_columnas", "multimedia"]);
const DEFAULT_PRESENTATION_MODE = "salas";
const SECTION_MENU_PRESENTATION_MODE = "menu_secciones";

const DEFAULT_INSTRUCTIONS_BY_MODE = Object.freeze({
  salas: "Recorre cada sala en orden, resuelve sus desafíos y reúne las claves para completar la misión.",
  menu_secciones: "Lee la introducción y las instrucciones. Completa cada actividad en orden para desbloquear el mensaje final."
});

export function normalizeBaseText(value = "") {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function normalizeString(value = "", fallback = "") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
}

export function normalizePresentationMode(value = "") {
  const mode = normalizeString(value, DEFAULT_PRESENTATION_MODE).toLowerCase();
  return mode === SECTION_MENU_PRESENTATION_MODE ? SECTION_MENU_PRESENTATION_MODE : DEFAULT_PRESENTATION_MODE;
}

export function normalizeTextList(value = []) {
  return (Array.isArray(value) ? value : [value])
    .flatMap((entry) => Array.isArray(entry) ? normalizeTextList(entry) : String(entry ?? "").split(/\r?\n+/))
    .map((entry) => normalizeString(entry, ""))
    .filter(Boolean);
}

export function normalizeAcceptedAnswers(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeAcceptedAnswers(entry)).filter(Boolean);
  }

  const raw = String(value ?? "").trim();
  if (!raw) return [];

  return raw
    .split(/[\r\n|;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => normalizeBaseText(entry))
    .filter(Boolean);
}

export function isSingleWordAnswer(value = "") {
  const raw = normalizeString(value, "");
  if (!raw || raw.length > 32) return false;
  return /^[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)?$/u.test(raw);
}

export function extractSingleWordAnswer(value = "", fallback = "") {
  const raw = normalizeString(Array.isArray(value) ? value[0] : value, "");
  const candidates = raw.match(/[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)?/gu) || [];
  const stopWords = new Set([
    "a", "al", "ante", "bajo", "con", "contra", "de", "del", "desde", "durante", "e", "el", "ella", "en",
    "entre", "es", "esa", "ese", "esta", "este", "esto", "la", "las", "lo", "los", "o", "para", "pero",
    "por", "que", "se", "sin", "sobre", "su", "sus", "un", "una", "unas", "unos", "y"
  ]);
  const preferred = candidates.find((candidate) => isSingleWordAnswer(candidate) && !stopWords.has(candidate.toLowerCase()));
  const firstValid = preferred || candidates.find(isSingleWordAnswer);
  return firstValid || (isSingleWordAnswer(fallback) ? fallback : "");
}

export function isOpenEndedTextPrompt(value = "") {
  return /\b(?:argumenta|comenta|crea|describe|diseña|elabora|explica|expresa|formula|justifica|opina|prop[oó]n|redacta|reflexiona|resume)\b|\b(?:frase|oraci[oó]n|p[aá]rrafo)\b|\b(?:m[aá]ximo|m[aá]s de|menos de)\s+\d+\s+palabras\b/i.test(String(value || ""));
}

export function buildSingleWordChallenge(value = "", title = "este reto", answer = "clave") {
  const raw = normalizeString(value, "Identifica la palabra clave para avanzar.");
  if (!extractSingleWordAnswer(answer)) {
    return /(?:una sola palabra|una palabra)/i.test(raw) ? raw : `${raw} Responde con una sola palabra.`;
  }
  if (!isOpenEndedTextPrompt(raw)) {
    return /(?:una sola palabra|una palabra)/i.test(raw) ? raw : `${raw} Responde con una sola palabra.`;
  }

  const keyword = extractSingleWordAnswer(answer);
  const letters = Array.from(keyword.replace(/[-'’]/g, ""));
  const safeTitle = normalizeString(title, "este reto");
  if (letters.length > 1) {
    const scrambled = [...letters.slice(1), letters[0]].map((letter) => letter.toUpperCase()).join(" · ");
    return `Ordena las letras «${scrambled}» para descubrir la palabra clave relacionada con «${safeTitle}». Responde con una sola palabra.`;
  }
  return `Escribe la única letra que funciona como clave para «${safeTitle}».`;
}

export function normalizeAcceptedAnswersForSubtype(value, subtype = DEFAULT_TEXT_SUBTYPE) {
  const normalizedSubtype = normalizeTextSubtype(subtype);
  const rawAnswers = (Array.isArray(value) ? value : [value])
    .flatMap((entry) => Array.isArray(entry) ? entry : String(entry ?? "").split(/[\r\n|;]+/))
    .map((entry) => normalizeString(entry, ""))
    .filter(Boolean);
  const compatibleAnswers = normalizedSubtype === "palabra"
    ? rawAnswers.filter(isSingleWordAnswer)
    : rawAnswers;
  return [...new Set(compatibleAnswers.flatMap((answer) => normalizeAcceptedAnswers(answer)))];
}

export function resolveTextSubtypeForAnswer(subtype = DEFAULT_TEXT_SUBTYPE, correctAnswer = "") {
  const normalizedSubtype = normalizeTextSubtype(subtype);
  if (normalizedSubtype === "palabra" && correctAnswer && !isSingleWordAnswer(correctAnswer)) {
    return "frase_corta";
  }
  return normalizedSubtype;
}

export function replacePrimaryAcceptedAnswer(acceptedAnswers = [], previousCorrect = "", nextCorrect = "") {
  const previousTokens = new Set(normalizeAcceptedAnswers(previousCorrect));
  const nextTokens = normalizeAcceptedAnswers(nextCorrect);
  const excludedTokens = new Set([...previousTokens, ...nextTokens]);
  const aliases = normalizeAcceptedAnswers(acceptedAnswers)
    .filter((answer) => !excludedTokens.has(answer));
  return [...nextTokens, ...aliases];
}

function looksLikeMediaUrl(value = "") {
  const raw = normalizeString(value, "");
  if (!raw) return false;
  if (/^data:/i.test(raw)) return true;
  if (/^(https?:|blob:)/i.test(raw)) return true;
  if (/^\.{0,2}\//.test(raw)) return true;
  if (/^assets\//i.test(raw)) return true;
  if (/^file:/i.test(raw)) return false;
  if (/^\/Users\//.test(raw)) return false;
  if (/^[A-Za-z]:[\\/]/.test(raw)) return false;
  if (/\s{2,}/.test(raw)) return false;
  return /\.(png|jpe?g|gif|webp|svg|mp3|wav|ogg|mp4|webm)(\?.*)?$/i.test(raw);
}

export function normalizeMediaValue(media = {}) {
  if (typeof media === "string") {
    const raw = normalizeString(media, "");
    if (!raw) return null;
    if (looksLikeMediaUrl(raw)) {
      return { tipo: "imagen", url: raw, alt: "", titulo: "", texto: "" };
    }
    return { tipo: "imagen", url: "", alt: raw, titulo: "", texto: raw };
  }

  if (!media || typeof media !== "object") return null;

  const rawUrl = normalizeString(media.url || media.src || media.link, "");
  const safeUrl = looksLikeMediaUrl(rawUrl) ? rawUrl : "";
  const derivedText = !safeUrl && rawUrl ? rawUrl : "";

  const item = {
    tipo: normalizeString(media.tipo || media.type || media.mediaType, "imagen").toLowerCase(),
    url: safeUrl,
    alt: normalizeString(media.alt || media.descripcion || media.texto_alt || derivedText, ""),
    titulo: normalizeString(media.titulo || media.title, ""),
    texto: normalizeString(media.texto || media.caption || media.descripcion || derivedText, "")
  };

  return Object.values(item).some(Boolean) ? item : null;
}

function normalizePaletteColor(value = "") {
  const raw = normalizeString(value, "").toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  return "";
}

export function normalizeAcademicPalette(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const stationIndex = Number(source.estacion_index ?? source.stationIndex);
  const themeIndex = Number(source.tema_unidad_index ?? source.themeIndex);
  return {
    color_estacion: normalizePaletteColor(source.color_estacion || source.stationColor),
    color_tema_unidad: normalizePaletteColor(source.color_tema_unidad || source.themeColor),
    estacion_index: Number.isFinite(stationIndex) ? Math.max(1, Math.round(stationIndex)) : 1,
    tema_unidad_index: Number.isFinite(themeIndex) ? Math.max(1, Math.round(themeIndex)) : 1
  };
}

export function normalizePairList(pairs = []) {
  const list = Array.isArray(pairs) ? pairs : [];
  return list
    .map((pair, index) => {
      if (Array.isArray(pair)) {
        return {
          izquierda: normalizeString(pair[0], `Elemento ${index + 1}`),
          derecha: normalizeString(pair[1], "")
        };
      }

      if (typeof pair === "string") {
        const [left, right] = pair.split(/[:=|]/);
        return {
          izquierda: normalizeString(left, `Elemento ${index + 1}`),
          derecha: normalizeString(right, "")
        };
      }

      if (!pair || typeof pair !== "object") return null;
      return {
        izquierda: normalizeString(pair.izquierda || pair.left || pair.columnaA || pair.a, `Elemento ${index + 1}`),
        derecha: normalizeString(pair.derecha || pair.right || pair.columnaB || pair.b, ""),
        pista: normalizeString(pair.pista || pair.hint, "")
      };
    })
    .filter((pair) => pair?.izquierda && pair?.derecha);
}

export function normalizeTextSubtype(value = "") {
  const subtype = normalizeString(value, DEFAULT_TEXT_SUBTYPE).toLowerCase();
  return TEXT_SUBTYPES.has(subtype) ? subtype : DEFAULT_TEXT_SUBTYPE;
}

export function normalizeMissionTitle(value = "", fallback = "", presentationMode = DEFAULT_PRESENTATION_MODE) {
  const raw = normalizeString(value, fallback);
  const mode = normalizePresentationMode(presentationMode);

  if (mode === SECTION_MENU_PRESENTATION_MODE) {
    if (/^(?:sala|misi[oó]n|secci[oó]n)\s*#?\s*\d+\s*$/i.test(raw)) {
      return raw.replace(/^(?:sala|misi[oó]n|secci[oó]n)\b/i, "Actividad");
    }
    return raw;
  }

  if (/^misi[oó]n\b/i.test(raw)) {
    return raw.replace(/^misi[oó]n\b/i, "Sala");
  }

  // Permite volver de menú a salas sin reescribir títulos editoriales que solo
  // casualmente comiencen con "Actividad" o "Sección".
  if (/^(?:actividad|secci[oó]n)\s*#?\s*\d+\s*$/i.test(raw)) {
    return raw.replace(/^(?:actividad|secci[oó]n)\b/i, "Sala");
  }

  return raw;
}

export function normalizeMissionRelease(value = "", fallback = "", presentationMode = DEFAULT_PRESENTATION_MODE) {
  const raw = normalizeString(value, fallback);
  const mode = normalizePresentationMode(presentationMode);

  if (mode === SECTION_MENU_PRESENTATION_MODE) {
    if (/^(?:sala|misi[oó]n|secci[oó]n)\s*#?\s*\d+\s*$/i.test(raw)) {
      return raw.replace(/^(?:sala|misi[oó]n|secci[oó]n)\b/i, "ACTIVIDAD");
    }
    return raw;
  }

  if (/^(?:actividad|secci[oó]n)\s*#?\s*\d+\s*$/i.test(raw)) {
    return raw.replace(/^(?:actividad|secci[oó]n)\b/i, "SALA");
  }

  return raw;
}

export function normalizeRoomTitle(value = "", fallback = "", presentationMode = DEFAULT_PRESENTATION_MODE) {
  return normalizeMissionTitle(value, fallback, presentationMode);
}

export function inferInteractionType(item = {}) {
  const explicit = normalizeString(item.tipo_interaccion || item.tipo || item.question_type, "").toLowerCase();
  if (INTERACTION_TYPES.has(explicit)) return explicit;
  if (normalizePairList(item.parejas || item.relacion || item.pairs).length) return "relacion_columnas";
  if (normalizeTextList(item.opciones || item.options || item.alternativas).length >= 2) return "opcion_multiple";
  if (normalizeMediaValue(item.media || item.recurso_multimedia || item.multimedia || item.recurso_visual)) return "multimedia";
  return "texto";
}

export function buildMissionId(value, index) {
  const normalized = normalizeBaseText(value || "");
  return normalized ? `mission-${normalized}` : `mission-${index + 1}`;
}

function buildQuestionId(value, roomIndex, questionIndex) {
  const normalized = normalizeBaseText(value || "");
  const base = normalized ? `question-${normalized}` : `question-${roomIndex + 1}-${questionIndex + 1}`;
  return base;
}

function normalizeChallenge(item = {}, index = 0, fallbackTitle = "Pregunta") {
  const tipo_interaccion = inferInteractionType(item);
  const rawCorrectAnswer = normalizeString(
    Array.isArray(item.respuesta_correcta) ? item.respuesta_correcta.join(" | ") : item.respuesta_correcta || item.respuesta,
    ""
  );
  const resolvedSubtype = resolveTextSubtypeForAnswer(
    item.subtipo_respuesta || item.answerSubtype || item.textSubtype,
    rawCorrectAnswer
  );
  const usesOpenAnswer = tipo_interaccion === "texto" || tipo_interaccion === "multimedia";
  const subtipo_respuesta = usesOpenAnswer && resolvedSubtype === "frase_corta"
    ? "palabra"
    : resolvedSubtype;
  const requiresSingleWord = usesOpenAnswer && subtipo_respuesta === "palabra";
  const respuestaCorrecta = requiresSingleWord
    ? extractSingleWordAnswer(rawCorrectAnswer)
    : rawCorrectAnswer;
  const rawAcceptedAnswers = item.respuestas_aceptadas || item.respuestas || item.acceptedAnswers || rawCorrectAnswer;
  const acceptedSource = requiresSingleWord
    ? [respuestaCorrecta, ...(Array.isArray(rawAcceptedAnswers) ? rawAcceptedAnswers : [rawAcceptedAnswers])]
        .map((answer) => extractSingleWordAnswer(answer, respuestaCorrecta))
    : rawAcceptedAnswers;
  const respuestas_aceptadas = normalizeAcceptedAnswersForSubtype(
    acceptedSource,
    subtipo_respuesta
  );
  const titulo = normalizeString(item.titulo, `${fallbackTitle} ${index + 1}`);
  const rawChallenge = normalizeString(item.reto || item.enunciado || item.pregunta, "Resuelve el desafío para avanzar.");

  return {
    id: normalizeString(item.id || item.slug, buildQuestionId(item.titulo || item.reto, item._roomIndex ?? 0, index)),
    release: normalizeString(item.release || item.etiqueta, `Q${String(index + 1).padStart(2, "0")}`),
    titulo,
    reto: requiresSingleWord ? buildSingleWordChallenge(rawChallenge, titulo, respuestaCorrecta) : rawChallenge,
    tipo_interaccion,
    subtipo_respuesta,
    respuesta_correcta: respuestaCorrecta,
    respuestas_aceptadas,
    opciones: normalizeTextList(item.opciones || item.options || item.alternativas || []),
    parejas: normalizePairList(item.parejas || item.relacion || item.pairs || []),
    media: normalizeMediaValue(item.media || item.recurso_multimedia || item.multimedia || item.recurso_visual || null),
    pista: normalizeString(item.pista, "Observa con calma y vuelve a intentarlo."),
    retroalimentacion_correcta: normalizeString(item.retroalimentacion_correcta || item.feedback_correcto, ""),
    retroalimentacion_incorrecta: normalizeString(item.retroalimentacion_incorrecta || item.feedback_incorrecto, ""),
    imagen_funcion: normalizeString(item.imagen_funcion, "Apoya la resolución con una pista visual."),
    imagen_prompt: normalizeString(item.imagen_prompt, ""),
    imagen_alt: normalizeString(item.imagen_alt, ""),
    imagen: normalizeString(item.imagen, ""),
    bloqueada_inicial: Boolean(item.bloqueada_inicial === true || item.locked === true)
  };
}

export function normalizeQuestion(question = {}, roomIndex = 0, questionIndex = 0) {
  return normalizeChallenge({ ...question, _roomIndex: roomIndex }, questionIndex, "Pregunta");
}

export function normalizeQuestionList(value = [], roomIndex = 0) {
  return (Array.isArray(value) ? value : [value])
    .map((question, questionIndex) => normalizeQuestion(question, roomIndex, questionIndex))
    .filter((question) => question.id || question.titulo || question.reto);
}

function buildLegacyQuestionFromMission(mission = {}, roomIndex = 0) {
  return normalizeQuestion({
    id: `${buildMissionId(mission.titulo, roomIndex)}-question-1`,
    titulo: mission.titulo,
    reto: mission.reto,
    tipo_interaccion: mission.tipo_interaccion,
    subtipo_respuesta: mission.subtipo_respuesta,
    respuesta_correcta: mission.respuesta_correcta,
    respuestas_aceptadas: mission.respuestas_aceptadas || mission.respuestas || mission.acceptedAnswers,
    opciones: mission.opciones,
    parejas: mission.parejas,
    media: mission.media,
    pista: mission.pista,
    retroalimentacion_correcta: mission.retroalimentacion_correcta || mission.feedback_correcto,
    retroalimentacion_incorrecta: mission.retroalimentacion_incorrecta || mission.feedback_incorrecto,
    imagen_funcion: mission.imagen_funcion,
    imagen_prompt: mission.imagen_prompt,
    imagen_alt: mission.imagen_alt,
    imagen: mission.imagen,
    bloqueada_inicial: mission.bloqueada_inicial,
    locked: mission.locked
  }, roomIndex, 0);
}

export function normalizeMission(mission = {}, index = 0, presentationMode = DEFAULT_PRESENTATION_MODE) {
  const mode = normalizePresentationMode(presentationMode);
  const usesSectionMenu = mode === SECTION_MENU_PRESENTATION_MODE;
  const hasExplicitQuestions = Array.isArray(mission.preguntas) && mission.preguntas.length > 0;
  const preguntasBase = hasExplicitQuestions
    ? mission.preguntas
    : [buildLegacyQuestionFromMission(mission, index)];
  const preguntas = normalizeQuestionList(preguntasBase, index);
  const legacyQuestionFallback = hasExplicitQuestions ? {} : (preguntas[0] || {});
  const respuestaCorrecta = normalizeString(
    Array.isArray(mission.respuesta_correcta) ? mission.respuesta_correcta.join(" | ") : mission.respuesta_correcta || legacyQuestionFallback.respuesta_correcta || mission.respuesta,
    ""
  );
  const subtipo_respuesta = resolveTextSubtypeForAnswer(
    mission.subtipo_respuesta || legacyQuestionFallback.subtipo_respuesta || mission.answerSubtype || mission.textSubtype,
    respuestaCorrecta
  );

  return {
    id: normalizeString(mission.id || mission.slug, buildMissionId(mission.titulo, index)),
    release: normalizeMissionRelease(
      mission.release || mission.etiqueta,
      `${usesSectionMenu ? "ACTIVIDAD" : "SALA"} ${String(index + 1).padStart(2, "0")}`,
      mode
    ),
    titulo: normalizeMissionTitle(mission.titulo, `${usesSectionMenu ? "Actividad" : "Sala"} ${index + 1}`, mode),
    historia: normalizeString(
      mission.historia,
      usesSectionMenu
        ? "La historia de esta actividad aún no está definida."
        : "La historia de esta sala aún no está definida."
    ),
    reto: normalizeString(mission.reto, "Resuelve el desafío para avanzar."),
    tipo_interaccion: normalizeString(mission.tipo_interaccion, legacyQuestionFallback.tipo_interaccion || "texto"),
    subtipo_respuesta,
    respuesta_correcta: respuestaCorrecta,
    respuestas_aceptadas: normalizeAcceptedAnswersForSubtype(
      mission.respuestas_aceptadas || legacyQuestionFallback.respuestas_aceptadas || mission.respuestas || mission.acceptedAnswers || respuestaCorrecta,
      subtipo_respuesta
    ),
    opciones: normalizeTextList(mission.opciones || legacyQuestionFallback.opciones || mission.options || mission.alternativas || []),
    parejas: normalizePairList(mission.parejas || legacyQuestionFallback.parejas || mission.relacion || mission.pairs || []),
    media: normalizeMediaValue(mission.media || legacyQuestionFallback.media || mission.recurso_multimedia || mission.multimedia || mission.recurso_visual || null),
    pista: normalizeString(mission.pista || legacyQuestionFallback.pista, "Observa con calma y vuelve a intentarlo."),
    retroalimentacion_correcta: normalizeString(mission.retroalimentacion_correcta || legacyQuestionFallback.retroalimentacion_correcta || mission.feedback_correcto, ""),
    retroalimentacion_incorrecta: normalizeString(mission.retroalimentacion_incorrecta || legacyQuestionFallback.retroalimentacion_incorrecta || mission.feedback_incorrecto, ""),
    imagen_funcion: normalizeString(mission.imagen_funcion || legacyQuestionFallback.imagen_funcion, "Apoya la resolución con una pista visual."),
    imagen_prompt: normalizeString(mission.imagen_prompt || legacyQuestionFallback.imagen_prompt, ""),
    imagen_alt: normalizeString(mission.imagen_alt || legacyQuestionFallback.imagen_alt, ""),
    imagen: normalizeString(mission.imagen || legacyQuestionFallback.imagen, ""),
    paleta_academica: normalizeAcademicPalette(mission.paleta_academica || mission.academicPalette || {}),
    preguntas,
    desbloquea: normalizeTextList(mission.desbloquea || mission.unlocks || []),
    bloqueada_inicial: Boolean(mission.bloqueada_inicial === true || mission.locked === true)
  };
}

function normalizeThemeConfig(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const config = {};
  const colorKeys = [
    "baseColor", "backgroundColor", "cardColor", "elevatedCardColor", "titleColor", "subtitleColor",
    "paragraphColor", "buttonColor", "buttonTextColor", "accentColor", "accentStrong", "accentSoft",
    "successColor", "warningColor", "dangerColor"
  ];
  colorKeys.forEach((key) => {
    const color = String(value[key] || "").trim();
    if (/^#[0-9a-f]{3,8}$/i.test(color)) config[key] = color;
  });
  ["cardRadius", "titleSize", "subtitleSize", "paragraphSize"].forEach((key) => {
    const number = Number(value[key]);
    if (Number.isFinite(number)) config[key] = number;
  });
  const presetId = String(value.presetId || "").trim();
  if (/^[a-z0-9_-]{1,48}$/i.test(presetId)) config.presetId = presetId;
  return config;
}

export function normalizeEscapeRoomProject(data = {}) {
  const rawDuration = Number(data.duracion_minutos ?? data.duracion ?? data.durationMinutes ?? 35);
  const duracion_minutos = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.max(1, Math.round(rawDuration)) : 35;
  const modo_presentacion = normalizePresentationMode(data.modo_presentacion);
  return {
    modo_presentacion,
    titulo: normalizeString(data.titulo, "Escape Room Educativo"),
    subtitulo: normalizeString(data.subtitulo, "Una aventura educativa lista para jugar"),
    introduccion: normalizeString(data.introduccion, "La historia de apertura se generará aquí."),
    instrucciones: normalizeString(data.instrucciones, DEFAULT_INSTRUCTIONS_BY_MODE[modo_presentacion]),
    ambientacion: normalizeString(data.ambientacion, "Ambiente inmersivo y cinematográfico."),
    linea_visual_base: normalizeString(data.linea_visual_base, ""),
    estilo_visual: normalizeString(data.estilo_visual, ""),
    personajes_recurrentes: Array.isArray(data.personajes_recurrentes) ? data.personajes_recurrentes : [],
    misiones: Array.isArray(data.misiones)
      ? data.misiones.map((mission, index) => normalizeMission(mission, index, modo_presentacion))
      : [],
    conclusion: normalizeString(
      data.conclusion,
      modo_presentacion === SECTION_MENU_PRESENTATION_MODE
        ? "El escape room concluye con un mensaje de victoria."
        : "La sala concluye con éxito."
    ),
    backgroundImage: normalizeString(data.backgroundImage, ""),
    nivel: normalizeString(data.nivel, "Primaria"),
    grado: normalizeString(data.grado, "Primero"),
    trimestre: normalizeString(data.trimestre, "1"),
    materia: normalizeString(data.materia, "Español"),
    unidad: normalizeString(data.unidad, ""),
    tema: normalizeString(data.tema, ""),
    tema_curricular: normalizeString(data.tema_curricular, ""),
    estacion: normalizeString(data.estacion, ""),
    duracion_minutos,
    // La configuración visual es parte del contrato exportable: se conserva aquí
    // y el builder aplica después sus propios límites seguros de color/tamaño.
    themeConfig: normalizeThemeConfig(data.themeConfig)
  };
}

export function getMissionAcceptedAnswers(mission = {}) {
  const accepted = normalizeAcceptedAnswers(mission.respuestas_aceptadas || []);
  const source = accepted.length ? accepted : normalizeAcceptedAnswers(mission.respuesta_correcta || "");
  return [...new Set(source.map((answer) => normalizePlayerAnswer(answer, mission)).filter(Boolean))];
}

export function getQuestionAcceptedAnswers(question = {}) {
  const accepted = normalizeAcceptedAnswers(question.respuestas_aceptadas || []);
  const source = accepted.length ? accepted : normalizeAcceptedAnswers(question.respuesta_correcta || "");
  return [...new Set(source.map((answer) => normalizePlayerAnswer(answer, question)).filter(Boolean))];
}

export function normalizePlayerAnswer(value, item = {}) {
  const subtype = normalizeTextSubtype(item.subtipo_respuesta);
  const raw = String(value ?? "").trim();

  if (subtype === "numero") {
    const digits = raw.replace(/[^\d.-]+/g, "");
    if (!digits) return "";
    const number = Number(digits);
    return Number.isFinite(number) ? String(number) : "";
  }

  const base = normalizeBaseText(raw);
  if (!base) return "";

  if (subtype === "letra") return base.slice(0, 1);
  return base;
}

export function validateMissionAnswer(mission = {}, answer = "") {
  if (normalizeTextSubtype(mission.subtipo_respuesta) === "frase_libre") {
    return Boolean(String(answer ?? "").trim());
  }
  const normalizedAnswer = normalizePlayerAnswer(answer, mission);
  if (!normalizedAnswer) return false;
  const accepted = getMissionAcceptedAnswers(mission);
  if (accepted.length) return accepted.includes(normalizedAnswer);
  if (Array.isArray(mission.preguntas) && mission.preguntas.length) {
    return validateQuestionAnswer(mission.preguntas[0], answer);
  }
  return false;
}

export function validateQuestionAnswer(question = {}, answer = "") {
  if (normalizeTextSubtype(question.subtipo_respuesta) === "frase_libre") {
    return Boolean(String(answer ?? "").trim());
  }
  const normalizedAnswer = normalizePlayerAnswer(answer, question);
  if (!normalizedAnswer) return false;
  return getQuestionAcceptedAnswers(question).includes(normalizedAnswer);
}
