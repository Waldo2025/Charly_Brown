// Read-only scene-level reconciliation for Podcaster.
const path=require('node:path'),fs=require('node:fs'),{createRequire}=require('node:module');
const rf=createRequire(path.resolve(__dirname,'../functions/package.json'));
const {initializeApp,cert,deleteApp}=rf('firebase-admin/app');
const {getFirestore}=rf('firebase-admin/firestore');
const app=initializeApp({credential:cert(path.resolve(__dirname,'../charly-brown-firebase-adminsdk-fbsvc-6c32e4f96b.json')),projectId:'charly-brown'});
const db=getFirestore(app),detail=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../artifacts/september-2026-details.json'))),start=Date.parse('2026-09-01T05:00:00Z'),end=Date.parse(detail.period.end);
const iso=x=>x?.toDate?.()?.toISOString?.()||x?.toISOString?.()||String(x||'');
async function main(){
 const jobs=(await db.collection('podcaster_ai_jobs').select('type','status','sessionId','ownerId','createdAt','input','result').get()).docs.map(d=>({id:d.id,...d.data()})).filter(j=>j.type==='dialogue_video'&&Date.parse(iso(j.createdAt))>=start&&Date.parse(iso(j.createdAt))<end);
 const newSessions=new Set(detail.podcaster.sessions.map(s=>s.id));
 const result=detail.podcaster.sessions.map(s=>{
  const own=jobs.filter(j=>j.sessionId===s.id);
  const groups=new Map();
  for(const j of own){const id=String(j.input?.rowId||j.result?.dialogueVideo?.rowId||'');const arr=groups.get(id)||[];arr.push(j);groups.set(id,arr);}
  const ready=own.filter(j=>j.status==='ready');
  const readyGroups=[...groups].filter(([id,arr])=>id&&arr.some(j=>j.status==='ready'));
  return {sessionId:s.id,user:s.user,title:s.title,scenes:s.scenes,videoAttempts:own.length,readyVideos:ready.length,distinctReadyScenes:readyGroups.length,extraReadyGenerations:readyGroups.reduce((n,[,arr])=>n+Math.max(0,arr.filter(j=>j.status==='ready').length-1),0),failedAttempts:own.filter(j=>j.status==='error').length,cancelledAttempts:own.filter(j=>j.status==='cancelled').length,sceneBreakdown:readyGroups.map(([rowId,arr])=>({rowId,ready:arr.filter(j=>j.status==='ready').length,errors:arr.filter(j=>j.status==='error').length,cancelled:arr.filter(j=>j.status==='cancelled').length}))};
 });
 console.log(JSON.stringify({period:detail.period,allVideoJobs:jobs.length,inNewSessions:jobs.filter(j=>newSessions.has(j.sessionId)).length,sessions:result},null,2));
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;}).finally(()=>deleteApp(app));
