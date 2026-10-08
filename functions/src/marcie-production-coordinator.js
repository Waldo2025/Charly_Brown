const { createHash } = require('node:crypto');
const { ProductionStore, COLLECTION } = require('./marcie-production-store.js');
const { task, hash, sourceKey, LENSES } = require('./marcie-production-policy.js');
const policy = require('./marcie-research-policy.js');
const { enqueueHttpTask, QUEUES } = require('./tasks.js');
const { PROJECT_ID, REGION, getAdminServices } = require('./common.js');
const { createWorkers } = require('./marcie-production-workers.js');
const { normalizeVideoEvidence } = require('./marcie-editorial-research.js');
const completeArticle = article => Array.isArray(article?.blocks) && article.blocks.some(b => String(b.text || '').trim() || b.items?.length);
const settled = task => ['completed', 'skipped'].includes(task.status);
const enabled = () => process.env.MARCIE_PARALLEL_PRODUCTION === 'true';

function nextTasks(run, tasks) {
  const config = run.config;
  const items = [];
  const byId = new Map(tasks.map(t => [t.id, t]));
  const add = item => { if (!byId.has(item.id)) { byId.set(item.id, item); items.push(item); } return byId.get(item.id); };
  const proposals = {};
  for (const audience of config.audiences) {
    const saved = config.proposals.find(p => p.audience === audience);
    if (saved) proposals[audience] = saved;
    else if (completeArticle(run.imported.articles[audience])) proposals[audience] = { title: run.imported.articles[audience].title, brief: config.audienceTopics[audience] || config.topic };
    else {
      const proposal = add(task('propose', audience, { audience }));
      if (proposal.status === 'completed') proposals[audience] = proposal.result;
    }
  }
  const sources = new Map();
  for (const dossier of [run.imported.global, ...Object.values(run.imported.research)]) for (const s of dossier?.sources || []) if (s.verificationStatus === 'verified') sources.set(sourceKey(s), s);
  for (const t of tasks.filter(t => t.stage === 'validate' && settled(t))) for (const s of t.result?.sources || []) sources.set(sourceKey(s), s);
  const allCandidates = new Map();
  for (const t of tasks.filter(t => t.stage === 'search' && settled(t))) for (const s of t.result?.sources || []) allCandidates.set(sourceKey(s), s);
  for (const [key, source] of [...allCandidates].slice(-256)) {
    if (!sources.has(key)) add(task('validate', key, { source: { ...source, id: `source-${hash(key)}` } }));
  }
  const verified = [...sources.values()].slice(-80);
  const version = hash(verified.map(s => [s.id, s.verificationStatus]).sort());
  const video = normalizeVideoEvidence(config.video || {});
  const references = tasks.filter(t => t.stage === 'validate' && t.status === 'completed').flatMap(t => t.result?.attributedReferences || []);
  const dossier = { searchPlatforms: config.platforms, researchRegion: config.region, researchPeriod: config.period, attributedReferences: [...references, ...(run.imported.global?.attributedReferences || []), ...Object.values(run.imported.research).flatMap(d => d.attributedReferences || [])], sources: [...verified, ...video.sources], facts: [...video.facts, ...verified.filter(s => s.supportSummary).map(s => ({ claim: s.supportSummary, sourceIds: [s.id] }))], analysisStatus: 'complete', analysis: { sourceIds: verified.map(s => s.id) }, dateSearchComplete: false, targetSourceCount: config.minimum };
  const readyAudiences = new Set();
  for (const audience of config.audiences) {
    if (run.committed?.[audience]) { readyAudiences.add(audience); continue; }
    const imported = run.imported.research[audience];
    const draftId = task('draft', audience).id;
    let draft = byId.get(draftId);
    let evidence = policy.readiness(imported || {}, config.minimum).ready ? imported : null;
    if (!evidence && verified.length >= config.minimum && config.audiences.every(a => proposals[a])) {
      const selection = add(task('select', [version, hash(proposals)], { dossier, proposals }));
      if (selection.status === 'completed' && policy.readiness(selection.result?.[audience] || {}, config.minimum).ready) evidence = selection.result[audience];
    }
    if (!draft && completeArticle(run.imported.articles[audience])) {
      draft = add({ ...task('draft', audience, { audience }), status: 'completed', result: run.imported.articles[audience], completedAt: run.createdAt });
    }
    if (!draft && evidence && proposals[audience]) draft = add(task('draft', audience, { audience, dossier: evidence, proposal: proposals[audience] }));
    if (!draft) continue;
    readyAudiences.add(audience);
    if (draft.status !== 'completed') continue;
    const article = draft.result;
    const pages = tasks.filter(t => t.stage === 'validate' && t.status === 'completed').flatMap(t => t.result?.retrievedPages || []).filter(page => (article.researchSources || []).some(source => source.id === page.id));
    const savedAudit = run.imported.audits[audience];
    const savedAuditValid = savedAudit && savedAudit.articleRevision != null && savedAudit.articleRevision === article.revision && savedAudit.reviewStatus !== 'pending';
    const evidenceHash = createHash('sha256').update(JSON.stringify({ title: article.title, subtitle: article.subtitle, blocks: article.blocks, sources: article.sources, seo: article.seo })).digest('hex');
    for (const stage of ['evidence', 'style', 'seo']) {
      const item = task(stage, audience, { audience, article, ...(stage === 'evidence' ? { pages } : {}) });
      if (stage === 'evidence' && article.verification?.contentHash === evidenceHash) add({ ...item, status: 'completed', result: article });
      else if (stage !== 'evidence' && savedAuditValid) add({ ...item, status: 'completed', result: stage === 'style' ? savedAudit : { issues: [], seoRecommendations: savedAudit.seoRecommendations || [] } });
      else add(item);
    }
    const cover = task('cover', audience, { audience, article });
    if (article.featuredImage?.url) add({ ...cover, status: 'completed', result: article.featuredImage, completedAt: run.createdAt });
    else add(cover);
    const reviews = ['evidence', 'style', 'seo'].map(stage => byId.get(task(stage, audience).id));
    if (reviews.every(t => t?.status === 'completed')) {
      const issues = reviews.slice(1).flatMap(t => t.result.issues || []);
      const corrected = add(task('correct', audience, { audience, article: reviews[0].result, issues, pages }));
      if (corrected.status === 'completed') {
        for (const stage of ['style', 'seo']) add(task(stage, [audience, 'final', hash(corrected.result)], { audience, article: corrected.result }));
      }
    }
  }
  const searchTasks = tasks.filter(t => t.stage === 'search');
  const pendingValidation = [...byId.values()].some(t => ['propose', 'validate', 'select'].includes(t.stage) && !settled(t));
  if (readyAudiences.size < config.audiences.length && searchTasks.length && searchTasks.every(settled) && !pendingValidation) {
    const round = Math.max(...searchTasks.map(t => t.input.round || 0)) + 1;
    const count = Math.min(10, Math.max(1, config.minimum * (config.audiences.length - readyAudiences.size) - verified.length));
    for (let i = 0; i < count; i++) items.push(task('search', [round, i], { lens: LENSES[(round + i) % LENSES.length], round, evidenceGap: i === 0 ? `Solo ${verified.length} fuentes verificadas; faltan documentos pertinentes para completar la selección.` : '', reformulation: round > 2 ? 'La búsqueda anterior no completó la evidencia; se cambia el enfoque académico.' : '', exclude: [...sources.keys()].slice(-80) }));
  }
  return items;
}

class ProductionCoordinator {
  constructor({ store, enqueue, execute, now = Date.now, timeoutMs = 180000 } = {}) {
    this.store = store;
    this.enqueue = enqueue;
    this.execute = execute;
    this.now = now;
    this.timeoutMs = timeoutMs;
  }
  async start(uid, sessionId) { const id = await this.store.start(uid, sessionId); await this.advance(id); return this.status(uid, id); }
  async status(uid, id) {
    const { run, tasks } = await this.store.read(id, uid);
    const { session } = await this.store.owned(uid, run.sessionId);
    return { id, status: run.status, startedAt: run.startedAt, completedAt: run.completedAt || null, cancelledAt: run.cancelledAt || null, message: run.message || '',
      tasks: tasks.map(t => ({ id: t.id, stage: t.stage, status: t.status, attempt: t.attempt, retryAt: t.dueAt || null, heartbeatAt: t.heartbeatAt || null })), session };
  }
  async control(uid, id, action) { await this.store.control(id, uid, action); if (action === 'resume') await this.advance(id); return this.status(uid, id); }
  async advance(id) {
    let { run, tasks } = await this.store.read(id);
    if (run.status !== 'running') return;
    await require('./pigpen-demand-recovery.js').scheduleRecovery(this.store, id, { queue: QUEUES.marcie, targetUrl: `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/recoverMarcieProductionTask` });
    await this.store.addTasks(id, run.epoch, nextTasks(run, tasks));
    ({ run, tasks } = await this.store.read(id));
    for (const audience of run.config.audiences) {
      const get = stage => tasks.find(t => t.id === task(stage, audience).id && t.status === 'completed')?.result;
      const article = get('correct'); const cover = get('cover');
      const finalAudit = stage => tasks.find(t => t.id === task(stage, [audience, 'final', hash(article)]).id && t.status === 'completed')?.result;
      const style = article && finalAudit('style'); const seo = article && finalAudit('seo');
      if (article && cover && style && seo) await this.store.commitAudience(id, audience, { ...article, featuredImage: cover }, {
        ...style, articleRevision: Number(run.imported.articles[audience]?.revision || 0) + 1, issues: [...(style.issues || []), ...(seo.issues || [])], seoRecommendations: seo.seoRecommendations || []
      });
    }
    await this.store.complete(id);
    const current = await this.store.read(id);
    if (current.run.status !== 'running') return;
    const enough = run.config.audiences.every(a => run.committed?.[a] || tasks.some(t => t.stage === 'draft' && t.input.audience === a));
    if (enough) await this.store.stopResearch(id, run.epoch);
    const pending = tasks.filter(t => !(enough && ['search', 'validate', 'select'].includes(t.stage)) && !settled(t) && (t.status !== 'running' || t.leaseUntil <= this.now() || t.epoch !== run.epoch));
    // Queue tasks individually; Cloud Tasks and transactional permits enforce the aggregate limit.
    for (const item of pending) await this.enqueue(id, item, run.epoch);
  }
  async dispatch(id, taskId) {
    const claimed = await this.store.claim(id, taskId);
    if (!claimed) return { skipped: true };
    const { run, task: item } = claimed;
    const controller = new AbortController();
    let checkpoint = item.checkpoint;
    let timer;
    const heartbeat = setInterval(() => {
      void this.store.checkpoint(id, item, checkpoint).catch(error => controller.abort(error));
    }, 30000);
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => { const error = Object.assign(new Error('Tiempo de espera agotado; se reanudará desde el checkpoint.'), { status: 504 }); controller.abort(error); reject(error); }, this.timeoutMs);
        controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
      });
      const result = await Promise.race([deadline, this.execute(run, item, async value => {
        if (controller.signal.aborted) throw controller.signal.reason;
        await this.store.checkpoint(id, item, value); checkpoint = value;
      }, controller.signal)]);
      await this.store.finish(id, item, result);
    } catch (error) { await this.store.finish(id, item, null, error); }
    finally { clearTimeout(timer); clearInterval(heartbeat); }
    await this.advance(id);
    return { ok: true };
  }
}
function createProductionCoordinator(dependencies = {}) {
  const services = dependencies.db ? dependencies : getAdminServices();
  return new ProductionCoordinator({ store: new ProductionStore(services.db), execute: dependencies.execute || createWorkers({ bucket: services.bucket, client: dependencies.client }),
    enqueue: dependencies.enqueue || ((id, item, epoch) => enqueueHttpTask({ queue: QUEUES.marcie, kind: 'marcie-production',
      jobId: `${id}:${item.id}:${epoch}:${item.attempt}:${Math.floor(Date.now() / 60000)}`,
      targetUrl: `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/dispatchMarcieProductionTask`,
      serviceAccountEmail: `charly-tasks-invoker@${PROJECT_ID}.iam.gserviceaccount.com`,
      payload: { runId: id, taskId: item.id }, scheduleDelaySeconds: Math.max(0, ((item.dueAt || 0) - Date.now()) / 1000), dispatchDeadlineSeconds: 240 })) });
}
async function recoverMarcieProductions() {
  if (!enabled()) return;
  const { db } = getAdminServices();
  const coordinator = createProductionCoordinator();
  const runs = await db.collection(COLLECTION).where('status', '==', 'running').limit(100).get();
  for (const doc of runs.docs) await coordinator.advance(doc.id);
}
module.exports = { ProductionCoordinator, createProductionCoordinator, recoverMarcieProductions, nextTasks, enabled };
