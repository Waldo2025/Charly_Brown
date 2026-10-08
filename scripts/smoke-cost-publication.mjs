import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const req=createRequire(new URL('../functions/package.json',import.meta.url));
const {OAuth2Client}=req('google-auth-library'),{Firestore}=req('@google-cloud/firestore');
const authClient=new OAuth2Client();authClient.setCredentials({access_token:execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8'}).trim()});
const db=new Firestore({projectId:'charly-brown',authClient});
const state=JSON.parse(await readFile('/tmp/charly-cost-hosting-state.json','utf8')),base=process.env.CHARLY_COST_BASE_URL||state.url;
const config=await readFile('public/js/firebase-web-config.js','utf8'),key=config.match(/apiKey:\s*["']([^"']+)["']/)[1];
let user;
const cleanup={docs:[],paths:[]};
async function smoke(){
try {
  if(!process.argv.includes('--pdf-source'))for(const path of state.changed){const response=await fetch(base+'/'+path,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,path);const bytes=Buffer.from(await response.arrayBuffer());assert.ok(bytes.equals(await readFile('public/'+path)),path+' does not match reviewed source');}
  const signup=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key='+key,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'cost-smoke-'+randomUUID()+'@example.invalid',password:randomUUID()+'Aa9!',returnSecureToken:true})});
  user=await signup.json();assert.ok(signup.ok&&user.idToken&&user.localId,'temporary authentication failed');
  await db.collection('users').doc(user.localId).set({role:'editor',status:'approved',approved:true,temporaryCostSmoke:true});
  async function call(path,method='GET',body){for(let attempt=0;;attempt++){try{const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+user.idToken,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(70000)});return{status:response.status,data:await response.json()};}catch(error){if(method!=='GET'||attempt>=2)throw error;await new Promise(resolve=>setTimeout(resolve,1000));}}}
  if(process.argv.includes('--pdf-source')) {
    const sessionId='cost-smoke-'+randomUUID(),revisionId='revision',fileId='document',session=db.collection('analizarPDF').doc(sessionId),revision=session.collection('revisions').doc(revisionId);
    cleanup.docs.push(revision,session);
    await session.set({ownerId:user.localId,sourceType:'pdf',title:'Temporary source smoke',revisions:[],revisionOrder:[revisionId]});
    await revision.set({id:revisionId,files:[{id:fileId,documentName:'fixture.pdf',sourceType:'pdf'}]});
    const size=process.argv.includes('--large')?1024**3:32*1024**2;
    const PDFDocument=req('pdfkit'),doc=new PDFDocument(),parts=[];doc.on('data',p=>parts.push(p));const ready=new Promise(resolve=>doc.on('end',resolve));doc.text('Verified document source');doc.end();await ready;const pdf=Buffer.concat(parts),xref=pdf.toString('latin1').match(/startxref\s+(\d+)\s+%%EOF\s*$/)[1],tail=Buffer.from(`\nstartxref\n${xref}\n%%EOF\n`);
    const created=await call('/api/analizar-pdf/sources/create','POST',{sessionId,revisionId,fileId,size});assert.equal(created.status,200);cleanup.docs.push(db.collection('analizarPdfSourceUploads').doc(created.data.uploadId));
    const source=(await cleanup.docs.at(-1).get()).data();cleanup.paths.push(source.storagePath);
    for(let offset=0;offset<size;offset+=8*1024**2){const end=Math.min(size,offset+8*1024**2),chunk=Buffer.alloc(end-offset);if(offset===0)pdf.copy(chunk);if(end===size)tail.copy(chunk,chunk.length-tail.length);const response=await fetch(created.data.uploadUrl,{method:'PUT',headers:{'Content-Type':'application/pdf','Content-Range':`bytes ${offset}-${end-1}/${size}`},body:chunk,signal:AbortSignal.timeout(120000)});assert.ok(response.ok||response.status===308,'upload failed '+response.status);}
    const finalized=await call('/api/analizar-pdf/sources/finalize','POST',{uploadId:created.data.uploadId});assert.equal(finalized.status,200);assert.equal((await revision.get()).data().files[0].sourceStoragePath,finalized.data.storagePath);
    if(process.argv.includes('--analyze')){
      const response=await fetch(base+'/api/analizar-pdf/analyze',{method:'POST',headers:{Authorization:'Bearer '+user.idToken,'Content-Type':'application/json','X-Use-Stored-Source':'1','X-Session-Id':sessionId,'X-Revision-Id':revisionId,'X-File-Id':fileId,'X-File-Name':'fixture.pdf'},body:JSON.stringify({analysisCategories:{spelling:false,pagination:true,sections:false}}),signal:AbortSignal.timeout(120000)});
      const accepted=await response.json();assert.equal(response.status,202,JSON.stringify(accepted));
      let completed=false;
      for(let i=0;i<60;i++){const result=await call('/api/analizar-pdf/analyze-status?jobId='+accepted.jobId);assert.equal(result.status,200);if(result.data.status==='completed'){assert.equal(result.data.result?.stats?.pageCount,1);completed=true;break;}if(['failed','cancelled'].includes(result.data.status))throw Error('server analysis failed '+String(result.data.error));await new Promise(resolve=>setTimeout(resolve,2000));}
      assert.equal(completed,true,'server analysis did not complete');console.log(JSON.stringify({pdfServerAnalysis:size,complete:true,pageCount:1}));
    }
    console.log(JSON.stringify({base,pdfSourceUpload:size,finalized:true}));return;
  }
  assert.equal((await call('/api/health')).status,200);
  assert.equal((await call('/api/gemini/live-token','POST',{})).status,410);
  const research=await call('/api/research/search','POST',{query:'school learning educational research',platforms:['supplemental']});assert.equal(research.status,200);assert.ok(Array.isArray(research.data.sources));
  const worker=await call('/api/analizar-pdf/analyze-status?jobId=cost-smoke-missing');assert.ok([400,404].includes(worker.status),'worker proxy failed '+worker.status);
  console.log(JSON.stringify({base,assets:state.changed.length,live:410,research:research.status,sources:research.data.sources.length,pdfProxy:worker.status}));
  if(!process.env.CHARLY_COST_BASE_URL){state.verified=true;await writeFile('/tmp/charly-cost-hosting-state.json',JSON.stringify(state,null,2));}
} finally {
  for(const ref of cleanup.docs)await db.recursiveDelete(ref);
  for(const path of cleanup.paths){const response=await fetch('https://storage.googleapis.com/storage/v1/b/charly-brown.firebasestorage.app/o/'+encodeURIComponent(path),{method:'DELETE',headers:{Authorization:'Bearer '+(await authClient.getAccessToken()).token}});assert.ok(response.ok||response.status===404,'temporary object cleanup failed');}
  if(user?.localId)await db.collection('users').doc(user.localId).delete();
  if(user?.idToken)await fetch('https://identitytoolkit.googleapis.com/v1/accounts:delete?key='+key,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:user.idToken})});
}
}
await smoke();
