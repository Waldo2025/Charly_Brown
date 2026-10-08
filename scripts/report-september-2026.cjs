// Read-only inventory for the September 2026 creator report.
const path = require('node:path');
const { createRequire } = require('node:module');
const requireFunctions = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, cert, deleteApp } = requireFunctions('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore');

const app = initializeApp({
  credential: cert(path.resolve(__dirname, '../charly-brown-firebase-adminsdk-fbsvc-6c32e4f96b.json')),
  projectId: 'charly-brown'
});
const db = getFirestore(app);
const start = Date.parse('2026-09-01T05:00:00.000Z');
const end = Math.min(Date.now(), Date.parse('2026-10-01T05:00:00.000Z'));
const toMs = value => value?.toMillis?.() ?? (typeof value === 'string' ? Date.parse(value) : value instanceof Date ? value.getTime() : NaN);
const inMonth = value => { const ms = toMs(value); return Number.isFinite(ms) && ms >= start && ms < end; };
const label = (value, fallback = 'Sin dato') => String(value ?? '').trim() || fallback;
const countBy = (rows, fn) => Object.fromEntries([...rows.reduce((map, row) => {
  const key = fn(row); map.set(key, (map.get(key) || 0) + 1); return map;
}, new Map())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));

async function main() {
  const [podcast, rooms, marcie, courses, images, users, aiJobs] = await Promise.all([
    db.collection('podcaster_sessions').select('ownerId', 'createdAt', 'title', 'archived').get(),
    db.collection('escapeRoom').select('ownerId', 'ownerEmail', 'createdAt', 'nivel', 'grado', 'trimestre', 'tema', 'unidad', 'project', 'topicCount').get(),
    db.collection('MarcieBlogEditor').select('ownerId', 'ownerEmail', 'createdAt', 'status', 'title', 'article', 'articlesByAudience').get(),
    db.collection('moodleCourses').select('userId', 'creado', 'docType', 'nombre').get(),
    db.collection('image_creator_sessions').select('ownerId', 'ownerEmail', 'createdAt', 'session').get(),
    db.collection('users').select('email', 'displayName', 'nombre', 'name').get(),
    db.collection('podcaster_ai_jobs').select('ownerId', 'type', 'model', 'status', 'createdAt', 'result').get()
  ]);
  const names = Object.fromEntries(users.docs.map(d => {
    const u = d.data(); return [d.id, label(u.email || u.displayName || u.nombre || u.name, d.id)];
  }));
  const owner = id => names[id] || label(id, 'Sin propietario');
  const podcastRows = podcast.docs.filter(d => inMonth(d.data().createdAt)).map(d => ({ id: d.id, user: owner(d.data().ownerId), title: label(d.data().title), archived: d.data().archived === true }));
  const roomRows = rooms.docs.filter(d => inMonth(d.data().createdAt)).map(d => ({ id: d.id, user: owner(d.data().ownerId), ...d.data() }));
  const topics = (await Promise.all(rooms.docs.map(async parent => {
    const snapshot = await parent.ref.collection('topics').select('createdAt', 'academicNumber', 'nivel', 'grado', 'trimestre', 'tema', 'unidad', 'project', 'title').get();
    return snapshot.docs.filter(d => inMonth(d.data().createdAt)).map(d => ({ id: d.id, parentId: parent.id, ownerId: parent.data().ownerId, ownerEmail: parent.data().ownerEmail, parent: parent.data(), ...d.data() }));
  }))).flat();
  const topicRows = topics.map(t => {
    const p = t.project || {}, parent = t.parent || {};
    return {
      id: t.id, sessionId: t.parentId, user: owner(t.ownerId) === t.ownerId && t.ownerEmail ? t.ownerEmail : owner(t.ownerId),
      nivel: label(t.nivel || p.nivel || parent.nivel || parent.project?.nivel),
      grado: label(t.grado || p.grado || parent.grado || parent.project?.grado),
      trimestre: label(t.trimestre || p.trimestre || parent.trimestre || parent.project?.trimestre),
      tema: label(t.tema || p.tema || t.unidad || p.unidad || t.academicNumber || parent.tema || parent.unidad),
      title: label(t.title || p.titulo)
    };
  });
  const marcieRows = marcie.docs.filter(d => inMonth(d.data().createdAt)).map(d => {
    const x = d.data();
    const articles = Object.entries(x.articlesByAudience || {}).filter(([, article]) => Array.isArray(article?.blocks) && article.blocks.some(b => String(b?.content || b?.text || '').trim()));
    const fallbackArticle = articles.length ? 0 : (Array.isArray(x.article?.blocks) && x.article.blocks.some(b => String(b?.content || b?.text || '').trim()) ? 1 : 0);
    return { id: d.id, user: owner(x.ownerId) === x.ownerId && x.ownerEmail ? x.ownerEmail : owner(x.ownerId), title: label(x.title), status: label(x.status), articleCount: articles.length + fallbackArticle, audiences: articles.map(([audience]) => audience) };
  });
  const courseRows = courses.docs.filter(d => inMonth(d.data().creado) && (!d.data().docType || d.data().docType === 'course')).map(d => ({ id: d.id, user: owner(d.data().userId), title: label(d.data().nombre) }));
  const imageRows = images.docs.map(d => {
    const x = d.data();
    const results = (x.session?.messages || []).flatMap(message => Array.isArray(message.results) ? message.results : []).filter(result => inMonth(result.createdAt));
    return { id: d.id, user: owner(x.ownerId) === x.ownerId && x.ownerEmail ? x.ownerEmail : owner(x.ownerId), createdInMonth: inMonth(x.createdAt), generatedImages: results.length, models: countBy(results, result => label(result.model)) };
  });
  const readyVideos = aiJobs.docs.map(d => d.data()).filter(job => inMonth(job.createdAt) && job.type === 'dialogue_video' && job.status === 'ready').map(job => ({ user: owner(job.ownerId), seconds: Number(job.result?.dialogueVideo?.durationSec || 0) }));
  const videoUsageByUser = Object.fromEntries([...readyVideos.reduce((map, row) => {
    const current = map.get(row.user) || { videos: 0, seconds: 0 };
    current.videos += 1; current.seconds += row.seconds; map.set(row.user, current); return map;
  }, new Map())].sort((a, b) => b[1].seconds - a[1].seconds));
  const result = {
    period: { start: new Date(start).toISOString(), end: new Date(end).toISOString(), timezone: 'America/Cancun' },
    sourceTotals: { podcaster: podcast.size, escapeRoomSessions: rooms.size, marcie: marcie.size, moodleCourses: courses.size, imageCreatorSessions: images.size, users: users.size },
    podcaster: { total: podcastRows.length, byUser: countBy(podcastRows, x => x.user), readyVideoUsageByUser: videoUsageByUser, rows: podcastRows },
    pigpen: { sessionsCreated: roomRows.length, sessionsByUser: countBy(roomRows, x => x.user), escapeRoomsCreated: topicRows.length, byUser: countBy(topicRows, x => x.user), byLevel: countBy(topicRows, x => x.nivel), byGrade: countBy(topicRows, x => x.grado), byTrimester: countBy(topicRows, x => x.trimestre), byTopic: countBy(topicRows, x => x.tema), byFullBreakdown: countBy(topicRows, x => [x.user, x.nivel, x.grado, x.trimestre, x.tema].join(' | ')), rows: topicRows },
    marcie: { sessionsCreated: marcieRows.length, articles: marcieRows.reduce((n, x) => n + x.articleCount, 0), byUser: countBy(marcieRows.flatMap(x => Array.from({ length: x.articleCount }, () => x)), x => x.user), rows: marcieRows },
    moodle: { coursesCreated: courseRows.length, byUser: countBy(courseRows, x => x.user), rows: courseRows },
    imageCreator: { sessionsCreated: imageRows.filter(x => x.createdInMonth).length, generatedImages: imageRows.reduce((n, x) => n + x.generatedImages, 0), sessionsByUser: countBy(imageRows.filter(x => x.createdInMonth), x => x.user), imagesByUser: countBy(imageRows.flatMap(x => Array.from({ length: x.generatedImages }, () => x)), x => x.user), imagesByModel: countBy(imageRows.flatMap(x => Object.entries(x.models).flatMap(([model, count]) => Array.from({ length: count }, () => model))), x => x), rows: imageRows }
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; }).finally(() => deleteApp(app));
