const { randomUUID } = require('node:crypto');
const { hash, RESOURCE_GENERATION_VERSION } = require('./contracts.js');
const {
  createVertexClient,
  buildVertexGenerateRequest,
  DEFAULT_IMAGE_MODEL,
  normalizeTextModel,
  DEFAULT_TEXT_MODEL,
  MARCIE_FALLBACK_MODELS
} = require('../vertex.js');
const { getAdminServices } = require('../common.js');
const DEFAULT_IMAGE_MODEL_CHAIN = Object.freeze([
  'gemini-3.1-flash-lite-image',
  DEFAULT_IMAGE_MODEL,
  'gemini-3-pro-image'
]);

function isRetryableTextError(error = {}) {
  const status = Number(error?.status || error?.code || error?.response?.status || 0);
  if ([408, 429, 500, 502, 503, 504].includes(status)) return true;
  const message = String(error?.message || error?.response?.data || error || '');
  return /INTERNAL|RESOURCE[_\s]?EXHAUSTED|UNAVAILABLE|Too Many Requests|quota|rate.?limit|overloaded|capacity|timeout|Internal error/i.test(message);
}

function textModelChain(initialModel) {
  const primary = normalizeTextModel(initialModel);
  const fallbacks = [...(MARCIE_FALLBACK_MODELS || []), 'gemini-3.5-flash', DEFAULT_TEXT_MODEL];
  return [...new Set([primary, ...fallbacks.map(normalizeTextModel)])];
}

const waitMs = (ms) => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));

function imageModelChain() {
  const configured = String(process.env.CHARLY_IMAGE_MODEL_CHAIN || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const legacy = String(process.env.CHARLY_IMAGE_MODEL || '').trim();
  return [...new Set([...(configured.length ? configured : DEFAULT_IMAGE_MODEL_CHAIN), legacy].filter(Boolean))];
}

function premiumImageModelChain() {
  const models = imageModelChain();
  const premium = models.filter(model => model !== 'gemini-3.1-flash-lite-image');
  return premium.length ? premium : models;
}

function imageErrorStatus(error = {}) {
  const direct = Number(error.status || error.code || error.response?.status || 0);
  if (direct > 0) return direct;
  const details = [error.message, error.response?.data, error.cause?.message]
    .filter(Boolean)
    .map(value => typeof value === 'string' ? value : JSON.stringify(value))
    .join(' ');
  return /RESOURCE_EXHAUSTED|quota|rate.?limit|too many requests/i.test(details) ? 429 : 0;
}

function imageConfigForModel(model, config = {}) {
  if (model === 'gemini-3.1-flash-lite-image') return { ...config, imageSize: '1K' };
  return config;
}

function extractCleanJson(raw = '') {
  let cleaned = String(raw || '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

function tryRepairTruncatedJson(str = '') {
  let s = extractCleanJson(str);
  try { return JSON.parse(s); } catch (_) {}
  const quoteCount = (s.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) s += '"';
  let openBraces = (s.match(/\{/g) || []).length;
  let closeBraces = (s.match(/\}/g) || []).length;
  while (closeBraces < openBraces) {
    s += '}';
    closeBraces++;
  }
  let openBrackets = (s.match(/\[/g) || []).length;
  let closeBrackets = (s.match(/\]/g) || []).length;
  while (closeBrackets < openBrackets) {
    s += ']';
    closeBrackets++;
  }
  try { return JSON.parse(s); } catch (_) { return null; }
}

function runtime(model, dependencies = {}) {
  const client = dependencies.client || createVertexClient({ location: 'global' });
  const generate = async (contents, generationConfig, selected = model) => {
    const models = textModelChain(selected);
    let lastError = null;
    for (let mIdx = 0; mIdx < models.length; mIdx += 1) {
      const candidateModel = models[mIdx];
      const maxAttempts = mIdx === 0 ? 2 : 1;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const req = buildVertexGenerateRequest({ model: candidateModel, payload: { contents, generationConfig } });
          return await client.models.generateContent(req);
        } catch (error) {
          lastError = error;
          if (!isRetryableTextError(error)) throw error;
          if (mIdx === models.length - 1 && attempt === maxAttempts) throw error;
          const delay = attempt * 600;
          console.warn('[charly-resource] Error transitorio en Vertex AI; reintentando:', {
            model: candidateModel,
            attempt,
            status: error.status || error.code,
            message: error.message,
            nextModel: attempt === maxAttempts ? models[mIdx + 1] : candidateModel
          });
          await waitMs(delay);
        }
      }
    }
    throw lastError;
  };
  const generateReviewedJson = async (contents, generationConfig, label) => {
    let parseError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await generate(contents, generationConfig);
      const raw = response.text || response.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || 'null';
      try {
        return JSON.parse(extractCleanJson(raw));
      } catch (error) {
        parseError = error;
        if (attempt === 3) {
          const repaired = tryRepairTruncatedJson(raw);
          if (repaired && typeof repaired === 'object') return repaired;
        }
        console.warn('[charly-resource] auditoría JSON inválida; reintentando', { label, attempt, message: error.message });
      }
    }
    throw Object.assign(parseError || new Error(`La auditoría ${label} no devolvió JSON válido.`), { status: 500 });
  };
  return {
    async cachedGeneration(type, input, generate) {
      const { bucket } = getAdminServices();
      const base = `charly-resources/${input.ownerUid}/${input.sessionId}/${input.targetUnitId}/operations/${hash([RESOURCE_GENERATION_VERSION, type, input.idempotencyKey, input.activity, input.unit, input.brief || ''])}`;
      const result = bucket.file(`${base}.json`), lock = bucket.file(`${base}.lock`);
      const readResult = async () => { try { const [bytes] = await result.download(); return JSON.parse(bytes.toString()); } catch (error) { if (Number(error.code) !== 404) throw error; return null; } };
      const cached = await readResult(); if (cached) return cached;
      let generation;
      try {
        await lock.save(JSON.stringify({ createdAt: Date.now() }), { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, contentType: 'application/json' });
        const [metadata] = await lock.getMetadata(); generation = metadata.generation;
      } catch (error) {
        if (Number(error.code) !== 412) throw error;
        const complete = await readResult(); if (complete) return complete;
        let metadata;
        try { [metadata] = await lock.getMetadata(); } catch (_) {}
        const lockAge = metadata?.timeCreated ? Date.now() - Date.parse(metadata.timeCreated) : 0;
        if (lockAge > 45000) {
          await lock.delete().catch(() => {});
        } else {
          throw Object.assign(new Error('El especialista todavía está generando este recurso.'), { status: 429, retryAfterSeconds: 5 });
        }
      }
      try {
        const artifact = await generate();
        await result.save(JSON.stringify(artifact), { resumable: false, contentType: 'application/json', preconditionOpts: { ifGenerationMatch: 0 } });
        return artifact;
      } finally { await lock.delete({ ifGenerationMatch: generation }).catch(() => {}); }
    },
    async generateJson(prompt) {
      let parseError = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const repair = attempt > 1
          ? `\nREINTENTO ${attempt}: la respuesta anterior quedó truncada o con JSON inválido (${parseError?.message || 'formato inválido'}). Devuelve ÚNICAMENTE un objeto JSON válido y conciso, cerrando todas las comillas y llaves, sin texto antes ni después.`
          : '';
        try {
          const response = await generate([{ role: 'user', parts: [{ text: `${prompt}${repair}` }] }], { responseMimeType: 'application/json', maxOutputTokens: 24000 });
          const raw = response.text || response.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || 'null';
          try {
            return JSON.parse(extractCleanJson(raw));
          } catch (error) {
            parseError = error;
            if (attempt === 3) {
              const repaired = tryRepairTruncatedJson(raw);
              if (repaired && typeof repaired === 'object') {
                console.warn('[charly-resource] JSON reparado exitosamente tras corte', { attempt });
                return repaired;
              }
            }
            console.warn('[charly-resource] JSON estructurado inválido; reintentando', { attempt, message: error.message });
          }
        } catch (apiError) {
          parseError = apiError;
          if (!isRetryableTextError(apiError) || attempt === 3) throw apiError;
          console.warn('[charly-resource] Reintento de llamada API por error transitorio', { attempt, message: apiError.message });
          await waitMs(attempt * 800);
        }
      }
      throw Object.assign(parseError || new Error('Gemini no devolvió JSON válido.'), { status: 500 });
    },
    async generateImage(prompt, { aspectRatio = '4:3', imageSize = '1K', qualityTier = 'standard' } = {}) {
      const models = qualityTier === 'premium' ? premiumImageModelChain() : imageModelChain();
      let lastError = null;
      for (let index = 0; index < models.length; index += 1) {
        const imageModel = models[index];
        const requestedConfig = imageConfigForModel(imageModel, { aspectRatio, imageSize });
        console.info('[charly-image] 🎨 Invocando modelo de imagen en Vertex:', {
          model: imageModel,
          qualityTier,
          imageSize: requestedConfig.imageSize,
          aspectRatio: requestedConfig.aspectRatio
        });
        try {
          const response = await generate(
            [{ role: 'user', parts: [{ text: `Material educativo profesional de alta resolución para niños y docentes de primaria/secundaria. Gráficos e imágenes reales, nítidos, coloridos y de alta calidad editorial. Sin letras, textos ilegibles, marcas de agua ni firmas. ${prompt}` }] }],
            { responseModalities: ['IMAGE'], imageConfig: requestedConfig },
            imageModel
          );
          const parts = response.candidates?.[0]?.content?.parts || [];
          let data = null;
          for (const p of parts) {
            if (p.inlineData?.data) { data = p.inlineData; break; }
            if (p.data && p.mimeType) { data = p; break; }
          }
          if (!data?.data) throw new Error('Vertex no entregó una imagen válida.');
          console.info('[charly-image] ✔ Imagen recibida exitosamente de Vertex:', { model: imageModel, byteLength: data.data.length });
          return { bytes: Buffer.from(data.data, 'base64'), mimeType: data.mimeType || 'image/png', model: imageModel };
        } catch (error) {
          lastError = error;
          console.error('[charly-image] ❌ Error en generación con modelo:', { model: imageModel, message: error.message, status: error.status || error.code });
          const quotaExhausted = imageErrorStatus(error) === 429;
          if (!quotaExhausted || index === models.length - 1) throw error;
          console.warn('[charly-image] cuota agotada; escalando al siguiente modelo', { from: imageModel, to: models[index + 1] });
        }
      }
      throw lastError || new Error('No fue posible generar la imagen.');
    },
    async reviewImage(bytes, mimeType, criteria, options = {}) {
      const criteriaStr = String(criteria || '');
      const isAnnex = options?.type === 'annex' || (/anexo|l[aá]mina visual|infograf|fotograf/i.test(criteriaStr) && !/recortable|piezas/i.test(criteriaStr));

      if (isAnnex) {
        const review = await generateReviewedJson([
          { role: 'user', parts: [
            { text: `Actúa como director de arte editorial escolar. Evalúa estrictamente la imagen educativa adjunta con estos criterios pedagógicos: ${criteriaStr}. Devuelve solo JSON con esta forma exacta: {"ok":true|false,"issues":["..."],"summary":"...","audit":{"faithfulToTopic":true|false,"requiredComponentsVisible":true|false,"professionalEditorialQuality":true|false,"hasUnreadableTextOrWatermarks":true|false}}. Marca ok=true si la imagen ilustra con calidad editorial el tema y sus componentes. IMPORTANTE: No rechaces la imagen por errores ortográficos en texto menor generado por IA o palabras accesorias si los conceptos visuales, figuras o ilustraciones principales son de calidad escolar adecuada. Marca ok=false únicamente si la imagen está completamente fuera de tema, faltan las figuras principales o tiene marcas de agua invasivas.` },
            { inlineData: { data: Buffer.from(bytes).toString('base64'), mimeType } }
          ] }
        ], { responseMimeType: 'application/json', maxOutputTokens: 1200 }, 'visual de anexo');
        const audit = review?.audit || {};
        const auditPassed = audit.professionalEditorialQuality !== false && audit.faithfulToTopic !== false;
        return { ...review, ok: Boolean((review?.ok ?? true) && auditPassed), audit };
      }

      const requiresBase = /aparece\s+la\s+base\s+funcional/i.test(criteriaStr);
      const requiresInsert = /exactamente\s+una\s+pieza\s+principal/i.test(criteriaStr);
      const cleanAsset = /(?:no|sin)\s+(?:contiene|incluye)?\s*(?:l[ií]neas?|contornos?|marcas?)\s+de\s+corte|sin\s+marcas?\s+de\s+tijera/i.test(criteriaStr);

      const review = await generateReviewedJson([
        { role: 'user', parts: [
          { text: `Actúa como director de arte editorial y auditor de material didáctico. Evalúa estrictamente la lámina recortable adjunta con estos criterios: ${criteriaStr}. Devuelve solo JSON con esta forma exacta: {"ok":true|false,"issues":["..."],"summary":"...","audit":{"allRequestedPiecesVisible":true|false,"allPiecesDetailedAndRecognizable":true|false,"professionalEditorialQuality":true|false,"hasGenericIconsEmojiOrPrimitiveClipart":true|false${requiresBase ? ',"assemblyBasePresent":true|false' : ''}${requiresInsert ? ',"singleCompositeInsertPresent":true|false' : ''}${!cleanAsset ? ',"allCutOutlinesFollowSilhouettes":true|false,"safeScissorSpacing":true|false' : ''}}}. Marca ok=true si las piezas se muestran ilustradas a color, completas y reconocibles para recortar y usar en la actividad escolar. Marca ok=false solo si las piezas son formas vacías sin ilustrar o si faltan las piezas principales.` },
          { inlineData: { data: Buffer.from(bytes).toString('base64'), mimeType } }
        ] }
      ], { responseMimeType: 'application/json', maxOutputTokens: 1200 }, 'visual de recortable');
      const audit = review?.audit || {};
      const requiredTrue = ['allRequestedPiecesVisible', 'allPiecesDetailedAndRecognizable', 'professionalEditorialQuality'];
      if (requiresBase) requiredTrue.push('assemblyBasePresent');
      if (requiresInsert) requiredTrue.push('singleCompositeInsertPresent');
      if (!cleanAsset) requiredTrue.push('allCutOutlinesFollowSilhouettes', 'safeScissorSpacing');
      const requiredFalse = ['hasGenericIconsEmojiOrPrimitiveClipart'];
      const auditPassed = requiredTrue.every(k => audit[k] !== false) && requiredFalse.every(k => audit[k] !== true);
      return { ...review, ok: Boolean((review?.ok ?? true) && auditPassed), audit };
    },
    async reviewReadingImage(bytes, mimeType, criteria) {
      const review = await generateReviewedJson([
        { role: 'user', parts: [
          { text: `Actúa como director de arte de libros escolares. Evalúa estrictamente la imagen adjunta con estos criterios: ${criteria}. Devuelve solo JSON con esta forma exacta: {"ok":true|false,"issues":["..."],"summary":"...","audit":{"sceneFaithful":true|false,"requiredCharactersActionsAndObjectsVisible":true|false,"singleContinuousScene":true|false,"hasVisibleTextLabelsOrNumbers":true|false,"hasPanelsInsetsCollageOrFrames":true|false,"professionalEditorialQuality":true|false,"ageAppropriate":true|false}}. Marca ok=false si cualquier elemento narrativo obligatorio está ausente, si aparece texto visible en cualquier idioma, si hay paneles, recuadros, insertos o collage, o si la calidad no corresponde a un libro escolar profesional.` },
          { inlineData: { data: Buffer.from(bytes).toString('base64'), mimeType } }
        ] }
      ], { responseMimeType: 'application/json', maxOutputTokens: 1200 }, 'visual de lectura');
      const audit = review?.audit || {};
      const requiredTrue = ['sceneFaithful', 'requiredCharactersActionsAndObjectsVisible', 'singleContinuousScene', 'professionalEditorialQuality', 'ageAppropriate'];
      const requiredFalse = ['hasVisibleTextLabelsOrNumbers', 'hasPanelsInsetsCollageOrFrames'];
      const auditComplete = [...requiredTrue, ...requiredFalse].every(key => typeof audit[key] === 'boolean');
      const auditPassed = auditComplete && requiredTrue.every(key => audit[key] === true) && requiredFalse.every(key => audit[key] === false);
      return { ...review, ok: review?.ok === true && auditPassed, audit };
    },
    async saveAsset(bytes, mimeType, key) {
      const { bucket } = getAdminServices();
      const storagePath = `charly-resources/${key}`; const file = bucket.file(storagePath);
      // A deterministic path makes retries reuse completed assets, including their download token.
      let metadata;
      try { [metadata] = await file.getMetadata(); } catch (error) { if (Number(error.code) !== 404) throw error; }
      const token = metadata?.metadata?.firebaseStorageDownloadTokens || randomUUID();
      if (!metadata) await file.save(bytes, { resumable: false, contentType: mimeType, metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
      return { storagePath, mimeType, url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}` };
    }
  };
}
module.exports = {
  runtime,
  DEFAULT_IMAGE_MODEL_CHAIN,
  imageModelChain,
  premiumImageModelChain,
  imageErrorStatus,
  imageConfigForModel,
  isRetryableTextError,
  textModelChain
};
