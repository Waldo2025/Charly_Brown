import { SUPPORTED_GAME_LOCALES, formatGameMessage, getGameMessages, normalizeGameLocale } from "./escape-room-game-i18n.mjs";

const DEFAULT_TEXT_SUBTYPE = "palabra";
const TEXT_SUBTYPES = new Set(["palabra", "letra", "numero", "codigo_corto", "frase_corta", "frase_libre"]);
const INTERACTION_TYPES = new Set([
  "texto", "opcion_multiple", "relacion_columnas", "drag_drop", "multimedia",
  "verdadero_falso", "ordenar_secuencia", "completar_espacio"
]);
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

function normalizeBriefingContext(value = "", history = "", locale = "es-419") {
  const messages = getGameMessages(locale);
  const raw = normalizeString(value, "");
  if (raw) {
    const normalizedRaw = normalizeBaseText(raw);
    const isGeneratedDefault = SUPPORTED_GAME_LOCALES.some((supportedLocale) => (
      normalizedRaw === normalizeBaseText(getGameMessages(supportedLocale).defaultBriefingContext)
    ));
    return isGeneratedDefault ? messages.defaultBriefingContext : raw;
  }
  return normalizeString(history, messages.defaultBriefingContext);
}

const LEGACY_SPANISH_HINT_EXACT = new Set([
  "añade una pista útil, pero no obvia.",
  "observa con calma y vuelve a intentarlo.",
  "pista concreta sin revelar la respuesta",
  "usa la condición exacta del enunciado para descartar opciones y hallar la respuesta."
]);

export function normalizeHintForLocale(value = "", locale = "es-419") {
  const messages = getGameMessages(locale);
  const raw = normalizeString(value, "");
  if (!raw) return messages.defaultHint;
  if (String(locale).toLowerCase().startsWith("es")) return raw;

  const normalized = raw.toLocaleLowerCase("es").trim();
  const detailMatch = raw.match(/en el enunciado(?:[^,]*)?,?\s*usa el detalle\s+(.+?)\s+para descartar opciones/i);
  if (detailMatch?.[1]) {
    return formatGameMessage(messages, "fallbackHintDetails", { details: detailMatch[1].trim() });
  }
  if (
    LEGACY_SPANISH_HINT_EXACT.has(normalized)
    || normalized.startsWith("lee con atención el enunciado y busca una pista concreta")
  ) {
    return messages.fallbackHintGeneric || messages.defaultHint;
  }
  return raw;
}

const GENERIC_HINT_PATTERNS = [
  "añade una pista", "agrega una pista", "pista concreta", "pista útil", "pista util",
  "lee con atención el enunciado", "en el enunciado", "use the detail", "read the prompt carefully",
  "utilise le détail", "lis attentivement l'énoncé", "use o detalhe", "leia o enunciado com atenção"
];

function isRepairableGenericHint(value = "") {
  const normalized = normalizeString(value, "").toLocaleLowerCase().trim();
  if (!normalized) return true;
  return GENERIC_HINT_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function formatLocalizedHintList(values = [], locale = "es-419") {
  const items = [...new Set(values.map((value) => normalizeString(value, "")).filter(Boolean))].slice(0, 3);
  if (!items.length) return "";
  const quoted = items.map((value) => `«${value}»`);
  try {
    return new Intl.ListFormat(normalizeGameLocale(locale), { style: "long", type: "conjunction" }).format(quoted);
  } catch (_) {
    return quoted.join(", ");
  }
}

export function buildConcreteQuestionHint(question = {}, locale = "es-419") {
  const language = normalizeGameLocale(locale).split("-")[0];
  const copies = {
    es: {
      pairs: (items) => `Empieza por ${items}: busca en el expediente la definición o relación exacta de cada término y usa cada ficha una sola vez.`,
      sequence: (items) => `Entre ${items}, localiza primero el paso que el expediente presenta como causa o requisito; después sigue sus relaciones de tiempo o dependencia.`,
      choices: (items) => `Compara ${items} con los datos exactos del expediente. Descarta primero cualquier opción que contradiga una condición escrita allí.`,
      blank: (text) => `Lee completa la oración «${text}». Las palabras junto al espacio determinan el concepto y la forma gramatical que encajan.`,
      boolean: (prompt) => `Comprueba por separado el sujeto y la acción de «${prompt}» contra un dato exacto del expediente antes de elegir Verdadero o Falso.`,
      text: (prompt) => `Busca en el expediente la frase que responde exactamente a «${prompt}» y usa el término específico que aparece allí.`
    },
    en: {
      pairs: (items) => `Start with ${items}: find their exact definitions or relationships in the briefing, then use every tile only once.`,
      sequence: (items) => `Among ${items}, first find the step the briefing presents as a cause or prerequisite; then follow its time or dependency links.`,
      choices: (items) => `Compare ${items} with the briefing’s exact facts. First eliminate any option that contradicts a stated condition.`,
      blank: (text) => `Read the complete sentence “${text}”. The words next to the blank determine the concept and grammatical form that fit.`,
      boolean: (prompt) => `Check the subject and action in “${prompt}” separately against an exact fact in the briefing before choosing True or False.`,
      text: (prompt) => `Find the sentence in the briefing that answers “${prompt}” exactly, then use the specific term written there.`
    },
    fr: {
      pairs: (items) => `Commence par ${items} : retrouve dans le dossier la définition ou la relation exacte de chaque terme, puis n’utilise chaque fiche qu’une fois.`,
      sequence: (items) => `Parmi ${items}, repère d’abord l’étape présentée dans le dossier comme cause ou condition préalable, puis suis les liens de temps ou de dépendance.`,
      choices: (items) => `Compare ${items} aux informations exactes du dossier. Écarte d’abord toute option qui contredit une condition écrite.`,
      blank: (text) => `Lis la phrase complète « ${text} ». Les mots autour du blanc déterminent le concept et la forme grammaticale attendus.`,
      boolean: (prompt) => `Vérifie séparément le sujet et l’action de « ${prompt} » avec une information exacte du dossier avant de choisir Vrai ou Faux.`,
      text: (prompt) => `Retrouve dans le dossier la phrase qui répond exactement à « ${prompt} », puis utilise le terme précis qui y apparaît.`
    },
    pt: {
      pairs: (items) => `Comece por ${items}: encontre no dossiê a definição ou relação exata de cada termo e use cada ficha uma única vez.`,
      sequence: (items) => `Entre ${items}, encontre primeiro a etapa que o dossiê apresenta como causa ou pré-requisito; depois siga as relações de tempo ou dependência.`,
      choices: (items) => `Compare ${items} com os dados exatos do dossiê. Primeiro elimine qualquer opção que contradiga uma condição escrita.`,
      blank: (text) => `Leia a frase completa “${text}”. As palavras ao redor do espaço determinam o conceito e a forma gramatical adequados.`,
      boolean: (prompt) => `Verifique separadamente o sujeito e a ação de “${prompt}” com um dado exato do dossiê antes de escolher Verdadeiro ou Falso.`,
      text: (prompt) => `Encontre no dossiê a frase que responde exatamente a “${prompt}” e use o termo específico escrito nela.`
    }
  };
  const templates = copies[language] || copies.es;
  const type = question.tipo_interaccion || inferInteractionType(question);
  if (["relacion_columnas", "drag_drop"].includes(type)) {
    const pairHint = (question.parejas || []).map((pair) => normalizeString(pair?.pista, "")).find(Boolean);
    if (pairHint && !isRepairableGenericHint(pairHint)) return pairHint;
    const items = formatLocalizedHintList((question.parejas || []).map((pair) => pair?.izquierda), locale);
    if (items) return templates.pairs(items);
  }
  if (type === "ordenar_secuencia") {
    const items = formatLocalizedHintList(question.elementos || [], locale);
    if (items) return templates.sequence(items);
  }
  if (type === "opcion_multiple") {
    const items = formatLocalizedHintList(question.opciones || [], locale);
    if (items) return templates.choices(items);
  }
  if (type === "completar_espacio" && question.texto_con_hueco) return templates.blank(question.texto_con_hueco);
  const prompt = normalizeString(question.reto || question.titulo, getGameMessages(locale).question);
  return type === "verdadero_falso" ? templates.boolean(prompt) : templates.text(prompt);
}

export function normalizeConcreteQuestionHint(question = {}, locale = "es-419") {
  const localized = normalizeHintForLocale(question.pista, locale);
  return isRepairableGenericHint(localized) ? buildConcreteQuestionHint({ ...question, pista: localized }, locale) : localized;
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

export function normalizeSequenceItems(value = []) {
  return [...new Set(normalizeTextList(value))].slice(0, 6);
}

export function normalizeFinalPasscode(value = "") {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return normalized.length >= 3 ? normalized.slice(0, 12) : "";
}

export function extractLegacyFinalPasscode(text = "") {
  const raw = String(text || "");
  if (!raw) return "";
  // Se conserva deliberadamente el orden y el límite 3–8 del extractor histórico:
  // proyectos antiguos deben seguir resolviendo exactamente la misma clave.
  const quotedMatch = raw.match(/['"“‘]([A-Za-z0-9]{3,8})['"”’]/);
  if (quotedMatch) return String(quotedMatch[1] || "").toUpperCase();
  const keywordMatch = raw.match(/(?:clave final|c[oó]digo final|final key|final code|cl[eé] finale|code final|chave final|clave|c[oó]digo|key|code|cl[eé]|chave)\s*(?:es|est|é|e|:|is)?\s*['"“‘]?([A-Za-z0-9]{3,8})['"”’]?/i);
  return keywordMatch ? String(keywordMatch[1] || "").toUpperCase() : "";
}

export function buildFallbackFinalPasscode(project = {}) {
  const slug = String(project?.titulo || "escape-room")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_/g, "")
    .toUpperCase();
  const base = `${slug || "ESCAPE"}${Array.isArray(project?.misiones) ? project.misiones.length : 0}X9`;
  return (base.replace(/[^A-Z0-9]/g, "") || "ESC9").slice(0, 6);
}

export function resolveFinalPasscode(project = {}) {
  const explicit = normalizeFinalPasscode(
    project?.clave_final ?? project?.final_key ?? project?.final_code ?? project?.passcode ?? project?.clave
  );
  if (explicit) return { code: explicit, isFallback: false, source: "explicit" };
  const legacy = extractLegacyFinalPasscode(project?.conclusion || "");
  if (legacy) return { code: legacy, isFallback: false, source: "legacy" };
  return { code: buildFallbackFinalPasscode(project), isFallback: true, source: "fallback" };
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

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function localizeSingleWordInstruction(value = "", locale = "es-419") {
  const messages = getGameMessages(locale);
  let localized = String(value || "");
  let foundGeneratedInstruction = false;

  for (const supportedLocale of SUPPORTED_GAME_LOCALES) {
    const instruction = getGameMessages(supportedLocale).singleWordInstruction;
    const pattern = new RegExp(escapeRegExp(instruction), "giu");
    if (!pattern.test(localized)) continue;
    foundGeneratedInstruction = true;
    localized = localized.replace(pattern, "");
  }

  if (!foundGeneratedInstruction) return localized;
  const cleanPrompt = localized
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleanPrompt ? `${cleanPrompt} ${messages.singleWordInstruction}` : messages.singleWordInstruction;
}

export function buildSingleWordChallenge(value = "", title = "este reto", answer = "clave", locale = "es-419") {
  const messages = getGameMessages(locale);
  const raw = localizeSingleWordInstruction(normalizeString(value, messages.defaultChallenge), locale);
  const alreadyRequestsSingleWord = normalizeBaseText(raw).includes(normalizeBaseText(messages.singleWordInstruction));
  if (!extractSingleWordAnswer(answer)) {
    return alreadyRequestsSingleWord ? raw : `${raw} ${messages.singleWordInstruction}`;
  }
  if (!isOpenEndedTextPrompt(raw)) {
    return alreadyRequestsSingleWord ? raw : `${raw} ${messages.singleWordInstruction}`;
  }

  const keyword = extractSingleWordAnswer(answer);
  const letters = Array.from(keyword.replace(/[-'’]/g, ""));
  const safeTitle = normalizeString(title, "este reto");
  if (letters.length > 1) {
    const scrambled = [...letters.slice(1), letters[0]].map((letter) => letter.toUpperCase()).join(" · ");
    return formatGameMessage(messages, "unscrambleInstruction", { letters: scrambled, title: safeTitle });
  }
  return formatGameMessage(messages, "singleLetterInstruction", { title: safeTitle });
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
  if (normalizeSequenceItems(item.elementos || item.sequence || item.items).length >= 3) return "ordenar_secuencia";
  if (normalizeString(item.texto_con_hueco || item.fill_blank_text, "").includes("___")) return "completar_espacio";
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

function normalizeChallenge(item = {}, index = 0, fallbackTitle = "Pregunta", locale = "es-419") {
  const messages = getGameMessages(locale);
  const tipo_interaccion = inferInteractionType(item);
  const booleanAnswer = item.respuesta_correcta === true || item.respuesta_correcta === false
    ? item.respuesta_correcta
    : /^(?:true|verdadero|vrai|verdadeiro|1)$/i.test(String(item.respuesta_correcta ?? item.respuesta ?? "").trim());
  const rawCorrectAnswer = tipo_interaccion === "verdadero_falso"
    ? booleanAnswer
    : normalizeString(
        Array.isArray(item.respuesta_correcta) ? item.respuesta_correcta.join(" | ") : item.respuesta_correcta || item.respuesta,
        ""
      );
  const resolvedSubtype = resolveTextSubtypeForAnswer(
    item.subtipo_respuesta || item.answerSubtype || item.textSubtype,
    rawCorrectAnswer
  );
  const usesOpenAnswer = tipo_interaccion === "texto" || tipo_interaccion === "multimedia" || tipo_interaccion === "completar_espacio";
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
  const rawChallenge = normalizeString(item.reto || item.enunciado || item.pregunta, messages.defaultChallenge);

  const normalizedChallenge = {
    id: normalizeString(item.id || item.slug, buildQuestionId(item.titulo || item.reto, item._roomIndex ?? 0, index)),
    release: normalizeString(item.release || item.etiqueta, `Q${String(index + 1).padStart(2, "0")}`),
    titulo,
    reto: requiresSingleWord ? buildSingleWordChallenge(rawChallenge, titulo, respuestaCorrecta, locale) : rawChallenge,
    tipo_interaccion,
    subtipo_respuesta,
    respuesta_correcta: respuestaCorrecta,
    respuestas_aceptadas,
    opciones: normalizeTextList(item.opciones || item.options || item.alternativas || []),
    parejas: normalizePairList(item.parejas || item.relacion || item.pairs || []),
    elementos: normalizeSequenceItems(item.elementos || item.sequence || item.items || []),
    texto_con_hueco: normalizeString(item.texto_con_hueco || item.fill_blank_text, ""),
    media: normalizeMediaValue(item.media || item.recurso_multimedia || item.multimedia || item.recurso_visual || null),
    pista: normalizeHintForLocale(item.pista, locale),
    retroalimentacion_correcta: normalizeString(item.retroalimentacion_correcta || item.feedback_correcto, ""),
    retroalimentacion_incorrecta: normalizeString(item.retroalimentacion_incorrecta || item.feedback_incorrecto, ""),
    requiere_imagen: item.requiere_imagen === true || item.requires_image === true,
    imagen_funcion: normalizeString(item.imagen_funcion, messages.defaultImagePurpose),
    imagen_prompt: normalizeString(item.imagen_prompt, ""),
    imagen_alt: normalizeString(item.imagen_alt, ""),
    imagen: normalizeString(item.imagen, ""),
    bloqueada_inicial: Boolean(item.bloqueada_inicial === true || item.locked === true)
  };
  normalizedChallenge.pista = normalizeConcreteQuestionHint(normalizedChallenge, locale);
  return normalizedChallenge;
}

export function normalizeQuestion(question = {}, roomIndex = 0, questionIndex = 0, locale = "es-419") {
  const messages = getGameMessages(locale);
  return normalizeChallenge({ ...question, _roomIndex: roomIndex }, questionIndex, messages.question, locale);
}

export function normalizeQuestionList(value = [], roomIndex = 0, locale = "es-419") {
  return (Array.isArray(value) ? value : [value])
    .map((question, questionIndex) => normalizeQuestion(question, roomIndex, questionIndex, locale))
    .filter((question) => question.id || question.titulo || question.reto);
}

function buildLegacyQuestionFromMission(mission = {}, roomIndex = 0, locale = "es-419") {
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
    elementos: mission.elementos,
    texto_con_hueco: mission.texto_con_hueco,
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
  }, roomIndex, 0, locale);
}

export function normalizeMission(mission = {}, index = 0, presentationMode = DEFAULT_PRESENTATION_MODE, locale = "es-419") {
  const messages = getGameMessages(locale);
  const mode = normalizePresentationMode(presentationMode);
  const usesSectionMenu = mode === SECTION_MENU_PRESENTATION_MODE;
  const hasExplicitQuestions = Array.isArray(mission.preguntas) && mission.preguntas.length > 0;
  const preguntasBase = hasExplicitQuestions
    ? mission.preguntas
    : [buildLegacyQuestionFromMission(mission, index, locale)];
  const preguntas = normalizeQuestionList(preguntasBase, index, locale);
  const legacyQuestionFallback = hasExplicitQuestions ? {} : (preguntas[0] || {});
  const explicitBriefingSource = mission.contexto || mission.expediente_contexto || mission.briefing || mission.context;
  const contextoRequerido = typeof mission.contexto_requerido === "boolean"
    ? mission.contexto_requerido
    : Boolean(normalizeString(explicitBriefingSource, ""));
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
      `${(usesSectionMenu ? messages.activity : messages.room).toLocaleUpperCase(locale)} ${String(index + 1).padStart(2, "0")}`,
      mode
    ),
    titulo: normalizeMissionTitle(mission.titulo, `${usesSectionMenu ? messages.activity : messages.room} ${index + 1}`, mode),
    historia: normalizeString(
      mission.historia,
      usesSectionMenu
        ? messages.defaultActivityStory
        : messages.defaultRoomStory
    ),
    contexto: normalizeBriefingContext(
      explicitBriefingSource,
      mission.historia,
      locale
    ),
    contexto_requerido: contextoRequerido,
    datos_clave: normalizeTextList(mission.datos_clave || mission.evidencias || mission.key_facts || mission.keyFacts || []),
    reto: normalizeString(mission.reto, messages.defaultChallenge),
    tipo_interaccion: normalizeString(mission.tipo_interaccion, legacyQuestionFallback.tipo_interaccion || "texto"),
    subtipo_respuesta,
    respuesta_correcta: respuestaCorrecta,
    respuestas_aceptadas: normalizeAcceptedAnswersForSubtype(
      mission.respuestas_aceptadas || legacyQuestionFallback.respuestas_aceptadas || mission.respuestas || mission.acceptedAnswers || respuestaCorrecta,
      subtipo_respuesta
    ),
    opciones: normalizeTextList(mission.opciones || legacyQuestionFallback.opciones || mission.options || mission.alternativas || []),
    parejas: normalizePairList(mission.parejas || legacyQuestionFallback.parejas || mission.relacion || mission.pairs || []),
    elementos: normalizeSequenceItems(mission.elementos || legacyQuestionFallback.elementos || []),
    texto_con_hueco: normalizeString(mission.texto_con_hueco || legacyQuestionFallback.texto_con_hueco, ""),
    media: normalizeMediaValue(mission.media || legacyQuestionFallback.media || mission.recurso_multimedia || mission.multimedia || mission.recurso_visual || null),
    pista: normalizeHintForLocale(mission.pista || legacyQuestionFallback.pista, locale),
    retroalimentacion_correcta: normalizeString(mission.retroalimentacion_correcta || legacyQuestionFallback.retroalimentacion_correcta || mission.feedback_correcto, ""),
    retroalimentacion_incorrecta: normalizeString(mission.retroalimentacion_incorrecta || legacyQuestionFallback.retroalimentacion_incorrecta || mission.feedback_incorrecto, ""),
    imagen_funcion: normalizeString(mission.imagen_funcion || legacyQuestionFallback.imagen_funcion, messages.defaultImagePurpose),
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
  const idioma = normalizeGameLocale(data.idioma);
  const messages = getGameMessages(idioma);
  const rawDuration = Number(data.duracion_minutos ?? data.duracion ?? data.durationMinutes ?? 35);
  const duracion_minutos = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.max(1, Math.round(rawDuration)) : 35;
  const modo_presentacion = normalizePresentationMode(data.modo_presentacion);
  const project = {
    idioma,
    modo_presentacion,
    titulo: normalizeString(data.titulo, messages.educationalEscapeRoom),
    subtitulo: normalizeString(data.subtitulo, messages.defaultSubtitle),
    introduccion: normalizeString(data.introduccion, messages.defaultIntroduction),
    instrucciones: normalizeString(data.instrucciones, modo_presentacion === SECTION_MENU_PRESENTATION_MODE ? messages.defaultInstructionsMenu : messages.defaultInstructionsRooms),
    ambientacion: normalizeString(data.ambientacion, messages.defaultAtmosphere),
    linea_visual_base: normalizeString(data.linea_visual_base, ""),
    estilo_visual: normalizeString(data.estilo_visual, ""),
    personajes_recurrentes: Array.isArray(data.personajes_recurrentes) ? data.personajes_recurrentes : [],
    misiones: Array.isArray(data.misiones)
      ? data.misiones.map((mission, index) => normalizeMission(mission, index, modo_presentacion, idioma))
      : [],
    conclusion: normalizeString(
      data.conclusion,
      modo_presentacion === SECTION_MENU_PRESENTATION_MODE
        ? messages.defaultConclusionMenu
        : messages.defaultConclusionRooms
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
  project.clave_final = resolveFinalPasscode({ ...data, ...project }).code;
  return project;
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
