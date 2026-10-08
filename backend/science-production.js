// Reuse the Functions implementation; only credentials and local dispatch differ.
function registerScienceBackend(app, { db, bucket, verifyFirebaseBearer, client }) {
  const resolveAuthContext = async req => { const auth = await verifyFirebaseBearer(req); return { uid: auth.uid, role: String(auth.decoded?.role || ''), token: auth.decoded || {} }; };
  const dependencies = { db, bucket, client, resolveAuthContext, getAdminServices: () => ({ db, bucket }) };
  const { createCandidateRegistry, validateRemoteCandidate, registerScienceCandidateRoutes } = require('../functions/src/science-simulator-candidates.js');
  dependencies.candidateRegistry = createCandidateRegistry({ db, validateRemote: validateRemoteCandidate });
  let coordinator;
  if (process.env.SCIENCE_LOCAL_WORKER === 'true') dependencies.enqueue = async (id, task) => {
    const timer = setTimeout(() => { void coordinator.dispatch(id, task.id).catch(error => console.error('[science-worker]', error.message)); }, Math.max(0, (task.dueAt || 0) - Date.now()));
    timer.unref(); return { created: true };
  };
  coordinator = require('../functions/src/science-production-routes.js').registerScienceProductionRoutes(app, dependencies);
  const oauth = require('../functions/src/science-oauth.js').registerScienceOAuthRoutes(app, dependencies);
  require('../functions/src/science-mcp.js').registerScienceMcpRoutes(app, { coordinator, resolveAuthContext: oauth.resolveMcpAuth, resourceMetadataUrl: oauth.resourceMetadataUrl });
  registerScienceCandidateRoutes(app, { ...dependencies, registry: dependencies.candidateRegistry });
  if (process.env.SCIENCE_LOCAL_WORKER === 'true') {
    const timer = setInterval(() => { void require('../functions/src/science-production-coordinator.js').recoverScienceProductions(dependencies).catch(error => console.error('[science-recovery]', error.message)); }, 60000); timer.unref();
  }
  return coordinator;
}
module.exports = { registerScienceBackend };
