const test = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('node-html-parser');
const { renderVideo } = require('../src/charly-resources/contracts.js');
const { generateResource } = require('../src/charly-resources/generate.js');
const { createSpecialistServer, TOOL } = require('../src/charly-resources/server.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const scenes = [{ startSeconds: 0, endSeconds: 10, script: 'Observa el árbol.', sceneDescription: 'Un árbol en el patio.', inSceneText: 'El árbol', transition: 'Corte', visual: 'Plano general del árbol.' }];
const specification = (type, code) => ({
  type, code, mechanic: 'observación y clasificación', useInstruction: `Utiliza ${code}.`,
  studentAction: 'Observa, organiza y explica el resultado.', requiredElements: type === 'annex' ? ['jardín'] : ['árbol', 'jardín'],
  visualBrief: 'Ilustración editorial infantil de un árbol dentro de un jardín, clara y completa.',
  expectedProduct: 'Composición completa y correctamente organizada.',
  placement: type === 'cutout'
    ? { mode: 'paste-into-activity', baseProvidedBy: 'activity', zoneDescription: 'Zona de jardín impresa en la actividad.' }
    : { mode: 'consult-alongside-activity', baseProvidedBy: 'resource', zoneDescription: 'Recurso consultado junto a la actividad.' },
  ...(type === 'cutout' ? { piecePolicy: 'single-composite', primaryPiece: { label: 'Jardín completo', composite: true } } : {})
});
test('canonical script table maps directly into the real Snoopy parser', async () => {
  const { analyzeVideoTableHeader, normalizeEducationalVideoTableRows } = await import('../../public/podcaster/podcaster-video-table-mapping.js');
  const table = parse(renderVideo(scenes)); const rows = table.querySelectorAll('tr').map(r => r.querySelectorAll('th,td').map(c => c.text));
  const header = analyzeVideoTableHeader(rows[0]);
  assert.ok(header.isHeader); assert.ok(header.keys.includes('script')); assert.ok(header.keys.includes('sceneDescription')); assert.ok(header.keys.includes('visual'));
  const mapped = normalizeEducationalVideoTableRows(rows);
  assert.equal(mapped[0].script, scenes[0].script);
  assert.equal(mapped[0].sceneDescription, scenes[0].sceneDescription);
  assert.equal(mapped[0].visual, scenes[0].visual);
  assert.throws(() => renderVideo([{ ...scenes[0], endSeconds: -1 }]), /tiempos/);
});
test('cutouts require and publish a real raster sheet with a printable PDF', async () => {
  const sharp = require('sharp');
  const bytes = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#edf5ff' } }).png().toBuffer();
  const saved = [];
  let imageCalls = 0; let activeSupportingImages = 0; let maxSupportingImages = 0;
  const artifact = await generateResource('cutout', { code: 'Recortable 1a', activity: { id: 'a', html: '<div class="cb-cutout-paste-zone" data-resource-code="Recortable 1a"></div>', resourceSpecifications: [specification('cutout', 'Recortable 1a')] }, unit: {}, ownerUid: 'u', sessionId: 's', targetUnitId: 'unit', idempotencyKey: '1234567890123456' }, {
    generateJson: async () => ({ title: 'Mi jardín', cutoutDocument: { title: 'Mi jardín', exerciseConcept: 'insertar un jardín completo en su zona', instructions: 'Recorta las piezas.', orientation: 'portrait', pieces: [{ id: 'p1', label: 'Árbol', targetId: 't1' }], targets: [{ id: 't1', label: 'Jardín' }], imagePrompt: 'Árbol ilustrado con contorno de recorte' } }),
    generateImage: async () => {
      imageCalls += 1;
      if (imageCalls > 1) {
        activeSupportingImages += 1;
        maxSupportingImages = Math.max(maxSupportingImages, activeSupportingImages);
        await new Promise(resolve => setTimeout(resolve, 15));
        activeSupportingImages -= 1;
      }
      return { bytes, mimeType: 'image/png', model: 'gemini-3.1-flash-lite-image' };
    },
    reviewImage: async () => ({ ok: true, issues: [] }),
    saveAsset: async (_bytes, mimeType, key) => { const asset = { url: `https://example.test/${key}`, storagePath: `charly-resources/${key}`, mimeType }; saved.push(asset); return asset; }
  });
  assert.equal(artifact.generatedImage, true);
  assert.equal(artifact.imageModel, 'gemini-3.1-flash-lite-image');
  assert.match(artifact.html, /<img /);
  assert.doesNotMatch(artifact.html, /<svg|<canvas/i);
  assert.deepEqual(saved.map(asset => asset.mimeType), ['image/png', 'image/png', 'image/png', 'application/pdf']);
  assert.equal(maxSupportingImages, 2, 'La guía y el ejemplo resuelto deben generarse en paralelo.');
});
test('an approved Gemini cutout sheet survives failures in optional supporting images', async () => {
  const sharp = require('sharp');
  const bytes = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#f5dd9d' } }).png().toBuffer();
  const saved = [];
  const imageConfigs = [];
  let imageCalls = 0;
  const artifact = await generateResource('cutout', { code: 'Recortable 1a', activity: { id: 'a', html: '<div class="cb-cutout-paste-zone" data-resource-code="Recortable 1a"></div>', resourceSpecifications: [specification('cutout', 'Recortable 1a')] }, unit: {}, ownerUid: 'u', sessionId: 's', targetUnitId: 'unit', idempotencyKey: 'optional-assets-fail' }, {
    generateJson: async () => ({ title: 'Mi jardín', cutoutDocument: { title: 'Mi jardín', exerciseConcept: 'insertar un jardín completo en su zona', instructions: 'Recorta las piezas.', orientation: 'portrait', pieces: [{ id: 'p1', label: 'Árbol', targetId: 't1' }], targets: [{ id: 't1', label: 'Jardín' }], imagePrompt: 'Árbol editorial infantil a todo color' } }),
    generateImage: async (_prompt, config) => {
      imageCalls += 1;
      imageConfigs.push(config);
      if (imageCalls > 1) throw new Error('Auxiliar no disponible');
      return { bytes, mimeType: 'image/png', model: 'gemini-3.1-flash-image' };
    },
    reviewImage: async () => ({ ok: true, issues: [] }),
    saveAsset: async (_bytes, mimeType, key) => { const asset = { url: `https://example.test/${key}`, storagePath: `charly-resources/${key}`, mimeType }; saved.push(asset); return asset; }
  });
  assert.equal(artifact.generatedImage, true);
  assert.equal(imageConfigs[0].qualityTier, 'premium');
  assert.match(artifact.html, /<img /);
  assert.doesNotMatch(artifact.html, /<svg|<canvas/i);
  assert.deepEqual(saved.map(asset => asset.mimeType), ['image/png', 'application/pdf']);
  assert.equal(artifact.supportWarnings.length, 2);
});
test('image generation failure never creates a completed annex', async () => {
  await assert.rejects(generateResource('annex', { code: 'Anexo 1a', activity: { id: 'a', resourceSpecifications: [specification('annex', 'Anexo 1a')] }, unit: {}, ownerUid: 'u', sessionId: 's', targetUnitId: 'unit', idempotencyKey: '1234567890123456' }, {
    generateJson: async () => ({ title: 'Foto', annexDocument: { title: 'Foto', kind: 'photo', alt: 'Jardín', instructions: 'Observa', imagePrompt: 'Jardín' } }),
    generateImage: async () => { throw new Error('Imagen no disponible'); }, saveAsset: async () => { throw new Error('No debe guardar'); }
  }), /Imagen no disponible/);
});
test('a specialist refuses to call Gemini when the activity agent did not provide a detailed contract', async () => {
  let generated = false;
  await assert.rejects(generateResource('worksheet', { code: 'Ficha 1a', activity: { id: 'a', resourceSpecifications: [] }, unit: {}, ownerUid: 'u', sessionId: 's', targetUnitId: 'unit', idempotencyKey: '1234567890123456' }, {
    generateJson: async () => { generated = true; return {}; },
    saveAsset: async () => { throw new Error('No debe guardar'); }
  }), error => error.code === 'RESOURCE_SPECIFICATION_REQUIRED' && /contrato detallado/.test(error.message));
  assert.equal(generated, false, 'No debe llamar al modelo antes de validar el contrato del agente de actividades');
});
test('each independent MCP publishes only its specialist tool', async () => {
  for (const [type, name] of Object.entries(TOOL)) {
    const server = createSpecialistServer(type), client = new Client({ name: 'test', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b); await client.connect(a);
    assert.deepEqual((await client.listTools()).tools.map(t => t.name), [name]);
    await client.close(); await server.close();
  }
});

test('remote MCP preserves the activity resource contract for its specialist', async () => {
  const bytes = Buffer.from('image');
  const server = createSpecialistServer('annex', {
    generateJson: async () => ({ title: 'Jardín', annexDocument: { title: 'Jardín', kind: 'illustration', alt: 'Jardín escolar', instructions: 'Observa el jardín.', imagePrompt: 'Jardín escolar ilustrado' } }),
    generateImage: async () => ({ bytes, mimeType: 'image/png', model: 'gemini-3.1-flash-image' }),
    reviewImage: async () => ({ ok: true, issues: [] }),
    saveAsset: async (_data, mimeType, key) => ({ url: `https://example.test/${key}`, storagePath: `charly-resources/${key}`, mimeType })
  });
  const client = new Client({ name: 'contract-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b); await client.connect(a);
  try {
    const result = await client.callTool({
      name: 'design_annex',
      arguments: {
        ownerUid: 'u', sessionId: 's', targetUnitId: 'unit', idempotencyKey: 'remote-contract-1234', model: 'gemini-model', code: 'Anexo 1a',
        unit: { meta: { grade: 'Tercero' }, accepted: {} },
        activity: { id: 'activity-1', title: 'El jardín', html: '<p>Observa.</p>', section: 'Ciencias', category: 'Ciencias', subtopic: 'Entorno', resourceSpecifications: [specification('annex', 'Anexo 1a')] }
      }
    });
    assert.equal(result.isError, false);
    assert.equal(result.structuredContent.activityId, 'activity-1');
    assert.equal(result.structuredContent.code, 'Anexo 1a');
    assert.equal(result.structuredContent.generatedImage, true);
  } finally {
    await client.close(); await server.close();
  }
});

test('managed annex images survive Word and PDF export', async () => {
  const sharp = require('sharp'); const JSZip = require('jszip');
  const { buildCharlyExport } = require('../src/charly-brown-export.js');
  const bytes = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#edf5ff' } }).png().toBuffer();
  const asset = { url: 'https://example.test/image', storagePath: 'charly-resources/u/s/unit/image', mimeType: 'image/png' };
  const session = { id: 's', ownerUid: 'u', title: 'Unidad visual', units: [{ id: 'unit', title: 'Unidad', accepted: { resources: [{ title: 'Anexo', html: `<h3>Anexo</h3><p><img src="${asset.url}" alt="Diagrama"></p>`, assets: [asset] }] } }] };
  let reads = 0; const loadAsset = async path => { assert.equal(path, asset.storagePath); reads++; return bytes; };
  const word = await buildCharlyExport({ session, format: 'docx', loadAsset });
  const zip = await JSZip.loadAsync(word.buffer);
  assert.ok(Object.keys(zip.files).some(name => /word\/media\/.+\.png$/.test(name)));
  const pdf = await buildCharlyExport({ session, format: 'pdf', loadAsset });
  assert.match(pdf.buffer.toString('latin1'), /\/Subtype \/Image/);
  assert.equal(reads, 2);
  session.units[0].accepted.resources[0].assets[0].storagePath = 'charly-resources/other/s/unit/image';
  await buildCharlyExport({ session, format: 'docx', loadAsset: async () => { throw new Error('Must not read another owner'); } });
});

test('annex specialist receives accurate information and approves first image without cutout bias', async () => {
  const bytes = Buffer.from('image');
  const server = createSpecialistServer('annex', {
    generateJson: async () => ({
      title: 'El Ciclo del Agua',
      annexDocument: {
        title: 'El Ciclo del Agua',
        kind: 'illustration',
        alt: 'Infografía del ciclo del agua',
        instructions: 'Observa la infografía y describe sus etapas.',
        imagePrompt: 'Ilustración del ciclo del agua'
      }
    }),
    generateImage: async () => ({ bytes, mimeType: 'image/png', model: 'gemini-3.1-flash-image' }),
    reviewImage: async (_b, _mime, _criteria, options) => {
      assert.equal(options?.type, 'annex');
      return { ok: true, audit: { faithfulToTopic: true, professionalEditorialQuality: true, hasUnreadableTextOrWatermarks: false } };
    },
    saveAsset: async (_data, mimeType, key) => ({ url: `https://example.test/${key}`, storagePath: `charly-resources/${key}`, mimeType })
  });
  const client = new Client({ name: 'annex-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b); await client.connect(a);
  try {
    const result = await client.callTool({
      name: 'design_annex',
      arguments: {
        ownerUid: 'u', sessionId: 's', targetUnitId: 'unit', idempotencyKey: 'annex-test-123456789', model: 'gemini-model', code: 'Anexo 1a',
        unit: { meta: { grade: 'Tercero' }, accepted: {} },
        activity: { id: 'act-water', title: 'Ciclo del agua', html: '<p>Observa el anexo.</p>', section: 'Ciencias', category: 'Ciencias', subtopic: 'Agua', resourceSpecifications: [specification('annex', 'Anexo 1a')] }
      }
    });
    assert.equal(result.isError, false);
    assert.equal(result.structuredContent.generatedImage, true);
    assert.equal(result.structuredContent.visualReview.ok, true);
  } finally {
    await client.close(); await server.close();
  }
});
