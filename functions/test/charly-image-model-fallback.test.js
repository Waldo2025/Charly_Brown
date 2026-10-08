const test = require('node:test');
const assert = require('node:assert/strict');
const {
  runtime,
  DEFAULT_IMAGE_MODEL_CHAIN,
  premiumImageModelChain,
  imageErrorStatus,
  imageConfigForModel
} = require('../src/charly-resources/runtime.js');

const imageResponse = () => ({
  candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('png').toString('base64'), mimeType: 'image/png' } }] } }]
});

test('image models are ordered from cheapest to most expensive', () => {
  assert.deepEqual(DEFAULT_IMAGE_MODEL_CHAIN, [
    'gemini-3.1-flash-lite-image',
    'gemini-3.1-flash-image',
    'gemini-3-pro-image'
  ]);
  assert.equal(imageConfigForModel(DEFAULT_IMAGE_MODEL_CHAIN[0], { imageSize: '2K' }).imageSize, '1K');
  assert.equal(imageConfigForModel(DEFAULT_IMAGE_MODEL_CHAIN[1], { imageSize: '2K' }).imageSize, '2K');
});

test('premium image generation skips the lite model for complex recortables', async () => {
  const calls = [];
  const client = { models: { generateContent: async request => {
    calls.push(request.model);
    return imageResponse();
  } } };
  const result = await runtime('gemini-3.5-flash-lite', { client }).generateImage('Recortable editorial', { qualityTier: 'premium', imageSize: '2K' });
  assert.equal(result.model, 'gemini-3.1-flash-image');
  assert.deepEqual(calls, ['gemini-3.1-flash-image']);
  assert.deepEqual(premiumImageModelChain(), ['gemini-3.1-flash-image', 'gemini-3-pro-image']);
});

test('image generation escalates only after quota exhaustion', async () => {
  const calls = [];
  const client = { models: { generateContent: async request => {
    calls.push(request.model);
    if (calls.length === 1) throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
    return imageResponse();
  } } };
  const result = await runtime('gemini-3.5-flash-lite', { client }).generateImage('Una escena escolar');
  assert.equal(result.model, 'gemini-3.1-flash-image');
  assert.deepEqual(calls, ['gemini-3.1-flash-lite-image', 'gemini-3.1-flash-image']);
});

test('image generation does not spend on a costlier model for non-quota errors', async () => {
  const calls = [];
  const client = { models: { generateContent: async request => {
    calls.push(request.model);
    throw Object.assign(new Error('INVALID_ARGUMENT'), { status: 400 });
  } } };
  await assert.rejects(() => runtime('gemini-3.5-flash-lite', { client }).generateImage('Una escena escolar'), /INVALID_ARGUMENT/);
  assert.deepEqual(calls, ['gemini-3.1-flash-lite-image']);
  assert.equal(imageErrorStatus({ status: 400, message: 'RESOURCE_EXHAUSTED' }), 400);
});

test('editorial review rejects raster images that hide pieces in cards or use generic icons', async () => {
  const client = { models: { generateContent: async () => ({
    text: JSON.stringify({
      ok: true,
      issues: [],
      audit: {
        allRequestedPiecesVisible: true,
        allPiecesDetailedAndRecognizable: false,
        allCutOutlinesFollowSilhouettes: false,
        hasPrintedPieceNamesOrLabels: false,
        hasGeometricCardsOrContainers: true,
        hasGenericIconsEmojiOrPrimitiveClipart: true,
        professionalEditorialQuality: false,
        safeScissorSpacing: true
      }
    })
  }) } };
  const review = await runtime('gemini-3.5-flash-lite', { client })
    .reviewImage(Buffer.from('image'), 'image/jpeg', 'Cada pieza debe ser una ilustración completa.');
  assert.equal(review.ok, false);
});

test('editorial review accepts only a complete passing audit', async () => {
  const client = { models: { generateContent: async () => ({
    text: JSON.stringify({
      ok: true,
      issues: [],
      audit: {
        allRequestedPiecesVisible: true,
        allActivityRequiredComponentsVisible: true,
        assemblyBasePresentWhenRequired: true,
        singleCompositeInsertWhenRequired: true,
        piecesFitAssemblyInstructions: true,
        allPiecesDetailedAndRecognizable: true,
        allCutOutlinesFollowSilhouettes: true,
        hasPrintedPieceNamesOrLabels: false,
        hasGeometricCardsOrContainers: false,
        hasGenericIconsEmojiOrPrimitiveClipart: false,
        professionalEditorialQuality: true,
        safeScissorSpacing: true
      }
    })
  }) } };
  const review = await runtime('gemini-3.5-flash-lite', { client })
    .reviewImage(Buffer.from('image'), 'image/jpeg', 'Cada pieza debe ser una ilustración completa.');
  assert.equal(review.ok, true);
});

test('structured resource planning retries malformed Gemini JSON', async () => {
  let calls = 0;
  const client = {
    models: {
      generateContent: async () => {
        calls += 1;
        return calls === 1 ? { text: '{"title":"truncado' } : { text: '{"title":"completo"}' };
      }
    }
  };
  const service = runtime('gemini-test', { client });
  assert.deepEqual(await service.generateJson('Crea un recurso.'), { title: 'completo' });
  assert.equal(calls, 2);
});

test('visual auditing retries malformed Gemini JSON without regenerating the resource', async () => {
  let calls = 0;
  const passingAudit = {
    ok: true, issues: [], summary: 'Aprobada', audit: {
      allRequestedPiecesVisible: true,
      allActivityRequiredComponentsVisible: true,
      assemblyBasePresentWhenRequired: true,
      singleCompositeInsertWhenRequired: true,
      piecesFitAssemblyInstructions: true,
      allPiecesDetailedAndRecognizable: true,
      allCutOutlinesFollowSilhouettes: true,
      hasPrintedPieceNamesOrLabels: false,
      hasGeometricCardsOrContainers: false,
      hasGenericIconsEmojiOrPrimitiveClipart: false,
      professionalEditorialQuality: true,
      safeScissorSpacing: true
    }
  };
  const service = runtime('gemini-test', { client: { models: { generateContent: async () => {
    calls += 1;
    return calls === 1 ? { text: '{"ok":true' } : { text: JSON.stringify(passingAudit) };
  } } } });
  assert.equal((await service.reviewImage(Buffer.from('image'), 'image/png', 'criterios')).ok, true);
  assert.equal(calls, 2);
});
