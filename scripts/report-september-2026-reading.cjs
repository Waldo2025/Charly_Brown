// Read-only inventory; Firestore records do not contain per-request AI billing.
const path=require('node:path');
const {createRequire}=require('node:module');
const rf=createRequire(path.resolve(__dirname,'../functions/package.json'));
const {initializeApp,cert,deleteApp}=rf('firebase-admin/app');
const {getFirestore}=rf('firebase-admin/firestore');
const app=initializeApp({credential:cert(path.resolve(__dirname,'../charly-brown-firebase-adminsdk-fbsvc-6c32e4f96b.json')),projectId:'charly-brown'});
const db=getFirestore(app), start=Date.parse('2026-09-01T05:00:00Z'),end=Date.parse('2026-09-30T16:28:50.340Z');
const iso=x=>x?.toDate?.()?.toISOString?.()||x?.toISOString?.()||String(x||'');
const inScope=x=>{const n=Date.parse(iso(x));return n>=start&&n<end;};
async function main(){
  const names=['lecturasASC','lecturasNuevas','lecturas','analisisLecturas','conversacionIA'];
  const [users,...sets]=await Promise.all([db.collection('users').select('email').get(),...names.map(n=>db.collection(n).get())]);
  const email=Object.fromEntries(users.docs.map(d=>[d.id,d.data().email||'']));
  const out={period:{start:new Date(start).toISOString(),end:new Date(end).toISOString()},collections:{}};
  sets.forEach((set,i)=>{const rows=set.docs.map(d=>({id:d.id,...d.data()})).filter(x=>inScope(x.createdAt||x.fechaCreacion||x.creado||x.timestamp));out.collections[names[i]]={allDocuments:set.size,septemberRows:rows.map(x=>({id:x.id,title:String(x.titulo||x.title||x.nombre||'').slice(0,160),createdAt:iso(x.createdAt||x.fechaCreacion||x.creado||x.timestamp),user:email[x.userId||x.ownerId||x.uid||x.createdBy]||x.ownerEmail||x.userEmail||x.userId||x.ownerId||'Sin usuario identificable',hasText:!!(x.textoLectura||x.texto||x.contenidoHTML),grade:x.grado||'',level:x.nivel||'',trim:x.trimestre||''}))};});
  console.log(JSON.stringify(out,null,2));
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;}).finally(()=>deleteApp(app));
