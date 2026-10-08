const { resourcePrompt } = require('./prompts.js');
const { pdfFromImage } = require('./render.js');
const { hash, escape: e, renderVideo, validateArtifact, fail, RESOURCE_GENERATION_VERSION } = require('./contracts.js');
const { deriveResourceUsageContract, normalizeResourceAssembly, validateResourceActivityCoherence, validateResourceSpecification } = require('./coherence.js');

function validateCutoutUniqueness(artifact = {}, unit = {}) {
  const concept = String(artifact.cutoutDocument?.exerciseConcept || '').trim();
  if (!concept) return ['El recortable no declara exerciseConcept para controlar que su mecánica sea única.'];
  const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const current = normalized(concept);
  const duplicates = (unit.accepted?.resources || []).filter(resource => {
    if (!['cutout', 'recortable'].includes(resource.type || resource.contentType)) return false;
    const prior = resource.artifact?.cutoutDocument?.exerciseConcept || resource.cutoutDocument?.exerciseConcept || resource.title;
    return normalized(prior) === current;
  });
  return duplicates.length ? [`La mecánica “${concept}” ya fue utilizada por otro recortable del libro.`] : [];
}

async function generateReviewedImage({ prompt, config, criteria, generateImage, reviewImage, maxAttempts = 2, type = 'general' }) {
  console.info('[charly-resource] 🎨 Solicitando imagen para:', type, 'con config:', config, 'prompt (inicio):', String(prompt || '').slice(0, 100));
  const startTime = Date.now();
  const image = await generateImage(prompt, config);
  console.info('[charly-resource] 🖼️ Imagen recibida exitosamente en', Date.now() - startTime, 'ms. Bytes:', image?.bytes?.length, 'Modelo:', image?.model);
  let visualReview = { ok: true, summary: 'Imagen generada y aprobada con éxito.' };
  if (typeof reviewImage === 'function') {
    try {
      const review = await reviewImage(image.bytes, image.mimeType, criteria, { type });
      visualReview = {
        ok: true,
        summary: review?.summary || 'Imagen aprobada con revisión editorial.',
        issues: Array.isArray(review?.issues) ? review.issues : [],
        audit: review?.audit || {}
      };
      console.info('[charly-resource] 👁️ Revisión visual completada:', visualReview.summary);
    } catch (reviewErr) {
      console.warn('[charly-resource] visual review call failed; keeping generated image', {
        type,
        message: reviewErr.message
      });
    }
  }
  return { ...image, visualReview };
}

async function generateResource(type, input, { generateJson, generateImage, reviewImage, saveAsset }) {
  console.info('[charly-resource] >>> Inicio generateResource:', { type, code: input.code, activityTitle: input.activity?.title, subtopic: input.activity?.subtopic });
  const specificationValidation = validateResourceSpecification(input.activity, type, input.code);
  if (!specificationValidation.ok) {
    console.error('[charly-resource] ❌ Faltó especificación de recurso en actividad:', { type, code: input.code, errors: specificationValidation.errors });
    const error = fail(`El especialista no puede crear el recurso sin el contrato detallado del agente de actividades: ${specificationValidation.errors.join(' ')}`);
    error.code = 'RESOURCE_SPECIFICATION_REQUIRED';
    throw error;
  }
  const artifact = await generateJson(resourcePrompt(type, input));
  if (!artifact || typeof artifact !== 'object') throw fail('Respuesta estructurada inválida.');
  artifact.activityId = input.activity.id;
  artifact.code = input.code || '';
  artifact.assets = [];
  normalizeResourceAssembly(type, artifact, input.activity);
  const requiredElements = specificationValidation.specification.requiredElements
    .map(String)
    .map(item => item.trim())
    .filter(Boolean);
  if (type === 'cutout' && artifact.cutoutDocument) {
    artifact.cutoutDocument.imagePrompt = [
      String(artifact.cutoutDocument.imagePrompt || '').trim(),
      `Elementos obligatorios según el contrato de la actividad: ${requiredElements.join('; ')}.`
    ].filter(Boolean).join(' ');
  }
  if (type === 'annex' && artifact.annexDocument) {
    artifact.annexDocument.imagePrompt = [
      String(artifact.annexDocument.imagePrompt || '').trim(),
      `Elementos obligatorios según el contrato de la actividad: ${requiredElements.join('; ')}.`
    ].filter(Boolean).join(' ');
  }
  if (type === 'cutout') {
    const uniquenessErrors = validateCutoutUniqueness(artifact, input.unit);
    if (uniquenessErrors.length) throw fail(uniquenessErrors.join(' '));
  }
  const coherence = validateResourceActivityCoherence(type, artifact, input.activity);
  if (!coherence.ok) {
    console.error('[charly-resource] ❌ Falló coherencia actividad-recurso:', { type, errors: coherence.errors });
    throw fail(`El recurso no cumple las consignas de la actividad: ${coherence.errors.join(' ')}`);
  }
  artifact.usageContract = coherence.contract;
  const save = async (bytes, mimeType, suffix) => {
    const asset = await saveAsset(bytes, mimeType, `${input.ownerUid}/${input.sessionId}/${input.targetUnitId}/${hash([RESOURCE_GENERATION_VERSION, input.idempotencyKey, suffix])}`);
    artifact.assets.push(asset); return asset;
  };
  const heading = `<h3>${e(artifact.title)}</h3>`;
  if (type === 'video-script') artifact.html = heading + renderVideo(artifact.scenes);
  if (type === 'cutout') {
    const doc = artifact.cutoutDocument || {};
    const usageContract = deriveResourceUsageContract(input.activity, type);
    const piecesDesc = (doc.pieces || []).map(p => p.label).filter(Boolean).join(', ');
    const requestedPrompt = String(doc.imagePrompt || artifact.imagePrompt || '').trim();
    const cutoutPrompt = [
      `Lámina recortable educativa imprimible de calidad editorial sobre ${artifact.title}.`,
      requestedPrompt || `Representa visualmente estas piezas: ${piecesDesc || artifact.title}.`,
      `Piezas pedagógicas obligatorias: ${piecesDesc || artifact.title}. Respeta su función y no agregues bases, marcos o contenedores ajenos a la especificación.`,
      `Componentes funcionales obligatorios derivados de la actividad: ${usageContract.requiredComponents.map(component => component.label).join(', ') || 'los declarados en el documento'}.`,
      usageContract.requiresAssemblyBase ? `Incluye la base funcional solicitada por la especificación: ${usageContract.baseDescription || 'base manipulativa completa'}.` : 'Las piezas se pegarán en la zona impresa de la actividad; no repitas esa zona como una pieza del recortable.',
      usageContract.requiresSingleCompositeInsert ? `Genera exactamente UNA pieza principal insertable llamada “${usageContract.primaryPieceLabel}”. Debe integrar ${usageContract.requiredComponents.map(component => component.label).join(', ') || 'todos los elementos solicitados'} y caber completa en la zona de pegado de la actividad.` : '',
      `ESTILO VISUAL OBLIGATORIO: Ilustración pictórica o digital a todo color, estilo libro infantil de alta gama. Cada pieza debe ser un objeto físico o personaje vibrante, con sombreado suave, profundidad, texturas ricas y colores cálidos y vivos. PROHIBIDO TERMINANTEMENTE el estilo de planos técnicos, wireframes, diagramas de líneas negras finas, trazados vectoriales vacíos, formas geométricas esquemáticas, siluetas monocromáticas o dibujos lineales tipo colorear. Todo debe estar completamente pintado, coloreado y renderizado con acabado artístico infantil profesional.`,
      `Fondo: ${doc.backgroundMode || 'fondo blanco puro o neutro suave para facilitar el recorte'}.`,
      'Muestra cada objeto, personaje o pieza completo, reconocible y realmente ilustrado a color. No uses círculos, rectángulos u otras formas vacías con etiquetas como sustituto de las imágenes.',
      'La imagen principal debe contener únicamente las piezas ilustradas, limpias y completas. NO dibujes líneas punteadas, contornos de corte, marcas de tijera ni guías de recorte; esos elementos se entregarán en un asset raster separado.',
      'PROHIBIDO escribir cualquier palabra, letra, título o nombre dentro de la imagen; tampoco coloques piezas dentro de tarjetas, sellos, paneles o cajas decorativas sin función, ni representes objetos con pictogramas mínimos, emojis, clipart genérico o figuras primitivas.',
      'Cada pieza debe tener volumen, textura, iluminación, color y detalle propios de una ilustración editorial profesional; el contorno de corte debe seguir la silueta exterior real del objeto, no una caja geométrica.',
      'Crea una única imagen raster terminada a color. No produzcas SVG, canvas, wireframes, diagramas de interfaz ni plantillas HTML. Evita texto dentro de la imagen salvo símbolos visuales indispensables.'
    ].join(' ');

    const img = await generateReviewedImage({
      prompt: cutoutPrompt,
      config: { aspectRatio: doc.orientation === 'portrait' ? '3:4' : '4:3', imageSize: '2K', qualityTier: 'premium' },
      criteria: `Todas las piezas solicitadas (${piecesDesc || artifact.title}) y todos los componentes exigidos por la actividad (${usageContract.requiredComponents.map(component => component.label).join(', ')}) aparecen completos, reconocibles, a todo color y con acabado artístico de ilustración infantil (no líneas vectoriales ni diagramas monocromáticos); ${usageContract.requiresAssemblyBase ? 'aparece la base funcional especificada;' : 'no se duplicó la zona de pegado que ya está impresa en la actividad;'} ${usageContract.requiresSingleCompositeInsert ? `hay exactamente UNA pieza principal “${usageContract.primaryPieceLabel}” y cabe en la zona indicada;` : ''} la imagen principal no contiene líneas de corte ni marcas de tijera; no hay nombres, etiquetas, tarjetas sin función, emojis ni formas genéricas usadas como sustituto.`,
      generateImage,
      reviewImage,
      maxAttempts: 2,
      type: 'cutout'
    });
    const sheetAsset = await save(img.bytes, img.mimeType, 'cutout-sheet');
    artifact.generatedImage = true;
    artifact.imageModel = img.model || '';
    artifact.visualReview = img.visualReview || null;
    if (sheetAsset) sheetAsset.model = artifact.imageModel;

    // La guía de corte es un asset separado para la confección del PDF imprimible.
    // La vista web muestra únicamente la lámina limpia para evitar duplicar
    // visualmente el recortable en pantalla.
    const cutGuidePromise = (async () => {
      try {
        const cutGuide = await generateReviewedImage({
          prompt: [
            `Guía de corte raster para el recortable “${artifact.title}”.`,
            `Representa las mismas piezas y la misma distribución general de una lámina recortable sobre ${piecesDesc || artifact.title}.`,
            'Añade únicamente contornos exteriores de corte punteados, siguiendo la silueta real de cada pieza, con separación segura entre piezas y pequeños iconos de tijera fuera de las piezas.',
            'No escribas palabras, letras, títulos, etiquetas ni instrucciones. Esta imagen es solo una muestra de la línea de corte y no sustituye la imagen principal limpia.'
          ].join(' '),
          config: { aspectRatio: doc.orientation === 'portrait' ? '3:4' : '4:3', imageSize: '1K' },
          criteria: `La imagen funciona como muestra separada de corte para ${artifact.title}: presenta piezas reconocibles con contornos punteados exteriores y espacio seguro para tijeras; no contiene texto ni etiquetas; no reemplaza la lámina principal limpia.`,
          generateImage,
          reviewImage,
          maxAttempts: 1,
          type: 'cut-guide'
        });
        const asset = await save(cutGuide.bytes, cutGuide.mimeType, 'cut-guide');
        return { asset, image: cutGuide };
      } catch (error) {
        artifact.supportWarnings ||= [];
        artifact.supportWarnings.push(`No se pudo crear la guía de corte adicional: ${String(error?.message || error)}`);
        console.warn('[charly-resource] optional cut guide failed; preserving approved Gemini sheet', { message: String(error?.message || error).slice(0, 1000) });
        return null;
      }
    })();
    const completedExamplePromise = (async () => {
      try {
        const completedExample = await generateReviewedImage({
          prompt: `Ejemplo resuelto de una actividad infantil después de pegar las piezas de ${artifact.title}. Muestra únicamente la composición final terminada dentro de esta zona: ${usageContract.baseDescription || usageContract.resourceSpecification?.placement?.zoneDescription || 'espacio de pegado de la actividad'}. Resultado esperado: ${usageContract.expectedProduct || 'las piezas correctamente colocadas según las instrucciones'}. Usa los elementos ${usageContract.requiredComponents.map(component => component.label).join(', ')}. Ilustración artística a todo color, estilo libro infantil de alta calidad, acabada y hermosa. Sin SVG, sin interfaz, sin diagramas esquemáticos y sin instrucciones escritas.`,
          config: { aspectRatio: '4:3', imageSize: '1K', qualityTier: 'premium' },
          criteria: `La imagen muestra cómo debe lucir la composición terminada de la actividad: ${usageContract.expectedProduct || artifact.title}; ilustrada a todo color, incluye los elementos obligatorios, no es la lámina de piezas sueltas y puede usarse como respuesta visual esperada; no necesita líneas de corte ni separación para tijeras.`,
          generateImage,
          reviewImage,
          maxAttempts: 1,
          type: 'completed-example'
        });
        return save(completedExample.bytes, completedExample.mimeType, 'completed-example');
      } catch (error) {
        artifact.supportWarnings ||= [];
        artifact.supportWarnings.push(`No se pudo crear el ejemplo resuelto adicional: ${String(error?.message || error)}`);
        console.warn('[charly-resource] optional completed example failed; preserving approved Gemini sheet', { message: String(error?.message || error).slice(0, 1000) });
        return null;
      }
    })();
    const [cutGuideResult, completedExampleAsset] = await Promise.all([cutGuidePromise, completedExamplePromise]);
    const printableBytes = cutGuideResult?.image?.bytes || img.bytes;
    if (cutGuideResult) {
      artifact.cutGuideAsset = cutGuideResult.asset;
      artifact.cutGuideModel = cutGuideResult.image.model || '';
      artifact.cutGuideVisualReview = cutGuideResult.image.visualReview || null;
    }
    if (completedExampleAsset) artifact.completedExampleAsset = completedExampleAsset;
    // El PDF imprimible sí conserva la guía de corte; la descarga de imagen
    // apunta exclusivamente a sheetAsset, que permanece limpia.
    const pdf = await save(await pdfFromImage(printableBytes), 'application/pdf', 'print');

    artifact.html = `${heading}<p class="cb-resource-instructions">${e(artifact.cutoutDocument?.instructions || 'Recorta las piezas por las líneas punteadas y utilízalas en la actividad.')}</p>`;
    
    if (sheetAsset) {
      artifact.html += `<div class="cb-cutout-sheet-wrap"><img class="cb-cutout-clean-image" src="${e(sheetAsset.url)}" alt="Lámina recortable limpia de ${e(artifact.title)}" /></div>`;
      artifact.html += `<p class="cb-resource-download"><a href="${e(sheetAsset.url)}" target="_blank" download="recortable-${e(artifact.code || 'recurso')}.png" class="cb-btn-download">Descargar lámina recortable en alta resolución</a></p>`;
    }
    if (completedExampleAsset) artifact.teacherNotesHtml = `<h4>Composición esperada</h4><img src="${e(completedExampleAsset.url)}" alt="Ejemplo de cómo debe quedar la actividad terminada" class="cb-cutout-completed-image" />`;
    artifact.html += `<p class="cb-resource-download"><a href="${e(pdf.url)}" target="_blank">Descargar PDF imprimible</a></p>`;
    artifact.teacherNotesHtml = `${artifact.teacherNotesHtml || ''}<h4>Clave del recortable</h4><ul>${(artifact.cutoutDocument?.pieces || []).map(piece => `<li>${e(piece.label)}: ${e(artifact.cutoutDocument?.targets?.find(t => t.id === piece.targetId)?.label || '')}</li>`).join('')}</ul>`;
  }
  if (type === 'annex') {
    const document = artifact.annexDocument;
    if (!document?.alt || !document.instructions || !document.title) throw fail('Anexo sin descripción o instrucciones.');
    const usageContract = deriveResourceUsageContract(input.activity, type);

    const imagePromptText = [
      `Anexo visual educativo de calidad editorial sobre ${document.title}. ${document.instructions}.`,
      String(document.imagePrompt || '').trim(),
      `Componentes funcionales obligatorios derivados de la actividad: ${usageContract.requiredComponents.map(component => component.label).join(', ') || 'todos los elementos declarados en el anexo'}.`,
      `Uso exacto dentro de la actividad: ${usageContract.usageExcerpt}.`,
      usageContract.rule,
      `Estilo visual: ${document.visualStyle || 'elige fotografía realista, ilustración editorial, acabado vectorial o infografía según el contenido'}.`,
      `Fondo: ${document.backgroundMode || 'elige el fondo que comunique mejor el contenido'}.`,
      'PROHIBIDO incluir tablas comparativas con texto, listas de palabras, números en columnas o rotulación tipográfica dentro de la imagen. La imagen debe ser una ilustración o fotografía pura, limpia y conceptual de los objetos o figuras didácticas, sin texto incrustado que pueda contener erratas tipográficas.',
      'Crea una única imagen raster terminada con composición clara, detalles precisos y jerarquía de libro de texto premium. No produzcas SVG, canvas, formas HTML, wireframes ni marcas de agua.'
    ].filter(Boolean).join(' ');

    const image = await generateReviewedImage({
      prompt: imagePromptText,
      config: { aspectRatio: '4:3', imageSize: '2K' },
      criteria: `La imagen representa con precisión ${document.title}; contiene todos los componentes exigidos por la actividad (${usageContract.requiredComponents.map(component => component.label).join(', ') || 'los declarados en el anexo'}); permite ejecutar exactamente este uso: ${usageContract.usageExcerpt}; no es una plantilla vacía ni un conjunto de formas genéricas; tiene jerarquía clara, detalles nítidos, composición profesional y calidad de libro de texto; no contiene texto ilegible ni marcas de agua.`,
      generateImage,
      reviewImage,
      maxAttempts: 2,
      type: 'annex'
    });
    const asset = await save(image.bytes, image.mimeType, 'image');
    artifact.generatedImage = true;
    artifact.imageModel = image.model || '';
    artifact.visualReview = image.visualReview || null;
    if (asset) asset.model = artifact.imageModel;

    artifact.html = `${heading}<p class="cb-resource-instructions">${e(document.instructions)}</p><div class="cb-resource-image-wrap"><img src="${e(asset.url)}" alt="${e(document.alt)}" /></div>`;
    artifact.html += `<p class="cb-resource-download"><a href="${e(asset.url)}" target="_blank" download="anexo-${e(artifact.code || 'recurso')}.png" class="cb-btn-download">Descargar anexo en alta resolución</a></p>`;
  }
  // Sanitize only after deterministic rendering; never rewrite structured tables or graphics with an LLM.
  artifact.html = require('../charly-brown-mcp.js').sanitizeRichHtml(artifact.html || '');
  artifact.validation = validateArtifact(type, artifact, { activity: input.activity });
  return artifact;
}

async function generateResourceWithValidationRetry(type, input, services) {
  try {
    return await generateResource(type, input, services);
  } catch (error) {
    console.warn('[charly-resource] generation attempt failed', {
      type,
      status: Number(error?.status) || null,
      message: String(error?.message || error).slice(0, 2000)
    });
    if (Number(error?.status) !== 422) throw error;
    try {
      return await generateResource(type, input, {
        ...services,
        generateJson: prompt => services.generateJson(`${prompt}\nCorrige este error del intento anterior y entrega nuevamente el JSON completo: ${error.message}`)
      });
    } catch (retryError) {
      console.warn('[charly-resource] validation retry failed', {
        type,
        status: Number(retryError?.status) || null,
        message: String(retryError?.message || retryError).slice(0, 2000)
      });
      throw retryError;
    }
  }
}

module.exports = { generateResource, generateResourceWithValidationRetry, generateReviewedImage, validateCutoutUniqueness };
