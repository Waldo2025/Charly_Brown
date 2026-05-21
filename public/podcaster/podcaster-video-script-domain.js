const {
  VOICES,
  VIDEO_SCENE_MAX_SEC,
  VIDEO_DIALOGUE_MAX_SEC,
} = window;

function requireWindowFunction(name = "") {
  const fn = window[name];
  if (typeof fn !== "function") {
    throw new TypeError(`${name} is not a function`);
  }
  return fn;
}

const trimWords = (...args) => requireWindowFunction("trimWords")(...args);
const makeId = (...args) => requireWindowFunction("makeId")(...args);
const normalizeSimpleText = (...args) => requireWindowFunction("normalizeSimpleText")(...args);
const composeEducationalVideoTable = (...args) => requireWindowFunction("composeEducationalVideoTable")(...args);
const buildCreativeVideoValidationError = (...args) => requireWindowFunction("buildCreativeVideoValidationError")(...args);
const normalizeCreativeRow = (...args) => requireWindowFunction("normalizeCreativeRow")(...args);
const buildCreativeOnScreenText = (...args) => requireWindowFunction("buildCreativeOnScreenText")(...args);
const deriveMediaCueFromTransition = (...args) => requireWindowFunction("deriveMediaCueFromTransition")(...args);
const expandCreativeVideoRowsForTiming = (...args) => requireWindowFunction("expandCreativeVideoRowsForTiming")(...args);
const validateCreativeVideoScriptOutput = (...args) => requireWindowFunction("validateCreativeVideoScriptOutput")(...args);
const normalizeScriptPayload = (...args) => requireWindowFunction("normalizeScriptPayload")(...args);
const normalizeCreativeVideoConfig = (...args) => requireWindowFunction("normalizeCreativeVideoConfig")(...args);
const getCreativeVideoConfig = (...args) => requireWindowFunction("getCreativeVideoConfig")(...args);
const rewritePromptForEducationalVideo = (...args) => requireWindowFunction("rewritePromptForEducationalVideo")(...args);

function buildVideoContextualInstructions(context = {}) {
  const isReel = context?.reelModeEnabled === true;
  if (isReel) {
    return [
      context?.isRefinement
        ? "Refina y mejora el guion actual de Reel/Short educativo, conservando el monólogo enérgico de un único presentador 'youtuber' centrado en la pantalla."
        : "Genera un guion nuevo de Reel/Short educativo vertical y dinámico (formato 9:16) con un único presentador 'youtuber' posicionado en el centro del encuadre, explicándolo todo de frente a la cámara con entusiasmo.",
      "Entrega una estructura lista para UI tabular de video corto creativo (Reel/Short).",
      "Cada fila debe avanzar la explicación del tema de forma sumamente ágil y dinámica, usando oraciones completas de no más de 17 palabras por escena.",
      "Imita el estilo veloz y de altísima retención de divulgadores de YouTube en español como 'Derivando' o 'QuantumFracture', usando frases cortas, directas y exclamaciones como: '¡Ojo!', '¡Espera!', '¡Boom!', '¡Piénsalo!'.",
      "REGLA OBLIGATORIA: En la columna de Descripción de escena (sceneDescription), sitúa de manera constante y explícita al presentador ('youtuber') posicionado frontalmente en la zona central de la pantalla (formato vertical), mirando de frente y con entusiasmo directamente al lente de la cámara (contacto visual directo).",
      "REGLA OBLIGATORIA: En la columna de Elemento visual (visualNotes/videoDirective), describe con precisión al presentador ('youtuber') en la zona central de la pantalla (plano medio o primer plano), haciendo contacto visual directo y constante con el lente de la cámara, realizando ademanes enérgicos con las manos, gestos expresivos para dar énfasis, y señalando activamente dibujos sencillos, iconos didácticos o diagramas explicativos flotando a sus costados (overlays). No reutilices el mismo texto en cada fila.",
      "REGLA OBLIGATORIA: El presentador debe ser el único personaje en cámara y el único que habla en la voz en off por escena. No crees diálogos ni uses otros locutores.",
      "Organiza mentalmente cada escena como fila de tabla con estas columnas: Tiempo, Guion, Descripción de escena, Texto en pantalla, Transición y Elemento visual.",
      "Mapeo obligatorio: Tiempo=durationSec, Guion=voiceOverText, Descripción de escena=sceneDescription, Texto en pantalla=onScreenText, Transición=transition, Elemento visual=visualNotes.",
      "Define cada escena con: durationSec, voiceOverText, sceneDescription y transition.",
      "Regla obligatoria: si necesitas ampliar, crea más escenas del mismo locutor en lugar de cortar frases a la mitad.",
      "Regla obligatoria: no cortar frases; segmenta solo por oraciones completas.",
      "Regla obligatoria: cada escena debe terminar con frase completa (sin cortes).",
      "Regla obligatoria: devuelve voiceOverText en cada escena.",
      "Regla obligatoria: devuelve sceneDescription en cada escena.",
      "Regla obligatoria: devuelve transition en cada escena (ej: corte rápido, disolvencia, barrido).",
      "Regla obligatoria: devuelve scenePrompt e imagePrompts para cada escena.",
      "Regla obligatoria: onScreenText debe ser una frase o palabra clave muy corta de 2 a 6 palabras en mayúsculas (ej: '¡OJO AL DATO!', '¡BOOM!', '¿CÓMO ES POSIBLE?').",
      context?.isRefinement ? "Conserva lo valioso del guion actual y modifica lo necesario segun la nueva instruccion." : ""
    ].filter(Boolean);
  }

  return [
    context?.isRefinement
      ? "Refina y mejora el guion actual usando el contexto de la conversación y el guion existente. Mantén el enfoque de video corto creativo para redes sociales."
      : "Genera un guion nuevo de video corto creativo para redes sociales a partir de la idea del usuario.",
    "Entrega una estructura lista para UI tabular de video corto creativo. No uses framing de podcast ni didáctico por defecto.",
    "Cada fila debe avanzar una mini-historia clara con gag/beat visual y ritmo ágil.",
    "Prohibido usar plantillas educativas. No escribas frases tipo: 'Bienvenidos a este video educativo', 'Hoy abrimos una conversación útil y accionable' o 'Vamos a tomar una idea y convertirla...'. Entra directo a la historia.",
    "Obligatorio: en la escena 1 menciona al menos 2 detalles específicos del prompt del usuario (personajes, lugar, amenaza, objetivo, etc.).",
    "Organiza mentalmente cada escena como fila de tabla con estas columnas: Tiempo, Guion, Descripción de escena, Texto en pantalla, Transición y Elemento visual.",
    context?.constrainedHosts?.length
      ? `Locutores preferidos para esta narración de video: ${context.constrainedHosts.join(", ")}.`
      : "Usa voz en off narrativa única (Narrador). Puedes mencionar personajes/acciones en la voz en off and en la descripción de escena.",
    "Define cada escena con: durationSec, voiceOverText, sceneDescription y transition.",
    "Mapeo obligatorio: Tiempo=durationSec, Guion=voiceOverText, Descripción de escena=sceneDescription (solo ubicación breve del lugar), Texto en pantalla=onScreenText, Transición=transition, Elemento visual=visualNotes.",
    "Opcional por escena: onScreenText y visualNotes.",
    "La voz en off global se configura en el panel; no pidas voz por locutor.",
    "Evita entrevista, mesa redonda, conducción radial o cualquier estructura de podcast. Escribe como guion técnico de video creativo.",
    `Objetivo operativo: cada escena dura ${context?.videoSceneMaxSec || VIDEO_SCENE_MAX_SEC} segundos con narración de ~${context?.videoDialogueMaxSec || VIDEO_DIALOGUE_MAX_SEC} segundos y debe contener una frase completa (sin cortar oraciones).`,
    "IMPORTANTE: cada escena debe tener un dialogo o guion de no más de 17 palabras, pueden ser menos pero no más.",
    "IMPORTANTE: la descripción de escena puede ser breve o más descriptiva, pero debe ser específica y concreta. Evita etiquetas vacías como 'Interior de una cocina' sin detalle adicional.",
    context?.forcedSceneCountText || "",
    context?.requestedMinDurationText || "",
    "Regla obligatoria: si necesitas ampliar, crea más escenas del mismo locutor en lugar de cortar frases a la mitad.",
    `Regla obligatoria: cada escena debe durar ${context?.videoSceneMaxSec || VIDEO_SCENE_MAX_SEC} segundos y la voz en off por escena debe rondar ${context?.videoDialogueMaxSec || VIDEO_DIALOGUE_MAX_SEC} segundos.`,
    "Regla obligatoria: no cortar frases; segmenta solo por oraciones completas.",
    "Regla obligatoria: cada escena debe terminar con frase completa (sin cortes).",
    "Regla obligatoria: devuelve voiceOverText en cada escena.",
    "Regla obligatoria: devuelve sceneDescription en cada escena.",
    "Regla obligatoria: devuelve transition en cada escena (ej: corte rápido, disolvencia, barrido).",
    "Regla obligatoria: devuelve scenePrompt e imagePrompts para cada escena.",
    "Regla obligatoria: sceneDescription debe ser solo una ubicación breve del lugar (ej. interior de una casa, calle nocturna, sótano, cocina, apartamento).",
    "Regla obligatoria: visualNotes/videoDirective debe describir con detalle el lugar, personajes, acción, cámara, luz y estilo visual; es el prompt de VEO específico y distinto por fila. No reutilices el mismo texto.",
    "Regla obligatoria: onScreenText debe ser una frase corta completa, de 2 a 6 palabras, clave para la escena.",
    context?.videoPreset === "creative"
      ? "Regla obligatoria: devuelve videoDirective en cada escena con acción creativa concreta (bloqueo, gag, tensión, sorpresa, etc.)."
      : "Regla obligatoria: devuelve videoDirective en cada escena con acción pedagógica concreta.",
    context?.videoPreset === "creative"
      ? "Regla obligatoria: cada escena debe avanzar la historia/gag y apoyarse en un beat visual sugerido."
      : "Regla obligatoria: cada escena debe explicar o enseñar algo concreto y apoyarse en imagen o gráfico sugerido.",
    context?.isRefinement ? "Conserva lo valioso del guion actual y modifica lo necesario segun la nueva instruccion." : ""
  ].filter(Boolean);
}

function buildVideoSystemInstruction(reelModeEnabled = false) {
  if (reelModeEnabled) {
    return "Eres un guionista y productor senior experto en la creación de videos cortos verticales (Reels, Shorts de YouTube, TikTok) de divulgación educativa y entretenimiento inteligente. Convierte la idea del usuario en un guion técnico estructurado en formato JSON, diseñado para ser narrado e interpretado individualmente (monólogo) por un único presentador 'youtuber' entusiasta en el centro de la pantalla. Devuelve escenas con durationSec, voiceOverText, sceneDescription y transition; además scenePrompt, imagePrompts y videoDirective para producción visual. Opcionalmente devuelve onScreenText y visualNotes. IMPORTANTE: En cada escena, la descripción de escena (sceneDescription) DEBE ubicar brevemente el set y situar explícitamente al presentador ('youtuber') en el centro del encuadre vertical de frente a la cámara. IMPORTANTE: La columna Elemento visual (visualNotes/videoDirective) DEBE describir en detalle al presentador en la zona central de la pantalla (plano medio o primer plano), haciendo contacto visual directo con el lente de la cámara, realizando ademanes enérgicos con las manos, gestos expresivos para dar énfasis a sus explicaciones y señalar activamente recursos gráficos sencillos, iconos o diagramas didácticos flotando a sus costados (overlays). IMPORTANTE: Cada escena debe tener un diálogo de no más de 17 palabras, natural, fluido y enérgico en español. Responde solo JSON válido, sin markdown. PROHIBIDO incluir metadatos o instrucciones en los campos de texto.";
  }
  return "Eres un guionista y productor senior de videos cortos creativos para redes sociales. Convierte la idea del usuario en un guion técnico para un editor visual. No uses podcast ni formato de locución radial. Devuelve escenas con durationSec, voiceOverText, sceneDescription y transition; además scenePrompt, imagePrompts y videoDirective para producción visual. Opcionalmente devuelve onScreenText y visualNotes. IMPORTANTE: sceneDescription puede ser breve o más descriptiva, pero debe ser específica y concreta; evita etiquetas vacías. Mientras que visualNotes/videoDirective debe describir en detalle el lugar, personajes y acción. IMPORTANTE: cada escena debe tener un dialogo o guion de no más de 17 palabras, pueden ser menos pero no más. Mantén el tono/estilo del usuario (comedia, terror, acción, etc.). Si el usuario envía mensajes posteriores, revisa y mejora el guion existente. Responde solo JSON válido, sin markdown. PROHIBIDO incluir metadatos o instrucciones en los campos de texto.";
}

async function buildCreativeVideoScriptFromPromptTable(prompt = "", session = null) {
  const composed = await composeEducationalVideoTable({
    text: prompt,
    html: ""
  }, session, {
    useGeminiStructure: false,
    useGeminiSceneSplit: true,
    failOnSplitError: true,
    useGeminiOnScreen: false
  });
  const canonicalRows = Array.isArray(composed?.rows) ? composed.rows : [];
  if (!canonicalRows.length) {
    throw buildCreativeVideoValidationError("video/compose", "no se pudieron extraer filas del guion de entrada.");
  }

  const creativeRows = canonicalRows.map((row, index) => {
    const scriptText = normalizeSimpleText(row?.script || row?.voiceOverText || row?.text || "");
    const transition = normalizeSimpleText(row?.transition || "");
    const sceneDescription = normalizeSimpleText(row?.sceneDescription || row?.scenePrompt || "");
    const visualElement = normalizeSimpleText(row?.visual || row?.elementoVisual || row?.visualNotes || "");
    const videoDirective = normalizeSimpleText(row?.videoDirective || "");
    if (!scriptText) {
      throw buildCreativeVideoValidationError("video/compose", "la columna Guion/voz en off está vacía.", index);
    }
    if (!sceneDescription) {
      throw buildCreativeVideoValidationError("video/compose", "falta la descripción de escena.", index);
    }
    if (!visualElement) {
      throw buildCreativeVideoValidationError("video/compose", "falta el elemento visual.", index);
    }
    if (!videoDirective) {
      throw buildCreativeVideoValidationError("video/compose", "falta la dirección de video.", index);
    }
    return normalizeCreativeRow({
      id: makeId("row"),
      durationSec: VIDEO_SCENE_MAX_SEC,
      voiceOverText: scriptText,
      sceneDescription,
      onScreenText: buildCreativeOnScreenText(String(row?.onScreenText || "").trim(), {
        voiceOver: scriptText,
        sceneDescription,
        visual: visualElement
      }),
      transition,
      visualNotes: visualElement,
      mediaCue: deriveMediaCueFromTransition(transition),
      videoDirective,
      scenePrompt: sceneDescription,
      imagePrompts: [visualElement || sceneDescription]
    }, index, { videoPreset: "creative", strictVideoValidation: true, validationStage: "video/compose" });
  });

  const expandedRows = expandCreativeVideoRowsForTiming(creativeRows, {
    validationStage: "video/compose"
  });
  validateCreativeVideoScriptOutput({ rows: expandedRows }, { stage: "video/compose" });
  const topic = trimWords(String(expandedRows[0]?.voiceOverText || expandedRows[0]?.sceneDescription || "Video creativo"), 8);
  const sessionVoice = getCreativeVideoConfig(session)?.globalVoiceName || "Kore";
  return validateCreativeVideoScriptOutput(normalizeScriptPayload({
    videoMode: true,
    videoPreset: "creative",
    episodeTitle: `Guion técnico desde tabla: ${topic}`,
    summary: "Tabla convertida automáticamente al formato del panel creativo.",
    hosts: ["Narrador"],
    creativeVideoConfig: normalizeCreativeVideoConfig({
      ...(session?.creativeVideoConfig || {}),
      globalVoiceName: sessionVoice,
      voiceMimeType: "audio/ogg"
    }),
    rows: expandedRows
  }, {
    session,
    videoMode: true,
    videoPreset: "creative",
    strictVideoValidation: true,
    validationStage: "video/compose"
  }), { stage: "video/compose" });
}

function prepareVideoPrompt(prompt = "") {
  return rewritePromptForEducationalVideo(prompt);
}

globalThis.PodcasterVideoScriptDomain = {
  buildVideoContextualInstructions,
  buildVideoSystemInstruction,
  buildCreativeVideoScriptFromPromptTable,
  prepareVideoPrompt
};
