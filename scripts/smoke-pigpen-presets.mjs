// Only temporary accounts and preset documents; never invokes generation or AI.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
if(!process.argv.includes('--execute'))throw Error('Pass --execute to create and clean temporary accounts.');
const base=process.env.PIGPEN_PRESET_BASE_URL||'https://charly-brown.web.app';
const source=await readFile('public/js/firebase-web-config.js','utf8'),key=source.match(/apiKey:\s*["']([^"']+)["']/)?.[1];assert.ok(key);
const access=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8'}).trim();
const temporary=[];let browser;
const accountApi=async(action,body)=>{const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:'+action+'?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});const d=await r.json();if(!r.ok)throw Error(action+' '+r.status+' '+d.error?.message);return d;};
const restBase='https://firestore.googleapis.com/v1/projects/charly-brown/databases/(default)/documents/';
try{
 for(let i=0;i<2;i++){const email='codex-pigpen-presets-'+Date.now()+'-'+i+'@example.invalid',password='Preset-'+crypto.randomUUID()+'Aa9!';const user=await accountApi('signUp',{email,password,returnSecureToken:true});temporary.push({email,password,uid:user.localId,token:user.idToken});}
 browser=await chromium.launch({headless:true});
 const pages=[];
 for(const user of temporary){const page=await browser.newPage();pages.push(page);
  await page.route(base+'/__codex-preset-smoke',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><link rel="stylesheet" href="/vendor/bootstrap/bootstrap.min.css"><script src="/vendor/bootstrap/bootstrap.bundle.min.js"></script>'}));
  await page.goto(base+'/__codex-preset-smoke');
  await page.evaluate(async credentials=>{
   const {firebaseWebConfig}=await import('/js/firebase-web-config.js');const {initializeApp}=await import('https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js');const {getAuth,signInWithEmailAndPassword}=await import('https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js');const sdk=await import('https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js');const {createPresetStore}=await import('/js/pigpen-experience-presets.mjs?v=20261006-account-presets-v2');const {createFirestorePresetAdapter}=await import('/js/pigpen-experience-presets-firestore.mjs?v=20261006-account-presets-v2');
   const app=initializeApp(firebaseWebConfig);const result=await signInWithEmailAndPassword(getAuth(app),credentials.email,credentials.password);window.db=sdk.getFirestore(app);window.sdk=sdk;window.uid=result.user.uid;window.store=createPresetStore({adapter:createFirestorePresetAdapter(db,sdk)});store.setUser(uid);await store.load();if(!store.state().ready)throw Error(store.state().error);window.value={name:'Prueba temporal',config:{question_types:['texto','marcar_evidencia'],primary_reward:'imagen',extras:['pista','coleccionable'],reward_image:'data:image/png;base64,YQ==',reward_image_alt:'Prueba',reward_image_aspect:1.5},structure:{rooms:6,questionsPerRoom:7}};
  },{email:user.email,password:user.password});
 }
 const owner=pages[0],other=pages[1];assert.equal(await owner.evaluate(()=>store.state().presets.length),4);
 const saved=await owner.evaluate(()=>store.save(value));assert.equal(saved.revision,1);
 // Another browser context signs in to the same account, then reads actual Firestore.
 const second=await browser.newPage();await second.route(base+'/__codex-preset-smoke',r=>r.fulfill({contentType:'text/html',body:'<!doctype html>'}));await second.goto(base+'/__codex-preset-smoke');
 const restored=await second.evaluate(async({email,password,id})=>{const {firebaseWebConfig}=await import('/js/firebase-web-config.js');const {initializeApp}=await import('https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js');const {getAuth,signInWithEmailAndPassword}=await import('https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js');const sdk=await import('https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js');const {createFirestorePresetAdapter}=await import('/js/pigpen-experience-presets-firestore.mjs?v=20261006-account-presets-v2');const app=initializeApp(firebaseWebConfig);const user=(await signInWithEmailAndPassword(getAuth(app),email,password)).user;const adapter=createFirestorePresetAdapter(sdk.getFirestore(app),sdk);return (await adapter.load(user.uid)).find(p=>p.id===id);},{email:temporary[0].email,password:temporary[0].password,id:saved.id});assert.deepEqual(restored.config,saved.config);assert.deepEqual(restored.structure,saved.structure);
 const denied=await other.evaluate(async({owner,id})=>{try{await sdk.getDoc(sdk.doc(db,'users',owner,'pigpenExperiencePresets',id));return false;}catch(e){return e.code==='permission-denied';}},{owner:temporary[0].uid,id:saved.id});assert.equal(denied,true);
 const updated=await owner.evaluate(()=>store.save({...value,structure:{rooms:2,questionsPerRoom:3}}));assert.equal(updated.id,saved.id);assert.equal(updated.revision,2);
 await owner.evaluate(async()=>{await store.remove('preset_classic');await store.load();});assert.equal(await owner.evaluate(()=>store.state().presets.some(p=>p.id==='preset_classic')),false);
 await owner.evaluate(async id=>{await store.remove(id);await store.load();},saved.id);assert.equal(await owner.evaluate(()=>store.state().presets.length),3);
 console.log('Production Firestore + browser SDK 12.7: save, update, second context, private access and deletion OK.');
 await writeFile('/tmp/charly-pigpen-presets-smoke.json',JSON.stringify({base,passed:true,checkedAt:new Date().toISOString(),sdk:'12.7.0'}));
}finally{
 if(browser)await browser.close();
 const cleanupErrors=[];
 for(const user of temporary){
  for(const group of ['pigpenExperiencePresets','pigpenExperienceState']){
   const path='users/'+user.uid+'/'+group;const r=await fetch(restBase+path,{headers:{Authorization:'Bearer '+access}});const data=await r.json();if(!r.ok){cleanupErrors.push('list '+group+' '+r.status);continue;}
   for(const doc of data.documents||[]){const removed=await fetch('https://firestore.googleapis.com/v1/'+doc.name,{method:'DELETE',headers:{Authorization:'Bearer '+access}});if(!removed.ok)cleanupErrors.push('delete '+group+' '+removed.status);}
  }
  const profile=await fetch(restBase+'users/'+user.uid,{method:'DELETE',headers:{Authorization:'Bearer '+access}});if(!profile.ok&&profile.status!==404)cleanupErrors.push('profile '+profile.status);
  try{await accountApi('delete',{idToken:user.token});}catch{cleanupErrors.push('temporary auth cleanup');}
 }
 if(cleanupErrors.length)throw Error('Temporary cleanup incomplete: '+cleanupErrors.join('; '));console.log('Temporary accounts and Firestore documents cleaned.');
}
