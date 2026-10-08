// Selective release: retain live files/config; require a verified preview before cutover.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const pigpenPresets=process.argv.includes('--pigpen-presets');
const channelId=pigpenPresets?'pigpen-presets-20261006':'cost-reduction-20261005';
const project='charly-brown',site='sites/'+project,channel=site+'/channels/'+channelId;
const statePath=pigpenPresets?'/tmp/charly-pigpen-presets-hosting-state.json':'/tmp/charly-cost-hosting-state.json';
const token=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8'}).trim();
async function api(path,method='GET',body){const res=await fetch('https://firebasehosting.googleapis.com/v1beta1/'+path,{method,headers:{Authorization:'Bearer '+token,'x-goog-user-project':project,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await res.json();if(!res.ok)throw Error(JSON.stringify(data));return data;}
async function filesIn(dir){const result=[];for(const item of await readdir('public/'+dir,{withFileTypes:true})){const name=dir+'/'+item.name;if(item.isDirectory())result.push(...await filesIn(name));else result.push(name);}return result;}
if(process.argv.includes('--verify')) {
  if(!pigpenPresets)throw Error('Use the existing cost-reduction verification workflow');
  const state=JSON.parse(await readFile(statePath,'utf8'));
  const browser=JSON.parse(await readFile('/tmp/charly-pigpen-presets-browser-verification.json','utf8'));
  if(!browser.passed||browser.url!==state.url)throw Error('This preview has not passed browser verification');
  for(const path of state.changed){const response=await fetch(state.url+'/'+path.replace(/\.html$/, ''));if(!response.ok)throw Error('Preview asset '+path+' '+response.status);const hash=createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');if(hash!==state.sourceHashes[path])throw Error('Preview differs: '+path);}
  state.verified=true;await writeFile(statePath,JSON.stringify(state,null,2));console.log(JSON.stringify({verified:state.version,url:state.url}));
} else if(process.argv.includes('--publish')) {
  const state=JSON.parse(await readFile(statePath,'utf8'));
  if(!state.verified)throw Error('Preview has not been verified');
  if(pigpenPresets)for(const path of state.changed){if(createHash('sha256').update(await readFile('public/'+path)).digest('hex')!==state.sourceHashes[path])throw Error('Source changed since preview: '+path);}
  if((await api(site+'/releases?pageSize=1')).releases[0].name!==state.baseRelease)throw Error('Live release changed; prepare again');
  const result=await api(site+'/releases?versionName='+encodeURIComponent(state.version),'POST',{message:pigpenPresets?'PigPen: presets privados por cuenta y recuperación':'Cómputo local, investigación limitada y cierre de sesiones inactivas'});
  console.log(JSON.stringify({release:result.name,version:state.version,rollback:state.previousVersion}));
} else {
  const release=(await api(site+'/releases?pageSize=1')).releases[0],previous=await api(release.version.name),files={};let pageToken='';
  do{const page=await api(previous.name+'/files?pageSize=1000'+(pageToken?'&pageToken='+encodeURIComponent(pageToken):''));for(const file of page.files||[])files[file.path]=file.hash;pageToken=page.nextPageToken;}while(pageToken);
  const changed=pigpenPresets?['PigPenCreator.html','js/PigPenCreator.js','js/pigpen-experience-modal.mjs','js/pigpen-question-preferences.mjs','js/pigpen-experience-presets.mjs','js/pigpen-experience-presets-firestore.mjs']:['cors.json','charly-brown/chat-attachment-uploader.js','charly-brown/chat-controller.js','analizarPDF/analizar-pdf-api.js','analizarPDF/analizar-pdf-app.js','MarcieBlogEditor/js/services/marcie-gemini-service.js','MarcieBlogEditor/js/services/marcie-mode-service.js','js/generarUnidad.js','js/lecturasGame.core.js','js/sally-remote.js',...await filesIn('document-processing'),...await filesIn('vendor/tesseract')];
  const uploads=new Map(),sourceHashes={};for(const path of changed){const source=await readFile('public/'+path);sourceHashes[path]=createHash('sha256').update(source).digest('hex');const bytes=gzipSync(source,{level:9}),hash=createHash('sha256').update(bytes).digest('hex');files['/'+path]=hash;uploads.set(hash,bytes);}
  if(!pigpenPresets)delete files['/js/generarUnidad_stable_20260507.js'];
  const config=structuredClone(previous.config);
  if(!pigpenPresets)for(const rule of config.headers||[])for(const [key,value] of Object.entries(rule.headers||{}))if(key.toLowerCase()==='content-security-policy'&&!value.includes("'wasm-unsafe-eval'"))rule.headers[key]=value.replace('script-src ',"script-src 'wasm-unsafe-eval' ");
  const version=await api(site+'/versions','POST',{config}),entries=Object.entries(files);
  for(let i=0;i<entries.length;i+=1000){const r=await api(version.name+':populateFiles','POST',{files:Object.fromEntries(entries.slice(i,i+1000))});for(const hash of r.uploadRequiredHashes||[]){if(!uploads.has(hash))throw Error('Missing retained file '+hash);const res=await fetch(r.uploadUrl+'/'+hash,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/octet-stream'},body:uploads.get(hash)});if(!res.ok)throw Error('Upload failed '+res.status);}}
  await api(version.name+'?updateMask=status','PATCH',{status:'FINALIZED'});
  try{await api(channel);}catch{await api(site+'/channels?channelId='+channelId,'POST',{ttl:'604800s'});}
  await api(channel+'/releases?versionName='+encodeURIComponent(version.name),'POST',{message:pigpenPresets?'PigPen account preset preview':'Selective cost-reduction preview'});
  const preview=await api(channel),state={baseRelease:release.name,previousVersion:previous.name,version:version.name,url:preview.url,changed,sourceHashes,verified:false};
  await writeFile(statePath,JSON.stringify(state,null,2));console.log(JSON.stringify(state));
}
