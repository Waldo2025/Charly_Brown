// Presets del editor: Gemini recibe estas indicaciones en lenguaje natural.
const DIRECTION_PRESETS = {
  stylePrompt: [
    ["", "Natural (automático)"],
    ["Use a warm, friendly and conversational delivery.", "Cálida y cercana"],
    ["Use a calm, clear and informative documentary narration.", "Documental"],
    ["Use a clear, professional and informative newsreader delivery.", "Informativa"],
    ["Use an expressive storytelling delivery, without exaggeration.", "Narrativa expresiva"],
    ["Use an upbeat and energetic delivery with clear articulation.", "Enérgica"],
    ["Use a serious and composed delivery.", "Seria"],
    ["Use a gentle and reassuring delivery.", "Suave y tranquila"],
    ["Use a professional, composed and confident delivery.", "Profesional y sobria"],
    ["Explain with a patient, clear teaching tone, emphasizing key ideas.", "Didáctica"],
    ["Use a helpful instructional tone with clearly separated steps.", "Tutorial paso a paso"],
    ["Use a relaxed, engaging podcast host delivery.", "Podcast conversacional"],
    ["Use an attentive, conversational interview tone.", "Entrevista"],
    ["Use an engaging audiobook narration with subtle emotional expression.", "Audiolibro"],
    ["Use a warm, playful storytelling tone suitable for children, with clear diction.", "Cuento infantil"],
    ["Use a soft, soothing bedtime storytelling tone.", "Cuento para dormir"],
    ["Use a lyrical, expressive spoken poetry delivery; do not sing.", "Poética"],
    ["Use a dramatic theatrical delivery with expressive intonation.", "Teatral"],
    ["Use a grand, inspiring and cinematic narration.", "Épica"],
    ["Use a restrained suspenseful delivery that builds anticipation.", "Suspenso"],
    ["Use an intriguing and quietly mysterious storytelling tone.", "Misteriosa"],
    ["Use a cheerful, bright and optimistic delivery.", "Alegre"],
    ["Use an enthusiastic and excited delivery with clear diction.", "Entusiasta"],
    ["Use an encouraging, uplifting and motivating delivery.", "Motivadora"],
    ["Use an empathetic, understanding and compassionate tone.", "Empática"],
    ["Use a thoughtful, introspective and contemplative delivery.", "Reflexiva"],
    ["Use a gentle, nostalgic and wistful delivery.", "Nostálgica"],
    ["Use a subdued, sad delivery consistent with the text.", "Triste"],
    ["Use an inquisitive, interested and curious tone.", "Curiosa"],
    ["Use a surprised and amazed tone consistent with the text.", "Sorprendida"],
    ["Use a concerned and cautious tone consistent with the text.", "Preocupada"],
    ["Use an urgent, focused and decisive delivery while staying intelligible.", "Urgente"],
    ["Use a firm, assertive and confident delivery without shouting.", "Firme y asertiva"],
    ["Use a light, amused and playful delivery.", "Humorística"],
    ["Use a subtle ironic delivery consistent with the text.", "Irónica"],
    ["Use a dry, sarcastic delivery consistent with the text.", "Sarcástica"],
    ["Whisper softly while keeping every word intelligible.", "Susurrada"],
    ["Use a deliberately robotic, even and mechanical delivery.", "Robótica"],
    ["Use an expressive vintage radio announcer delivery.", "Radio clásica"],
    ["Use a persuasive, polished advertising delivery without exaggeration.", "Publicitaria"]
  ],
  pacingPrompt: [
    ["", "Natural (automático)"],
    ["Speak slowly and clearly, with natural sentence pauses.", "Lento y claro"],
    ["Speak at a moderate conversational pace, with natural sentence pauses.", "Conversacional"],
    ["Speak briskly while keeping clear articulation and natural sentence pauses.", "Ágil"],
    ["Use brief pauses between sentences.", "Pausas breves"],
    ["Use deliberate pauses between sentences.", "Pausas marcadas"],
    ["Speak very slowly with clear articulation and unhurried sentence pauses.", "Muy lento"],
    ["Use an unhurried, reflective pace with breathing room between ideas.", "Pausado y reflexivo"],
    ["Maintain a steady, moderate pace throughout the narration.", "Moderado y uniforme"],
    ["Speak quickly while keeping every word intelligible.", "Rápido y claro"],
    ["Speak very rapidly while preserving intelligibility.", "Muy rápido"],
    ["Use a relaxed pace without rushing sentence endings.", "Sin prisas"],
    ["Use a flowing, continuous delivery with minimal natural sentence pauses.", "Fluido y continuo"],
    ["Clearly separate sentences with audible natural pauses.", "Frases bien separadas"],
    ["Pause when moving from one idea to the next.", "Pausas entre ideas"],
    ["Use longer pauses between sentences without excessive silence.", "Pausas largas"],
    ["Use expressive dramatic pauses before important revelations.", "Pausas dramáticas"],
    ["Let commas, periods and semicolons guide natural phrasing and pauses.", "Respeta la puntuación"],
    ["Separate list items with brief pauses and clearly distinguish each item.", "Enumeraciones claras"],
    ["Pause between instructional steps so each step is easy to follow.", "Pasos separados"],
    ["Slightly slow down and emphasize important words without changing the text.", "Énfasis en palabras clave"],
    ["Vary the pace naturally: measured for explanations and brisk for transitions.", "Ritmo dinámico"],
    ["Start at a measured pace and gradually become brisker toward the end.", "Inicio pausado, cierre ágil"],
    ["Begin briskly and gradually slow down toward the end.", "Inicio ágil, cierre pausado"],
    ["Use an easy-to-follow pace with clear phrase boundaries and natural pauses.", "Lectura accesible"],
    ["Use natural pauses and intonation to distinguish questions from statements.", "Preguntas bien marcadas"]
  ],
  accentPrompt: [
    ["", "Según el idioma y variante"],
    ["Use clear articulation and the natural accent of the selected language variant.", "Dicción clara"],
    ["Articulate each word precisely without exaggeration, preserving the selected language variant.", "Articulación precisa"],
    ["Use relaxed, natural conversational pronunciation in the selected language variant.", "Pronunciación conversacional"],
    ["Use polished broadcast diction in the selected language variant.", "Dicción de locutor"],
    ["Pronounce consonants clearly without making the delivery sound unnatural.", "Consonantes definidas"],
    ["Use clear vowel articulation consistent with the selected language variant.", "Vocales claras"],
    ["Keep word endings audible and clear in the selected language variant.", "Finales de palabra claros"],
    ["Use a subtle, natural accent consistent with the selected language variant; avoid caricature.", "Sin exagerar el acento"],
    ["Use careful, formal pronunciation consistent with the selected language variant.", "Lectura formal"]
  ]
};

// Los acentos regionales son solicitudes por prompt, no voces ni códigos de idioma adicionales.
const REGIONAL_ACCENT_PRESETS = {
  "es": [
    [
      "Use a natural Mexican Spanish accent with clear articulation.",
      "Español mexicano"
    ],
    [
      "Use a neutral Latin American Spanish accent with clear articulation.",
      "Español latinoamericano neutro"
    ],
    [
      "Use a natural Spanish accent from Spain with clear articulation.",
      "Español de España"
    ],
    [
      "Use a natural Argentinian Spanish accent with clear articulation.",
      "Español argentino"
    ],
    [
      "Use a natural Uruguayan Spanish accent with clear articulation.",
      "Español uruguayo"
    ],
    [
      "Use a natural Chilean Spanish accent with clear articulation.",
      "Español chileno"
    ],
    [
      "Use a natural Colombian Spanish accent with clear articulation.",
      "Español colombiano"
    ],
    [
      "Use a natural Peruvian Spanish accent with clear articulation.",
      "Español peruano"
    ],
    [
      "Use a natural Ecuadorian Spanish accent with clear articulation.",
      "Español ecuatoriano"
    ],
    [
      "Use a natural Venezuelan Spanish accent with clear articulation.",
      "Español venezolano"
    ],
    [
      "Use a natural Bolivian Spanish accent with clear articulation.",
      "Español boliviano"
    ],
    [
      "Use a natural Paraguayan Spanish accent with clear articulation.",
      "Español paraguayo"
    ],
    [
      "Use a natural Costa Rican Spanish accent with clear articulation.",
      "Español costarricense"
    ],
    [
      "Use a natural Panamanian Spanish accent with clear articulation.",
      "Español panameño"
    ],
    [
      "Use a natural Guatemalan Spanish accent with clear articulation.",
      "Español guatemalteco"
    ],
    [
      "Use a natural Salvadoran Spanish accent with clear articulation.",
      "Español salvadoreño"
    ],
    [
      "Use a natural Honduran Spanish accent with clear articulation.",
      "Español hondureño"
    ],
    [
      "Use a natural Nicaraguan Spanish accent with clear articulation.",
      "Español nicaragüense"
    ],
    [
      "Use a natural Cuban Spanish accent with clear articulation.",
      "Español cubano"
    ],
    [
      "Use a natural Dominican Spanish accent with clear articulation.",
      "Español dominicano"
    ],
    [
      "Use a natural Puerto Rican Spanish accent with clear articulation.",
      "Español puertorriqueño"
    ]
  ],
  "en": [
    [
      "Use a natural American English accent with clear articulation.",
      "Inglés estadounidense"
    ],
    [
      "Use a natural British English accent with clear articulation.",
      "Inglés británico"
    ],
    [
      "Use a natural Australian English accent with clear articulation.",
      "Inglés australiano"
    ],
    [
      "Use a natural Canadian English accent with clear articulation.",
      "Inglés canadiense"
    ],
    [
      "Use a natural Irish English accent with clear articulation.",
      "Inglés irlandés"
    ],
    [
      "Use a natural Scottish English accent with clear articulation.",
      "Inglés escocés"
    ],
    [
      "Use a natural Indian English accent with clear articulation.",
      "Inglés de India"
    ],
    [
      "Use a natural South African English accent with clear articulation.",
      "Inglés sudafricano"
    ],
    [
      "Use a natural New Zealand English accent with clear articulation.",
      "Inglés neozelandés"
    ]
  ],
  "pt": [
    [
      "Use a natural Brazilian Portuguese accent with clear articulation.",
      "Portugués brasileño"
    ],
    [
      "Use a natural European Portuguese accent with clear articulation.",
      "Portugués de Portugal"
    ]
  ],
  "fr": [
    [
      "Use a natural French from France accent with clear articulation.",
      "Francés de Francia"
    ],
    [
      "Use a natural Canadian French accent with clear articulation.",
      "Francés canadiense"
    ],
    [
      "Use a natural Belgian French accent with clear articulation.",
      "Francés belga"
    ],
    [
      "Use a natural Swiss French accent with clear articulation.",
      "Francés suizo"
    ]
  ],
  "de": [
    [
      "Use a natural German from Germany accent with clear articulation.",
      "Alemán de Alemania"
    ],
    [
      "Use a natural Austrian German accent with clear articulation.",
      "Alemán austríaco"
    ],
    [
      "Use a natural Swiss Standard German accent with clear articulation.",
      "Alemán suizo"
    ]
  ],
  "it": [
    [
      "Use a natural standard Italian accent with clear articulation.",
      "Italiano estándar"
    ],
    [
      "Use a natural northern Italian accent with clear articulation.",
      "Italiano del norte"
    ],
    [
      "Use a natural central Italian accent with clear articulation.",
      "Italiano del centro"
    ],
    [
      "Use a natural southern Italian accent with clear articulation.",
      "Italiano del sur"
    ]
  ]
};

export function getGeminiDirectionPresets(field, locale = "") {
  const presets = [...(DIRECTION_PRESETS[field] || [])];
  if (field === "accentPrompt") {
    const language = String(locale).toLowerCase().split("-")[0];
    presets.push(...(REGIONAL_ACCENT_PRESETS[language] || []));
  }
  return presets;
}
