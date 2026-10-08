import { ACTIVE_PRODUCTION_STATUSES } from './science-production-client.mjs';
const labels = { planning: 'El agente prepara el plan', awaiting_approval: 'Revisa el plan antes de aprobar', approved: 'Plan aprobado', running: 'Agentes trabajando en paralelo', completed: 'Actividad completa y validada', needs_attention: 'Pendiente de completar: revisa los errores', cancelled: 'Generación cancelada', pending: 'Pendiente', queued: 'En cola', failed: 'Error', blocked: 'Bloqueado' };
export function mountScienceProductionUI({ client, onResult, onError }) {
  const CHECKPOINT_KEY = 'scienceProduction.progress.v1';
  const dialog = document.getElementById('scienceProductionDialog');
  const query = (name) => dialog?.querySelector(`[data-production="${name}"]`);
  const progress = document.getElementById('scienceProductionProgress');
  const progressQuery = (name) => progress?.querySelector(`[data-progress="${name}"]`);
  let run = null, timer = null, busy = false, lastPlanKey = '', applied = '';
  const readCheckpoint = (id) => {
    try {
      const key = id ? `${CHECKPOINT_KEY}:${id}` : CHECKPOINT_KEY;
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch { return null; }
  };
  const saveCheckpoint = () => {
    if (!run?.id) return;
    try {
      const tasks = Array.isArray(run.tasks) ? run.tasks : Object.values(run.tasks || {});
      const checkpointData = {
        id: run.id, revision: run.revision, status: run.status, plan: run.plan, config: run.config,
        warnings: run.warnings, updatedAt: run.updatedAt, result: run.result || null,
        previewActivity: run.previewActivity || null,
        tasks: tasks.map(task => ({ id: task.id, stage: task.stage, status: task.status, error: task.error || null, attempt: task.attempt || 0, result: task.result || null }))
      };
      localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpointData));
      localStorage.setItem(`${CHECKPOINT_KEY}:${run.id}`, JSON.stringify(checkpointData));
    } catch { /* Firestore remains primary source */ }
  };
  const resultKey = () => `${run?.id}:${run?.revision}:${run?.result?.generation?.completedAt || ''}`;
  const report = (error) => {
    const status = Number(error?.status || 0);
    const message = status === 404
      ? 'El servicio de agentes científicos no está publicado en este entorno. Despliega la función scienceActivitiesApi y su rewrite de Firebase Hosting.'
      : status === 401 || error?.message === 'AUTH_REQUIRED' || error?.message === 'auth_required'
        ? 'Inicia sesión para usar los agentes científicos.'
        : error?.message || String(error);
    if (query('error')) query('error').textContent = message;
    onError?.(error);
  };
  const schedule = () => {
    clearTimeout(timer);
    if (run && ACTIVE_PRODUCTION_STATUSES.has(run.status)) timer = setTimeout(refresh, 2500);
  };
  const taskName = task => task.agent || ({ planner: 'Planificación', 'art-direction': 'Dirección artística', pedagogy: 'Guía pedagógica', questions: 'Preguntas', simulator: 'Revisión científica', candidate: 'Diseño del simulador', image: 'Imágenes', validate: 'Validación final' }[task.stage]) || task.type || task.id;
  function renderProgress() {
    if (!progress) return;
    const tasks = Array.isArray(run?.tasks) ? run.tasks : Object.values(run?.tasks || {});
    const completed = tasks.filter(task => ['completed', 'failed', 'blocked'].includes(task.status)).length;
    const hasFailed = tasks.some(task => ['failed', 'blocked'].includes(task.status));
    const active = tasks.find(task => ['running', 'queued', 'pending'].includes(task.status));
    const percentage = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
    const phase = run?.status === 'completed' ? 'Listo para revisar' : run?.status === 'cancelled' ? 'Producción cancelada' : active ? `${taskName(active)} en curso` : labels[run?.status] || 'Preparando';
    if (progressQuery('title')) progressQuery('title').textContent = run?.plan?.title || run?.config?.topic || 'Creando simulador';
    if (progressQuery('status')) progressQuery('status').textContent = labels[run?.status] || 'Los agentes están trabajando en paralelo.';
    if (progressQuery('count')) progressQuery('count').textContent = `${completed} de ${tasks.length} agentes`;
    if (progressQuery('phase')) progressQuery('phase').textContent = phase;
    if (progressQuery('bar')) progressQuery('bar').style.width = `${percentage}%`;
    if (progressQuery('apply')) progressQuery('apply').hidden = !(run?.status === 'completed' && run?.result && applied !== resultKey());
    if (progressQuery('cancel')) progressQuery('cancel').disabled = busy || !run || ['completed', 'cancelled'].includes(run.status);
    if (progressQuery('retry')) {
      progressQuery('retry').hidden = !(hasFailed || run?.status === 'needs_attention');
      progressQuery('retry').disabled = busy;
    }
    if (progressQuery('tasks')) {
      progressQuery('tasks').replaceChildren(...tasks.map(task => {
        const item = document.createElement('li');
        item.className = `is-${task.status || 'pending'}`;
        const icon = document.createElement('i'); icon.className = `fas ${task.status === 'completed' ? 'fa-check' : task.status === 'failed' || task.status === 'blocked' ? 'fa-triangle-exclamation' : task.status === 'running' ? 'fa-spinner' : 'fa-circle-dot'}`; icon.setAttribute('aria-hidden', 'true');
        const body = document.createElement('span');
        const name = document.createElement('strong'); name.textContent = taskName(task);
        const state = document.createElement('small'); state.textContent = labels[task.status] || task.status || 'Pendiente';
        body.append(name, state);
        item.append(icon, body);
        if (['failed', 'blocked'].includes(task.status)) {
          const retryBtn = document.createElement('button');
          retryBtn.type = 'button';
          retryBtn.className = 'sa-generate-button sa-button-secondary';
          retryBtn.style.marginLeft = 'auto';
          retryBtn.style.padding = '2px 8px';
          retryBtn.style.fontSize = '0.75rem';
          retryBtn.textContent = 'Reintentar';
          retryBtn.disabled = busy;
          retryBtn.onclick = (e) => { e.stopPropagation(); action(async () => accept((await client.retry(run.id, task.id)).run)); };
          item.append(retryBtn);
        }
        return item;
      }));
    }
  }
  function showProgress() { if (progress) { progress.hidden = false; renderProgress(); } }
  async function accept(next) {
    if (!next?.id) throw new Error('El servidor no devolvió una ejecución válida.');
    run = next;
    saveCheckpoint();
    render();
    renderProgress();
    schedule();
    if (run.status === 'completed' && run.result && applied !== resultKey()) {
      if (await onResult(run, false)) applied = resultKey();
      render();
    }
  }
  async function refresh(force = false) {
    const id = run?.id;
    if (!id || (busy && !force)) { schedule(); return; }
    try { const response = await client.get(id); if (run?.id === id) await accept(response.run); }
    catch (error) { report(error); schedule(); }
  }
  async function action(operation) {
    if (busy) return;
    busy = true; if (query('error')) query('error').textContent = ''; render();
    try { await operation(); } catch (error) { report(error); }
    finally { busy = false; render(); renderProgress(); schedule(); }
  }
  function render() {
    if (!dialog) return;
    if (query('status')) query('status').textContent = run ? `${labels[run.status] || run.status} · Revisión ${run.revision}` : 'Crea un plan para comenzar.';
    const editable = run?.status === 'awaiting_approval';
    const key = `${run?.id}:${run?.revision}`;
    if (key !== lastPlanKey && run?.plan) {
      if (query('partial')) query('partial').hidden = true;
      if (query('plan')) query('plan').value = run.plan.instructions || '';
      if (query('title')) query('title').value = run.plan.title || '';
      if (query('objective')) query('objective').value = run.plan.objective || '';
      const art = run.plan.artDirection;
      if (query('outline')) query('outline').textContent = [...(art ? [`Dirección visual: realismo ilustrado — ${art.environment}`, `Protagonista: ${art.hero}`, `Interacción: ${art.interaction || ''}`, `Encuadre: ${art.camera}; adaptación móvil incluida.`] : []), ...(run.plan.levels || []).map((level, index) => `Nivel ${index + 1}: ${level.title || ''} — ${level.objective || ''}`), ...(run.plan.visuals || []).map((visual) => `Recurso visual: ${visual.role || visual.id} — ${visual.prompt || ''}`)].join('\n');
      lastPlanKey = key;
    }
    if (query('title')) query('title').readOnly = !editable || busy;
    if (query('objective')) query('objective').readOnly = !editable || busy;
    if (query('plan')) query('plan').readOnly = !editable || busy;
    if (query('revise')) query('revise').disabled = busy || !editable;
    if (query('approve')) query('approve').disabled = busy || !editable;
    if (query('start')) { query('start').hidden = run?.status !== 'approved'; query('start').disabled = busy; }
    if (query('show-progress')) { query('show-progress').hidden = !run; query('show-progress').disabled = busy; }
    if (query('cancel')) query('cancel').disabled = busy || !run || ['completed','cancelled'].includes(run.status);
    if (query('apply')) { query('apply').hidden = !run?.result || run.status !== 'completed' || applied === resultKey(); query('apply').disabled = busy; }
    if (query('preview')) { query('preview').hidden = !run?.partialResult && !run?.previewActivity; query('preview').disabled = busy; }
    if (query('refresh')) query('refresh').disabled = busy;
    if (query('runs')) query('runs').disabled = busy;
    const tasks = Array.isArray(run?.tasks) ? run.tasks : Object.values(run?.tasks || {});
    if (query('tasks')) {
      query('tasks').replaceChildren(...tasks.map((task) => {
        const item = document.createElement('li');
        const text = document.createElement('span');
        text.textContent = `${taskName(task)}: ${labels[task.status] || task.status || 'Pendiente'}${task.error ? ` — ${typeof task.error === 'string' ? task.error : task.error.message || 'No se completó'}` : ''}`;
        item.append(text);
        if (['failed','blocked'].includes(task.status)) {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'sa-generate-button sa-button-secondary'; button.textContent = 'Reintentar'; button.disabled = busy;
          button.onclick = () => action(async () => accept((await client.retry(run.id, task.id)).run)); item.append(button);
        }
        const candidateId = task.result?.candidateId || task.result?.candidate?.id;
        if (candidateId) {
          const review = document.createElement('button'); review.type = 'button'; review.className = 'sa-generate-button sa-button-secondary'; review.textContent = 'Revisar simulador propuesto';
          review.onclick = () => import("./science-candidate-review.mjs").then(({ openScienceCandidateReview }) => openScienceCandidateReview(candidateId, { onApproved: () => refresh() })).catch(report);
          item.append(review);
        }
        return item;
      }));
    }
    if (query('warnings')) query('warnings').textContent = (run?.warnings || []).map((warning) => typeof warning === 'string' ? warning : warning.message || JSON.stringify(warning)).join('\n');
    saveCheckpoint();
  }
  function editedPlan() { return { ...run.plan, title: query('title')?.value || '', objective: query('objective')?.value || '', instructions: query('plan')?.value || '' }; }
  if (query('preview')) {
    query('preview').onclick = () => {
      const partial = run?.partialResult || run?.previewActivity;
      if (!partial) return;
      const panel = query('partial'); if (!panel) return; panel.replaceChildren(); panel.hidden = false;
      const add = (tag, text) => { const node = document.createElement(tag); node.textContent = text; panel.append(node); };
      add('h3', partial.title || 'Vista previa parcial');
      add('p', 'En preparación: faltan recursos o validaciones. Esta vista no modifica la actividad guardada.');
      if (partial.mission) add('p', partial.mission);
      for (const [index, level] of (partial.learningGuide?.levels || []).entries()) add('p', `Nivel ${index + 1}: ${level.title || ''} — ${level.explanation || level.objective || ''}`);
      for (const [index, assessment] of (partial.assessments || []).entries()) {
        add('h4', `Pregunta ${index + 1}`); add('p', assessment.prompt || 'Pendiente');
        if (assessment.options?.length) add('p', assessment.options.join(' · '));
        const source = assessment.visual?.imageUrl || assessment.visual?.imageSrc;
        if (source && /^(https:\/\/|data:image\/(?:png|jpeg|webp);base64,)/.test(source)) { const img = document.createElement('img'); img.src = source; img.alt = assessment.visual.alt || 'Recurso visual de la pregunta'; img.loading = 'lazy'; panel.append(img); }
      }
      const background = partial.visualScene?.background?.imageUrl;
      if (background && /^https:\/\//.test(background)) { const img = document.createElement('img'); img.src = background; img.alt = 'Fondo del simulador en preparación'; panel.append(img); }
    };
  }
  if (query('close')) query('close').onclick = () => { dialog.close(); if (run) showProgress(); };
  if (query('show-progress')) query('show-progress').onclick = () => { dialog.close(); showProgress(); };
  progressQuery('close')?.addEventListener('click', () => { if (progress) progress.hidden = true; });
  progressQuery('plan')?.addEventListener('click', () => { if (progress) progress.hidden = true; if (!dialog.open) dialog.showModal(); });
  progressQuery('retry')?.addEventListener('click', () => action(async () => accept((await client.retry(run.id, 'all')).run)));
  progressQuery('cancel')?.addEventListener('click', () => action(async () => accept((await client.cancel(run.id)).run)));
  progressQuery('apply')?.addEventListener('click', () => action(async () => { if (await onResult(run, true)) applied = resultKey(); }));
  if (query('refresh')) query('refresh').onclick = () => action(() => refresh(true));
  if (query('revise')) query('revise').onclick = () => action(async () => accept((await client.revise(run.id, run.revision, editedPlan())).run));
  if (query('approve')) query('approve').onclick = () => action(async () => {
    if (['title', 'objective', 'instructions'].some((field) => String(editedPlan()[field] || '') !== String(run.plan[field] || ''))) throw new Error('Guarda los cambios del plan antes de aprobar.');
    await accept((await client.approve(run.id, run.revision)).run);
    await accept((await client.start(run.id, run.revision)).run);
    dialog.close(); showProgress();
  });
  if (query('start')) query('start').onclick = () => action(async () => { await accept((await client.start(run.id, run.revision)).run); dialog.close(); showProgress(); });
  if (query('cancel')) query('cancel').onclick = () => action(async () => accept((await client.cancel(run.id)).run));
  if (query('apply')) query('apply').onclick = () => action(async () => { if (await onResult(run, true)) applied = resultKey(); });
  if (query('runs')) query('runs').onchange = () => action(async () => accept((await client.get(query('runs').value)).run));
  async function list() {
    const response = await client.list();
    const runs = response.runs || [];
    if (query('runs')) {
      query('runs').replaceChildren(...runs.map((item) => { const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.plan?.title || item.config?.topic || 'Actividad'} — ${labels[item.status] || item.status}`; return option; }));
      if (run) query('runs').value = run.id;
    }
    return runs;
  }
  return {
    async create(config, activity) {
      if (busy) return null;
      run = null; lastPlanKey = ''; applied = '';
      for (const field of ['plan', 'title', 'objective']) if (query(field)) query(field).value = '';
      if (query('partial')) query('partial').hidden = true;
      if (!dialog.open) dialog.showModal();
      await action(async () => { const response = await client.plan(config, activity); await accept(response.run); await list(); });
      return run;
    },
    async regenerate(id, request) {
      if (!dialog.open) dialog.showModal();
      await action(async () => { applied = ''; await accept((await client.regenerate(id, request)).run); await list(); });
    },
    async open() {
      const cached = readCheckpoint();
      if (cached?.id && !run) run = cached;
      showProgress();
      if (!dialog.open) dialog.showModal();
      await action(async () => { const runs = await list(); if (!run && runs.length) await accept((await client.get(runs[0].id)).run); else if (run?.id) await accept((await client.get(run.id)).run); showProgress(); });
    },
    showProgressCard() {
      showProgress();
    },
    async restore() {
      try {
        const runs = await list();
        const active = runs.find((item) => ACTIVE_PRODUCTION_STATUSES.has(item.status)) || runs[0];
        if (active) {
          await accept((await client.get(active.id)).run);
          showProgress();
        } else {
          const cached = readCheckpoint();
          if (cached?.id) { run = cached; render(); renderProgress(); showProgress(); }
        }
      } catch (error) {
        console.info('[ScienceProduction] Recuperando desde checkpoint local:', error?.message);
        const cached = readCheckpoint();
        if (cached?.id) { run = cached; render(); renderProgress(); showProgress(); }
      }
    }
  };
}
