const { hash, clean, fail, identifier, configuration, task, taskClass, LIMITS, retryPolicy, randomUUID, parseHttpStatus } = require('./pigpen-generation-policy.js');
const COLLECTION = process.env.PIGPEN_LOCAL_WORKER === 'true' ? 'PigPenLocalGenerationRuns' : 'PigPenGenerationRuns';
const CONTROL = process.env.PIGPEN_LOCAL_WORKER === 'true' ? 'PigPenLocalGenerationControl' : 'PigPenGenerationControl';
const LEASE_MS = 540000;
class GenerationStore {
  constructor(db, artifacts, now = Date.now) { this.db = db; this.artifacts = artifacts; this.now = now; }
  ref(id) { return this.db.collection(COLLECTION).doc(identifier(id)); }
  topic(sessionId, topicId) { return this.db.collection('escapeRoom').doc(identifier(sessionId)).collection('topics').doc(identifier(topicId)); }
  async owned(uid, sessionId, topicId) {
    const session = await this.db.collection('escapeRoom').doc(identifier(sessionId)).get();
    if (!session.exists || ![session.data().ownerId, session.data().ownerUid, session.data().uid, session.data().userId].includes(uid)) throw fail('No tienes acceso a esta sesión.', 403);
    const ref = this.topic(sessionId, topicId), snapshot = await ref.get();
    if (!snapshot.exists) throw fail('Tema no encontrado.', 404);
    return { ref, data: snapshot.data() };
  }
  async start(uid, input) {
    const { sessionId, topicId } = input;
    const {data:existingTopic} = await this.owned(uid, sessionId, topicId);
    const parent = await this.db.collection('escapeRoom').doc(sessionId).get();
    if (parent.data()?.status === 'published') throw fail('Cambia la sesión a borrador antes de generar.', 409);
    const config = configuration(input.config);
    if (!['objective', 'full'].includes(input.mode)) throw fail('Modo de generación inválido.');
    const key = identifier(input.idempotencyKey || randomUUID());
    const id = hash([uid, sessionId, topicId, key]);
    if (input.mode === 'full' && !(await this.ref(id).get()).exists) {
      const { getPolicy, claimDaily } = require('./savings-policy.js');
      const policy = await getPolicy(this.db);
      await claimDaily(this.db, uid, 'pigpenTopics', `${sessionId}_${topicId}`, policy.limits.pigpenTopics, { completed: false });
    }
    let master = null;
    const core = require('./pigpen-generation-core.generated.js').createCore({ requestQualityJson: () => { throw Error('No model calls during validation'); } });
    const settings = value => core.buildObjectiveSourceContract(value).configuration;
    const saved = existingTopic.formState?.__objectiveBlueprint;
    if (input.mode === 'full' && input.reuseBlueprint && saved?.source_contract?.applied_plan_text === config.objetivo
      && hash(saved.source_contract.configuration) === hash(settings(config))) master = structuredClone(saved);
    if (input.planRunId) {
      const prior = await this.read(input.planRunId, uid);
      if (prior.run.sessionId !== sessionId || prior.run.topicId !== topicId || prior.run.status !== 'completed') throw fail('El plan no está disponible para este tema.', 409);
      master ||= (await this.results(prior.tasks)).find(t => t.stage === 'objective')?.result;
      if (!master) throw fail('El plan no tiene resultado.', 409);
      // Objective text changes when it is formatted; compare the source and configuration separately in the client.
      if (hash(settings(config)) !== hash(settings(prior.run.config))) throw fail('La configuración cambió; vuelve a enriquecer el objetivo.', 409);
    }
    const masterRef = master ? await this.artifacts.put(`${id}/imported-master-${hash(master)}`, master) : null;
    const previousProjectRef = master && existingTopic.project ? await this.artifacts.put(`${id}/previous-project-${hash(existingTopic.project)}`,existingTopic.project) : null;
    await this.db.runTransaction(async tx => {
      const ref = this.ref(id), topicRef = this.topic(sessionId, topicId);
      const [existing, snapshot] = await Promise.all([tx.get(ref), tx.get(topicRef)]);
      if (existing.exists) {
        if (hash(existing.data().config) !== hash(config) || existing.data().mode !== input.mode) throw fail('La clave de esta solicitud ya se usó con otra configuración.',409);
        return;
      }
      const topic = snapshot.data();
      if (!topic) throw fail('Tema no encontrado.', 404);
      if (topic.generation?.status === 'running') throw fail('Este tema ya tiene una generación activa.', 409);
      const run = { id, ownerId: uid, sessionId, topicId, mode: input.mode, config, status: 'running', epoch: randomUUID(), createdAt: this.now(), updatedAt: this.now(),
        baseHash: hash([topic.project || null, topic.formState || null]), previousProjectRef, message: '' };
      tx.create(ref, run);
      tx.create(ref.collection('tasks').doc('objective--1-0-main'), { ...task('objective'), ...(masterRef ? { status: 'completed', resultRef: masterRef, completedAt: this.now() } : {}) });
      tx.update(topicRef, { generation: { runId: id, mode: input.mode, status: 'running' } });
    });
    return id;
  }
  async read(id, uid) {
    const ref = this.ref(id), snapshot = await ref.get();
    if (!snapshot.exists) throw fail('Generación no encontrada.', 404);
    const run = snapshot.data();
    if (uid) { if (run.ownerId !== uid) throw fail('Generación de otro usuario.', 403); await this.owned(uid, run.sessionId, run.topicId); }
    return { run, tasks: (await ref.collection('tasks').get()).docs.map(d => ({ ...d.data(), id: d.id })) };
  }
  async results(tasks) { return Promise.all(tasks.map(async t => ({ ...t, ...(t.resultRef ? { result: await this.artifacts.get(t.resultRef) } : {}) }))); }
  async addTasks(id, epoch, items) {
    if (!items.length) return;
    const ref = this.ref(id);
    await this.db.runTransaction(async tx => {
      const run = (await tx.get(ref)).data();
      const snapshots = await Promise.all(items.map(t => tx.get(ref.collection('tasks').doc(t.id))));
      if (run?.status !== 'running' || run.epoch !== epoch) return;
      items.forEach((t,i) => { if (!snapshots[i].exists) tx.create(ref.collection('tasks').doc(t.id), clean(t)); });
    });
  }
  async claim(id, taskId) {
    const ref = this.ref(id), itemRef = ref.collection('tasks').doc(identifier(taskId)), gate = this.db.collection(CONTROL).doc('capacity');
    return this.db.runTransaction(async tx => {
      const [r,t,g] = await Promise.all([tx.get(ref), tx.get(itemRef), tx.get(gate)]);
      const run = r.data(), item = t.data(), now = this.now();
      if (run?.status !== 'running' || !item || item.status !== 'pending' || item.dueAt > now) return null;
      const slots = (g.data()?.slots || []).filter(s => s.until > now);
      const kind = taskClass(item.stage), cooling = (g.data()?.cooldownUntil || 0) > now;
      if (slots.filter(s => s.kind === kind).length >= (cooling ? 1 : LIMITS[kind])) return null;
      const token = randomUUID();
      const claimed = { ...item, token, epoch: run.epoch, attempt: item.attempt + 1, status: 'running', startedAt: now, heartbeatAt: now, leaseUntil: now + LEASE_MS };
      slots.push({ token, runId: id, kind, until: now + LEASE_MS });
      tx.set(gate, { ...g.data(), slots }); tx.set(itemRef, claimed); tx.update(ref, { updatedAt: now });
      return { run, task: claimed };
    });
  }
  async heartbeat(id, item) {
    const ref = this.ref(id), itemRef = ref.collection('tasks').doc(item.id), gate = this.db.collection(CONTROL).doc('capacity');
    await this.db.runTransaction(async tx => {
      const [r,t,g] = await Promise.all([tx.get(ref),tx.get(itemRef),tx.get(gate)]);
      if (r.data()?.status !== 'running' || r.data().epoch !== item.epoch || t.data()?.token !== item.token || t.data().status !== 'running') throw fail('Ejecución cancelada o reemplazada.', 409);
      const now = this.now(); tx.update(itemRef, { heartbeatAt: now, leaseUntil: now + LEASE_MS });
      tx.set(gate, { ...g.data(), slots: (g.data()?.slots || []).map(s => s.token === item.token ? { ...s, until: now + LEASE_MS } : s) });
    });
  }
  async finish(id, item, result, error, metrics = []) {
    const resultRef = !error ? await this.artifacts.put(`${id}/${item.id}/${item.token}`, result) : null;
    const partialRef = error?.partialResult ? await this.artifacts.put(`${id}/${item.id}/${item.token}-partial`,error.partialResult) : null;
    const ref = this.ref(id), itemRef = ref.collection('tasks').doc(item.id), gate = this.db.collection(CONTROL).doc('capacity');
    return this.db.runTransaction(async tx => {
      const [r,t,g] = await Promise.all([tx.get(ref),tx.get(itemRef),tx.get(gate)]);
      const now = this.now();
      const errStatus = parseHttpStatus(error);
      tx.set(gate, { ...g.data(), slots: (g.data()?.slots || []).filter(s => s.token !== item.token), ...(errStatus === 429 ? { cooldownUntil: now + 60000 } : {}) });
      if (r.data()?.status !== 'running' || r.data().epoch !== item.epoch || t.data()?.token !== item.token || t.data().status !== 'running') return false;
      const state = error ? retryPolicy(item.stage === 'image' && errStatus >= 500 ? Object.assign(error,{uncertain:true}) : error, item.attempt, now) : { status: 'completed', resultRef, completedAt: now, error: null };
      tx.update(itemRef, { ...state, metrics:clean(metrics), ...(partialRef ? {partialRef,validationIssues:clean(error.validationIssues || [])} : {}), leaseUntil: 0, finishedAt: now });
      tx.update(ref, { updatedAt: now });
      return true;
    });
  }
  async expire(id) {
    const { tasks } = await this.read(id);
    for (const item of tasks.filter(t => t.status === 'running' && t.leaseUntil < this.now())) await this.db.runTransaction(async tx => {
      const ref = this.ref(id).collection('tasks').doc(item.id), fresh = (await tx.get(ref)).data();
      if (fresh?.status === 'running' && fresh.leaseUntil < this.now()) tx.update(ref, { status: 'needs_attention', uncertain: true, error: 'El worker dejó de responder. Reanuda explícitamente para evitar duplicar consumo.', leaseUntil: 0 });
    });
  }
  async settle(id, { status, resultRef = null, message = '' }) {
    const ref = this.ref(id);
    const settled = await this.db.runTransaction(async tx => {
      const run = (await tx.get(ref)).data();
      if (run?.status !== 'running') return;
      const topicRef = this.topic(run.sessionId, run.topicId), snapshot = await tx.get(topicRef), topic = snapshot.data();
      tx.update(ref, { status, resultRef, message, updatedAt: this.now(), ...(status === 'completed' ? { completedAt: this.now() } : {}) });
      if (topic?.generation?.runId === id) tx.update(topicRef, { generation: { ...topic.generation, status, message } });
      return true;
    });
    if (settled !== undefined) {
      const run = (await ref.get()).data();
      if (run?.mode === 'full' && ['completed', 'cancelled', 'needs_attention'].includes(status)) {
        const savings = require('./savings-policy.js');
        const action = status === 'completed' ? savings.completeDaily : savings.releaseDaily;
        await action(this.db, run.ownerId, 'pigpenTopics', `${run.sessionId}_${run.topicId}`);
      }
    }
    return settled;
  }
  async commit(id, result) {
    const ref = this.ref(id);
    return this.db.runTransaction(async tx => {
      const run = (await tx.get(ref)).data();
      if (run?.status !== 'running') return false;
      const topicRef = this.topic(run.sessionId, run.topicId), topic = (await tx.get(topicRef)).data();
      if (!topic || topic.generation?.runId !== id || hash([topic.project || null, topic.formState || null]) !== run.baseHash) {
        tx.update(ref, { commitConflict: true, message: 'Hay cambios manuales. El resultado se conserva sin reemplazarlos.' }); return false;
      }
      if (Buffer.byteLength(JSON.stringify(result.project)) > 750000) { tx.update(ref, { commitConflict: true, message: 'Resultado guardado en Storage; demasiado grande para el documento del tema.' }); return false; }
      tx.update(topicRef, { project: result.project, title: result.project.titulo, updatedAt: new Date(this.now()), generation: { ...topic.generation, status: 'completed' } });
      return true;
    });
  }
  async control(uid, id, action) {
    const { run } = await this.read(id, uid);
    if (!['cancel','resume','retry'].includes(action)) throw fail('Acción inválida.');
    const ref = this.ref(id);
    await this.db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      const snapshots = await tx.get(ref.collection('tasks'));
      const topicRef = this.topic(run.sessionId, run.topicId), topic = (await tx.get(topicRef)).data();
      if (current.status === 'completed') return;
      if (topic?.generation?.runId !== id) throw fail('Otra generación reemplazó esta ejecución.', 409);
      const status = action === 'cancel' ? 'cancelled' : 'running';
      const reviewFinished = snapshots.docs.some(d=>d.data().stage==='review' && d.data().revision===(current.maxReviewRevision || 1) && d.data().status==='completed');
      tx.update(ref, { status, epoch: randomUUID(), message: '', updatedAt: this.now(), ...(action!=='cancel' && current.status==='needs_attention' && reviewFinished ? {maxReviewRevision:(current.maxReviewRevision || 1)+1} : {}) });
      for (const d of snapshots.docs) if (['running','needs_attention'].includes(d.data().status)) tx.update(d.ref, { status: 'pending', dueAt: 0, leaseUntil: 0, error: null });
      tx.update(topicRef, { generation: { ...topic.generation, status } });
    });
  }
}
module.exports = { GenerationStore, COLLECTION };
