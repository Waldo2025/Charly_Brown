const { randomUUID } = require('node:crypto');
const { hash } = require('./charly-resources/contracts.js');
const { initialTasks, inputHash, RESOURCE_TYPES, RESOURCE_LIMITS, MAX_UNIT_RESOURCES, productionConcurrency, retryDelay, activityKey } = require('./charly-production-policy.js');
const COLLECTION = 'charlyProductionRuns';
const json = value => JSON.parse(JSON.stringify(value));
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const validId = value => { if (!/^[^/]{1,200}$/.test(String(value || ''))) throw fail('Identificador inválido.', 400); return value; };
class CharlyProductionStore {
  constructor(db, now = Date.now) { this.db = db; this.now = now; }
  ref(id) { return this.db.collection(COLLECTION).doc(validId(id)); }
  sessionRef(id) { return this.db.collection('charlyBrownUnitSessions').doc(validId(id)); }
  async owned(uid, sessionId) {
    const ref = this.sessionRef(sessionId), snap = await ref.get();
    if (!snap.exists) throw fail('Sesión inexistente.', 404);
    const session = { ...snap.data(), id: snap.id };
    if ((session.ownerUid || session.ownerId || session.userId) !== uid) throw fail('Sesión de otro usuario.', 403);
    return { ref, session };
  }
  async start(uid, sessionId, unitId, enabledExerciseDynamics) {
    if (enabledExerciseDynamics !== undefined) {
      const { normalizeExerciseDynamics } = await import('./charly-exercise-dynamics-catalog.mjs');
      if (!Array.isArray(enabledExerciseDynamics) || enabledExerciseDynamics.length > 18 || normalizeExerciseDynamics(enabledExerciseDynamics).length !== enabledExerciseDynamics.length) {
        throw fail('Selección de tipos de ejercicio inválida.', 400);
      }
      enabledExerciseDynamics = normalizeExerciseDynamics(enabledExerciseDynamics);
    }
    const { ref: sessionRef } = await this.owned(uid, sessionId);
    return this.db.runTransaction(async tx => {
      const session = (await tx.get(sessionRef)).data(), unit = session.units?.find(u => u.id === unitId);
      if (!unit) throw fail('Unidad inexistente.', 404);
      if (unit.automation?.id && unit.automation.status === 'running') return unit.automation.id;
      if (Array.isArray(enabledExerciseDynamics)) unit.meta = { ...unit.meta, enabledExerciseDynamics };
      const activityIds = new Set((unit.accepted?.activities || []).map(activity => String(activity.id || '')).filter(Boolean));
      if (Array.isArray(unit.accepted?.teacherNotes)) {
        unit.accepted.teacherNotes = unit.accepted.teacherNotes.filter(note =>
          note?.automated !== true || !note.activityId || activityIds.has(String(note.activityId))
        );
      }
      const id = randomUUID(), tasks = initialTasks(unit), now = this.now();
      const run = { id, sessionId, unitId, ownerUid: uid, status: 'running', epoch: randomUUID(), inputHash: inputHash(unit), slots: [], createdAt: now, updatedAt: now };
      tx.create(this.ref(id), run);
      for (const task of tasks) tx.create(this.ref(id).collection('tasks').doc(task.id), json(task));
      unit.automation = { id, status: 'running' };
      tx.update(sessionRef, { units: session.units, storageRevision: Number(session.storageRevision || 0) + 1 });
      return id;
    });
  }
  async read(id, uid) {
    const ref = this.ref(id), snap = await ref.get();
    if (!snap.exists) throw fail('Ejecución inexistente.', 404);
    const run = snap.data();
    if (uid && run.ownerUid !== uid) throw fail('Ejecución de otro usuario.', 403);
    const tasks = (await ref.collection('tasks').get()).docs.map(d => {
      const data = d.data();
      return { ...data, id: d.id, error: data.status === 'completed' ? null : (data.error || null) };
    }).filter(task => task.status !== 'skipped');
    const { session } = await this.owned(run.ownerUid, run.sessionId);
    return { run, tasks, session, unit: session.units?.find(u => u.id === run.unitId) };
  }
  async add(id, epoch, items) {
    if (!items.length) return;
    const ref = this.ref(id);
    await this.db.runTransaction(async tx => {
      const run = (await tx.get(ref)).data();
      const snapshots = await Promise.all(items.map(t => tx.get(ref.collection('tasks').doc(t.id))));
      if (run.status !== 'running' || run.epoch !== epoch) return;
      items.forEach((item, i) => { if (!snapshots[i].exists) tx.create(ref.collection('tasks').doc(item.id), json(item)); });
    });
  }
  async enforceResourceBudget(id) {
    const ref = this.ref(id);
    await this.db.runTransaction(async tx => {
      const run = (await tx.get(ref)).data();
      if (!run || run.status !== 'running') return;
      const snapshot = await tx.get(ref.collection('tasks'));
      const session = (await tx.get(this.sessionRef(run.sessionId))).data();
      const unit = session?.units?.find(item => item.id === run.unitId);
      if (!unit) return;
      const resources = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
        .filter(task => Object.hasOwn(RESOURCE_TYPES, task.stage) && task.status !== 'skipped');
      const trackedIds = new Set(resources.map(task => `auto_${task.id}`));
      const priority = { completed: 0, running: 1, pending: 2, failed: 3, stale: 4 };
      resources.sort((a, b) => (priority[a.status] ?? 5) - (priority[b.status] ?? 5)
        || (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));
      const excess = [];
      for (const [stage, label] of Object.entries(RESOURCE_TYPES)) {
        const untracked = (unit.accepted?.resources || []).filter(resource => !trackedIds.has(resource.id)
          && [stage, label].includes(resource.type || resource.contentType)).length;
        excess.push(...resources.filter(task => task.stage === stage)
          .slice(Math.max(0, RESOURCE_LIMITS[stage] - untracked))
          .filter(task => task.status !== 'completed'));
      }
      if (!excess.length) return;
      const excluded = new Set(excess.map(task => task.id));
      excess.forEach(task => tx.update(ref.collection('tasks').doc(task.id), {
        status: 'skipped', reason: 'Límite máximo de seis recursos por tipo en la unidad.', leaseUntil: 0
      }));
      tx.update(ref, { slots: (run.slots || []).filter(slot => !excluded.has(slot.taskId)), updatedAt: this.now() });
    });
  }
  async claim(id, taskId) {
    const ref = this.ref(id), taskRef = ref.collection('tasks').doc(validId(taskId));
    return this.db.runTransaction(async tx => {
      const [r, t] = await Promise.all([tx.get(ref), tx.get(taskRef)]), run = r.data(), task = t.data(), now = this.now();
      if (!run || run.status !== 'running' || !task || ['completed', 'failed', 'stale', 'skipped'].includes(task.status) || task.dueAt > now || (task.status === 'running' && task.leaseUntil > now && task.epoch === run.epoch)) return null;
      const slots = (run.slots || []).filter(s => s.until > now && s.taskId !== taskId);
      // The retry policy allows up to six attempts for quota exhaustion. Keep
      // the lease-recovery guard aligned so a checkpoint is not failed early.
      if (task.attempt >= 6) {
        tx.update(ref, { slots, updatedAt: now });
        tx.update(taskRef, { status: 'failed', error: 'Se agotaron los intentos después de interrupciones del worker.', leaseUntil: 0 });
        return null;
      }
      const stageSlots = slots.filter(s => (s.stage || (['annex', 'cutout', 'worksheet', 'video-script'].includes(task.stage) ? 'resources' : 'activity')) === task.stage);
      if (stageSlots.length >= productionConcurrency(task.stage)) throw fail('Capacidad ocupada; reintenta.', 429);
      if (['annex', 'cutout', 'worksheet', 'video-script'].includes(task.stage)) {
        const totalResourceSlots = slots.filter(s => ['annex', 'cutout', 'worksheet', 'video-script'].includes(s.stage) || s.stage === 'resources');
        if (totalResourceSlots.length >= productionConcurrency('resources')) throw fail('Capacidad ocupada; reintenta.', 429);
      }
      if (task.activityId && slots.some(s => s.activityId === task.activityId && s.until > now)) {
        throw fail('Actividad ocupada por otro especialista; reintenta.', 429);
      }
      const session = (await tx.get(this.sessionRef(run.sessionId))).data(), unit = session.units?.find(u => u.id === run.unitId);
      if (!unit || inputHash(unit) !== run.inputHash) throw fail('Cambió el contexto curricular. Inicia una nueva ejecución.', 409);
      const activity = unit.accepted.activities.find(a => a.id === task.activityId);
      const token = randomUUID();
      const claim = { ...task, token, epoch: run.epoch, status: 'running', attempt: task.attempt + 1, leaseUntil: now + 300000, activityHash: activity ? hash(activity) : '' };
      delete claim.error;
      tx.update(ref, { slots: [...slots, { taskId, token, stage: task.stage, activityId: task.activityId, until: now + 300000 }], updatedAt: now });
      tx.set(taskRef, json(claim));
      return { run, task: claim, unit: json(unit) };
    });
  }
  async finish(id, task, artifact, error) {
    const ref = this.ref(id), taskRef = ref.collection('tasks').doc(task.id);
    await this.db.runTransaction(async tx => {
      const [r, t] = await Promise.all([tx.get(ref), tx.get(taskRef)]), run = r.data();
      const sessionRef = this.sessionRef(run.sessionId), session = (await tx.get(sessionRef)).data();
      if (run.epoch !== task.epoch || run.status !== 'running' || t.data()?.token !== task.token || t.data()?.status !== 'running') return;
      tx.update(ref, { slots: (run.slots || []).filter(s => s.token !== task.token), updatedAt: this.now() });
      if (error) {
        const retryError = task.stage === 'notes' && Number(error.status) === 422
          ? { status: 500, message: error.message }
          : error;
        const delay = retryDelay(task.attempt, retryError);
        tx.update(taskRef, { status: delay === null ? 'failed' : 'pending', error: String(error.message).slice(0, 1000), dueAt: delay === null ? 0 : this.now() + delay, leaseUntil: 0 }); return;
      }
      const unit = session.units?.find(u => u.id === run.unitId), activity = unit?.accepted.activities.find(a => a.id === task.activityId);
      const stale = !unit || inputHash(unit) !== run.inputHash || (task.activityHash && hash(activity || null) !== task.activityHash);
      if (stale) { tx.update(taskRef, { status: 'stale', result: json(artifact), error: 'El contenido cambió durante la generación.', leaseUntil: 0 }); return; }
      const entry = json({ ...artifact, id: `auto_${task.id}`, automated: true, sourceUnitId: unit.id, revision: 1, acceptedAt: new Date(this.now()).toISOString() });
      if (task.stage === 'activity') {
        entry.id = task.activityId;
        Object.assign(entry, { section: task.section.name || task.section.section, sectionId: task.section.id || task.section.sectionId, category: task.section.category, subtopic: task.section.subtopic, mathGroup: task.section.mathGroup || "", mathIndex: Number.isInteger(task.section.mathIndex) ? task.section.mathIndex : -1, order: task.order });
        const existingActivityIndex = unit.accepted.activities.findIndex(a => a.id === entry.id);
        if (existingActivityIndex >= 0) unit.accepted.activities[existingActivityIndex] = entry;
        else unit.accepted.activities.push(entry);
        const sectionOrder = new Map((unit.workflow?.activitySections || []).map((section, i) => [activityKey(section), i]));
        unit.accepted.activities.sort((a, b) => (sectionOrder.get(activityKey(a)) ?? 10000) - (sectionOrder.get(activityKey(b)) ?? 10000));
        for (const section of unit.workflow?.activitySections || []) if ([section.id, section.sectionId].includes(entry.sectionId)) Object.assign(section, { status: 'approved', activityIds: [entry.id] });
      } else if (task.stage === 'notes') {
        entry.activityId = task.activityId;
        unit.accepted.teacherNotes ||= [];
        const existingIdx = unit.accepted.teacherNotes.findIndex(n => n.id === entry.id || (entry.activityId && n.activityId === entry.activityId));
        if (existingIdx >= 0) {
          unit.accepted.teacherNotes[existingIdx] = entry;
        } else {
          unit.accepted.teacherNotes.push(entry);
        }
      } else {
        const { html: renderedHtml, ...structuredArtifact } = artifact;
        const resourceType = RESOURCE_TYPES[task.stage];
        const existingCount = (unit.accepted.resources || []).filter(r => [task.stage, resourceType].includes(r.type || r.contentType)).length;
        const existingResourceIndex = unit.accepted.resources.findIndex(resource => resource.id === entry.id);
        if (existingResourceIndex >= 0 || ((unit.accepted.resources || []).length < MAX_UNIT_RESOURCES && existingCount < (RESOURCE_LIMITS[task.stage] ?? 1))) {
          Object.assign(entry, { type: resourceType, activityId: task.activityId, order: task.order * 10 + Object.keys(RESOURCE_TYPES).indexOf(task.stage), code: task.code, artifact: json(structuredArtifact) });
          if (existingResourceIndex >= 0) unit.accepted.resources[existingResourceIndex] = entry;
          else unit.accepted.resources.push(entry);
          unit.accepted.resources.sort((a, b) => (a.order ?? 10000) - (b.order ?? 10000));
          unit.workflow ||= {}; unit.workflow.resources ||= [];
          if (!unit.workflow.resources.some(r => r.resourceId === entry.id)) unit.workflow.resources.push({ activityId: entry.activityId, resourceId: entry.id, resourceType: task.stage, status: 'approved' });
          if (task.stage === 'cutout' && activity && artifact.completedExampleAsset?.url) {
            const escapedCode = String(task.code || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const codePattern = escapedCode ? `(?:${escapedCode}|${escapedCode.split(/[:\s-]+/)[0]})` : '[^"\']*';
            const exampleRegexWithCode = new RegExp(`(<div[^>]*class=["'][^"']*cb-cutout-completed-example[^"']*["'][^>]*data-cutout-example=["'][^"']*?${codePattern}[^"']*?["'][^>]*>)[\\s\\S]*?(<\\/div>)`, 'i');
            const genericExampleRegex = /(<div[^>]*class=["'][^"']*cb-cutout-completed-example[^"']*["'][^>]*>)[\s\S]*?(<\/div>)/i;
            const replacement = `$1<span class="cb-cutout-example-label">Composición esperada</span><img class="cb-cutout-example-img" src="${artifact.completedExampleAsset.url}" alt="Ejemplo resuelto de ${task.code || 'recortable'}" loading="lazy"/>$2`;
            if (exampleRegexWithCode.test(activity.html)) {
              activity.html = activity.html.replace(exampleRegexWithCode, replacement);
            } else if (genericExampleRegex.test(activity.html)) {
              activity.html = activity.html.replace(genericExampleRegex, replacement);
            }
          }
        }
      }
      unit.revision = Number(unit.revision || 0) + 1; unit.updatedAt = new Date(this.now()).toISOString();
      tx.update(sessionRef, { units: json(session.units), storageRevision: Number(session.storageRevision || 0) + 1, updatedAt: unit.updatedAt });
      tx.update(taskRef, { status: 'completed', error: null, leaseUntil: 0, completedAt: this.now() });
    });
  }
  async control(id, uid, action) {
    const { tasks } = await this.read(id, uid), ref = this.ref(id);
    await this.db.runTransaction(async tx => {
      const run = (await tx.get(ref)).data(), sessionRef = this.sessionRef(run.sessionId), session = (await tx.get(sessionRef)).data();
      const unit = session.units?.find(u => u.id === run.unitId);
      if (!unit) throw fail('Unidad inexistente.', 404);
      if (action === 'resume' && inputHash(unit) !== run.inputHash) throw fail('El currículo cambió; inicia otra ejecución.');
      const status = action === 'cancel' ? 'cancelled' : action === 'pause' ? 'paused' : action === 'complete' ? 'completed' : action === 'attention' ? 'needs_attention' : 'running';
      const snapshots = action === 'resume' ? await Promise.all(tasks.filter(t => t.status !== 'completed').map(t => tx.get(ref.collection('tasks').doc(t.id)))) : [];
      tx.update(ref, { status, epoch: randomUUID(), slots: [], updatedAt: this.now() });
      for (const snap of snapshots) if (snap.data()?.status !== 'completed') tx.update(snap.ref, { status: 'pending', attempt: 0, dueAt: 0, leaseUntil: 0 });
      unit.automation = { id, status };
      tx.update(sessionRef, { units: session.units, storageRevision: Number(session.storageRevision || 0) + 1 });
    });
  }
}
module.exports = { CharlyProductionStore, COLLECTION };
