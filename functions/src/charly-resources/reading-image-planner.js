const cleanText = (value, limit = 1200) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const cleanList = (value, limit = 12) => (Array.isArray(value) ? value : [])
  .map(item => cleanText(item, 240))
  .filter(Boolean)
  .slice(0, limit);

function readingImageBriefPrompt({ title = '', readingText = '', styleInstructions = '', grade = '' } = {}) {
  return `Actúa como director de arte especializado en libros escolares. Analiza la lectura y crea el contrato visual que usará otro agente de Gemini para producir UNA ilustración raster profesional.

LECTURA: ${cleanText(title, 180)}
GRADO: ${cleanText(grade, 80) || 'Primaria'}
TEXTO COMPLETO: ${cleanText(readingText, 9000)}
PREFERENCIAS EDITORIALES: ${cleanText(styleInstructions, 2500)}

Elige un solo momento narrativo representativo. La imagen debe ser una escena continua, sin collage, viñetas, recuadros, insertos, infografías ni paneles. No debe contener palabras, letras, números, rótulos, etiquetas, carteles legibles, marcas de agua ni firmas en ningún idioma. Si la escena contiene libros, empaques, pizarrones u hojas, sus superficies deben verse sin texto legible. Conserva la edad, acciones, relaciones espaciales, objetos y ambiente descritos por la lectura. No inventes hechos que cambien la historia.

Devuelve únicamente JSON válido con esta forma exacta:
{"sceneSummary":"","focalMoment":"","characters":[{"nameOrRole":"","ageAndAppearance":"","action":"","position":""}],"environment":"","requiredObjects":[""],"composition":"","cameraAndLighting":"","visualStyle":"","colorPalette":"","gradeAdaptation":"","forbiddenElements":[""],"negativePrompt":"","altText":""}`;
}

function normalizeReadingImageBrief(value = {}, fallback = {}) {
  const characters = (Array.isArray(value.characters) ? value.characters : []).map(character => ({
    nameOrRole: cleanText(character?.nameOrRole, 120),
    ageAndAppearance: cleanText(character?.ageAndAppearance, 260),
    action: cleanText(character?.action, 260),
    position: cleanText(character?.position, 180)
  })).filter(character => character.nameOrRole || character.action).slice(0, 10);
  const brief = {
    sceneSummary: cleanText(value.sceneSummary, 900),
    focalMoment: cleanText(value.focalMoment, 600),
    characters,
    environment: cleanText(value.environment, 700),
    requiredObjects: cleanList(value.requiredObjects),
    composition: cleanText(value.composition, 700),
    cameraAndLighting: cleanText(value.cameraAndLighting, 500),
    visualStyle: cleanText(value.visualStyle, 400),
    colorPalette: cleanText(value.colorPalette, 300),
    gradeAdaptation: cleanText(value.gradeAdaptation, 400),
    forbiddenElements: [...new Set([
      ...cleanList(value.forbiddenElements, 20),
      'texto visible o legible en cualquier idioma',
      'collage, viñetas, paneles, recuadros o insertos',
      'marcas de agua, firmas y logotipos'
    ])],
    negativePrompt: cleanText(value.negativePrompt, 900),
    altText: cleanText(value.altText, 300)
  };
  if (!brief.sceneSummary) brief.sceneSummary = cleanText(fallback.readingText, 700);
  if (!brief.focalMoment) brief.focalMoment = brief.sceneSummary;
  if (!brief.environment) brief.environment = 'Ambiente coherente con la lectura escolar.';
  if (!brief.composition) brief.composition = 'Una sola escena continua con foco narrativo claro y jerarquía editorial.';
  if (!brief.visualStyle) brief.visualStyle = 'Ilustración editorial infantil profesional con acabado raster detallado.';
  if (!brief.altText) brief.altText = `Ilustración de ${cleanText(fallback.title, 180) || 'la lectura'}`;
  return brief;
}

function validateReadingImageBrief(brief = {}) {
  const errors = [];
  for (const key of ['sceneSummary', 'focalMoment', 'environment', 'composition', 'visualStyle', 'altText']) {
    if (!cleanText(brief[key])) errors.push(`Falta ${key}.`);
  }
  if (/collage|viñet|panel|recuadro|inserto/i.test(brief.composition) && !/sin |no /i.test(brief.composition)) {
    errors.push('La composición propone paneles o insertos.');
  }
  return { ok: errors.length === 0, errors };
}

function readingImageGenerationPrompt({ title = '', brief = {} } = {}) {
  return [
    `Ilustración principal para la lectura escolar “${cleanText(title, 180)}”.`,
    `CONTRATO VISUAL AUTORIZADO: ${JSON.stringify(brief)}.`,
    'Representa exactamente ese contrato como UNA escena continua y natural, de borde a borde.',
    'No construyas collage, cuadrícula, historieta, viñetas, paneles, recuadros, insertos, tarjetas ni diagramas.',
    'No dibujes palabras, letras, números, etiquetas, títulos, carteles legibles, marcas de agua, firmas ni logotipos en ningún idioma.',
    'Si aparecen libros, empaques, pizarrones u hojas, mantenlos sin texto legible.',
    'Entrega una imagen raster terminada con composición, iluminación, profundidad, anatomía y detalle propios de un libro escolar profesional.',
    'Está prohibido producir SVG, canvas, formas HTML, pictogramas geométricos simples o wireframes.'
  ].join(' ');
}

function readingImageReviewCriteria({ title = '', brief = {} } = {}) {
  return `Comprueba la ilustración de “${cleanText(title, 180)}” contra este contrato visual: ${JSON.stringify(brief)}. Debe representar el momento, personajes, acciones, ambiente y objetos obligatorios; ser una única escena continua; no contener collage, viñetas, paneles, recuadros ni insertos; no contener texto, letras, números, etiquetas, carteles legibles, marcas de agua, firmas o logotipos en ningún idioma; y alcanzar calidad editorial profesional apropiada para el grado.`;
}

module.exports = {
  readingImageBriefPrompt,
  normalizeReadingImageBrief,
  validateReadingImageBrief,
  readingImageGenerationPrompt,
  readingImageReviewCriteria
};
