import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,setDoc,terminate} from 'firebase/firestore';
import {getStorage,connectStorageEmulator,ref,uploadBytes,getMetadata,deleteObject} from 'firebase/storage';
const project='demo-sally-tasks',bucket=project+'.appspot.com',clients=[];
function client(uid,approved=true){const app=initializeApp({projectId:project,storageBucket:bucket,apiKey:'fake'},uid||'anon');const db=getFirestore(app),storage=getStorage(app);const mock=uid?{mockUserToken:{sub:uid,user_id:uid,role:'teacher',approvalStatus:approved?'approved':'pending'}}:{};connectFirestoreEmulator(db,'127.0.0.1',8187,mock);connectStorageEmulator(storage,'127.0.0.1',9297,mock);const c={app,db,storage};clients.push(c);return c;}
async function seed(name,fields){const r=await fetch(`http://127.0.0.1:8187/v1/projects/${project}/databases/(default)/documents/${name}`,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({fields})});assert.equal(r.ok,true);}
const owner=client('alice'),collaborator=client('bob'),outsider=client('eve'),pending=client('pending',false),anon=client(null);
for(const c of clients){c.storage.maxOperationRetryTime=3000;c.storage.maxUploadRetryTime=3000;}
const artifact='sallyBrown/alice/project/tasks/task1/states/version.json';
const denied=async fn=>assert.rejects(fn,e=>['permission-denied','storage/unauthorized'].includes(e.code));
try{
 console.log('Seeding emulator fixtures');
 await seed('SallyBrownSessions/project',{ownerId:{stringValue:'alice'},collaborators:{arrayValue:{values:[{stringValue:'bob'},{stringValue:'pending'}]}}});
 await seed('SallyBrownTasks/task1',{sessionId:{stringValue:'project'},ownerId:{stringValue:'alice'},status:{stringValue:'draft'}});
 const saved=await fetch(`http://127.0.0.1:9297/v0/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(artifact)}`,{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/octet-stream','X-Goog-Upload-Protocol':'raw'},body:'{"status":"draft"}',signal:AbortSignal.timeout(5000)});assert.equal(saved.ok,true);
 for(const c of [owner,collaborator]){console.log('Checking participant',c.app.name);assert.equal((await getDoc(doc(c.db,'SallyBrownTasks','task1'))).exists(),true);console.log('Checking Storage participant',c.app.name);assert.equal((await getMetadata(ref(c.storage,artifact))).fullPath,artifact);}
 for(const c of [owner,collaborator,outsider,pending,anon]){await denied(()=>setDoc(doc(c.db,'SallyBrownTasks','task1'),{status:'approved'}));await denied(()=>uploadBytes(ref(c.storage,artifact),new Uint8Array([1]),{contentType:'image/png'}));await denied(()=>deleteObject(ref(c.storage,artifact)));}
 for(const c of [outsider,pending,anon]){await denied(()=>getDoc(doc(c.db,'SallyBrownTasks','task1')));await denied(()=>getMetadata(ref(c.storage,artifact)));}
 const attachment='sallyBrown/alice/project/attachments/sample.png';await uploadBytes(ref(owner.storage,attachment),new Uint8Array([1]),{contentType:'image/png'});await getMetadata(ref(collaborator.storage,attachment));await denied(()=>getMetadata(ref(outsider.storage,attachment)));
 console.log('PASS: server-only task states, no fallback bypass, participant reads, pending/outsider denial and ordinary attachments preserved.');
}catch(error){console.error(error);process.exitCode=1;}finally{await Promise.race([Promise.all(clients.map(async c=>{await terminate(c.db);await deleteApp(c.app);})),new Promise(r=>setTimeout(r,3000))]);}
