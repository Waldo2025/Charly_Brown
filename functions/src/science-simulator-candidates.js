const { GoogleAuth } = require('google-auth-library');
const common = require('./common.js');
const { normalizeCandidate, buildCandidateDocument } = require('./science-candidate-document.js');
const COLLECTION = 'ScienceSimulatorCandidates';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
function createCandidateRegistry({ db, validateRemote, clock = Date.now } = {}) {
  const ref = id => { if (!/^[a-f0-9]{64}$/.test(String(id))) throw fail('candidate_id_invalid'); return db.collection(COLLECTION).doc(id); };
  async function owned(id, actor) {
    const snap = await ref(id).get(); if (!snap.exists) throw fail('candidate_not_found', 404);
    const item = snap.data();
    if (item.ownerId !== actor.uid && !await common.hasAdminRoleWithProfile(actor, db)) throw fail('candidate_forbidden', 403);
    return item;
  }
  return {
    async submit({ run, candidate }) {
      const item = normalizeCandidate(candidate);
      // The owner participates in the identity: identical generated code cannot cross accounts.
      const id = require('node:crypto').createHash('sha256').update(`${run.ownerId}:${item.hash}`).digest('hex');
      await db.runTransaction(async tx => { const target = ref(id), snap = await tx.get(target); if (!snap.exists) tx.create(target, { ...item, id, ownerId: run.ownerId, runId: run.id, status: 'pending_admin_approval', createdAt: clock(), evidence: null }); });
      const current = (await ref(id).get()).data();
      return { candidateId: id, hash: item.hash, status: current.status, modelId: `generated-${item.hash}`, version: 1 };
    },
    read: owned,
    async listModels() {
      const records = await db.collection('ScienceSimulatorCatalog').where('status', '==', 'approved').limit(100).get();
      return records.docs.map(doc => { const value = doc.data(); return { modelId: doc.id, candidateId: value.id, title: value.title, description: value.description, hash: value.hash, controls: value.controls, version: value.version }; });
    },
    async model(id) {
      if (!/^generated-[a-f0-9]{64}$/.test(String(id))) throw fail('model_id_invalid');
      const snapshot = await db.collection('ScienceSimulatorCatalog').doc(id).get();
      const model = snapshot.data();
      if (!model || model.status !== 'approved') throw fail('model_not_approved', 404);
      return model;
    },
    async validate(id, actor) {
      const item = await owned(id, actor);
      if (!validateRemote) throw fail('science_sandbox_not_configured', 503);
      const evidence = await validateRemote(item);
      const passed = evidence.hash === item.hash && evidence.passed === true && evidence.tests?.length === item.tests.length && evidence.tests.every((result, i) => Object.entries(item.tests[i].expected).every(([key, expected]) => Number.isFinite(result.actual?.[key]) && Math.abs(result.actual[key] - expected) <= item.tests[i].tolerance));
      const trusted = { ...evidence, passed, hash: item.hash, testedAt: clock() };
      await ref(id).update({ evidence: trusted }); return { ...item, evidence: trusted };
    },
    async decide(id, actor, hash, approve) {
      if (!await common.hasAdminRoleWithProfile(actor, db)) throw fail('admin_required', 403);
      return db.runTransaction(async tx => {
        const target = ref(id), snap = await tx.get(target); if (!snap.exists) throw fail('candidate_not_found', 404);
        const item = snap.data();
        if (approve && (item.hash !== hash || item.evidence?.hash !== hash || !item.evidence?.passed)) throw fail('candidate_validation_required', 409);
        const result = { ...item, status: approve ? 'approved' : 'rejected', reviewedBy: actor.uid, reviewedAt: clock() };
        tx.set(target, result);
        tx.set(db.collection('ScienceSimulatorCatalog').doc(`generated-${item.hash}`), { ...result, modelId: `generated-${item.hash}`, version: 1 });
        return result;
      });
    },
    async approved(id) { const snap = await ref(id).get(); const item = snap.data(); if (!item || item.status !== 'approved') throw fail('candidate_approval_required', 409); return item; }
  };
}
async function validateRemoteCandidate(candidate) {
  const base = process.env.SCIENCE_SANDBOX_URL;
  if (!base || !/^https:\/\//.test(base)) throw fail('science_sandbox_not_configured', 503);
  const auth = new GoogleAuth(); const client = await auth.getIdTokenClient(base.replace(/\/$/, ''));
  const response = await client.request({ url: `${base.replace(/\/$/, '')}/validate`, method: 'POST', data: normalizeCandidate(candidate), timeout: 25000 });
  return response.data;
}
function defaultCandidateRegistry() { return createCandidateRegistry({ ...common.getAdminServices(), validateRemote: validateRemoteCandidate }); }
function registerScienceCandidateRoutes(app, dependencies = {}) {
  const wrap = dependencies.asyncRoute || common.asyncRoute, auth = dependencies.resolveAuthContext || common.resolveAuthContext;
  const registry = () => dependencies.registry || defaultCandidateRegistry();

  app.get('/api/science-activities/models', wrap(async (req, res) => { await auth(req); res.json({ models: await registry().listModels() }); }));
  app.get('/api/science-activities/models/:modelId', wrap(async (req, res) => {
    await auth(req); const item = await registry().model(req.params.modelId), html = buildCandidateDocument(item);
    res.json({ model: { modelId: item.modelId, title: item.title, description: item.description, controls: item.controls, version: item.version,
      generated: { candidateId: item.id, hash: item.hash, html, htmlHash: require('node:crypto').createHash('sha256').update(html).digest('hex'), reviewStatus: 'approved' } } });
  }));
  const prefix = '/api/science-activities/candidates/:id';
  app.get(prefix, wrap(async (req, res) => { res.json({ candidate: await registry().read(req.params.id, await auth(req)) }); }));
  app.get(`${prefix}/preview`, wrap(async (req, res) => { const candidate = await registry().read(req.params.id, await auth(req)); res.json({ html: buildCandidateDocument(candidate) }); }));
  app.post(`${prefix}/validate`, wrap(async (req, res) => { res.json({ candidate: await registry().validate(req.params.id, await auth(req)) }); }));
  for (const action of ['approve', 'reject']) app.post(`${prefix}/${action}`, wrap(async (req, res) => { res.json({ candidate: await registry().decide(req.params.id, await auth(req), String(req.body?.hash || ''), action === 'approve') }); }));
}
module.exports = { createCandidateRegistry, defaultCandidateRegistry, registerScienceCandidateRoutes, validateRemoteCandidate };
