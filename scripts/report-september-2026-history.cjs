// Read-only historical evidence for the September 2026 management report.
const path = require('node:path');
const { createRequire } = require('node:module');
const rf = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, cert, deleteApp } = rf('firebase-admin/app');
const { getFirestore } = rf('firebase-admin/firestore');
const app = initializeApp({ credential: cert(path.resolve(__dirname, '../charly-brown-firebase-adminsdk-fbsvc-6c32e4f96b.json')), projectId: 'charly-brown' });
const db = getFirestore(app);
const end = Date.parse('2026-09-30T16:28:50.340Z');
const month = value => {
  const raw = value?.toDate?.()?.toISOString?.() || value?.toISOString?.() || String(value || '');
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cancun', year: 'numeric', month: '2-digit' }).format(date);
};
const iso = value => value?.toDate?.()?.toISOString?.() || value?.toISOString?.() || String(value || '');
const inScope = value => { const n = Date.parse(iso(value)); return Number.isFinite(n) && n < end; };
const bump = (out, category, date, amount = 1) => { const key = month(date); if (key >= '2026-05' && key <= '2026-09') out[category][key] = (out[category][key] || 0) + amount; };
async function main() {
  const names = ['podcaster_sessions', 'podcaster_ai_jobs', 'escapeRoom', 'image_creator_sessions', 'charlyBrownUnitSessions', 'science_activity_sessions'];
  const snapshots = await Promise.all(names.map(name => db.collection(name).get()));
  const out = { months: ['2026-05','2026-06','2026-07','2026-08','2026-09'], podcasterSessions: {}, readyVideos: {}, readyAudio: {}, pigpenSessions: {}, pigpenTopics: {}, imageCreatorSessions: {}, imageCreatorImages: {}, charlyUnits: {}, scienceSessions: {}, charlySessions: [], scienceRows: [] };
  snapshots[0].forEach(doc => { const x=doc.data(); if (inScope(x.createdAt)) bump(out,'podcasterSessions',x.createdAt); });
  snapshots[1].forEach(doc => { const x=doc.data(); if (!inScope(x.createdAt)) return; if (x.type==='dialogue_video' && x.status==='ready') bump(out,'readyVideos',x.createdAt); if (x.type==='dialogue_audio' && x.status==='ready') bump(out,'readyAudio',x.createdAt); });
  snapshots[2].forEach(doc => { const x=doc.data(); if (inScope(x.createdAt)) bump(out,'pigpenSessions',x.createdAt); });
  for (const doc of snapshots[2].docs) { const topics=await doc.ref.collection('topics').select('createdAt').get(); topics.forEach(t => { const x=t.data(); if(inScope(x.createdAt)) bump(out,'pigpenTopics',x.createdAt); }); }
  snapshots[3].forEach(doc => { const x=doc.data(); if(inScope(x.createdAt)) bump(out,'imageCreatorSessions',x.createdAt); for(const msg of x.session?.messages || []) for(const result of msg.results || []) if(inScope(result.createdAt)) bump(out,'imageCreatorImages',result.createdAt); });
  snapshots[4].forEach(doc => { const x=doc.data(); if(!inScope(x.createdAt)) return; const units=x.units || []; bump(out,'charlyUnits',x.createdAt,units.length); if(month(x.createdAt)==='2026-09') out.charlySessions.push({id:doc.id,title:x.title,createdAt:iso(x.createdAt),ownerUid:x.ownerUid,units:units.map(u=>({title:u.title,acceptedActivities:u.accepted?.activities?.filter(a=>a.html || a.content)?.length||0,acceptedResources:u.accepted?.resources?.length||0,acceptedTeacherNotes:u.accepted?.teacherNotes?.length||0,acceptedReading:!!u.accepted?.reading,acceptedSya:!!u.accepted?.sya}))}); });
  snapshots[5].forEach(doc => { const x=doc.data(); if(!inScope(x.createdAt)) return; bump(out,'scienceSessions',x.createdAt); if(month(x.createdAt)==='2026-09') out.scienceRows.push({id:doc.id,title:x.title,createdAt:iso(x.createdAt),ownerEmail:x.ownerEmail,mode:x.activity?.gameMode}); });
  console.log(JSON.stringify(out,null,2));
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;}).finally(()=>deleteApp(app));
