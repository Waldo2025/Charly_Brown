const { randomUUID } = require('node:crypto');
const { hash, configuration, initialTasks, LIMITS, retryDelay, needsUser } = require('./marcie-production-policy.js');
const { getPolicy, claimManyDaily } = require('./savings-policy.js');
const COLLECTION = 'MarcieProductionRuns';
const LEASE_MS = 240000;
const fail = (message, status) => Object.assign(new Error(message), { status });
const clean = value => JSON.parse(JSON.stringify(value));
class ProductionStore {
  constructor(db, clock = Date.now) { this.db = db; this.clock = clock; }
  ref(id) { if (!/^[a-f0-9]{32}$/.test(id)) throw fail('Producción inválida.', 400); return this.db.collection(COLLECTION).doc(id); }
  async owned(uid, sessionId) {
    if (!sessionId || /\//.test(sessionId)) throw fail('Sesión inválida.', 400);
    const ref = this.db.collection('MarcieBlogEditor').doc(sessionId);
    const snap = await ref.get();
    if (!snap.exists) throw fail('Sesión no encontrada.', 404);
    const session = snap.data();
    if (![session.ownerId, session.ownerUid].includes(uid)) throw fail('Sesión de otro usuario.', 403);
    return { ref, session };
  }
  async start(uid, sessionId) {
    const { ref: sessionRef, session } = await this.owned(uid, sessionId);
    const config = configuration(session);
    const id = hash([sessionId, config, session.automation?.startedAt || session.createdAt]);
    const ref = this.ref(id);
    const policy = await getPolicy(this.db);
    if (policy.limits.marcieAudiences != null && !(await ref.get()).exists) {
      const newAudiences = config.audiences.filter(audience => !session.articlesByAudience?.[audience]?.blocks?.length);
      await claimManyDaily(this.db, uid, 'marcieAudiences', newAudiences.map(audience => `${sessionId}_${audience}`), policy.limits.marcieAudiences);
    }
    await this.db.runTransaction(async tx => {
      const [existing, latest] = await Promise.all([tx.get(ref), tx.get(sessionRef)]);
      if (existing.exists) return;
      if (hash(configuration(latest.data())) !== hash(config) || hash([sessionId, config, latest.data().automation?.startedAt || latest.data().createdAt]) !== id) throw fail('La configuración cambió.', 409);
      const currentSession = latest.data();
      const imported = { articles: currentSession.articlesByAudience || {}, audits: currentSession.auditsByAudience || {}, drafts: currentSession.articleDraftsByAudience || {}, research: currentSession.researchByAudience || {}, global: currentSession.researchGlobal || null };
      const run = { id, sessionId, ownerId: uid, config, configHash: hash(config), status: 'running', epoch: randomUUID(), createdAt: this.clock(), startedAt: session.automation?.startedAt || new Date(this.clock()).toISOString(), updatedAt: this.clock(), imported,
        baseArticles: Object.fromEntries(config.audiences.map(a => [a, hash(currentSession.articlesByAudience?.[a] || null)])) };
      tx.create(ref, clean(run));
      for (const item of initialTasks(config, session)) tx.create(ref.collection('tasks').doc(item.id), item);
      tx.update(sessionRef, { 'automation.productionId': id, 'automation.engine': 'persistent', 'automation.startedAt': run.startedAt, 'automation.status': 'running', storageRevision: Number(session.storageRevision || 0) + 1 });
    });
    return id;
  }
  async read(id, uid) {
    const ref = this.ref(id); const snap = await ref.get();
    if (!snap.exists) throw fail('Producción no encontrada.', 404);
    const run = snap.data();
    if (uid && run.ownerId !== uid) throw fail('Producción de otro usuario.', 403);
    const tasks = (await ref.collection('tasks').get()).docs.map(doc => ({ ...doc.data(), id: doc.id }));
    return { run, tasks };
  }
  async control(id, uid, action) {
    await this.read(id, uid);
    await this.db.runTransaction(async tx => {
      const ref = this.ref(id); const snap = await tx.get(ref); const run = snap.data();
      if (['completed', 'completed_with_findings'].includes(run.status)) return;
      const sessionRef = this.db.collection('MarcieBlogEditor').doc(run.sessionId);
      const session = (await tx.get(sessionRef)).data();
      tx.update(sessionRef, { 'automation.status': action === 'cancel' ? 'cancelled' : 'running', ...(action === 'cancel' ? { 'automation.cancelledAt': new Date(this.clock()).toISOString() } : {}), storageRevision: Number(session.storageRevision || 0) + 1 });
      tx.update(ref, { status: action === 'cancel' ? 'cancelled' : 'running', epoch: randomUUID(), updatedAt: this.clock(), ...(action === 'cancel' ? { cancelledAt: new Date(this.clock()).toISOString() } : {}) });
    });
  }
  async addTasks(id, epoch, items) {
    if (!items.length) return;
    const ref = this.ref(id);
    await this.db.runTransaction(async tx => {
      const run = (await tx.get(ref)).data();
      const snapshots = await Promise.all(items.map(item => tx.get(ref.collection('tasks').doc(item.id))));
      if (run?.status !== 'running' || run.epoch !== epoch) return;
      items.forEach((item, i) => { if (!snapshots[i].exists) tx.create(snapshots[i].ref, clean(item)); });
    });
  }
  async stopResearch(id, epoch) {
    const ref = this.ref(id);
    await this.db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.data()?.epoch === epoch && snap.data()?.status === 'running') tx.update(ref, { researchReady: true });
    });
  }
  async claim(id, taskId) {
    const ref = this.ref(id); const taskRef = ref.collection('tasks').doc(taskId);
    const gate = this.db.collection('MarcieProductionControl').doc('capacity');
    return this.db.runTransaction(async tx => {
      const [r, t, g] = await Promise.all([tx.get(ref), tx.get(taskRef), tx.get(gate)]);
      const run = r.data(); const task = t.data(); const now = this.clock();
      if (run?.status !== 'running' || !task || ['completed', 'skipped'].includes(task.status) || task.dueAt > now || (task.status === 'running' && task.leaseUntil > now && task.epoch === run.epoch)) return null;
      if (run.researchReady && ['search', 'validate', 'select'].includes(task.stage)) return null;
      const slots = (g.data()?.slots || []).filter(slot => slot.until > now);
      const stageActive = slots.filter(slot => slot.stage === task.stage).length;
      const waiting = Object.fromEntries(Object.entries(g.data()?.waiting || {}).filter(([, at]) => now - at < 120000));
      const owners = new Set([...slots.map(slot => slot.runId), ...Object.keys(waiting), id]);
      const share = Math.ceil(10 / owners.size);
      const retrievalStages = ['validate', 'evidence', 'correct'];
      const retrievalFull = retrievalStages.includes(task.stage) && slots.filter(slot => retrievalStages.includes(slot.stage)).length >= 6;
      if (slots.length >= 10 || stageActive >= (LIMITS[task.stage] || 1) || retrievalFull || slots.filter(slot => slot.runId === id).length >= share) {
        tx.set(gate, { slots, waiting: { ...waiting, [id]: now } });
        return null;
      }
      delete waiting[id];
      const token = randomUUID(); const claim = { ...task, attempt: task.attempt + 1, status: 'running', token, epoch: run.epoch, leaseUntil: now + LEASE_MS, heartbeatAt: now };
      slots.push({ token, runId: id, stage: task.stage, until: now + LEASE_MS });
      tx.set(gate, { slots, waiting }); tx.set(taskRef, claim); tx.update(ref, { updatedAt: now });
      return { run, task: claim };
    });
  }
  async checkpoint(id, task, value) {
    const ref = this.ref(id); const taskRef = ref.collection('tasks').doc(task.id);
    const gate = this.db.collection('MarcieProductionControl').doc('capacity');
    await this.db.runTransaction(async tx => {
      const [r, t, g] = await Promise.all([tx.get(ref), tx.get(taskRef), tx.get(gate)]);
      if (r.data()?.status !== 'running' || r.data().epoch !== task.epoch || t.data()?.token !== task.token || t.data()?.status !== 'running') throw fail('Intento vencido.', 409);
      const now = this.clock();
      tx.update(taskRef, { checkpoint: clean(value), heartbeatAt: now, leaseUntil: now + LEASE_MS });
      tx.set(gate, { ...g.data(), slots: (g.data()?.slots || []).map(slot => slot.token === task.token ? { ...slot, until: now + LEASE_MS } : slot) });
    });
  }
  async finish(id, task, result, error) {
    const ref = this.ref(id); const taskRef = ref.collection('tasks').doc(task.id);
    const gate = this.db.collection('MarcieProductionControl').doc('capacity');
    return this.db.runTransaction(async tx => {
      const [r, t, g] = await Promise.all([tx.get(ref), tx.get(taskRef), tx.get(gate)]);
      const run = r.data();
      const sessionRef = run && this.db.collection('MarcieBlogEditor').doc(run.sessionId);
      const sessionSnapshot = error && needsUser(error) && sessionRef ? await tx.get(sessionRef) : null;
      tx.set(gate, { ...g.data(), slots: (g.data()?.slots || []).filter(slot => slot.token !== task.token) });
      if (run?.status !== 'running' || run.epoch !== task.epoch || t.data()?.token !== task.token) return false;
      const now = this.clock();
      tx.update(taskRef, error ? { status: 'pending', dueAt: now + retryDelay(task.attempt, error), leaseUntil: 0, error: String(error.message || error).slice(0, 500) }
        : { status: 'completed', result: clean(result ?? null), completedAt: now, leaseUntil: 0, error: null });
      if (sessionSnapshot?.exists) tx.update(sessionRef, { 'automation.status': 'failed', 'automation.message': String(error.message).slice(0, 500), storageRevision: Number(sessionSnapshot.data().storageRevision || 0) + 1 });
      tx.update(ref, { updatedAt: now, ...(error && needsUser(error) ? { status: 'needs_attention', message: String(error.message).slice(0, 500) } : {}) });
      return true;
    });
  }
  async commitAudience(id, audience, article, audit) {
    const ref = this.ref(id);
    await this.db.runTransaction(async tx => {
      const run = (await tx.get(ref)).data();
      if (run?.status !== 'running' || run.committed?.[audience]) return;
      const sessionRef = this.db.collection('MarcieBlogEditor').doc(run.sessionId);
      const session = (await tx.get(sessionRef)).data();
      if (hash(configuration(session)) !== run.configHash || hash(session.articlesByAudience?.[audience] || null) !== run.baseArticles[audience]) {
        tx.update(ref, { status: 'needs_attention', message: 'El artículo o la configuración cambiaron. Se conservan ambos resultados para revisión.' });
        tx.update(sessionRef, { 'automation.status': 'failed', 'automation.message': 'Hay cambios manuales pendientes de conciliar. Los resultados automáticos permanecen en sus checkpoints.', storageRevision: Number(session.storageRevision || 0) + 1 }); return;
      }
      const revision = Number(session.articlesByAudience?.[audience]?.revision || 0) + 1;
      const value = clean({ ...article, audience, revision });
      tx.update(sessionRef, { [`articlesByAudience.${audience}`]: value, [`auditsByAudience.${audience}`]: clean(audit),
        ...(session.audience === audience ? { article: value, audit: clean(audit) } : {}), status: 'review_required', storageRevision: Number(session.storageRevision || 0) + 1 });
      tx.update(ref, { [`committed.${audience}`]: true });
    });
  }
  async complete(id) {
    const ref = this.ref(id);
    await this.db.runTransaction(async tx => {
      const run = (await tx.get(ref)).data();
      if (run?.status !== 'running' || !run.config.audiences.every(a => run.committed?.[a])) return;
      const sessionRef = this.db.collection('MarcieBlogEditor').doc(run.sessionId);
      const session = (await tx.get(sessionRef)).data();
      const completedAt = new Date(this.clock()).toISOString();
      const findings = Object.values(session.auditsByAudience || {}).some(audit => audit.issues?.length) || Object.values(session.articlesByAudience || {}).some(article => article.verification?.blockers?.length);
      const status = findings ? 'completed_with_findings' : 'completed';
      tx.update(ref, { status, completedAt });
      tx.update(sessionRef, { 'automation.status': status, 'automation.progress': 100, 'automation.stage': 'corrections', 'automation.completedAt': completedAt, 'automation.message': 'Producción completada. Revisa los artículos antes de aprobarlos.', storageRevision: Number(session.storageRevision || 0) + 1 });
    });
  }
}
module.exports = { ProductionStore, COLLECTION, LEASE_MS };
