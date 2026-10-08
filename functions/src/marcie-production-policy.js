const { createHash } = require('node:crypto');
const policy = require('./marcie-research-policy.js');
const LIMITS = Object.freeze({ propose: 4, search: 10, validate: 6, select: 4, draft: 4, evidence: 3, style: 3, seo: 3, correct: 4, cover: 2 });
const LENSES = ['fundamentos y conceptos', 'mecanismos y explicaciones', 'estudios recientes', 'revisiones sistemáticas y metaanálisis', 'consensos y guías', 'aplicaciones prácticas', 'contexto regional', 'poblaciones y públicos', 'limitaciones', 'evidencia contradictoria'];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);
const clone = value => JSON.parse(JSON.stringify(value));
function configuration(session) {
  const audiences = ['educators', 'students', 'parents', 'coordinators'].filter(id => session.selectedAudiences?.includes(id));
  if (!audiences.length) throw Object.assign(new Error('Selecciona al menos un público.'), { status: 400 });
  return clone({ topic: session.topic || session.title, audiences, mode: session.editorialMode || 'marcie',
    profile: session.editorialProfileSnapshot || {}, specifications: session.sessionConfiguration?.specifications || session.specifications || [],
    region: session.researchRegion || 'MX', period: session.researchPeriod || '6m', platforms: policy.selection(session),
    minimum: policy.target(session), model: session.sessionConfiguration?.productionModel || "", prompts: session.sessionConfiguration?.productionPrompts || {}, humanize: session.humanizationEnabled !== false, vocabulary: session.preferredVocabulary || [], video: session.videoResearch || null,
    titles: session.titleProposals || {}, proposals: session.proposals || [], audienceTopics: session.audienceTopics || {},
    configurationRevision: session.configurationRevision || 0 });
}
function audienceSpecifications(config, audience) {
  return config.specifications.flatMap(value => {
    const match = String(value).match(/^#([a-z]+)\[([a-z_]+)\]\s+(.*)$/i);
    return !match ? [value] : match[2] === 'all' || match[2] === audience ? [`#${match[1]} ${match[3]}`] : [];
  });
}
function sourceKey(source) {
  const doi = String(source.doi || '').toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').trim();
  if (doi) return 'doi:' + doi;
  try { const url = new URL(source.url); url.hash = ''; for (const key of [...url.searchParams.keys()]) if (/^utm_|^fbclid$/.test(key)) url.searchParams.delete(key); return url.href.replace(/\/$/, ''); }
  catch { return String(source.id || ''); }
}
function retryDelay(attempt, error, random = Math.random) {
  const raw = error?.response?.headers?.get?.('retry-after') || error?.headers?.['retry-after'];
  const headerDelay = raw && (Number.isFinite(Number(raw)) ? Number(raw) * 1000 : Math.max(0, Date.parse(raw) - Date.now()));
  const retryAfter = Number(error?.retryAfterMs || headerDelay);
  return Math.max(Number.isFinite(retryAfter) ? retryAfter : 0, Math.min(300000, 10000 * 2 ** Math.min(5, Math.max(0, attempt - 1))) + Math.floor(random() * 1000));
}
function needsUser(error) { return [400, 401, 403, 409, 413, 422].includes(Number(error?.status || error?.code)) || ['permission-denied', 'unauthenticated', 'marcie_save_conflict'].includes(error?.code); }
function task(stage, key, input = {}) { return { id: `${stage}-${hash(key)}`, stage, key, input: clone(input), status: 'pending', attempt: 0, dueAt: 0, checkpoint: null }; }
function initialTasks(config, session) {
  const tasks = [];
  const existing = new Map();
  for (const dossier of [session.researchGlobal, ...Object.values(session.researchByAudience || {})]) {
    for (const source of dossier?.sources || []) if (source.verificationStatus === 'verified') existing.set(sourceKey(source), source);
  }
  const missing = config.audiences.filter(id => !policy.readiness(session.researchByAudience?.[id] || {}, config.minimum).ready);
  // One complementary query per missing document, bounded by ten and the available lenses.
  const target = policy.sharedTarget({}) + Math.max(2, config.minimum - policy.sharedTarget({})) * missing.length;
  const count = missing.length ? Math.min(10, Math.max(1, target - existing.size)) : 0;
  for (let index = 0; index < count; index++) tasks.push(task('search', index, { lens: LENSES[index], round: 0 }));
  return tasks;
}
module.exports = { LIMITS, LENSES, hash, clone, configuration, audienceSpecifications, sourceKey, retryDelay, needsUser, task, initialTasks };
