const test = require('node:test');
const assert = require('node:assert/strict');
const { CharlyProductionStore } = require('../src/charly-production-store.js');
const { CharlyProduction, buildResourceTaskInput } = require('../src/charly-production.js');
const { nextTasks, retryDelay, reusableActivity, productionConcurrency } = require('../src/charly-production-policy.js');
const { resolveActivityResourceCodes, planActivityResources } = require('../src/charly-activity-generation.js');
const clone = v => v === undefined ? undefined : structuredClone(v);
const resourceSpecification = (type, code) => ({
  type, code, mechanic: `mecánica ${code}`, useInstruction: `Utiliza ${code}.`,
  studentAction: 'Observa, resuelve y explica.', requiredElements: [`elemento de ${code}`],
  visualBrief: `Dirección visual detallada para ${code}.`, expectedProduct: `Producto terminado de ${code}.`,
  placement: type === 'cutout'
    ? { mode: 'paste-into-activity', baseProvidedBy: 'activity', zoneDescription: `Zona para ${code}.` }
    : { mode: 'consult-alongside-activity', baseProvidedBy: 'resource', zoneDescription: `Uso externo de ${code}.` },
  ...(type === 'cutout' ? { piecePolicy: 'single-composite', primaryPiece: { label: `Pieza principal de ${code}`, composite: true } } : {})
});
const specifications = (...types) => types.map((type, index) => resourceSpecification(type, `${type}-${index + 1}`));
function memoryDb() {
  const data = new Map(); let tail = Promise.resolve();
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => collection(`${path}/${name}`), get: async () => snap(path) });
  const snap = path => ({ id: path.split('/').at(-1), ref: ref(path), exists: data.has(path), data: () => clone(data.get(path)) });
  const collection = path => ({ doc: id => ref(`${path}/${id}`), get: async () => ({ docs: [...data.keys()].filter(k => k.startsWith(`${path}/`) && k.split('/').length === path.split('/').length + 1).map(snap) }) });
  return { data, collection, runTransaction(fn) {
    const run = tail.then(async () => {
      const writes = []; let writing = false;
      const tx = { get: r => { assert.equal(writing, false, 'Firestore requires all reads before writes'); return r.get(); },
        create(r, v) { writing = true; writes.push(() => { assert.equal(data.has(r.path), false); data.set(r.path, clone(v)); }); },
        set(r, v) { writing = true; writes.push(() => data.set(r.path, clone(v))); },
        update(r, v) { writing = true; writes.push(() => { assert.ok(data.has(r.path)); data.set(r.path, { ...data.get(r.path), ...clone(v) }); }); } };
      const result = await fn(tx); writes.forEach(f => f()); return result;
    }); tail = run.catch(() => {}); return run;
  } };
}
async function setup(count = 2) {
  const db = memoryDb();
  db.data.set('charlyBrownUnitSessions/s', { id: 's', ownerUid: 'u', units: [{ id: 'unit', meta: { unit: '1' }, revision: 0,
    accepted: { reading: { title: 'Lectura' }, sya: { AE: 'Clasifica' }, activities: [], resources: [], teacherNotes: [] },
    workflow: { activitySections: Array.from({ length: count }, (_, i) => ({
      sectionId: `section-${i}`,
      section: `Sección ${i}`,
      category: 'Ciencias',
      subtopic: `Tema ${i}`,
      resourceTypes: ['worksheet', 'annex', 'cutout', 'video-script']
    })) } }] });
  const store = new CharlyProductionStore(db, () => 1000), id = await store.start('u', 's', 'unit');
  return { store, db, id };
}
test('concurrent start is idempotent and ownership is checked', async () => {
  const { store, id } = await setup();
  assert.deepEqual(await Promise.all([store.start('u', 's', 'unit'), store.start('u', 's', 'unit')]), [id, id]);
  await assert.rejects(store.read(id, 'other'), { status: 403 });
});
test('seven activity agents maximum; concurrent results do not overwrite each other', async () => {
  const { store, id } = await setup(8); const { tasks } = await store.read(id);
  const claims = await Promise.all(tasks.slice(0, 7).map(t => store.claim(id, t.id)));
  assert.equal(claims.filter(Boolean).length, 7);
  await assert.rejects(store.claim(id, tasks[7].id), { status: 429 });
  await Promise.all(claims.map((c, i) => store.finish(id, c.task, { title: `Actividad ${i}`, html: '<p>Actividad</p>' })));
  const state = await store.read(id);
  assert.equal(state.unit.accepted.activities.length, 7);
  assert.equal(state.session.storageRevision, 8);
  await store.finish(id, claims[0].task, { title: 'Duplicate', html: '<p>Duplicate</p>' });
  assert.equal((await store.read(id)).unit.accepted.activities.length, 7);
});
test('independent resource agents can claim work in parallel respecting stage limits', async () => {
  const { store, db, id } = await setup(1);
  const session = db.data.get('charlyBrownUnitSessions/s');
  session.units[0].accepted.activities = Array.from({ length: 4 }, (_, index) => ({
    id: `resource-activity-${index}`,
    title: `Actividad ${index}`,
    html: `<p>Actividad ${index}</p>`,
    category: 'Ciencias',
    subtopic: `Tema ${index}`,
    resourceSpecifications: [resourceSpecification('annex', `Anexo 1${String.fromCharCode(97 + index)}`)]
  }));
  for (let index = 0; index < 4; index += 1) {
    db.data.set(`charlyProductionRuns/${id}/tasks/resource-${index}`, {
      id: `resource-${index}`,
      stage: 'annex',
      activityId: `resource-activity-${index}`,
      code: `Anexo 1${String.fromCharCode(97 + index)}`,
      status: 'pending',
      attempt: 0,
      dueAt: 0,
      order: index
    });
  }
  const claims = await Promise.all(Array.from({ length: 2 }, (_, index) => store.claim(id, `resource-${index}`)));
  assert.equal(claims.filter(Boolean).length, 2);
  await assert.rejects(store.claim(id, 'resource-2'), { status: 429 });
  assert.equal(productionConcurrency('resources'), 6);
  assert.equal(productionConcurrency('annex'), 2);
  assert.equal(productionConcurrency('cutout'), 2);
  assert.equal(productionConcurrency('worksheet'), 1);
  assert.equal(productionConcurrency('video-script'), 1);
});
test('each parallel specialist receives only its activity, code and resource contract', () => {
  const unit = {
    meta: { model: 'gemini-3.5-flash-lite', grade: 'Tercero', unit: '1' },
    accepted: {
      reading: { title: 'Lectura' },
      sya: { AE: 'Clasifica' },
      resources: [],
      activities: [
        { id: 'a-1', title: 'Actividad uno', html: '<p>Uno</p>', section: 'Ciencias', category: 'Ciencias', subtopic: 'Agua', resourceSpecifications: [resourceSpecification('annex', 'Anexo 1a')] },
        { id: 'a-2', title: 'Actividad dos', html: '<p>Dos</p>', section: 'Lenguaje', category: 'Lenguaje', subtopic: 'Oralidad', resourceSpecifications: [resourceSpecification('cutout', 'Recortable 1a')] }
      ]
    }
  };
  const run = { id: 'run', ownerUid: 'owner', sessionId: 'session', unitId: 'unit' };
  const annex = buildResourceTaskInput({ run, unit, task: { id: 'annex-task', stage: 'annex', activityId: 'a-1', activityHash: 'h1', code: 'Anexo 1a' } }, 'gemini-model');
  const cutout = buildResourceTaskInput({ run, unit, task: { id: 'cutout-task', stage: 'cutout', activityId: 'a-2', activityHash: 'h2', code: 'Recortable 1a' } }, 'gemini-model');
  assert.equal(annex.activity.id, 'a-1');
  assert.equal(annex.code, 'Anexo 1a');
  assert.deepEqual(annex.activity.resourceSpecifications.map(item => item.type), ['annex']);
  assert.equal(cutout.activity.id, 'a-2');
  assert.equal(cutout.code, 'Recortable 1a');
  assert.deepEqual(cutout.activity.resourceSpecifications.map(item => item.type), ['cutout']);
  assert.notEqual(annex.idempotencyKey, cutout.idempotencyKey);
});
test('a regenerated activity replaces its placeholder and persists its resource contracts', async () => {
  const { store, db, id } = await setup(1);
  const task = (await store.read(id)).tasks[0];
  db.data.get('charlyBrownUnitSessions/s').units[0].accepted.activities.push({
    id: task.activityId,
    title: 'Marcador anterior',
    html: '<p>Actividad incompleta</p>',
    category: task.section.category,
    subtopic: task.section.subtopic,
    resourceSpecifications: []
  });
  const claim = await store.claim(id, task.id);
  const planned = specifications('worksheet', 'annex', 'cutout', 'video-script');
  await store.finish(id, claim.task, {
    title: 'Actividad regenerada',
    html: '<p>Actividad completa</p>',
    resourceSpecifications: planned
  });
  const state = await store.read(id);
  assert.equal(state.unit.accepted.activities.length, 1);
  assert.equal(state.unit.accepted.activities[0].title, 'Actividad regenerada');
  assert.deepEqual(state.unit.accepted.activities[0].resourceSpecifications, planned);
});
test('a regenerated resource replaces the previous artifact with the same checkpoint id', async () => {
  const { store, db, id } = await setup(1);
  let state = await store.read(id);
  const activityClaim = await store.claim(id, state.tasks[0].id);
  await store.finish(id, activityClaim.task, {
    title: 'Actividad', html: '<p>Actividad</p>', resourceSpecifications: specifications('annex')
  });
  state = await store.read(id);
  await store.add(id, state.run.epoch, nextTasks(state.run, state.tasks, state.unit));
  state = await store.read(id);
  const annexTask = state.tasks.find(task => task.stage === 'annex');
  db.data.get('charlyBrownUnitSessions/s').units[0].accepted.resources.push({
    id: `auto_${annexTask.id}`, type: 'anexo', activityId: annexTask.activityId, title: 'Anexo anterior'
  });
  const annexClaim = await store.claim(id, annexTask.id);
  await store.finish(id, annexClaim.task, { title: 'Anexo corregido', html: '<p>Corregido</p>' });
  state = await store.read(id);
  assert.equal(state.unit.accepted.resources.length, 1);
  assert.equal(state.unit.accepted.resources[0].title, 'Anexo corregido');
});
test('a new run removes only orphan automatic notes from previous pipelines', async () => {
  const { store, db, id } = await setup(1);
  await store.control(id, 'u', 'cancel');
  const unit = db.data.get('charlyBrownUnitSessions/s').units[0];
  unit.accepted.activities.push({ id: 'activity-kept', category: 'Ciencias', subtopic: 'Tema 0', html: '<p>Actividad</p>', resourceSpecifications: specifications('worksheet', 'annex', 'cutout', 'video-script') });
  unit.accepted.teacherNotes.push(
    { id: 'valid-auto', automated: true, activityId: 'activity-kept' },
    { id: 'orphan-auto', automated: true, activityId: 'old-resource' },
    { id: 'manual', automated: false, activityId: 'old-resource' }
  );
  unit.automation = { id, status: 'cancelled' };
  await store.start('u', 's', 'unit');
  const notes = db.data.get('charlyBrownUnitSessions/s').units[0].accepted.teacherNotes;
  assert.deepEqual(notes.map(note => note.id), ['valid-auto', 'manual']);
});
test('manual activity edits produce a retained stale result, never overwrite', async () => {
  const { store, db, id } = await setup(1);
  let state = await store.read(id); const c = await store.claim(id, state.tasks[0].id);
  await store.finish(id, c.task, { title: 'A', html: '<p>A</p>', resourceSpecifications: specifications('annex') });
  state = await store.read(id); await store.add(id, state.run.epoch, nextTasks(state.run, state.tasks, state.unit));
  state = await store.read(id); const resource = await store.claim(id, state.tasks.find(t => t.stage === 'annex').id);
  db.data.get('charlyBrownUnitSessions/s').units[0].accepted.activities[0].html = '<p>Manual</p>';
  await store.finish(id, resource.task, { title: 'Anexo', html: '<p>Visual</p>' });
  state = await store.read(id);
  assert.equal(state.unit.accepted.resources.length, 0);
  assert.equal(state.tasks.find(t => t.id === resource.task.id).status, 'stale');
  assert.equal(state.unit.accepted.activities[0].html, '<p>Manual</p>');
});
test('cancel rejects late completion; resume restarts only unfinished work', async () => {
  const { store, id } = await setup(); const state = await store.read(id);
  const c = await store.claim(id, state.tasks[0].id);
  await store.control(id, 'u', 'cancel'); await store.finish(id, c.task, { title: 'Late' });
  assert.equal((await store.read(id)).unit.accepted.activities.length, 0);
  await store.control(id, 'u', 'resume');
  assert.equal((await store.read(id)).tasks[0].status, 'pending');
});
test('complete pipeline creates four explicitly planned resources and notes per unit; repeat fills no duplicates', async () => {
  const { store, id } = await setup(1); const queued = [];
  const p = new CharlyProduction({ store, enqueue: async (_, t) => queued.push(t.id), worker: async ({ task }) => ({ title: task.stage, html: '<p>Contenido</p>', activityId: task.activityId || '', ...(task.stage === 'activity' ? { resourceSpecifications: specifications('worksheet', 'annex', 'cutout', 'video-script') } : {}) }) });
  await p.advance(id);
  for (let round = 0; round < 10; round++) {
    const state = await store.read(id); if (state.run.status !== 'running') break;
    for (const task of state.tasks.filter(t => t.status === 'pending')) await p.dispatch(id, task.id);
  }
  const state = await store.read(id);
  assert.equal(state.run.status, 'completed'); assert.equal(state.unit.accepted.resources.length, 4); assert.equal(state.unit.accepted.teacherNotes.length, 1);
  const second = await store.start('u', 's', 'unit'); await p.advance(second);
  for (let round = 0; round < 10; round++) {
    const next = await store.read(second); if (next.run.status !== 'running') break;
    for (const task of next.tasks.filter(t => t.status === 'pending')) await p.dispatch(second, task.id);
  }
  assert.equal((await store.read(second)).run.status, 'completed');
  assert.equal((await store.read(second)).unit.accepted.resources.length, 4);
});
test('retries are bounded and honor Retry-After', () => {
  assert.equal(retryDelay(1, { status: 429, retryAfterSeconds: 30 }), 30000);
  assert.equal(retryDelay(3, { status: 503 }), null);
  assert.equal(retryDelay(1, { status: 422 }), null);
});

test('section selections never authorize a specialist without an activity contract', () => {
  const unit = {
    meta: { unit: '3' },
    accepted: { activities: [{ id: 'activity-without-contract', category: 'Ciencias', subtopic: 'Agua', resourceSpecifications: [] }], resources: [], teacherNotes: [] },
    workflow: { activitySections: [{ category: 'Ciencias', subtopic: 'Agua', resourceTypes: ['annex', 'cutout'] }] }
  };
  const additions = nextTasks({}, [{ id: 'activity-task', stage: 'activity', activityId: 'activity-without-contract', status: 'completed', order: 0 }], unit);
  assert.equal(additions.some(task => ['annex', 'cutout', 'worksheet', 'video-script'].includes(task.stage)), false);
});

test('legacy SVG recortables are never reused as completed Gemini resources', () => {
  const activity = {
    id: 'activity-svg-regression', category: 'Matemáticas', subtopic: 'Decenas',
    html: '<p>Forma 34 con las piezas.</p>',
    resourceSpecifications: specifications('cutout')
  };
  const unit = {
    meta: { unit: '1' },
    accepted: {
      activities: [activity], teacherNotes: [],
      resources: [{
        id: 'legacy-svg', activityId: activity.id, type: 'recortable', title: 'Recortable 1d',
        html: '<h3>Recortable 1d</h3><img src="https://example.test/legacy.svg">',
        assets: [{ mimeType: 'image/svg+xml', storagePath: 'legacy.svg', url: 'https://example.test/legacy.svg' }]
      }]
    },
    workflow: { activitySections: [{ category: 'Matemáticas', subtopic: 'Decenas', resourceTypes: ['cutout'] }] }
  };
  const additions = nextTasks({}, [{
    id: 'activity-task', stage: 'activity', activityId: activity.id, status: 'completed', order: 0,
    section: unit.workflow.activitySections[0]
  }], unit);
  const cutout = additions.find(task => task.stage === 'cutout');
  assert.ok(cutout);
  assert.equal(cutout.status, 'pending');
});

test('chat resourceTypes are converted into authoritative codes for the activity planner', () => {
  const unit = { meta: { unit: '4' }, accepted: { activities: [] }, workflow: { activitySections: [] } };
  assert.deepEqual(
    resolveActivityResourceCodes(unit, { name: 'El ciclo del agua' }, ['annex', 'cutout']),
    [{ type: 'annex', code: 'Anexo 4a' }, { type: 'cutout', code: 'Recortable 4a' }]
  );
});

test('the activity agent plans every assigned resource before composing the activity', async () => {
  const assignedCodes = [
    { type: 'annex', code: 'Anexo 4a' },
    { type: 'cutout', code: 'Recortable 4a' }
  ];
  const planned = assignedCodes.map(item => resourceSpecification(item.type, item.code));
  let calls = 0;
  const result = await planActivityResources({
    unit: { meta: { level: 'Primaria', grade: 'Segundo', unit: '4' }, accepted: { activities: [] } },
    activity: { section: 'Artes', subtopic: 'Artes' },
    sectionDefinition: { section: 'Artes', subtopic: 'Artes' },
    assignedCodes,
    generateJson: async () => { calls += 1; return { resourceSpecifications: planned }; }
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, planned);
});

test('restart reuses only finished activities that contain every planned resource contract', () => {
  const section = { resourceTypes: ['worksheet', 'annex'] };
  assert.equal(reusableActivity({ html: '' }, section), false);
  assert.equal(reusableActivity({ html: '<div>Actividad vieja</div>', resourceSpecifications: [] }, section), false);
  assert.equal(reusableActivity({
    html: '<div>Actividad completa</div>',
    resourceSpecifications: specifications('worksheet', 'annex')
  }, section), true);
});

test('a terminal task failure moves the run to attention instead of leaving it running', async () => {
  const { store, id } = await setup(1);
  const p = new CharlyProduction({
    store,
    enqueue: async () => {},
    worker: async () => { throw Object.assign(new Error('Contenido inválido'), { status: 422 }); }
  });
  const task = (await store.read(id)).tasks[0];
  await p.dispatch(id, task.id);
  assert.equal((await store.read(id)).run.status, 'needs_attention');
});

test('expired workers cannot retry forever or commit an old lease', async () => {
  const { store, id } = await setup(1); const task = (await store.read(id)).tasks[0];
  const first = await store.claim(id, task.id);
  for (let i = 1; i < 6; i++) { store.now = () => 1000 + 301000 * i; assert.ok(await store.claim(id, task.id)); }
  store.now = () => 2000000;
  assert.equal(await store.claim(id, task.id), null);
  await store.finish(id, first.task, { title: 'Obsolete' });
  assert.equal((await store.read(id)).tasks[0].status, 'failed');
  assert.equal((await store.read(id)).unit.accepted.activities.length, 0);
});

test('a changed curriculum can start a new run without losing approved content', async () => {
  const { store, db, id } = await setup(2); const state = await store.read(id);
  const claim = await store.claim(id, state.tasks[0].id);
  await store.finish(id, claim.task, { title: 'Aprobada', html: '<p>Conservar</p>', resourceSpecifications: specifications('worksheet', 'annex', 'cutout', 'video-script') });
  db.data.get('charlyBrownUnitSessions/s').units[0].meta.grade = 'Cuarto';
  await store.control(id, 'u', 'attention');
  const p = new CharlyProduction({ store, enqueue: async () => {} });
  const restarted = await p.control('u', id, 'restart');
  assert.notEqual(restarted.id, id);
  assert.equal(restarted.session.units[0].accepted.activities[0].html, '<p>Conservar</p>');
  assert.equal(restarted.tasks.filter(t => t.stage === 'activity' && t.status === 'completed').length, 1);
});

test('resource selection filtering respects false selections and caps video-scripts at 2 max per unit', () => {
  const unit = {
    meta: { unit: '1' },
    accepted: {
      activities: [
        { id: 'act-1', category: 'Lenguaje', subtopic: 'Lectura', resourceSpecifications: specifications('worksheet', 'video-script') },
        { id: 'act-2', category: 'Lenguaje', subtopic: 'Gramatica', resourceSpecifications: specifications('video-script') },
        { id: 'act-3', category: 'Lenguaje', subtopic: 'Ortografia', resourceSpecifications: specifications('video-script') },
        { id: 'act-4', category: 'Lenguaje', subtopic: 'Vocabulario' }
      ],
      resources: [],
      teacherNotes: []
    },
    workflow: {
      activitySections: [
        { sectionId: 'sec-1', category: 'Lenguaje', subtopic: 'Lectura', resourceSelections: { fichas: true, videos: true, anexos: false, recortables: false } },
        { sectionId: 'sec-2', category: 'Lenguaje', subtopic: 'Gramatica', resourceSelections: { fichas: false, videos: true, anexos: false, recortables: false } },
        { sectionId: 'sec-3', category: 'Lenguaje', subtopic: 'Ortografia', resourceSelections: { fichas: false, videos: true, anexos: false, recortables: false } },
        { sectionId: 'sec-4', category: 'Lenguaje', subtopic: 'Vocabulario', resourceSelections: { fichas: false, videos: false, anexos: false, recortables: false } }
      ]
    }
  };
  const tasks = [
    { id: 't-1', stage: 'activity', activityId: 'act-1', status: 'completed', order: 0 },
    { id: 't-2', stage: 'activity', activityId: 'act-2', status: 'completed', order: 1 },
    { id: 't-3', stage: 'activity', activityId: 'act-3', status: 'completed', order: 2 },
    { id: 't-4', stage: 'activity', activityId: 'act-4', status: 'completed', order: 3 }
  ];
  const additions = nextTasks({ id: 'run-1' }, tasks, unit);
  const videoTasks = additions.filter(t => t.stage === 'video-script');
  const worksheetTasks = additions.filter(t => t.stage === 'worksheet');
  const emptySectionTasks = additions.filter(t => t.activityId === 'act-4');

  assert.equal(videoTasks.length, 2, 'Debe limitar a un máximo de 2 guiones de video en toda la unidad');
  assert.equal(worksheetTasks.length, 1, 'Solo debe generar ficha para la sección con fichas: true');
  assert.equal(emptySectionTasks.length, 0, 'La sección sin recursos seleccionados no debe generar tareas de recursos');
});

test('sequential workflow: resources require all activities completed, notes require all resources completed and are 1:1 per activity', () => {
  const unit = {
    meta: { unit: '1' },
    accepted: {
      activities: [
        { id: 'act-1', category: 'Lenguaje', subtopic: 'Lectura', resourceSpecifications: specifications('worksheet') },
        { id: 'act-2', category: 'Lenguaje', subtopic: 'Gramatica', resourceSpecifications: specifications('annex') }
      ],
      resources: [],
      teacherNotes: []
    },
    workflow: {
      activitySections: [
        { sectionId: 'sec-1', category: 'Lenguaje', subtopic: 'Lectura', resourceSelections: { fichas: true } },
        { sectionId: 'sec-2', category: 'Lenguaje', subtopic: 'Gramatica', resourceSelections: { anexos: true } }
      ]
    }
  };

  // Phase 1: Activities still in progress -> no resources or notes added
  const partialActivities = [
    { id: 't-1', stage: 'activity', activityId: 'act-1', status: 'completed', order: 0 },
    { id: 't-2', stage: 'activity', activityId: 'act-2', status: 'pending', order: 1 }
  ];
  const additions1 = nextTasks({ id: 'run-1' }, partialActivities, unit);
  assert.equal(additions1.length, 0, 'No debe generar recursos mientras haya actividades pendientes');

  // Phase 2: All activities completed -> generates resources only, no notes yet
  const allActivitiesDone = [
    { id: 't-1', stage: 'activity', activityId: 'act-1', status: 'completed', order: 0 },
    { id: 't-2', stage: 'activity', activityId: 'act-2', status: 'completed', order: 1 }
  ];
  const additions2 = nextTasks({ id: 'run-1' }, allActivitiesDone, unit);
  assert.ok(additions2.length > 0, 'Debe generar tareas de recursos al terminar las actividades');
  assert.ok(additions2.every(t => t.stage !== 'notes'), 'No debe generar notas del maestro mientras los recursos no estén terminados');

  // Phase 3: Resources still pending -> no notes added
  const resourcesPending = [
    ...allActivitiesDone,
    { id: 'res-1', stage: 'worksheet', activityId: 'act-1', status: 'pending', order: 0 },
    { id: 'res-2', stage: 'annex', activityId: 'act-2', status: 'running', order: 1 }
  ];
  const additions3 = nextTasks({ id: 'run-1' }, resourcesPending, unit);
  assert.equal(additions3.length, 0, 'No debe generar notas del maestro mientras los recursos estén en ejecución o pendientes');

  // Phase 4: All activities & all resources completed -> generates 1 note per activity (1:1)
  const allCompleted = [
    ...allActivitiesDone,
    { id: 'res-1', stage: 'worksheet', activityId: 'act-1', status: 'completed', order: 0 },
    { id: 'res-2', stage: 'annex', activityId: 'act-2', status: 'completed', order: 1 }
  ];
  const additions4 = nextTasks({ id: 'run-1' }, allCompleted, unit);
  const noteTasks = additions4.filter(t => t.stage === 'notes');
  assert.equal(noteTasks.length, 2, 'Debe generar exactamente una tarea de notas por cada actividad (1:1)');
  assert.equal(noteTasks[0].activityId, 'act-1', 'La primera nota debe vincularse a act-1');
  assert.equal(noteTasks[1].activityId, 'act-2', 'La segunda nota debe vincularse a act-2');
});

test('unit with all 4 complementary resources: enqueues all 4 and halts notes until all 4 complete', () => {
  const unit = {
    meta: { unit: '1' },
    accepted: {
      activities: [
        { id: 'act-1', category: 'Lenguaje', subtopic: 'ExpresionOral', resourceSpecifications: specifications('cutout') },
        { id: 'act-2', category: 'Ciencias', subtopic: 'ConocimientoDelMedio', resourceSpecifications: specifications('annex') },
        { id: 'act-3', category: 'Matematicas', subtopic: 'Matematicas', resourceSpecifications: specifications('worksheet') },
        { id: 'act-4', category: 'Proyectos', subtopic: 'Proyectos', resourceSpecifications: specifications('video-script') }
      ],
      resources: [],
      teacherNotes: []
    },
    workflow: {
      activitySections: [
        { sectionId: 'sec-1', category: 'Lenguaje', subtopic: 'ExpresionOral', resourceSelections: { recortables: true } },
        { sectionId: 'sec-2', category: 'Ciencias', subtopic: 'ConocimientoDelMedio', resourceSelections: { anexos: true } },
        { sectionId: 'sec-3', category: 'Matematicas', subtopic: 'Matematicas', resourceSelections: { fichas: true } },
        { sectionId: 'sec-4', category: 'Proyectos', subtopic: 'Proyectos', resourceSelections: { videos: true } }
      ]
    }
  };

  const completedActivities = [
    { id: 't-1', stage: 'activity', activityId: 'act-1', status: 'completed', order: 0 },
    { id: 't-2', stage: 'activity', activityId: 'act-2', status: 'completed', order: 1 },
    { id: 't-3', stage: 'activity', activityId: 'act-3', status: 'completed', order: 2 },
    { id: 't-4', stage: 'activity', activityId: 'act-4', status: 'completed', order: 3 }
  ];

  // 1. All activities done -> Enqueues all 4 resources
  const resAdditions = nextTasks({ id: 'run-1' }, completedActivities, unit);
  assert.equal(resAdditions.length, 4, 'Debe encolar las 4 tareas de recursos (recortable, anexo, ficha, video)');
  const stages = resAdditions.map(t => t.stage).sort();
  assert.deepEqual(stages, ['annex', 'cutout', 'video-script', 'worksheet']);

  // 2. Only 2 resources completed -> MUST NOT start notes!
  const partialResources = [
    ...completedActivities,
    { id: resAdditions[0].id, stage: resAdditions[0].stage, activityId: resAdditions[0].activityId, status: 'completed' },
    { id: resAdditions[1].id, stage: resAdditions[1].stage, activityId: resAdditions[1].activityId, status: 'completed' },
    { id: resAdditions[2].id, stage: resAdditions[2].stage, activityId: resAdditions[2].activityId, status: 'pending' },
    { id: resAdditions[3].id, stage: resAdditions[3].stage, activityId: resAdditions[3].activityId, status: 'pending' }
  ];
  const partialAdditions = nextTasks({ id: 'run-1' }, partialResources, unit);
  assert.equal(partialAdditions.filter(t => t.stage === 'notes').length, 0, 'No debe generar notas del maestro si faltan recursos por completar');

  // 3. All 4 resources completed -> Generates 4 teacher notes (1 per activity)
  const allResourcesDone = [
    ...completedActivities,
    { id: resAdditions[0].id, stage: resAdditions[0].stage, activityId: resAdditions[0].activityId, status: 'completed' },
    { id: resAdditions[1].id, stage: resAdditions[1].stage, activityId: resAdditions[1].activityId, status: 'completed' },
    { id: resAdditions[2].id, stage: resAdditions[2].stage, activityId: resAdditions[2].activityId, status: 'completed' },
    { id: resAdditions[3].id, stage: resAdditions[3].stage, activityId: resAdditions[3].activityId, status: 'completed' }
  ];
  const notesAdditions = nextTasks({ id: 'run-1' }, allResourcesDone, unit);
  const noteTasks = notesAdditions.filter(t => t.stage === 'notes');
  assert.equal(noteTasks.length, 4, 'Debe generar exactamente una nota del maestro por cada actividad tras completar todos los recursos');
});



test('resumed runs omit queued resources beyond the six-resource budget for each type', async () => {
  const { store, id } = await setup(1);
  const state = await store.read(id);
  await store.add(id, state.run.epoch, Array.from({ length: 27 }, (_, index) => ({
    id: `budget-resource-${index}`, stage: ['worksheet', 'annex', 'cutout'][index % 3],
    activityId: state.tasks[0].activityId, order: index, status: 'pending', attempt: 0, dueAt: 0
  })));
  await store.enforceResourceBudget(id);
  const limited = await store.read(id);
  assert.equal(limited.tasks.filter(task => ['worksheet', 'annex', 'cutout'].includes(task.stage)).length, 18);
  assert.equal(await store.claim(id, 'budget-resource-26'), null);
});

test('existing resources reduce the available budget in resumed runs', async () => {
  const { store, db, id } = await setup(1);
  db.data.get('charlyBrownUnitSessions/s').units[0].accepted.resources = Array.from({ length: 4 }, (_, index) => ({ id: `existing-${index}`, type: 'anexo' }));
  const state = await store.read(id);
  await store.add(id, state.run.epoch, Array.from({ length: 5 }, (_, index) => ({
    id: `remaining-resource-${index}`, stage: 'annex', activityId: state.tasks[0].activityId,
    order: index, status: 'pending', attempt: 0, dueAt: 0
  })));
  await store.enforceResourceBudget(id);
  assert.equal((await store.read(id)).tasks.filter(task => task.stage === 'annex').length, 2);
});

test('advance enqueues activities in batches of up to 7 and resources 1 worksheet, 2 annexes, 2 cutouts, 1 video on distinct activities', async () => {
  const { store, db, id } = await setup(8);
  const queued = [];
  const p = new CharlyProduction({
    store,
    enqueue: async (_, t) => queued.push(t),
    worker: async () => ({})
  });

  // 1. In activity phase: exactly 7 activity tasks enqueued at once, distinct activities
  await p.advance(id);
  assert.equal(queued.length, 7);
  assert.ok(queued.every(t => t.stage === 'activity'));
  const actIds = new Set(queued.map(t => t.activityId));
  assert.equal(actIds.size, 7);

  // Complete all 8 activities
  const session = db.data.get('charlyBrownUnitSessions/s');
  session.units[0].accepted.activities = Array.from({ length: 8 }, (_, index) => ({
    id: `act-${index}`,
    title: `Actividad ${index}`,
    html: '<p>Act</p>',
    subtopic: `Subtema ${index}`,
    resourceSpecifications: [
      resourceSpecification('worksheet', `Ficha 1${String.fromCharCode(97 + index)}`),
      resourceSpecification('annex', `Anexo 1${String.fromCharCode(97 + index)}`),
      resourceSpecification('cutout', `Recortable 1${String.fromCharCode(97 + index)}`),
      resourceSpecification('video-script', `Video ${index}`)
    ]
  }));
  const stateAfterAct = await store.read(id);
  for (let i = 0; i < stateAfterAct.tasks.length; i++) {
    const t = stateAfterAct.tasks[i];
    if (t.stage === 'activity') {
      const taskDoc = db.data.get(`charlyProductionRuns/${id}/tasks/${t.id}`);
      taskDoc.status = 'completed';
      taskDoc.activityId = `act-${i}`;
    }
  }

  // Clear queued
  queued.length = 0;

  // 2. Advance to resource phase
  await p.advance(id);
  // Queued should have 6 tasks: 1 worksheet, 2 annex, 2 cutout, 1 video-script
  assert.equal(queued.length, 6);
  const counts = { worksheet: 0, annex: 0, cutout: 0, 'video-script': 0 };
  queued.forEach(t => { counts[t.stage] = (counts[t.stage] || 0) + 1; });
  assert.equal(counts.worksheet, 1);
  assert.equal(counts.annex, 2);
  assert.equal(counts.cutout, 2);
  assert.equal(counts['video-script'], 1);

  // Each of the 6 enqueued resource tasks belongs to a DIFFERENT activityId!
  const resActIds = new Set(queued.map(t => t.activityId));
  assert.equal(resActIds.size, 6);
});

test('task retry after 500 internal error clears error on success and marks completed cleanly', async () => {
  const { store, id } = await setup(1);
  let currentTime = 1000;
  store.now = () => currentTime;
  let attemptCount = 0;
  const p = new CharlyProduction({
    store,
    enqueue: async () => {},
    now: () => currentTime,
    worker: async ({ task }) => {
      attemptCount += 1;
      if (attemptCount === 1) {
        throw Object.assign(new Error('{"error":{"code":500,"message":"Internal error encountered.","status":"INTERNAL"}}'), { status: 500 });
      }
      return {
        title: 'Actividad completada',
        html: '<p>Contenido</p>',
        resourceSpecifications: specifications('worksheet')
      };
    }
  });

  const state1 = await store.read(id);
  const task = state1.tasks[0];
  assert.ok(task);

  // Attempt 1 fails with 500
  await p.dispatch(id, task.id);
  const stateAfterFail = await store.read(id);
  const failedTask = stateAfterFail.tasks.find(t => t.id === task.id);
  assert.equal(failedTask.status, 'pending');
  assert.ok(failedTask.error.includes('Internal error encountered'));
  assert.equal(failedTask.attempt, 1);

  // Advance time beyond retry delay (dueAt = 1000 + 2000 = 3000)
  currentTime = 5000;

  // Attempt 2 succeeds
  await p.dispatch(id, task.id);
  const stateAfterSuccess = await store.read(id);
  const completedTask = stateAfterSuccess.tasks.find(t => t.id === task.id);
  assert.equal(completedTask.status, 'completed');
  assert.equal(completedTask.error, null);
  assert.equal(completedTask.attempt, 2);
});

