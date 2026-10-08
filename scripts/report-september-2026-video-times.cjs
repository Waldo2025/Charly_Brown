// Read-only timing evidence for the September 2026 management report.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const requireFunctions = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, cert, deleteApp } = requireFunctions('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore');

const root = path.resolve(__dirname, '..');
const details = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/september-2026-details.json'), 'utf8'));
const period = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/september-2026-data.json'), 'utf8')).period;
const start = Date.parse(period.start);
const end = Date.parse(period.end);
const sessions = details.podcaster.sessions.filter(x => !x.id.startsWith('schroeder_'));
const app = initializeApp({
  credential: cert(path.join(root, 'charly-brown-firebase-adminsdk-fbsvc-6c32e4f96b.json')),
  projectId: 'charly-brown',
});
const db = getFirestore(app);

const iso = value => value?.toDate?.()?.toISOString?.() || (typeof value === 'string' ? value : '');
const inPeriod = value => { const time = Date.parse(value); return time >= start && time < end; };
const cancunDay = value => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Cancun', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(value));
const daysInclusive = (a, b) => {
  const begin = Date.parse(`${cancunDay(a)}T00:00:00Z`);
  const finish = Date.parse(`${cancunDay(b)}T00:00:00Z`);
  return Math.round((finish - begin) / 86400000) + 1;
};

async function main() {
  const refs = sessions.map(s => db.collection('podcaster_sessions').doc(s.id));
  const snaps = await db.getAll(...refs);
  const allJobs = [];
  for (let i = 0; i < sessions.length; i += 10) {
    const ids = sessions.slice(i, i + 10).map(s => s.id);
    const jobs = await db.collection('podcaster_ai_jobs').where('sessionId', 'in', ids)
      .select('sessionId', 'type', 'status', 'createdAt', 'updatedAt').get();
    allJobs.push(...jobs.docs.map(doc => doc.data()));
  }
  const rows = sessions.map((session, index) => {
    const data = snaps[index].data() || {};
    const createdAt = iso(data.createdAt) || session.createdAt;
    const jobs = allJobs.filter(job => job.sessionId === session.id && job.status === 'ready'
      && inPeriod(iso(job.createdAt)) && inPeriod(iso(job.updatedAt)));
    const videos = jobs.filter(job => job.type === 'dialogue_video');
    const audio = jobs.filter(job => job.type === 'dialogue_audio');
    const videoDates = videos.map(job => iso(job.updatedAt)).sort();
    const audioDates = audio.map(job => iso(job.updatedAt)).sort();
    const lastVideoAt = videoDates.at(-1) || '';
    const lastAudioAt = audioDates.at(-1) || '';
    const activeVideoDays = [...new Set(videoDates.map(cancunDay))].sort();
    return {
      id: session.id, title: session.title, user: session.user, createdAt,
      firstVideoAt: videoDates[0] || '', lastVideoAt, lastAudioAt,
      readyVideos: videos.length, readyAudio: audio.length,
      activeVideoDays, activeVideoDayCount: activeVideoDays.length,
      calendarDaysToLastVideo: lastVideoAt ? daysInclusive(createdAt, lastVideoAt) : null,
      sessionUpdatedAt: iso(data.updatedAt) || iso(data.sessionUpdatedAt),
    };
  });
  const videoDays = [...new Set(rows.flatMap(row => row.activeVideoDays))].sort();
  const output = { period, videoDays, rows };
  fs.writeFileSync(path.join(root, 'artifacts/september-2026-video-times.json'), JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ sessions: rows.length, readyVideos: rows.reduce((n, x) => n + x.readyVideos, 0), videoProductionDays: videoDays.length, withVideo: rows.filter(x => x.readyVideos).length }));
}

main().then(() => deleteApp(app)).catch(async error => {
  console.error(error.code || error.message);
  await deleteApp(app);
  process.exitCode = 1;
});
