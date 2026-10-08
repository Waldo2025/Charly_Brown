const { asyncRoute, resolveAuthContext, getAdminServices } = require('../common.js');
const { withResearchContext } = require('./budget.js');
const { prepareResearch } = require('./search.js');
function registerResearchRoutes(app, dependencies = {}) {
  app.post('/api/research/settings', asyncRoute(async (req, res) => {
    const auth = await (dependencies.resolveAuthContext || resolveAuthContext)(req);
    const { db } = dependencies.db ? dependencies : getAdminServices();
    const profile = (await db.collection('users').doc(auth.uid).get()).data() || {};
    const role = String(auth.role || auth.token?.role || profile.role || profile.rol || '').toLowerCase();
    if (!['admin', 'administrator', 'administrador', 'superadmin', 'owner'].includes(role)) throw Object.assign(new Error('admin_required'), { status: 403 });
    const { monthlyProjectCalls, monthlyUserCalls, enabled } = req.body || {};
    if (typeof enabled !== 'boolean' || !Number.isSafeInteger(monthlyProjectCalls) || monthlyProjectCalls < 0 || monthlyProjectCalls > 100000 || !Number.isSafeInteger(monthlyUserCalls) || monthlyUserCalls < 0 || monthlyUserCalls > monthlyProjectCalls || (enabled && (!monthlyProjectCalls || !monthlyUserCalls))) throw Object.assign(new Error('invalid_research_budget'), { status: 400 });
    await db.collection('ResearchSettings').doc('grounding').set({ enabled, monthlyProjectCalls, monthlyUserCalls, updatedBy: auth.uid });
    res.json({ enabled, monthlyProjectCalls, monthlyUserCalls });
  }));
  app.post('/api/research/search', asyncRoute(async (req, res) => {
    const auth = await (dependencies.resolveAuthContext || resolveAuthContext)(req);
    const { db } = dependencies.db ? dependencies : getAdminServices();
    await require('../marcie-editorial-research.js').assertEditorialAccess(auth, db);
    const query = String(req.body?.query || '').trim();
    if (query.length < 3 || query.length > 300) throw Object.assign(new Error('invalid_research_query'), { status: 400 });
    const policy = require('../marcie-research-policy.js');
    const policies = [...policy.platforms, policy.supplemental];
    const ids = Array.isArray(req.body?.platforms) ? req.body.platforms : ['supplemental'];
    if (!ids.length || ids.some(id => !policies.some(p => p.id === id))) throw Object.assign(new Error('invalid_research_platforms'), { status: 400 });
    const domains = ids.includes('supplemental') ? [] : policies.filter(p => ids.includes(p.id)).flatMap(p => p.domains);
    const excludedDomains = policies.filter(p => !ids.includes(p.id)).flatMap(p => p.domains);
    const { createVertexClient, normalizeTextModel } = require('../vertex.js');
    const value = await withResearchContext({ db, uid: auth.uid, dossierId: '' }, () => prepareResearch({
      prompt: '', client: dependencies.client || createVertexClient(), model: normalizeTextModel(req.body?.model), query, domains, excludedDomains
    }));
    res.json({ sources: value.sources, results: value.results, complete: false });
  }));
}
module.exports = { registerResearchRoutes };
