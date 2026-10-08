const { CharlyProductionStore, COLLECTION } = require('./charly-production-store.js');
const { nextTasks, getTypesFromSelections, isMathSection, RESOURCE_LIMITS, MAX_UNIT_RESOURCES, productionConcurrency } = require('./charly-production-policy.js');
const { callSpecialist, configured } = require('./charly-resources/client.js');
const { runtime } = require('./charly-resources/runtime.js');
const { hash, TYPES } = require('./charly-resources/contracts.js');
const { buildTeacherNotesPrompt, buildTeacherNotesResourceMap, validateTeacherNotesResourceReferences } = require('./charly-brown-agent-tools.js');
const { resolveActivityResourceCodes, generateActivityArtifact } = require('./charly-activity-generation.js');
const { enqueueHttpTask, QUEUES } = require('./tasks.js');
const { getAdminServices, PROJECT_ID, REGION } = require('./common.js');
const inlineSpecialistsEnabled = () => process.env.CHARLY_INLINE_SPECIALISTS !== 'false';
const inlineScheduledTasks = new Set();
const enabled = () => true;
const ready = () => enabled() && (inlineSpecialistsEnabled() || configured());

function buildResourceTaskInput({ run, task, unit }, model) {
  const { activityKey } = require('./charly-production-policy.js');
  const activity = unit.accepted.activities.find(item => item.id === task.activityId)
    || unit.accepted.activities.find(item => item.sectionId && (item.sectionId === task.sectionId || item.sectionId === task.section?.sectionId))
    || unit.accepted.activities.find(item => activityKey(item) === activityKey(task.section || task))
    || unit.accepted.activities[task.order]
    || null;

  if (!activity) {
    throw Object.assign(new Error(`La actividad ${task.activityId || 'sin id'} no existe para la tarea ${task.id || task.stage}.`), {
      code: 'ACTIVITY_NOT_FOUND',
      status: 422
    });
  }

  let resourceSpecifications = Array.isArray(activity.resourceSpecifications) ? activity.resourceSpecifications : [];
  if (!resourceSpecifications.some(s => s && s.type === task.stage)) {
    const { buildSyntheticResourceSpecification } = require('./charly-resources/coherence.js');
    const fallbackSpec = buildSyntheticResourceSpecification(activity, task.stage, task.code);
    resourceSpecifications = [...resourceSpecifications, fallbackSpec];
    activity.resourceSpecifications = resourceSpecifications;
  }

  return {
    ownerUid: run.ownerUid,
    sessionId: run.sessionId,
    targetUnitId: run.unitId,
    idempotencyKey: hash([run.id, task.id, task.activityHash]),
    model,
    unit: {
      meta: unit.meta,
      accepted: {
        reading: unit.accepted.reading,
        sya: unit.accepted.sya || unit.sya,
        resources: unit.accepted.resources || []
      }
    },
    activity: {
      id: activity.id,
      title: activity.title || '',
      html: activity.html,
      section: activity.section || '',
      category: activity.category || '',
      subtopic: activity.subtopic || '',
      resourceSpecifications
    },
    code: task.code
  };
}

async function execute({ run, task, unit }, signal) {
  const model = require('./charly-brown-mcp.js').normalizeCharlyModel(unit.meta.model);
  const generation = runtime(model);
  console.info('[charly-production] >>> EXECUTE iniciando tarea:', { stage: task.stage, taskId: task.id, subtopic: task.subtopic || task.section?.subtopic, code: task.code, attempt: task.attempt });
  if (TYPES.includes(task.stage)) {
    const input = buildResourceTaskInput({ run, task, unit }, model);
    const generate = () => require('./charly-resources/generate.js').generateResourceWithValidationRetry(task.stage, input, generation);
    const res = await generation.cachedGeneration(task.stage, input, generate);
    console.info('[charly-production] <<< EXECUTE recurso generado con éxito:', { stage: task.stage, taskId: task.id, code: input.code });
    return res;
  }
  if (task.stage === 'activity') {
    const activity = { id: task.activityId, title: task.section.name || task.section.section, section: task.section.name || task.section.section, category: task.section.category, subtopic: task.section.subtopic };
    const requestedTypes = [...new Set(task.section.resourceTypes || getTypesFromSelections(task.section.resourceSelections || {}))];
    const assignedCodes = resolveActivityResourceCodes(unit, task.section, requestedTypes);
    const artifact = await generateActivityArtifact({
      unit,
      activity,
      sectionDefinition: task.section,
      generateJson: prompt => generation.generateJson(prompt),
      sanitizeHtml: html => require('./charly-brown-mcp.js').sanitizeRichHtml(html),
      memory: [],
      assignedCodes
    });
    const plannedTypes = new Set((artifact.resourceSpecifications || []).map(item => item?.type).filter(Boolean));
    const missingCodes = assignedCodes.filter(item => !plannedTypes.has(item.type));
    if (missingCodes.length) {
      const { planActivityResources } = require('./charly-activity-generation.js');
      const fallbackSpecs = await planActivityResources({
        unit,
        activity,
        sectionDefinition: task.section,
        assignedCodes: missingCodes,
        generateJson: prompt => generation.generateJson(prompt)
      });
      artifact.resourceSpecifications = [...(artifact.resourceSpecifications || []), ...fallbackSpecs];
    }
    return artifact;
  }
  const { activityKey } = require('./charly-production-policy.js');
  const targetActivity = (unit.accepted?.activities || []).find(a => a.id === task.activityId)
    || (unit.accepted?.activities || []).find(a => a.sectionId && (a.sectionId === task.sectionId || a.sectionId === task.section?.sectionId))
    || (unit.accepted?.activities || []).find(a => activityKey(a) === activityKey(task.section || task))
    || (unit.accepted?.activities || []).find(a => (a.subtopic && task.subtopic && a.subtopic.toLowerCase() === task.subtopic.toLowerCase()))
    || { id: task.activityId, title: task.subtopic || 'Actividad' };
  const targetResources = (unit.accepted?.resources || []).filter(r => r.activityId === task.activityId || (targetActivity.id && r.activityId === targetActivity.id));
  const resourceMap = buildTeacherNotesResourceMap({ unit, items: [targetActivity], mode: 'single' });
  const resourceNames = targetResources.map(r => r.code || r.title || r.type);
  const resourceInstruction = resourceNames.length
    ? ` Esta actividad cuenta con los siguientes recursos complementarios vinculados: ${resourceNames.join(', ')}. En la nota, debes explicar con detalle en qué momento y de qué forma utilizar y mediar cada uno de estos recursos en el aula, así como la verificación de evidencias.`
    : ` Esta actividad no tiene recursos complementarios asignados.`;
  const prompt = buildTeacherNotesPrompt({
    unit,
    items: [targetActivity],
    mode: 'single',
    brief: `Crea notas metodológicas directas para guiar esta actividad en el aula.${resourceInstruction}`
  });
  let artifact = await generation.generateJson(prompt);
  if (!artifact?.title || !artifact.html) throw Object.assign(new Error('Contenido incompleto.'), { status: 422 });
  artifact.html = require('./charly-brown-mcp.js').sanitizeRichHtml(artifact.html);
  let validation = validateTeacherNotesResourceReferences(artifact.html, resourceMap);
  if (!validation.ok && validation.missing.length) {
    artifact = await generation.generateJson(`${prompt}\nCorrige esta nota conservando su contenido pedagógico: ${JSON.stringify(artifact)}\nFaltan referencias a estos recursos: ${JSON.stringify(validation.missing)}. Menciona cada nombre y explica su uso docente. Devuelve el mismo formato JSON completo.`);
    if (!artifact?.title || !artifact.html) throw Object.assign(new Error('Contenido incompleto.'), { status: 422 });
    artifact.html = require('./charly-brown-mcp.js').sanitizeRichHtml(artifact.html);
    validation = validateTeacherNotesResourceReferences(artifact.html, resourceMap);
  }
  if (!validation.ok) throw Object.assign(new Error(`Contenido no válido: ${JSON.stringify(validation)}`), { status: 422 });
  return { ...artifact, activityId: targetActivity.id || task.activityId, validation };
}
class CharlyProduction {
  constructor({ store, enqueue, worker = execute, now = Date.now }) { Object.assign(this, { store, enqueue, worker, now }); }
  async start(uid, sessionId, unitId, enabledExerciseDynamics) { const id = await this.store.start(uid, sessionId, unitId, enabledExerciseDynamics); await this.advance(id); return this.status(uid, id); }
  async status(uid, id) {
    await this.store.read(id, uid);
    await this.advance(id);
    await this.store.enforceResourceBudget(id);
    const { run, tasks, session, unit } = await this.store.read(id, uid);
    const sections = unit?.workflow?.activitySections || [];
    const plannedResources = { worksheet: 0, annex: 0, cutout: 0, 'video-script': 0 };
    sections.forEach((section) => {
      const types = section.resourceTypes || getTypesFromSelections(section.resourceSelections || {});
      [...new Set(types)].forEach((type) => {
        if (Object.hasOwn(plannedResources, type)) plannedResources[type] = Math.min(RESOURCE_LIMITS[type], plannedResources[type] + 1);
      });
    });
    const plannedTotal = sections.length * 2 + Math.min(MAX_UNIT_RESOURCES, Object.values(plannedResources).reduce((sum, count) => sum + count, 0));
    return {
      id,
      plannedTotal,
      status: run.status,
      unitId: run.unitId,
      session,
      tasks: tasks.map(({ id, stage, status, order, attempt, error, dueAt, section, subtopic, activityId, code }) => {
        const secObj = typeof section === 'object' && section !== null ? section : {};
        const resolvedSection = (secObj.section || secObj.name || (typeof section === 'string' ? section : '')) || '';
        const resolvedSubtopic = (subtopic || secObj.mathFocus || secObj.subtopic || '') || '';
        return {
          id,
          stage,
          status,
          order,
          attempt,
          error,
          dueAt,
          activityId: activityId || '',
          code: code || '',
          section: resolvedSection,
          subtopic: resolvedSubtopic,
          agentLabel: resolvedSubtopic ? `Agente de ${resolvedSubtopic}` : ''
        };
      })
    };
  }
  async control(uid, id, action) {
    if (action === 'restart') {
      const { run } = await this.store.read(id, uid);
      await this.store.control(id, uid, 'cancel');
      return this.start(uid, run.sessionId, run.unitId);
    }
    await this.store.control(id, uid, action);
    if (action === 'resume') await this.advance(id);
    return this.status(uid, id);
  }
  async advance(id) {
    let state = await this.store.read(id);
    if (state.run.status !== 'running') return;
    await require('./pigpen-demand-recovery.js').scheduleRecovery(this.store, id, { queue: QUEUES.charly, targetUrl: `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/recoverCharlyProductionTask` });
    await this.store.enforceResourceBudget(id);
    state = await this.store.read(id);
    if (!state.unit) { await this.store.control(id, state.run.ownerUid, 'attention'); return; }
    await this.store.add(id, state.run.epoch, nextTasks(state.run, state.tasks, state.unit));
    state = await this.store.read(id);
    if (state.tasks.some(t => t.stage === 'notes') && state.tasks.every(t => ['completed', 'failed', 'stale'].includes(t.status))) {
      await this.store.control(id, state.run.ownerUid, state.tasks.some(t => t.status !== 'completed') ? 'attention' : 'complete'); return;
    }
    const unfinished = state.tasks.filter(t => ['pending', 'running'].includes(t.status));
    if (!unfinished.length && state.tasks.some(t => ['failed', 'stale'].includes(t.status))) {
      await this.store.control(id, state.run.ownerUid, 'attention'); return;
    }

    const activeSlots = (state.run.slots || []).filter(slot => slot.until > this.now());
    const runningTasks = state.tasks.filter(t => t.status === 'running' && t.leaseUntil > this.now());

    const hasPendingOrRunningActivity = state.tasks.some(t => t.stage === 'activity' && ['pending', 'running'].includes(t.status));
    const hasPendingOrRunningResource = state.tasks.some(t => TYPES.includes(t.stage) && ['pending', 'running'].includes(t.status));
    const phase = hasPendingOrRunningActivity ? 'activity' : (hasPendingOrRunningResource ? 'resources' : 'notes');

    const busyActivityIds = new Set();
    activeSlots.forEach(s => { if (s.activityId) busyActivityIds.add(s.activityId); });
    runningTasks.forEach(t => { if (t.activityId) busyActivityIds.add(t.activityId); });

    const occupiedStageSlots = {};
    activeSlots.forEach(s => { occupiedStageSlots[s.stage] = (occupiedStageSlots[s.stage] || 0) + 1; });
    runningTasks.forEach(t => {
      occupiedStageSlots[t.stage] = Math.max(occupiedStageSlots[t.stage] || 0, runningTasks.filter(rt => rt.stage === t.stage).length);
    });

    const pendingCandidates = state.tasks.filter(t => t.status === 'pending' || (t.status === 'running' && t.leaseUntil <= this.now()))
      .sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0) || a.order - b.order);

    const pending = [];

    if (phase === 'activity') {
      const maxActivities = productionConcurrency('activity');
      let available = Math.max(0, maxActivities - (occupiedStageSlots['activity'] || 0));
      for (const t of pendingCandidates) {
        if (available <= 0) break;
        if (t.stage !== 'activity') continue;
        if (t.activityId && busyActivityIds.has(t.activityId)) continue;
        pending.push(t);
        if (t.activityId) busyActivityIds.add(t.activityId);
        available -= 1;
      }
    } else if (phase === 'resources') {
      const limits = {
        'video-script': productionConcurrency('video-script'),
        worksheet: productionConcurrency('worksheet'),
        cutout: productionConcurrency('cutout'),
        annex: productionConcurrency('annex')
      };
      const currentCounts = {
        'video-script': occupiedStageSlots['video-script'] || 0,
        worksheet: occupiedStageSlots['worksheet'] || 0,
        cutout: occupiedStageSlots['cutout'] || 0,
        annex: occupiedStageSlots['annex'] || 0
      };
      let totalAvailable = Math.max(0, productionConcurrency('resources') - Object.values(currentCounts).reduce((a, b) => a + b, 0));

      const stagePriority = ['video-script', 'worksheet', 'cutout', 'annex'];
      for (const stage of stagePriority) {
        if (totalAvailable <= 0) break;
        const stageLimit = limits[stage] || 1;
        const needed = stageLimit - (currentCounts[stage] || 0);
        if (needed <= 0) continue;

        const candidatesForStage = pendingCandidates.filter(t => t.stage === stage && (!t.activityId || !busyActivityIds.has(t.activityId)));
        for (const t of candidatesForStage) {
          if (totalAvailable <= 0 || (currentCounts[stage] || 0) >= stageLimit) break;
          if (t.activityId && busyActivityIds.has(t.activityId)) continue;

          pending.push(t);
          currentCounts[stage] = (currentCounts[stage] || 0) + 1;
          totalAvailable -= 1;
          if (t.activityId) busyActivityIds.add(t.activityId);
        }
      }
    } else if (phase === 'notes') {
      const maxNotes = productionConcurrency('notes');
      let available = Math.max(0, maxNotes - (occupiedStageSlots['notes'] || 0));
      for (const t of pendingCandidates) {
        if (available <= 0) break;
        if (t.stage !== 'notes') continue;
        if (t.activityId && busyActivityIds.has(t.activityId)) continue;
        pending.push(t);
        if (t.activityId) busyActivityIds.add(t.activityId);
        available -= 1;
      }
    }

    await Promise.all(pending.map(t => this.enqueue(id, t, state.run.epoch)));
  }
  async dispatch(id, taskId) {
    let claim;
    try { claim = await this.store.claim(id, taskId); }
    catch (error) {
      if (error.status === 409) {
        const { run } = await this.store.read(id);
        await this.store.control(id, run.ownerUid, 'attention');
        return { stale: true };
      }
      console.error('[charly-production] Error al reclamar tarea:', { runId: id, taskId, error: error.message });
      throw error;
    }
    if (!claim) { await this.advance(id); return { skipped: true }; }
    console.info('[charly-production] >>> Tarea reclamada para ejecución:', { runId: id, taskId, stage: claim.task.stage, subtopic: claim.task.subtopic, attempt: claim.task.attempt });
    const controller = new AbortController(); let timer;
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const e = Object.assign(new Error('Tiempo de generación agotado (360s).'), { status: 504 });
          controller.abort(e);
          reject(e);
        }, 360000);
      });
      const result = await Promise.race([this.worker(claim, controller.signal), deadline]);
      console.info('[charly-production] ✔ Tarea completada con éxito:', { runId: id, taskId, stage: claim.task.stage });
      await this.store.finish(id, claim.task, result);
    } catch (error) {
      console.error('[charly-production] ❌ ERROR EN WORKER DE TAREA:', {
        runId: id,
        taskId,
        stage: claim.task.stage,
        subtopic: claim.task.subtopic,
        attempt: claim.task.attempt,
        error: error.message,
        code: error.code,
        status: error.status,
        stack: error.stack
      });
      await this.store.finish(id, claim.task, null, error);
    }
    finally { clearTimeout(timer); }
    await this.advance(id); return { ok: true };
  }
}
function createProduction(dependencies = {}) {
  const db = dependencies.db || getAdminServices().db;
  let production;
  const isCloudEnvironment = Boolean(process.env.K_SERVICE || process.env.FUNCTION_NAME || process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_CONFIG);
  const enqueueInline = async (id, task) => {
    const scheduleKey = `${id}:${task.id}`;
    if (inlineScheduledTasks.has(scheduleKey)) return { local: true, duplicate: true };
    inlineScheduledTasks.add(scheduleKey);
    const waitMs = Math.max(0, Number(task.dueAt || 0) - Date.now());
    console.info('[charly-production] Despacho inline programado en', waitMs, 'ms para:', { taskId: task.id, stage: task.stage });
    const timer = setTimeout(() => {
      inlineScheduledTasks.delete(scheduleKey);
      void production.dispatch(id, task.id).catch(error => console.error('[charly-production] inline dispatch failed', { runId: id, taskId: task.id, message: error.message }));
    }, waitMs);
    timer.unref?.();
    return { local: true, waitMs };
  };
  const enqueueCloudTask = async (id, task, epoch) => {
    try {
      console.info('[charly-production] Encolando en Cloud Tasks:', { runId: id, taskId: task.id, stage: task.stage, attempt: task.attempt });
      return await enqueueHttpTask({
        queue: QUEUES.charly,
        kind: 'charly-production',
        jobId: `${id}:${task.id}:${epoch}:${task.attempt}:${Math.floor(Date.now() / 60000)}`,
        targetUrl: `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/dispatchCharlyProductionTask`,
        serviceAccountEmail: `charly-tasks-invoker@${PROJECT_ID}.iam.gserviceaccount.com`,
        payload: { runId: id, taskId: task.id },
        scheduleDelaySeconds: Math.max(0, ((task.dueAt || 0) - Date.now()) / 1000),
        dispatchDeadlineSeconds: 300
      });
    } catch (err) {
      // Cloud Run may stop CPU after the response. Keep the durable job pending for recovery.
      throw Object.assign(err, { code: err.code || 'cloud_task_submission_failed' });
    }
  };
  const enqueue = dependencies.enqueue || (isCloudEnvironment ? enqueueCloudTask : enqueueInline);
  production = new CharlyProduction({ store: new CharlyProductionStore(db), worker: dependencies.worker || execute, enqueue });
  return production;
}
function registerProductionRoutes(app, contextFor, dependencies = {}) {
  const production = () => createProduction(dependencies);
  const handle = operation => async (req, res) => {
    try {
      const context = await contextFor(req);
      if (req.method !== "GET") context.rateLimit?.("mcp");
      if (!context.approvedUser) return res.status(403).json({ error: 'USER_NOT_APPROVED' });
      if (!ready()) return res.status(503).json({ error: 'CHARLY_PRODUCTION_DISABLED', message: 'La producción especializada aún no está habilitada en el servidor.' });
      const value = await operation(context.uid, req, production()); res.json(value);
    } catch (error) { res.status(error.status || 500).json({ error: error.code || 'CHARLY_PRODUCTION_FAILED', message: error.message }); }
  };
  app.get('/api/charly-brown/production/config', async (req, res) => {
    try { const context = await contextFor(req); res.json({ enabled: Boolean(context.approvedUser && ready()), mode: inlineSpecialistsEnabled() ? 'inline' : 'specialists' }); }
    catch (error) { res.status(401).json({ error: error.message }); }
  });
  app.post('/api/charly-brown/production', handle((uid, req, p) => p.start(uid, req.body?.sessionId, req.body?.targetUnitId, req.body?.enabledExerciseDynamics)));
  app.get('/api/charly-brown/production/:id', handle((uid, req, p) => p.status(uid, req.params.id)));
  app.post('/api/charly-brown/production/:id/:action', handle((uid, req, p) => {
    if (!['cancel', 'resume', 'restart', 'pause'].includes(req.params.action)) throw Object.assign(new Error('Acción inválida.'), { status: 400 });
    return p.control(uid, req.params.id, req.params.action);
  }));
}
async function recover() {
  if (!enabled()) return;
  const { db } = getAdminServices(), production = createProduction({ db });
  const runs = await db.collection(COLLECTION).where('status', '==', 'running').limit(100).get();
  await Promise.allSettled(runs.docs.map(d => production.advance(d.id)));
}
module.exports = { CharlyProduction, createProduction, registerProductionRoutes, recover, enabled, ready, inlineSpecialistsEnabled, buildResourceTaskInput, execute };
