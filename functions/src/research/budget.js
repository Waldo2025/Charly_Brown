const { AsyncLocalStorage } = require('node:async_hooks');
const { createHash } = require('node:crypto');
const scope = new AsyncLocalStorage();
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const withResearchContext = (context, work) => scope.run(context, work);
const currentContext = () => scope.getStore();
// A session is the conservative shared ledger; edits and topic changes cannot reset it.
const dossierKey = (product, sessionId, unitId = '') => sessionId ? `${product}:${sessionId}:${unitId || ''}` : ''; 
const hasSearch = tools => (tools || []).some(t => t.googleSearch || t.google_search || t.google_search_retrieval);
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;
async function sessionContext({ db, uid, product, sessionId, unitId }) {
  const context = { db, uid, dossierId: '' };
  if (!sessionId) return context;
  if (!/^[\w.-]{1,200}$/.test(sessionId)) throw Object.assign(Error('invalid_research_session'), { status: 400 });
  const snapshot = await db.collection(product === 'charly' ? 'charlyBrownUnitSessions' : 'MarcieBlogEditor').doc(sessionId).get();
  const session = snapshot.data();
  if (!session || ![session.ownerUid, session.ownerId, session.userId].includes(uid)) throw Object.assign(Error('research_session_forbidden'), { status: 403 });
  if(product==='charly'&&unitId&&!session.units?.some(unit=>unit.id===unitId))throw Object.assign(Error('research_unit_forbidden'),{status:403});
  context.dossierId = dossierKey(product, sessionId, product === 'charly' ? unitId : '');
  return context;
}
async function groundingConfigured(context = currentContext()) {
  if (!context?.db || !context.dossierId) return false;
  const config = (await context.db.collection('ResearchSettings').doc('grounding').get()).data() || {};
  return config.enabled === true && positive(config.monthlyProjectCalls) > 0 && positive(config.monthlyUserCalls) > 0;
}
async function reserve(context, query, { now = new Date() } = {}) {
  if (!context?.db || !context.uid || !context.dossierId || !context.gap) return { allowed: false, reason: 'research_context_required' };
  const { db, uid, dossierId, gap } = context;
  const config = (await db.collection('ResearchSettings').doc('grounding').get()).data() || {};
  const projectLimit = positive(config.monthlyProjectCalls), userLimit = positive(config.monthlyUserCalls);
  if (config.enabled !== true || !projectLimit || !userLimit) return { allowed: false, reason: 'grounding_budget_not_configured' };
  const month = now.toISOString().slice(0, 7);
  const refs = [db.collection('ResearchUsage').doc(`project-${month}`), db.collection('ResearchUsage').doc(`${hash(uid)}-${month}`),
    db.collection('ResearchDossiers').doc(hash(`${uid}:${dossierId}`))];
  const key = hash(query.trim().toLowerCase().replace(/\s+/g, ' '));
  return db.runTransaction(async tx => {
    const snapshots = await Promise.all(refs.map(ref => tx.get(ref)));
    const [project, user, dossier] = snapshots.map(s => s.data() || {});
    if (dossier.queries?.[key]) return { allowed: false, reason: 'query_already_reserved' };
    if ((dossier.calls || 0) === 1 && !context.reformulation) return { allowed: false, reason: 'reformulation_required' };
    if ((dossier.calls || 0) >= 2) return { allowed: false, reason: 'dossier_limit' };
    if ((project.calls || 0) >= projectLimit || (user.calls || 0) >= userLimit) return { allowed: false, reason: 'monthly_limit' };
    // Failed/uncertain provider calls consume the reservation: never blind retry.
    tx.set(refs[0], { calls: (project.calls || 0) + 1 }, { merge: true });
    tx.set(refs[1], { calls: (user.calls || 0) + 1 }, { merge: true });
    tx.set(refs[2], { ownerUid: uid, calls: (dossier.calls || 0) + 1,
      queries: { [key]: { reservedAt: now.toISOString(), gap: String(gap).slice(0, 300) } } }, { merge: true });
    return { allowed: true, ref: refs[2], key };
  });
}
async function recordEvidence(sources, { used = false, context = currentContext() } = {}) {
  if (!context?.db || !context.dossierId || !sources?.length) return;
  const ref = context.db.collection('ResearchDossiers').doc(hash(`${context.uid}:${context.dossierId}`));
  const keys = [...new Set(sources.filter(source => source.verificationStatus === 'verified' && source.url).map(source => hash(source.url)))];
  if (!keys.length) return;
  let added = 0;
  await context.db.runTransaction(async tx => {
    added = 0;
    const previous = (await tx.get(ref)).data() || {}, field = used ? 'incorporatedSources' : 'verifiedSources';
    const updates = {};
    for (const key of keys) if (!previous[field]?.[key]) { updates[key] = true; added++; }
    if (added) tx.set(ref, { [field]: updates, [used ? 'incorporatedCount' : 'verifiedCount']: Number(previous[used ? 'incorporatedCount' : 'verifiedCount'] || 0) + added }, { merge: true });
  });
  if (added) console.info(JSON.stringify({ event: 'research_useful_evidence', verified: !used, incorporated: used, added }));
}
function guardClient(client) {
  if (client.__researchGuard) return client;
  const generate = client.models.generateContent.bind(client.models);
  client.models.generateContent = async request => {
    if (!hasSearch(request.config?.tools)) return generate(request);
    const context = currentContext();
    const query = JSON.stringify(request.contents || []);
    const permit = await reserve(context, query);
    if (!permit.allowed) throw Object.assign(new Error(permit.reason), { status: 429, code: permit.reason });
    try {
      // Disable hidden SDK retries for paid search. App fallbacks need a new reservation.
      const result = await generate({ ...request, config: { ...request.config,
        httpOptions: { ...request.config?.httpOptions, retryOptions: { attempts: 1 } } } });
      const queries = [...new Set((result.candidates || []).flatMap(c => c.groundingMetadata?.webSearchQueries || []))];
      await permit.ref.set({ queries: { [permit.key]: { status: 'completed', reportedQueries: queries.length } } }, { merge: true });
      console.info(JSON.stringify({ event: 'research_grounding_execution', reportedQueries: queries.length, success: true }));
      return result;
    } catch (error) {
      await permit.ref.set({ queries: { [permit.key]: { status: 'failed_or_uncertain' } } }, { merge: true });
      throw error;
    }
  };
  if (client.models.generateContentStream) {
    const stream = client.models.generateContentStream.bind(client.models);
    client.models.generateContentStream = request => {
      if (hasSearch(request.config?.tools)) throw Object.assign(Error('paid_search_requires_measured_response'), { status: 429 });
      return stream(request);
    };
  }
  Object.defineProperty(client, '__researchGuard', { value: true });
  return client;
}
module.exports = { withResearchContext, currentContext, reserve, guardClient, hasSearch, dossierKey, groundingConfigured, sessionContext, recordEvidence };
