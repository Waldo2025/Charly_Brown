const DEFAULT_TEXT_SUBTYPE = "frase_corta";
const TEXT_SUBTYPES = new Set(["palabra", "letra", "numero", "codigo_corto", "frase_corta"]);
const INTERACTION_TYPES = new Set(["texto", "opcion_multiple", "relacion_columnas", "multimedia"]);

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

export function normalizeRoomTitle(value = "", fallback = "") {
  const raw = normalizeString(value, fallback);
  if (/^misi[oó]n\b/i.test(raw)) {
    return raw.replace(/^misi[oó]n\b/i, "Sala");
  }
  return raw;
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
  const respuestaCorrecta = normalizeString(
    Array.isArray(item.respuesta_correcta) ? item.respuesta_correcta.join(" | ") : item.respuesta_correcta || item.respuesta,
    ""
  );
  const respuestas_aceptadas = normalizeAcceptedAnswers(
    item.respuestas_aceptadas || item.respuestas || item.acceptedAnswers || respuestaCorrecta
  );

  return {
    id: normalizeString(item.id || item.slug, buildQuestionId(item.titulo || item.reto, item._roomIndex ?? 0, index)),
    release: normalizeString(item.release || item.etiqueta, `Q${String(index + 1).padStart(2, "0")}`),
    titulo: normalizeString(item.titulo, `${fallbackTitle} ${index + 1}`),
    reto: normalizeString(item.reto || item.enunciado || item.pregunta, "Resuelve el desafío para avanzar."),
    tipo_interaccion,
    subtipo_respuesta: normalizeTextSubtype(item.subtipo_respuesta || item.answerSubtype || item.textSubtype),
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

export function normalizeMission(mission = {}, index = 0) {
  const hasExplicitQuestions = Array.isArray(mission.preguntas) && mission.preguntas.length > 0;
  const preguntasBase = hasExplicitQuestions
    ? mission.preguntas
    : [buildLegacyQuestionFromMission(mission, index)];
  const preguntas = normalizeQuestionList(preguntasBase, index);
  const legacyQuestionFallback = hasExplicitQuestions ? {} : (preguntas[0] || {});

  return {
    id: normalizeString(mission.id || mission.slug, buildMissionId(mission.titulo, index)),
    release: normalizeString(mission.release || mission.etiqueta, `SALA ${String(index + 1).padStart(2, "0")}`),
    titulo: normalizeRoomTitle(mission.titulo, `Sala ${index + 1}`),
    historia: normalizeString(mission.historia, "La historia de esta sala aún no está definida."),
    reto: normalizeString(mission.reto, "Resuelve el desafío para avanzar."),
    tipo_interaccion: normalizeString(mission.tipo_interaccion, legacyQuestionFallback.tipo_interaccion || "texto"),
    subtipo_respuesta: normalizeTextSubtype(mission.subtipo_respuesta || legacyQuestionFallback.subtipo_respuesta || mission.answerSubtype || mission.textSubtype),
    respuesta_correcta: normalizeString(
      Array.isArray(mission.respuesta_correcta) ? mission.respuesta_correcta.join(" | ") : mission.respuesta_correcta || legacyQuestionFallback.respuesta_correcta || mission.respuesta,
      ""
    ),
    respuestas_aceptadas: normalizeAcceptedAnswers(
      mission.respuestas_aceptadas || legacyQuestionFallback.respuestas_aceptadas || mission.respuestas || mission.acceptedAnswers || mission.respuesta_correcta || mission.respuesta
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
    preguntas,
    desbloquea: normalizeTextList(mission.desbloquea || mission.unlocks || []),
    bloqueada_inicial: Boolean(mission.bloqueada_inicial === true || mission.locked === true)
  };
}

export function normalizeEscapeRoomProject(data = {}) {
  const rawDuration = Number(data.duracion_minutos ?? data.duracion ?? data.durationMinutes ?? 35);
  const duracion_minutos = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.max(1, Math.round(rawDuration)) : 35;
  return {
    titulo: normalizeString(data.titulo, "Escape Room Educativo"),
    subtitulo: normalizeString(data.subtitulo, "Una aventura educativa lista para jugar"),
    introduccion: normalizeString(data.introduccion, "La historia de apertura se generará aquí."),
    ambientacion: normalizeString(data.ambientacion, "Ambiente inmersivo y cinematográfico."),
    linea_visual_base: normalizeString(data.linea_visual_base, ""),
    estilo_visual: normalizeString(data.estilo_visual, ""),
    personajes_recurrentes: Array.isArray(data.personajes_recurrentes) ? data.personajes_recurrentes : [],
    misiones: Array.isArray(data.misiones) ? data.misiones.map((mission, index) => normalizeMission(mission, index)) : [],
    conclusion: normalizeString(data.conclusion, "La sala concluye con éxito."),
    backgroundImage: normalizeString(data.backgroundImage, ""),
    duracion_minutos
  };
}

export function getMissionAcceptedAnswers(mission = {}) {
  const accepted = normalizeAcceptedAnswers(mission.respuestas_aceptadas || []);
  if (accepted.length) return accepted;
  return normalizeAcceptedAnswers(mission.respuesta_correcta || "");
}

export function getQuestionAcceptedAnswers(question = {}) {
  const accepted = normalizeAcceptedAnswers(question.respuestas_aceptadas || []);
  if (accepted.length) return accepted;
  return normalizeAcceptedAnswers(question.respuesta_correcta || "");
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
  const normalizedAnswer = normalizePlayerAnswer(answer, question);
  if (!normalizedAnswer) return false;
  return getQuestionAcceptedAnswers(question).includes(normalizedAnswer);
}
