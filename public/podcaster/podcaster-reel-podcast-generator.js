/**
 * podcaster-reel-podcast-generator.js
 * Logic for generating educational Reels, Shorts and TikToks in Podcast mode when Reel mode is active.
 * Emulates the fast-paced, high-retention, example-rich style of Spanish educational YouTubers (Derivando, QuantumFracture, Matemáticas con Juan).
 */

import { authFetchJson } from "../js/api-client.js";

// Expose functions globally for integration
export function buildReelPodcastSystemInstruction() {
  return `Eres un productor creativo senior experto en la creación de videos verticales cortos (Reels, Shorts de YouTube, TikTok) de divulgación educativa y entretenimiento inteligente.
Tu objetivo es transformar la idea o tema del usuario en un guion estructurado en formato JSON, diseñado para ser narrado de forma individual (monólogo) por un único presentador (speaker), de forma extremadamente rápida, fluida y con un alto nivel de enganche (retención).

Debes imitar el estilo dinámico, apasionado y de altísima retención de divulgadores educativos de éxito en español como "Derivando" (Eduardo Sáenz de Cabezón), "QuantumFracture", "CdeCiencia" o "Matemáticas con Juan".

Sigue estas reglas fundamentales de tono, redacción y estructura:
1. UN SOLO LOCUTOR (Monólogo): Todo el guion debe tener como locutor al presentador principal (usualmente 'Host A' o el primer locutor configurado). Bajo ninguna circunstancia deben alternar voces o crearse diálogos grupales.
2. EL GANCHO INICIAL (Primeros 3 segundos): La primera escena debe abrir con un gancho brutal que capture la atención de inmediato y detenga el scroll automático. Empieza con una pregunta intrigante, una paradoja desconcertante, un mito común a desmentir o un dato contraintuitivo impactante.
   - Ejemplos de ganchos excelentes:
     * "¿Y si te dijera que el infinito no es lo que piensas? A ver, imagina..."
     * "¡Cuidado con esto! Nos han mentido toda la vida sobre cómo funciona..."
     * "¿Cuál es el problema sin resolver más antiguo de las matemáticas? ¡Ojo!"
     * "Esta es la paradoja más loca de la probabilidad, y te la explico en 60 segundos."
3. RITMO VELOZ, ENTUSIASTA Y CASUAL: El habla debe ser rápida, enérgica y directa al grano. Evita preámbulos aburridos o formales. Usa frases cortas, contundentes y expresiones dinámicas del español que transmitan emoción y complicidad con la audiencia como:
   - "¡Ojo al dato!", "¡Espera!", "Mira esto...", "¡Boom! Así de fácil", "¡Es una lucura!", "Flipante", "A ver, te explico...", "¡Piénsalo por un segundo!".
4. EXPLICACIÓN SIEMPRE CON EJEMPLOS CONCRETOS Y COTIDIANOS: Prohibido dar explicaciones abstractas, teóricas o puramente formales sin aterrizarlas de inmediato con analogías memorables de la vida diaria (repartir pizzas, lanzar monedas, dados, caminar por la calle, un hotel infinito, etc.). Explica el truco o concepto de forma que cualquiera pueda visualizarlo al instante.
5. CUES VISUALES Y DE EDICIÓN DINÁMICAS (columna visualNotes): En cada fila, describe al presentador ("youtuber") posicionado frontalmente en la zona central de la pantalla (zona central simétrica, formato vertical), mirando de frente y con entusiasmo directamente al lente de la cámara (contacto visual constante con el espectador). Describe con precisión sus gestos (ademanes enérgicos con las manos, señalar a la cámara o hacia los lados para dar énfasis) e indicaciones de edición modernas:
   - Zooms rápidos a la cara, animaciones de texto colorido gigante en pantalla que reafirman las palabras clave ("¡BOOM!", "¡OJO!"), iconos sencillos, esquemas o dibujos explicativos flotando a sus costados (overlays didácticos) que el presentador señala activamente con el dedo, transiciones de plano dinámicas.
6. EFECTOS DE SONIDO Y AUDIO (columna mediaCue): Usa efectos de sonido de alta retención (como 'Pop', 'Transición', 'Efecto sutil', 'Ding', 'Suspenso', 'Cierre', 'CTA final') para acentuar los puntos más importantes del discurso.
7. CIERRE CON LLAMADO A LA ACCIÓN (CTA) O BUCLE: La última escena debe tener un desenlace potente y un llamado a la acción directo, breve y amigable que invite a interactuar: "¿Qué opinas de esto? ¡Déjamelo en los comentarios y sígueme para más mates/ciencia!".

Estructura de salida JSON:
Devuelve un objeto JSON que coincida estrictamente con el siguiente esquema:
{
  "episodeTitle": "Título corto y súper llamativo estilo clickbait inteligente para el Short",
  "summary": "Resumen conciso del contenido del Reel",
  "hosts": ["ID del locutor principal, ej: Host A"],
  "rows": [
    {
      "speaker": "El ID exacto del locutor único (ej: Host A)",
      "text": "El diálogo hablado en español. Natural, fluido, redactado en oraciones completas y dinámicas.",
      "durationSec": 8,
      "expression": "Expresión emocional del locutor ('Enérgico', 'Sorprendido', 'Divertido', 'Analítico', 'Inspirador', 'Neutral')",
      "mediaCue": "Efecto o transición de audio ('Pop', 'Transición', 'Efecto sutil', 'Ding', 'Cierre', 'CTA final', 'Sin media')",
      "visualNotes": "Instrucciones detalladas del presentador de frente en la zona central de la pantalla (plano medio o primer plano), haciendo contacto visual directo y entusiasta con la lente de la cámara, ademanes enérgicos de explicación y mención de recursos gráficos flotantes a los lados (overlays) que él señala activamente.",
      "scenePrompt": "Escenario consistente de video vertical (ej: Set de grabación moderno de YouTuber con luces LED de colores de fondo, o fondo abstracto dinámico), con el presentador posicionado frontalmente en el centro del encuadre, mirando fijamente al lente de la cámara.",
      "notes": "Propósito editorial de la escena (ej: Gancho, Introducción del ejemplo, Explicación práctica, Conclusión, CTA)"
    }
  ]
}

Responde ÚNICAMENTE con JSON válido, sin bloques de código markdown, sin texto explicativo adicional.`;
}

export function buildReelPodcastContextualInstructions(context = {}) {
  const preferredSpeakers = Array.isArray(context?.preferredSpeakers) ? context.preferredSpeakers : [];
  const primarySpeaker = preferredSpeakers[0] || "Host A";

  return [
    context?.isRefinement
      ? "Refina y mejora el guion actual de Reel/Short educativo, conservando el monólogo dinámico de un solo presentador con alta retención."
      : "Genera un guion nuevo de Reel/Short educativo con un solo presentador, aplicando ritmo veloz, explicaciones con ejemplos y ganchos constantes.",
    "Entrega una estructura lista para UI tabular de podcast.",
    `REGLA DE LOCUTOR ÚNICO: Todo el guion debe pertenecer a un solo locutor: "${primarySpeaker}". Prohibido usar más de una voz en la columna 'speaker'.`,
    `La columna speaker/Locutor DEBE usar exactamente el ID interno del presentador: "${primarySpeaker}".`,
    "No menciones nombres propios del locutor dentro del diálogo hablado.",
    "El campo visualNotes debe describir con precisión efectos de edición modernos, textos gigantes animados en pantalla, ademanes con las manos y gestos enérgicos del presentador en cámara.",
    "Mantén el escenario consistente en todas las escenas: un estudio premium de grabación de video o fondo temático abstracto de alta calidad.",
    "Cada escena debe ser súper dinámica y ágil, con duraciones estimadas cortas (entre 6 y 12 segundos por fila).",
    "Usa un lenguaje natural, directo, conversacional y entusiasta, propio de los mejores divulgadores de YouTube.",
    context?.preserveMinRowsText || "",
    context?.preserveStructureText || "",
    context?.requestedSceneRangeText || "",
    context?.forcedSceneCountText || "",
    context?.forcedWordRangeText || "",
    context?.requestedMinDurationText || "",
    context?.isRefinement ? "Conserva lo valioso del guion actual y modifica lo necesario según la nueva instrucción." : ""
  ].filter(Boolean);
}

function forceSingleSpeakerOnReel(script = {}, primarySpeaker = "Host A") {
  const hosts = [primarySpeaker];
  const rows = (Array.isArray(script?.rows) ? script.rows : []).map(row => ({
    ...row,
    speaker: primarySpeaker
  }));
  return {
    ...script,
    hosts,
    rows
  };
}

export async function generateReelPodcastScript(prompt, sessionSnapshot = null, constraints = null) {
  const preferredSpeakers = Array.isArray(sessionSnapshot?.script?.hosts) && sessionSnapshot.script.hosts.length
    ? sessionSnapshot.script.hosts
    : (Array.isArray(constraints?.hosts) && constraints.hosts.length ? constraints.hosts : ["Host A"]);
  const primarySpeaker = preferredSpeakers[0] || "Host A";

  const safeConstraints = {
    ...(constraints && typeof constraints === "object" ? constraints : {}),
    videoMode: false,
    hosts: [primarySpeaker],
    hostCount: 1
  };

  const hasExistingScript = window.hasMeaningfulScript?.(sessionSnapshot || {}) || false;
  const existingRowsCount = Math.max(0, Number(sessionSnapshot?.script?.rows?.length || 0));
  const shortenRequested = window.isShortenRequest?.(prompt) || false;
  const rebuildRequested = window.isRebuildRequest?.(prompt) || false;
  const isRefinement = hasExistingScript && !rebuildRequested && !safeConstraints.forceNewScript;

  const requestedMinDurationSec = window.extractRequestedMinDurationSec?.(prompt) || 0;
  const requestedSceneRange = window.extractRequestedSceneRange?.(prompt) || null;
  const forcedSceneCount = Number(safeConstraints.sceneCount) || 0;

  const speakerVoiceMap = window.getSpeakerVoiceMap?.(sessionSnapshot || {}) || {};
  const speakerVoiceLines = [
    `${primarySpeaker} = ${window.normalizeLiveVoiceName?.(speakerVoiceMap[primarySpeaker], window.resolveSpeakerVoiceName?.(primarySpeaker, sessionSnapshot)) || "default"}`
  ];

  const contextualInstructions = buildReelPodcastContextualInstructions({
    isRefinement,
    constrainedHosts: [primarySpeaker],
    preferredSpeakers: [primarySpeaker],
    speakerVoiceLines,
    preserveMinRowsText: isRefinement && !shortenRequested ? `No reduzcas el número de escenas por debajo de ${Math.max(4, existingRowsCount)}, a menos que el usuario pida resumir.` : "",
    preserveStructureText: isRefinement && !shortenRequested && !rebuildRequested && existingRowsCount > 0 && !requestedSceneRange && forcedSceneCount <= 0
      ? `Mantén exactamente ${existingRowsCount} escenas y preserva la estructura del guion de Reel actual, mejorando el dinamismo y los ejemplos.`
      : "",
    requestedSceneRangeText: requestedSceneRange
      ? `El usuario pidió un rango de escenas entre ${requestedSceneRange.minRows} y ${requestedSceneRange.maxRows}. Devuelve una cantidad dentro de ese rango.`
      : "",
    forcedSceneCountText: forcedSceneCount > 0 ? `Regla obligatoria: devuelve exactamente ${forcedSceneCount} escenas.` : "",
    requestedMinDurationText: requestedMinDurationSec > 0 ? `La duración total del Reel debe ser como mínimo ${requestedMinDurationSec} segundos.` : ""
  }).join("\n");

  const conversationContext = (sessionSnapshot && isRefinement) ? (window.buildChatContext?.(sessionSnapshot) || "") : "";
  const scriptContext = (sessionSnapshot && isRefinement) ? (window.buildScriptContext?.(sessionSnapshot.script || {}) || "") : "";

  const responseSchema = window.buildScriptGenerationResponseSchema?.({ videoMode: false }) || { type: "object" };

  const payload = {
    systemInstruction: {
      parts: [{
        text: buildReelPodcastSystemInstruction()
      }]
    },
    contents: [{
      role: "user",
      parts: [{
        text: [
          contextualInstructions,
          conversationContext ? `Conversación reciente:\n${conversationContext}` : "",
          scriptContext ? `Guion actual editable:\n${scriptContext}` : "",
          `Nueva instrucción del usuario (Reel Educativo): ${prompt}`
        ].join("\n")
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: responseSchema
    }
  };

  const data = await authFetchJson("/api/gemini/generate", {
    method: "POST",
    body: JSON.stringify({
      model: els?.scriptModelSelect?.value || "gemini-2.5-flash",
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

  // Force single speaker properties to align perfectly with Reel requirements
  let normalized = window.normalizeScriptPayload?.(script, {
    session: sessionSnapshot,
    videoMode: false,
    hosts: [primarySpeaker],
    skipOptimize: true
  }) || script;

  normalized = forceSingleSpeakerOnReel(normalized, primarySpeaker);

  if (window.applyScriptGenerationConstraints) {
    normalized = window.applyScriptGenerationConstraints(normalized, safeConstraints, sessionSnapshot);
  }

  normalized = {
    ...normalized,
    rows: (normalized?.rows || []).map((row, index) => {
      const estimatedDuration = Math.max(6, Math.min(12, Math.round((row?.text || "").split(/\s+/).filter(Boolean).length / 3.2)));
      return {
        ...row,
        speaker: primarySpeaker,
        durationSec: Number(row?.durationSec) || estimatedDuration,
        mediaCue: window.MEDIA_CUES?.includes(row?.mediaCue) ? row.mediaCue : "Sin media",
        expression: window.EXPRESSIONS?.includes(row?.expression) ? row.expression : "Enérgico"
      };
    })
  };

  return {
    ...normalized,
    episodeTitle: String(normalized?.episodeTitle || `Reel: ${prompt.slice(0, 30)}`).trim(),
    summary: String(normalized?.summary || "Reel educativo dinámico de un solo presentador.").trim()
  };
}

export async function buildReelPodcastScriptFromPromptTable(prompt = "", session = null, constraints = null) {
  const resolvedConstraints = window.normalizeGenerationConstraints?.({
    ...(constraints && typeof constraints === "object" ? constraints : {}),
    videoMode: false
  }) || { hosts: ["Host A"] };

  const resolvedHosts = Array.isArray(resolvedConstraints?.hosts) && resolvedConstraints.hosts.length
    ? resolvedConstraints.hosts
    : (window.getSpeakerOptions?.(session) || ["Host A"]);
  const primarySpeaker = resolvedHosts[0] || "Host A";

  const schema = window.buildScriptGenerationResponseSchema?.({ videoMode: false }) || { type: "object" };

  const systemInstruction = [
    "Eres un experto productor de Reels educativos de alta retención.",
    "El usuario te proporcionará un texto que contiene una tabla o una idea para estructurar un Reel.",
    "Tu tarea es extraer o generar una estructura de Reel educativo y devolver un JSON válido siguiendo el esquema.",
    "DEBES imitar el estilo apasionado, entusiasta y veloz de divulgadores de YouTube como Derivando, con explicaciones muy visuales basadas en ejemplos cotidianos.",
    `REGLA OBLIGATORIA DE LOCUTOR ÚNICO: Todo el guion debe pertenecer a un solo locutor: "${primarySpeaker}". Prohibido usar más de una voz en la columna 'speaker'.`,
    `En la columna speaker usa únicamente el ID exacto: "${primarySpeaker}".`,
    "El campo visualNotes debe describir con precisión al presentador de frente en la zona central de la pantalla (formato vertical, plano medio), haciendo contacto visual directo y constante con el lente de la cámara, acompañado de ademanes enérgicos de explicación y recursos gráficos/overlays flotando a sus lados que él señala activamente.",
    "El campo scenePrompt debe describir de forma consistente un escenario moderno de YouTuber (luces LED de colores, fondo abstracto) con el presentador posicionado frontalmente en el centro del encuadre, mirando fijamente al lente de la cámara.",
    "Si faltan tiempos (durationSec), asume entre 6 y 10 segundos por fila para un dinamismo óptimo.",
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
      model: els?.scriptModelSelect?.value || "gemini-2.5-flash",
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

  let normalized = window.normalizeScriptPayload?.(script, {
    session,
    videoMode: false,
    hosts: [primarySpeaker],
    skipOptimize: true
  }) || script;

  normalized = forceSingleSpeakerOnReel(normalized, primarySpeaker);

  normalized = {
    ...normalized,
    rows: (normalized?.rows || []).map(row => ({
      ...row,
      speaker: primarySpeaker,
      expression: window.EXPRESSIONS?.includes(row?.expression) ? row.expression : "Enérgico",
      mediaCue: window.MEDIA_CUES?.includes(row?.mediaCue) ? row.mediaCue : "Sin media"
    }))
  };

  const topic = window.trimWords?.(String(normalized?.rows?.[0]?.text || "Reel desde tabla"), 8) || "Reel desde tabla";

  return {
    ...normalized,
    episodeTitle: `Reel desde tabla: ${topic}`,
    summary: "Reel educativo estructurado a partir de la entrada del usuario."
  };
}

// Bind to window for global access
window.buildReelPodcastSystemInstruction = buildReelPodcastSystemInstruction;
window.buildReelPodcastContextualInstructions = buildReelPodcastContextualInstructions;
window.generateReelPodcastScript = generateReelPodcastScript;
window.buildReelPodcastScriptFromPromptTable = buildReelPodcastScriptFromPromptTable;
