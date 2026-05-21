import { authFetchJson } from "../js/api-client.js";

const {
  els,
  VOICES,
  EXPRESSIONS,
  MEDIA_CUES,
} = window;

function requireWindowFunction(name = "") {
  const fn = window[name];
  if (typeof fn !== "function") {
    throw new TypeError(`${name} is not a function`);
  }
  return fn;
}

const getSpeakerOptions = (...args) => requireWindowFunction("getSpeakerOptions")(...args);
const normalizeGenerationConstraints = (...args) => requireWindowFunction("normalizeGenerationConstraints")(...args);
const buildScriptGenerationResponseSchema = (...args) => requireWindowFunction("buildScriptGenerationResponseSchema")(...args);
const normalizeScriptPayload = (...args) => requireWindowFunction("normalizeScriptPayload")(...args);
const applyScriptGenerationConstraints = (...args) => requireWindowFunction("applyScriptGenerationConstraints")(...args);
const forceHostsAndAlternation = (...args) => requireWindowFunction("forceHostsAndAlternation")(...args);
const getSpeakerVoiceMap = (...args) => requireWindowFunction("getSpeakerVoiceMap")(...args);
const resolveSpeakerVoiceName = (...args) => requireWindowFunction("resolveSpeakerVoiceName")(...args);
const normalizeLiveVoiceName = (...args) => requireWindowFunction("normalizeLiveVoiceName")(...args);
const trimWords = (...args) => requireWindowFunction("trimWords")(...args);
const sanitizeSpeakerMentionsInDialogue = (...args) => requireWindowFunction("sanitizeSpeakerMentionsInDialogue")(...args);
const ensureCompleteSentence = (...args) => requireWindowFunction("ensureCompleteSentence")(...args);
const splitTextIntoSentences = (...args) => requireWindowFunction("splitTextIntoSentences")(...args);

function buildPodcastContextualInstructions(context = {}) {
  const preferredSpeakers = Array.isArray(context?.preferredSpeakers) ? context.preferredSpeakers : [];
  const roleDescriptions = Array.isArray(context?.roleDescriptions) ? context.roleDescriptions : [];
  const speakerVoiceLines = Array.isArray(context?.speakerVoiceLines) ? context.speakerVoiceLines : [];
  return [
    context?.isRefinement
      ? "Refina y mejora el guion actual usando el contexto de la conversacion y el guion existente."
      : "Genera un guion nuevo de podcast a partir de la idea del usuario.",
    "Entrega una estructura lista para UI tabular de podcast.",
    "Antes de escribir, analiza el tema como editor: detecta el angulo mas util para la audiencia, las dudas clave, los errores comunes, las implicaciones practicas y los ejemplos que vuelven la explicacion memorable.",
    "Cada fila debe ser util para produccion y contener una plática divertida, texto conversacional natural y reacciones reales entre los locutores.",
    "Evita guiones genericos. Cada escena debe aportar una idea concreta, una explicacion clara, un contraste, una mini anécdota, un ejemplo practico, una objecion comun o una consecuencia real para el oyente.",
    "Cada intervención debe estar escrita en frases completas y naturales. Prohibido devolver fragmentos telegráficos, bullets disfrazados de diálogo o ideas cortadas a la mitad.",
    "Haz la conversación más dinámica: alterna preguntas incisivas, respuestas claras, repreguntas útiles, desacuerdos elegantes, ejemplos y reacciones breves que hagan avanzar la idea.",
    "Además del diálogo, cada fila debe incluir un elemento visual útil para el panel: describe con claridad qué hace el locutor mientras habla, incluyendo postura, ademanes, manos, mirada, ritmo corporal, gestos faciales y energía en cabina.",
    "Mantén el escenario consistente en todas las escenas: una cabina de radio/podcast premium. No cambies de locación entre filas salvo que el usuario lo pida.",
    context?.isCreativePodcast
      ? "IMPORTANTE: Aunque el enfoque sea creativo/narrativo/dramático, el formato DEBE ser un podcast conversacional con interacción fluida entre los locutores. PROHIBIDO usar estilo de narrador o voz en off descriptiva. Haz que los personajes hablen entre sí sobre lo que sucede, reaccionen y mantengan la dinámica de un programa de radio o podcast premium."
      : "",
    [
      `Locutores preferidos para este episodio: ${preferredSpeakers.join(", ")}.`,
      ...roleDescriptions
    ].filter(Boolean).join("\n"),
    context?.constrainedHosts?.length ? `Locutores obligatorios para este episodio: ${context.constrainedHosts.join(", ")}.` : "",
    `Si necesitas locutores extra, usa solo este catálogo: ${VOICES.join(", ")}.`,
    "La columna speaker/Locutor DEBE usar exactamente los IDs internos configurados (por ejemplo: Host A, Host B, Host C, Narrador, Invitado). No uses alias visibles como Valeria o Mateo en esa columna.",
    "No menciones nombres propios de locutores dentro del diálogo.",
    "No hagas que los locutores se llamen por su nombre entre ellos salvo que el usuario lo pida explícitamente.",
    speakerVoiceLines.length ? `Asignación de voz por locutor (no la mezcles): ${speakerVoiceLines.join(" | ")}.` : "",
    "No escribas literalmente 'Host A', 'Host B', etc., dentro de los textos hablados.",
    context?.isCreativePodcast
      ? "PROHIBIDO usar estilo de narrador o voz en off. Los locutores deben vivir la escena conversando e interactuando de forma dinámica."
      : "Haz que interactúen entre sí de forma natural sin usar nombres, etiquetas ni vocativos de identidad.",
    context?.sceneLengthInstruction
      || `Objetivo operativo: escenas cortas, entre ${context?.shortSceneMinSec || 6} y ${context?.shortSceneMaxSec || 7} segundos aprox. Si un diálogo es largo, divídelo en más escenas consecutivas.`,
    "Cada escena debe ser autosuficiente y cerrar la idea con puntuación completa.",
    "Está prohibido cortar una frase entre dos escenas o comenzar una escena con una continuación gramatical de la anterior.",
    context?.strictAlternationRule || "",
    `Usa solo estas expresiones cuando sea posible: ${EXPRESSIONS.join(", ")}.`,
    `Usa solo estas media cues cuando sea posible: ${MEDIA_CUES.join(", ")}.`,
    "Evita dejar Media Cue en 'Sin media' por defecto en todas las escenas. Usa intro, transición, efecto sutil o CTA final cuando aporten ritmo editorial.",
    context?.preserveMinRowsText || "",
    context?.preserveStructureText || "",
    context?.requestedSceneRangeText || "",
    context?.forcedSceneCountText || "",
    context?.forcedHostCountText || "",
    context?.forcedWordRangeText || "",
    context?.requestedMinDurationText || "",
    context?.isRefinement ? "Conserva lo valioso del guion actual y modifica lo necesario segun la nueva instruccion." : ""
  ].filter(Boolean);
}

function buildPodcastSystemInstruction() {
  return "Eres un productor senior de podcasts. Convierte la idea del usuario en una estructura profesional para un editor tipo studio creator. Analiza el tema antes de escribir y decide el mejor angulo para volverlo interesante, claro y educativo. Prioriza siempre el diálogo interactivo, natural y fluido entre los locutores sobre la narración estática o descriptiva. Haz que el resultado se sienta como una plática divertida, con química, ritmo y reacciones reales entre una, dos o más personas según la configuración elegida. Evita generalidades vacias, relleno y consejos obvios: cada escena debe enseñar algo concreto o abrir una pregunta valiosa para el oyente. Cada intervención debe escribirse en frases completas; no uses fragmentos, apuntes sueltos ni remates incompletos. Organiza cada escena como una fila con estas columnas: Locutor (speaker), Expresión (expression), Tiempo (durationSec), Media Cue (mediaCue), Guion (text), Elemento visual (visualNotes), Escenario (scenePrompt) y Notas (notes). La columna speaker/Locutor DEBE usar exactamente los IDs internos configurados como Host A, Host B, Host C, Narrador, Invitado, etc.; no uses alias visibles ni nombres personalizados en esa columna. El campo visualNotes debe describir con precisión lo que hace el locutor en cámara o en cabina mientras habla: postura, manos, mirada, cejas, boca, respiración, microgestos y energía. El campo scenePrompt debe mantener la misma locación base en todas las escenas: una cabina de radio/podcast premium, salvo que el usuario pida otra cosa. Si el usuario envia mensajes posteriores, debes revisar y mejorar el guion existente, no responder de forma aislada. Responde SOLO JSON válido, sin markdown. IMPORTANTE: El campo 'text' debe contener ÚNICAMENTE el diálogo del locutor; está terminantemente PROHIBIDO incluir instrucciones técnicas, nombres de voces, parámetros del sistema o fragmentos del prompt en el contenido del diálogo.";
}

function polishPodcastDialogueRows(rows = [], options = {}) {
  const hosts = Array.isArray(options?.hosts) ? options.hosts.filter(Boolean) : [];
  return (Array.isArray(rows) ? rows : []).map((row, index) => {
    const fallbackSpeaker = hosts[index % Math.max(1, hosts.length)] || hosts[0] || "Host A";
    const rawText = sanitizeSpeakerMentionsInDialogue(String(row?.text || "").trim(), options?.session || null, hosts);
    const polishedText = splitTextIntoSentences(rawText)
      .map((part) => ensureCompleteSentence(part))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim() || ensureCompleteSentence(rawText);
    return {
      ...row,
      speaker: String(row?.speaker || "").trim() || fallbackSpeaker,
      text: polishedText,
      notes: sanitizeSpeakerMentionsInDialogue(String(row?.notes || "").trim(), options?.session || null, hosts)
    };
  });
}

async function buildPodcastScriptFromPromptTable(prompt = "", session = null, constraints = null) {
  const resolvedConstraints = normalizeGenerationConstraints({
    ...(constraints && typeof constraints === "object" ? constraints : {}),
    videoMode: false
  });
  const resolvedHosts = Array.isArray(resolvedConstraints?.hosts) && resolvedConstraints.hosts.length
    ? resolvedConstraints.hosts
    : getSpeakerOptions(session);
  const resolvedMinWords = Number(resolvedConstraints?.minWords || 0) || 0;
  const resolvedMaxWords = Number(resolvedConstraints?.maxWords || 0) || 0;
  const resolvedSceneCount = Number(resolvedConstraints?.sceneCount || 0) || 0;
  const schema = buildScriptGenerationResponseSchema({ videoMode: false });
  const systemInstruction = [
    "Eres un experto productor de podcasts.",
    "El usuario te proporcionará un texto que puede contener una tabla (Excel/Word) o una idea narrativa.",
    "Tu tarea es extraer o generar una estructura de podcast y devolver un JSON válido siguiendo el esquema.",
    "Analiza el tema con criterio editorial antes de proponer el guion.",
    "Evita generalidades vacías, intros de relleno y consejos obvios; cada escena debe aportar una idea concreta, ejemplo, contraste, dato o implicación útil.",
    resolvedHosts.length ? `Locutores obligatorios para este podcast: ${resolvedHosts.join(", ")}.` : "",
    resolvedSceneCount > 0 ? `Debes devolver exactamente ${resolvedSceneCount} escenas.` : "",
    resolvedMinWords > 0 || resolvedMaxWords > 0
      ? `Cada escena debe tener entre ${Math.max(1, resolvedMinWords || 1)} y ${Math.max(Math.max(1, resolvedMinWords || 1), resolvedMaxWords || Math.max(1, resolvedMinWords || 1))} palabras en la columna Guion/text.`
      : "",
    "Mapea las columnas correctamente: Locutor/Personaje -> speaker, Guion/Diálogo/Texto -> text, Expresión -> expression, Media/Audio -> mediaCue, Elemento visual/Visual -> visualNotes, Escenario -> scenePrompt, Notas -> notes.",
    "Regla obligatoria: en la columna speaker usa los IDs internos exactos de la lista configurada (Host A, Host B, Host C, Narrador, Invitado, etc.). No uses alias visibles ni nombres personalizados.",
    "Si el texto es narrativo, divídelo en escenas conversacionales naturales.",
    "Si faltan tiempos (durationSec), asume 15-20 segundos por fila.",
    "Si faltan Media Cue o Elemento visual, complétalos con criterio editorial. No dejes escenas vacías o genéricas.",
    "Responde SOLO JSON válido siguiendo estrictamente el esquema proporcionado. PROHIBIDO incluir markdown, bloques de código o texto explicativo."
  ].filter(Boolean).join("\n");

  const payload = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: schema
    }
  };

  const data = await authFetchJson("/api/gemini/generate", {
    method: "POST",
    body: JSON.stringify({
      model: els.scriptModelSelect.value,
      payload
    })
  });

  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  let script = {};
  try {
    script = JSON.parse(rawText.replace(/```json\n?|```/g, "").trim());
  } catch (_) {
    script = {};
  }

  let normalized = normalizeScriptPayload(script, {
    session,
    videoMode: false,
    hosts: resolvedHosts,
    skipOptimize: Boolean(resolvedSceneCount > 0 || resolvedMinWords > 0 || resolvedMaxWords > 0)
  });
  normalized = applyScriptGenerationConstraints(normalized, resolvedConstraints, session);
  normalized = forceHostsAndAlternation(normalized, resolvedConstraints, session);
  normalized = {
    ...normalized,
    rows: window.finalizePodcastRows
      ? window.finalizePodcastRows(normalized?.rows || [], {
        hosts: resolvedHosts,
        session
      })
      : polishPodcastDialogueRows(normalized?.rows || [], {
      hosts: resolvedHosts,
      session
    })
  };
  const topic = trimWords(String(normalized?.rows?.[0]?.text || "Podcast desde tabla"), 8);

  return {
    ...normalized,
    episodeTitle: `Podcast desde tabla: ${topic}`,
    summary: "Podcast estructurado a partir de entrada del usuario."
  };
}

function generatePodcastFallbackScript(prompt, options = {}) {
  const cleanPrompt = String(prompt || "")
    .replace(/--- CONFIGURACIÓN TÉCNICA OBLIGATORIA[\s\S]*?--- FIN DE CONFIGURACIÓN ---/gi, "")
    .replace(/INSTRUCCIÓN DEL USUARIO:\s*/gi, "")
    .trim();
  const topic = cleanPrompt
    .replace(/^(?:genera(?:r)?|crea|haz|escribe(?:r)?)\s+(?:un\s+)?(?:video educativo|video|guion nuevo de video educativo|guion nuevo de podcast|guion)\s+(?:sobre|para|a partir de la idea del usuario[:.]?)\s*/i, "")
    .replace(/^escribe(?:r)?\s+(?:un\s+)?guion\s+para\s+el\s+podcast\s+sobre/i, "")
    .replace(/^nueva instrucción del usuario(?:\s*\([^)]+\))?:\s*/i, "")
    .trim() || "una idea nueva";
  const requestedHosts = Array.isArray(options?.hosts) && options.hosts.length ? options.hosts : ["Host A", "Host B"];
  return normalizeScriptPayload({
    prompt,
    episodeTitle: `Podcast sobre ${topic.slice(0, 42)}`,
    summary: `Episodio construido en modo demo alrededor de ${topic}.`,
    hosts: requestedHosts,
    rows: [
      {
        speaker: requestedHosts[0] || "Host A",
        expression: "Enérgico",
        durationSec: 18,
        mediaCue: "Intro musical",
        text: `Si hoy tuviéramos que explicar ${topic} sin humo ni relleno, yo empezaría por la pregunta que casi nadie se hace: qué cambia de verdad cuando lo entiendes bien.`,
        notes: "Abrir con gancho y tesis."
      },
      {
        speaker: requestedHosts[1] || requestedHosts[0] || "Host B",
        expression: "Curioso",
        durationSec: 20,
        mediaCue: "Sin media",
        text: `Y esa es la clave, porque mucha gente oye ${topic}, cree que ya lo entendió, pero en la práctica sigue cometiendo el mismo error de base. Entonces, vamos a desmontarlo con un caso concreto.`,
        notes: "Repregunta y aterrizaje."
      },
      {
        speaker: requestedHosts[0] || "Host A",
        expression: "Analítico",
        durationSec: 24,
        mediaCue: "Transición",
        text: `Exacto. Primero vamos a separar la idea popular de la idea útil, luego vemos dónde falla normalmente y al final qué decisión más inteligente puede tomar alguien después de entenderlo.`,
        notes: "Estructura con contraste."
      },
      {
        speaker: requestedHosts[1] || requestedHosts[0] || "Host B",
        expression: "Curioso",
        durationSec: 24,
        mediaCue: "Efecto sutil",
        text: `Porque si no lo bajas a tierra, se queda en discurso bonito. Yo quiero que este episodio deje ejemplos, señales de alerta y una forma simple de reconocer cuándo algo se está haciendo bien o mal.`,
        notes: "Aplicación práctica."
      },
      {
        speaker: requestedHosts[0] || "Host A",
        expression: "Inspirador",
        durationSec: 18,
        mediaCue: "CTA final",
        text: "Con esa base, ya tenemos un episodio que no solo conversa, sino que enseña, cuestiona y deja a la audiencia con algo realmente útil para aplicar.",
        notes: "Cierre con promesa de valor."
      }
    ]
  }, { videoMode: false, prompt, hosts: requestedHosts });
}

globalThis.PodcasterPodcastScriptDomain = {
  buildPodcastContextualInstructions,
  buildPodcastSystemInstruction,
  buildPodcastScriptFromPromptTable,
  generatePodcastFallbackScript,
  polishPodcastDialogueRows
};
