const {
  VOICES,
  VIDEO_SCENE_MAX_SEC,
  VIDEO_DIALOGUE_MAX_SEC
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
        : "Genera un guion nuevo de Reel/Short educativo vertical y dinámico (formato 9:16) con un monólogo enérgico de un único presentador 'youtuber' centrado en la pantalla, explicándolo todo de frente a la cámara con entusiasmo.",
      "Entrega una estructura lista para UI tabular de video corto creativo (Reel/Short).",
      "Cada fila debe avanzar la explicación del tema de forma sumamente ágil y dinámica, usando oraciones completas de no más de 17 palabras por escena.",
      "Imita el estilo veloz y de altísima retención de divulgadores de YouTube en español como 'Derivando' o 'QuantumFracture', usando frases cortas, directas y exclamaciones como: '¡Ojo!', '¡Espera!', '¡Boom!', '¡Piénsalo!'.",
      "REGLA OBLIGATORIA: En la columna de Descripción de escena (sceneDescription), sitúa de manera constante y explícita al presentador ('youtuber') posicionado frontalmente en la zona central de la pantalla (formato vertical), mirando de frente y con entusiasmo directamente al lente de la cámara (contacto visual directo).",
      "REGLA OBLIGATORIA: En la columna de Elemento visual (visualNotes/videoDirective), describe con precisión al presentador ('youtuber') en la zona central de la pantalla (plano medio o primer plano), haciendo contacto visual directo y constante con el lente de la cámara, realizando ademanes enérgicos con las manos, gestos expresivos para dar énfasis, y señalando activamente dibujos sencillos, iconos didácticos o diagramas explicativos flotando a sus costados (overlays). No reutilices el mismo texto en cada fila.",
      "REGLA OBLIGATORIA: El presentador debe ser el único personaje en cámara y el único que habla en la voz en off por escena. No crees diálogos ni uses otros locutores.",
      "Organiza mentalmente cada escena como fila de tabla con estas columnas: Tiempo, Guion, Descripción de escena, Texto en pantalla, Transición y Elemento visual.",
      "Mapeo de texto editorial: titular opcional=headlineText, subtítulos literales=captionText, texto natural dentro del escenario=inSceneText. onScreenText es solo un alias legacy y no debe generarse.",
      "Define cada escena con: durationSec, voiceOverText, sceneDescription y transition.",
      "Regla obligatoria: si necesitas ampliar, crea más escenas del mismo locutor en lugar de cortar frases a la mitad.",
      "Regla obligatoria: no cortar frases; segmenta solo por oraciones completas.",
      "Regla obligatoria: cada escena debe terminar con frase completa (sin cortes).",
      "Regla obligatoria: devuelve voiceOverText en cada escena.",
      "Regla obligatoria: devuelve sceneDescription en cada escena.",
      "Regla obligatoria: devuelve transition en cada escena (ej: corte rápido, disolvencia, barrido).",
      "Regla obligatoria: devuelve scenePrompt e imagePrompts para cada escena.",
      "Regla obligatoria: headlineText es opcional; si aporta valor, debe ser una frase completa de 2 a 6 palabras y máximo 48 caracteres. Si no aporta, usa una cadena vacía.",
      "captionText debe quedar vacío: los subtítulos literales se derivan del guion sólo cuando el usuario los activa.",
      "inSceneText debe quedar vacío salvo que la historia requiera palabras naturales visibles en un objeto o letrero; nunca lo confundas con títulos, subtítulos ni overlays editoriales.",
      "No copies headlineText ni captionText dentro de sceneDescription, visualNotes, videoDirective, scenePrompt o imagePrompts.",
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
    "Mapeo de texto editorial: titular opcional=headlineText, subtítulos literales=captionText, texto natural dentro del escenario=inSceneText. onScreenText es solo un alias legacy y no debe generarse.",
    "Opcional por escena: headlineText, inSceneText y visualNotes.",
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
    "Regla obligatoria: visualNotes/videoDirective debe describir con detalle el lugar, personajes, acción, cámara, luz y estilo visual; no debe incluir titulares, subtítulos, rótulos editoriales ni copy overlay. No reutilices el mismo texto.",
    "Regla obligatoria: headlineText es opcional; si aporta valor, debe ser una frase completa de 2 a 6 palabras y máximo 48 caracteres. Si no aporta, usa una cadena vacía.",
    "captionText debe quedar vacío. inSceneText sólo puede contener texto natural imprescindible dentro del escenario, nunca un título o subtítulo.",
    "No copies headlineText ni captionText dentro de sceneDescription, visualNotes, videoDirective, scenePrompt o imagePrompts.",
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
    return "Eres un guionista y productor senior experto en videos cortos verticales 9:16. Convierte la idea del usuario en un guion técnico JSON para un único presentador 'youtuber' de frente a la cámara. Devuelve escenas con durationSec, voiceOverText, sceneDescription, transition, scenePrompt, imagePrompts, videoDirective, visualNotes y los campos editoriales headlineText, captionText e inSceneText. headlineText es opcional (2–6 palabras, máximo 48 caracteres), captionText queda vacío e inSceneText sólo se usa para texto natural imprescindible dentro del escenario. Nunca copies titulares o subtítulos en los prompts visuales. En cada Elemento visual mantén al youtuber centrado, mirando al lente, con ademanes enérgicos con las manos y diagramas didácticos flotando sin palabras a sus costados. Cada escena debe tener un diálogo natural de máximo 17 palabras en español. Responde solo JSON válido, sin markdown.";
  }
  return "Eres un guionista y productor senior de videos cortos creativos para redes sociales. Convierte la idea del usuario en un guion técnico JSON, sin formato podcast. Devuelve escenas con durationSec, voiceOverText, sceneDescription, transition, scenePrompt, imagePrompts, videoDirective, visualNotes y los campos editoriales headlineText, captionText e inSceneText. headlineText es opcional (2–6 palabras, máximo 48 caracteres), captionText queda vacío e inSceneText sólo se usa para texto natural imprescindible dentro del escenario. Nunca copies titulares o subtítulos en sceneDescription ni en prompts visuales. Cada escena debe tener diálogo de máximo 17 palabras y dirección visual concreta sin copy overlay. Mantén el tono del usuario. Responde solo JSON válido, sin markdown.";
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
      headlineText: buildCreativeOnScreenText(String(row?.headlineText || row?.onScreenText || "").trim(), {
        voiceOver: scriptText,
        sceneDescription,
        visual: visualElement
      }),
      captionText: String(row?.captionText || "").trim(),
      inSceneText: String(row?.inSceneText || "").trim(),
      overlayMode: String(row?.overlayMode || "headline").trim() || "headline",
      textSource: String(row?.textSource || "generated").trim() || "generated",
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
