// Read-only supporting inventory for the September 2026 expense justification.
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const requireFunctions = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, cert, deleteApp } = requireFunctions('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore');
const app = initializeApp({ credential: cert(path.resolve(__dirname, '../charly-brown-firebase-adminsdk-fbsvc-6c32e4f96b.json')), projectId: 'charly-brown' });
const db = getFirestore(app);
const prior = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../artifacts/september-2026-data.json'), 'utf8'));
const first = Date.parse('2026-09-01T05:00:00Z');
const last = Date.parse(prior.period.end);
const date = value => value?.toDate?.()?.toISOString?.() || (value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : '');
const inPeriod = value => { const n = Date.parse(date(value)); return Number.isFinite(n) && n >= first && n < last; };
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const chunks = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
async function load(collection, ids, subcollection = '') {
  const refs = ids.map(x => subcollection ? db.collection(collection).doc(x.parent).collection(subcollection).doc(x.id) : db.collection(collection).doc(x));
  const out = [];
  for (const group of chunks(refs, 100)) out.push(...await db.getAll(...group));
  return out;
}
function countBy(items, key) {
  return Object.fromEntries([...items.reduce((map, item) => {
    const k = key(item); map.set(k, (map.get(k) || 0) + 1); return map;
  }, new Map())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

async function main() {
  const [podcast, pigpenSessions, pigpenTopics, marcie, courses, images, jobs] = await Promise.all([
    load('podcaster_sessions', prior.podcaster.rows.map(r => r.id)),
    db.collection('escapeRoom').select('ownerId', 'ownerEmail', 'createdAt', 'title', 'topicCount', 'nivel', 'grado', 'trimestre').get(),
    load('escapeRoom', prior.pigpen.rows.map(r => ({ parent: r.sessionId, id: r.id })), 'topics'),
    load('MarcieBlogEditor', prior.marcie.rows.map(r => r.id)),
    load('moodleCourses', prior.moodle.rows.map(r => r.id)),
    load('image_creator_sessions', prior.imageCreator.rows.filter(r => r.createdInMonth).map(r => r.id)),
    db.collection('podcaster_ai_jobs').select('type', 'ownerId', 'sessionId', 'model', 'status', 'createdAt', 'result').get()
  ]);
  const podcastIndex = Object.fromEntries(prior.podcaster.rows.map(r => [r.id, r]));
  const pigpenSessionIndex = Object.fromEntries(prior.pigpen.rows.map(r => [r.sessionId, r]));
  const pigpenTopicIndex = Object.fromEntries(prior.pigpen.rows.map(r => [r.id, r]));
  const marcieIndex = Object.fromEntries(prior.marcie.rows.map(r => [r.id, r]));
  const imageIndex = Object.fromEntries(prior.imageCreator.rows.map(r => [r.id, r]));
  const jobsInPeriod = jobs.docs.map(d => ({ id: d.id, ...d.data() })).filter(j => inPeriod(j.createdAt));
  const jobsBySession = new Map();
  for (const job of jobsInPeriod) {
    const list = jobsBySession.get(job.sessionId) || [];
    list.push(job); jobsBySession.set(job.sessionId, list);
  }
  const podcastRows = podcast.map(s => {
    const x = s.data() || {}, meta = podcastIndex[s.id] || {}, session = x.session || {};
    const scenes = Array.isArray(session.script?.rows) ? session.script.rows : [];
    const ownJobs = jobsBySession.get(s.id) || [];
    return {
      id: s.id, user: meta.user, createdAt: date(x.createdAt), title: clean(x.title || session.title), archived: x.archived === true,
      scenes: scenes.length,
      scenesWithText: scenes.filter(r => clean(r.text || r.dialogue || r.voiceOverText)).length,
      scenesWithVisualDescription: scenes.filter(r => clean(r.sceneDescription || r.scenePrompt || r.visualNotes || r.videoDirective)).length,
      rowsWithReferenceVideo: Object.keys(session.rowReferenceVideoMap || {}).length,
      rowsWithReferenceImage: Object.keys(session.rowReferenceImageMap || {}).length,
      jobs: countBy(ownJobs, j => `${j.type || 'unknown'}:${j.status || 'unknown'}`),
      readyVideoSeconds: ownJobs.filter(j => j.type === 'dialogue_video' && j.status === 'ready').reduce((n, j) => n + Number(j.result?.dialogueVideo?.durationSec || 0), 0)
    };
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const pigpenParentRows = pigpenSessions.docs.map(s => {
    const x = s.data() || {}, meta = pigpenSessionIndex[s.id] || {};
    return { id: s.id, user: meta.user || clean(x.ownerEmail) || clean(x.ownerId), createdAt: date(x.createdAt), title: clean(x.title), topicCountCurrent: Number(x.topicCount || 0), nivel: clean(x.nivel), grado: clean(x.grado), trimestre: clean(x.trimestre) };
  }).filter(r => inPeriod(r.createdAt)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const pigpenTopicRows = pigpenTopics.map(s => {
    const x = s.data() || {}, meta = pigpenTopicIndex[s.id] || {}, project = x.project || {};
    const missions = Array.isArray(project.misiones) ? project.misiones : [];
    return {
      id: s.id, sessionId: s.ref.parent.parent.id, user: meta.user, createdAt: date(x.createdAt), title: clean(project.titulo || x.title),
      nivel: meta.nivel, grado: meta.grado, trimestre: meta.trimestre, tema: meta.tema, materia: clean(project.materia || meta.materia),
      missions: missions.length,
      questions: missions.reduce((n, m) => n + (Array.isArray(m.preguntas) ? m.preguntas.length : 0), 0),
      missionImages: missions.filter(m => clean(m.imagen)).length,
      coverImage: Boolean(clean(project.backgroundImage)), endingImage: Boolean(clean(project.endingImage))
    };
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const marcieRows = marcie.map(s => {
    const x = s.data() || {}, meta = marcieIndex[s.id] || {};
    const versions = Object.entries(x.articlesByAudience || {}).filter(([, a]) => Array.isArray(a?.blocks) && a.blocks.some(b => clean(b?.content || b?.text))).map(([audience, a]) => ({ audience, title: clean(a.title || x.title), blocks: a.blocks.length }));
    return { id: s.id, user: meta.user, createdAt: date(x.createdAt), title: clean(x.title), status: clean(x.status), versions };
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const courseRows = courses.map(s => {
    const x = s.data() || {}, themes = Array.isArray(x.temas) ? x.temas : [], subs = themes.flatMap(t => Array.isArray(t.subtemas) ? t.subtemas : []);
    return { id: s.id, user: prior.moodle.rows.find(r => r.id === s.id)?.user, createdAt: date(x.creado), title: clean(x.nombre), themes: themes.length, subtopics: subs.length, linkedModules: subs.reduce((n, sub) => n + (Array.isArray(sub.modulosIds) ? sub.modulosIds.length : 0), 0), themeNames: themes.map(t => clean(t.nombre)) };
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const imageRows = images.map(s => {
    const x = s.data() || {}, meta = imageIndex[s.id] || {}, results = (x.session?.messages || []).flatMap(m => Array.isArray(m.results) ? m.results : []).filter(r => inPeriod(r.createdAt));
    return { id: s.id, user: meta.user, createdAt: date(x.createdAt), title: clean(x.title), images: results.length, models: countBy(results, r => clean(r.model) || 'Sin modelo') };
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const result = {
    period: prior.period,
    podcaster: { sessions: podcastRows, sceneTotal: podcastRows.reduce((n, r) => n + r.scenes, 0), jobsInPeriod: { total: jobsInPeriod.length, byTypeStatus: countBy(jobsInPeriod, j => `${j.type || 'unknown'}:${j.status || 'unknown'}`), readyVideos: jobsInPeriod.filter(j => j.type === 'dialogue_video' && j.status === 'ready').length, readyAudio: jobsInPeriod.filter(j => j.type === 'dialogue_audio' && j.status === 'ready').length } },
    pigpen: { sessions: pigpenParentRows, topics: pigpenTopicRows, topicsWithMissions: pigpenTopicRows.filter(r => r.missions > 0).length, missions: pigpenTopicRows.reduce((n, r) => n + r.missions, 0), questions: pigpenTopicRows.reduce((n, r) => n + r.questions, 0), missionImages: pigpenTopicRows.reduce((n, r) => n + r.missionImages, 0) },
    marcie: { sessions: marcieRows }, moodle: { courses: courseRows }, imageCreator: { sessions: imageRows }
  };
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; }).finally(() => deleteApp(app));
