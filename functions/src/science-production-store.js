const { fail, clean, LIMITS, LEASE_MS, MAX_ATTEMPTS, terminal, configuration, validatePlan, task, initialTasks, retryDelay, publicRun, randomUUID } = require('./science-production-policy.js');
const { encodeFirestoreValue, decodeFirestoreValue } = require('./science-activities.js');
const COLLECTION = 'ScienceProductionRuns';
class ScienceProductionStore {
  constructor(db, clock = Date.now) { this.db = db; this.clock = clock; }
  ref(id) { if (!/^[a-f0-9-]{36}$/.test(id)) throw fail('Producción inválida.'); return this.db.collection(COLLECTION).doc(id); }
  async create(uid, config, activity) {
    if (activity!=null&&(typeof activity !== 'object' || Array.isArray(activity))) throw fail('Actividad base inválida.');
    activity=await require('./science-production-templates.js').prepareActivityTemplate(config,activity);
    activity=clean(activity);if(activity.simulator)delete activity.simulator.generated;
    if (Buffer.byteLength(JSON.stringify(activity)) > 400000) throw fail('Actividad base demasiado grande. Guarda primero sus imágenes.', 413);
    const id = randomUUID(); const now = this.clock();
    const run = { id, ownerId: uid, config: configuration(config, activity), activity: clean(activity), status: 'planning', revision: 1, epoch: randomUUID(), createdAt: now, updatedAt: now, warnings: [], plan: null, result: null };
    await this.db.runTransaction(async tx => { tx.create(this.ref(id), encodeFirestoreValue(run)); tx.create(this.ref(id).collection('tasks').doc('planner-1'), {...task('planner-1', 'planner'),revision:1}); });
    return id;
  }
  async read(id, uid) {
    const ref = this.ref(id); const snap = await ref.get();
    if (!snap.exists) throw fail('Producción no encontrada.', 404);
    const run = decodeFirestoreValue(snap.data());
    if (uid && run.ownerId !== uid) throw fail('Producción de otro usuario.', 403);
    const tasks = (await ref.collection('tasks').get()).docs.map(d => ({ ...decodeFirestoreValue(d.data()), id: d.id })).filter(t=>t.revision===run.revision);
    return { run, tasks };
  }
  async list(uid) {
    const docs = await this.db.collection(COLLECTION).where('ownerId', '==', uid).orderBy('updatedAt','desc').limit(100).select('id','status','revision','plan','createdAt','updatedAt','completedAt','warnings').get();
    return docs.docs.map(doc => decodeFirestoreValue(doc.data())).sort((a,b) => b.updatedAt-a.updatedAt).map(run => publicRun(run));
  }
  async control(id, uid, action, body = {}) {
    const ref = this.ref(id);
    await this.db.runTransaction(async tx => {
      const snapshot = await tx.get(ref); const run = decodeFirestoreValue(snapshot.data());
      if (!run) throw fail('Producción no encontrada.', 404);
      if (run.ownerId !== uid) throw fail('Producción de otro usuario.', 403);
      const now = this.clock();
      if (['approve', 'start', 'revise'].includes(action) && Number(body.revision) !== run.revision) throw fail('El plan cambió. Actualiza antes de continuar.', 409);
      if (action === 'cancel') { if (!['completed','cancelled'].includes(run.status)) tx.update(ref, { status: 'cancelled', epoch: randomUUID(), updatedAt: now }); return; }
      if (action === 'revise') {
        if (!['awaiting_approval', 'approved', 'needs_attention'].includes(run.status)) throw fail('El plan no se puede editar durante la ejecución.', 409);
        const revision = run.revision + 1;
        if (typeof body.changes === 'string') {
          const instructions = body.changes.trim().slice(0, 12000); if (!instructions) throw fail('Escribe los cambios del plan.');
          tx.update(ref, { revision, status: 'planning', approvedRevision: null, epoch: randomUUID(), 'config.instructions': instructions, updatedAt: now });
          tx.create(ref.collection('tasks').doc(`planner-${revision}`), {...task(`planner-${revision}`, 'planner', { previousPlan: run.plan, instructions }),revision});
        } else {
          const plan = validatePlan({ ...run.plan, ...body.changes }, run.config);
          tx.update(ref, { revision, status: 'awaiting_approval', approvedRevision: null, plan, epoch: randomUUID(), updatedAt: now });
        }
        return;
      }
      if (action === 'approve') {
        if (!['awaiting_approval', 'approved'].includes(run.status)) throw fail('El plan no está listo para aprobar.', 409);
        validatePlan(run.plan, run.config); tx.update(ref, { status: 'approved', approvedRevision: run.revision, updatedAt: now }); return;
      }
      if (action === 'start') {
        if (run.status === 'running' && run.approvedRevision === run.revision) return;
        if (run.status !== 'approved' || run.approvedRevision !== run.revision) throw fail('Aprueba la versión actual del plan antes de generar.', 409);
        const items = initialTasks(run); const snaps = await Promise.all(items.map(item => tx.get(ref.collection('tasks').doc(item.id))));
        items.forEach((item, i) => tx.set(snaps[i].ref, encodeFirestoreValue({...item,revision:run.revision})));
        tx.update(ref, { status: 'running', epoch: randomUUID(), startedAt: now, updatedAt: now }); return;
      }
      if (action === 'retry') {
        if (!['needs_attention', 'running', 'planning'].includes(run.status)) throw fail('Esta ejecución no admite reintentos.', 409);
        const taskId = String(body.taskId || '');
        if (taskId === 'all' || !taskId) {
          const targets = await tx.get(ref.collection('tasks'));
          const tasks = targets.docs.map(d => ({ ...decodeFirestoreValue(d.data()), id: d.id })).filter(t => t.revision === run.revision && t.status === 'failed');
          if (!tasks.length) throw fail('No hay tareas fallidas para reintentar.', 409);
          for (const t of tasks) tx.update(ref.collection('tasks').doc(t.id), { status: 'pending', attempt: 0, dueAt: 0, error: null });
          tx.update(ref, { status: tasks.some(t => t.stage === 'planner') ? 'planning' : 'running', updatedAt: now }); return;
        }
        if (!/^[a-z0-9-]{1,80}$/.test(taskId)) throw fail('Selecciona una tarea válida.');
        const target = ref.collection('tasks').doc(taskId); const t = (await tx.get(target)).data();
        if (!t || t.status !== 'failed') throw fail('La tarea no está pendiente de reintento.', 409);
        if (t.stage === 'planner' && taskId !== `planner-${run.revision}`) throw fail('El plan tiene una versión posterior.', 409);
        tx.update(target, { status: 'pending', attempt: 0, dueAt: 0, error: null });
        tx.update(ref, { status: t.stage === 'planner' ? 'planning' : 'running', updatedAt: now }); return;
      }
      if(action==='regenerate_asset'||action==='validate_activity'){
        if(!['completed','needs_attention'].includes(run.status)||run.approvedRevision!==run.revision)throw fail('Espera a terminar la ejecución antes de regenerar.',409);
        const taskId=action==='validate_activity'?'validate':String(body.taskId||'');if(!/^[a-z0-9-]{1,80}$/.test(taskId))throw fail('Selecciona una tarea válida.');
        const targets=await tx.get(ref.collection('tasks'));const tasks=targets.docs.map(d=>({...decodeFirestoreValue(d.data()),id:d.id})).filter(t=>t.revision===run.revision);
        const target=tasks.find(t=>t.id===taskId);if(!target||!['image','questions','validate'].includes(target.stage))throw fail('La tarea no admite regeneración.');
        let questionInput;
        if(target.stage==='questions'&&body.questionIndex!=null){const index=Number(body.questionIndex);if(!Number.isInteger(index)||index<0||index>=run.config.questionsPerLevel||!Array.isArray(target.result?.questions))throw fail('Índice de pregunta inválido.');questionInput={...target.input,questionIndex:index,previousQuestions:target.result.questions};}
        else if(target.stage==='questions'){const {questionIndex,previousQuestions,...rest}=target.input;questionInput=rest;}
        const invalid=new Set([taskId]);let grew=true;while(grew){grew=false;for(const t of tasks){if(questionInput?.questionIndex>0&&t.stage==='image'&&t.input.role==='question')continue;if(!invalid.has(t.id)&&t.dependencies.some(dep=>invalid.has(dep))){invalid.add(t.id);grew=true;}}}
        for(const taskId of invalid)tx.update(ref.collection('tasks').doc(taskId),{status:'pending',attempt:0,dueAt:0,result:null,error:null,leaseUntil:0});
        if(questionInput)tx.update(ref.collection('tasks').doc(taskId),encodeFirestoreValue({input:questionInput}));
        tx.update(ref,{status:'running',result:null,warnings:[],epoch:randomUUID(),updatedAt:now});return;
      }
      throw fail('Operación desconocida.');
    });
  }
  async claim(id, taskId) {
    if (!/^[a-z0-9-]{1,80}$/.test(taskId)) throw fail('Tarea inválida.');
    const ref = this.ref(id), target = ref.collection('tasks').doc(taskId), gate = this.db.collection('ScienceProductionControl').doc('capacity');
    return this.db.runTransaction(async tx => {
      const [r,t,g] = await Promise.all([tx.get(ref),tx.get(target),tx.get(gate)]);
      const run = decodeFirestoreValue(r.data()), item = decodeFirestoreValue(t.data()), now = this.clock();
      if (!run || !item || item.revision!==run.revision || !['planning','running'].includes(run.status) || !['pending','running'].includes(item.status) || item.dueAt > now) return null;
      if (run.status === 'planning' ? taskId !== `planner-${run.revision}` : item.stage === 'planner') return null;
      if (item.status === 'running' && item.leaseUntil > now && item.epoch === run.epoch) return null;
      const deps = await Promise.all(item.dependencies.map(dep => tx.get(ref.collection('tasks').doc(dep))));
      if (deps.some(dep => dep.data()?.status !== 'completed')) return null;
      const slots = (g.data()?.slots || []).filter(s => s.until > now);
      if (slots.filter(s => s.pool === item.pool).length >= LIMITS[item.pool]) return null;
      const token = randomUUID(), claimed = { ...item, status: 'running', token, epoch: run.epoch, attempt: item.attempt + 1, leaseUntil: now + LEASE_MS };
      slots.push({ token, runId:id, pool:item.pool, until:now+LEASE_MS });
      tx.set(gate,{slots}); tx.set(target,encodeFirestoreValue(claimed)); tx.update(ref,{updatedAt:now}); return {run,task:claimed};
    });
  }
  async heartbeat(id, item) {
    const ref=this.ref(id), target=ref.collection('tasks').doc(item.id), gate=this.db.collection('ScienceProductionControl').doc('capacity');
    await this.db.runTransaction(async tx => {
      const [r,t,g]=await Promise.all([tx.get(ref),tx.get(target),tx.get(gate)]);
      if (!['planning','running'].includes(r.data()?.status) || r.data()?.epoch!==item.epoch || t.data()?.token!==item.token || t.data()?.status!=='running') throw fail('Intento vencido.',409);
      const until=this.clock()+LEASE_MS; tx.update(target,{leaseUntil:until}); tx.set(gate,{slots:(g.data()?.slots||[]).map(s=>s.token===item.token?{...s,until}:s)});
    });
  }
  async finish(id,item,result,error) {
    const ref=this.ref(id), target=ref.collection('tasks').doc(item.id), gate=this.db.collection('ScienceProductionControl').doc('capacity');
    return this.db.runTransaction(async tx=>{
      const [r,t,g]=await Promise.all([tx.get(ref),tx.get(target),tx.get(gate)]); const run=decodeFirestoreValue(r.data());
      tx.set(gate,{slots:(g.data()?.slots||[]).filter(s=>s.token!==item.token)});
      if (!['planning','running'].includes(run?.status) || run.epoch!==item.epoch || t.data()?.token!==item.token) return false;
      const now=this.clock();
      if(error){ const failed=item.attempt>=MAX_ATTEMPTS || [400,401,403,409,413].includes(Number(error.status));
        tx.update(target,{status:failed?'failed':'pending',error:String(error.message||error).slice(0,1000),leaseUntil:0,dueAt:now+retryDelay(item.attempt,error)});
        tx.update(ref,{updatedAt:now,...(failed?{status:'needs_attention'}:{})}); return true; }
      if(Buffer.byteLength(JSON.stringify(result))>650000) throw fail('Resultado de tarea demasiado grande.',413);
      tx.update(target,encodeFirestoreValue({status:'completed',result,completedAt:now,leaseUntil:0,error:null}));
      const patch={updatedAt:now};
      if(item.stage==='planner'){patch.plan=validatePlan(result,run.config);patch.status='awaiting_approval';}
      if(item.stage==='validate'){patch.result=result.activity;patch.warnings=result.warnings||[];patch.status='completed';patch.completedAt=now;}
      if(Buffer.byteLength(JSON.stringify(encodeFirestoreValue({...run,...patch})))>850000)throw fail('La actividad supera el tamaño permitido. Reduce niveles o recursos.',413);
      tx.update(ref,encodeFirestoreValue(patch)); return true;
    });
  }
}
module.exports={ScienceProductionStore,COLLECTION};
