// Execute once after private recovery endpoints are deployed, before removing crons.
const { getAdminServices, REGION, PROJECT_ID } = require('../functions/src/common.js');
const { scheduleRecovery } = require('../functions/src/pigpen-demand-recovery.js');
const { QUEUES } = require('../functions/src/tasks.js');
let services, enqueue;
if (process.argv.includes('--gcloud')) {
  const { execFileSync } = require('node:child_process');
  const { createRequire } = require('node:module');
  const fromFunctions = createRequire(require('node:path').resolve('functions/package.json'));
  const { OAuth2Client } = fromFunctions('google-auth-library');
  const { Firestore } = fromFunctions('@google-cloud/firestore');
  const { CloudTasksClient } = fromFunctions('@google-cloud/tasks');
  const authClient = new OAuth2Client();
  authClient.setCredentials({ access_token: execFileSync('gcloud', ['auth','print-access-token'], { encoding:'utf8' }).trim() });
  services = { db: new Firestore({ projectId: PROJECT_ID, authClient }) };
  const client = new CloudTasksClient({ projectId: PROJECT_ID, authClient });
  enqueue = options => require('../functions/src/tasks.js').enqueueHttpTask(options, { client });
} else services = getAdminServices();
const targets = [
  ['PigPen', 'PigPenGenerationRuns', 'pigpen', 'recoverPigPenGenerationTask'],
  ['Marcie', 'MarcieProductionRuns', 'marcie', 'recoverMarcieProductionTask'],
  ['Science', 'ScienceProductionRuns', 'science', 'recoverScienceProductionTask'],
  ['Charly', 'charlyProductionRuns', 'charly', 'recoverCharlyProductionTask']
];
(async () => {
  for (const [name, collection, queue, endpoint] of targets) {
    let last, count = 0;
    for (;;) {
      let query = services.db.collection(collection).where('status', 'in', ['planning', 'running']).orderBy('__name__').limit(100);
      if (last) query = query.startAfter(last);
      const page = await query.get();
      if (!page.size) break;
      const store = { db: services.db, ref: id => services.db.collection(collection).doc(id) };
      for (const doc of page.docs) { await scheduleRecovery(store, doc.id, { enabled: true, enqueue, queue: QUEUES[queue], targetUrl: `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${endpoint}` }); count++; }
      last = page.docs.at(-1);
    }
    console.log(`${name}: ${count} pending productions seeded`);
  }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
