// Publish PigPen generation only, preserving unrelated live files and configuration.
// Default: inspect the intended release. Pass --publish after local verification.
import {execFileSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import {gzipSync} from "node:zlib";
import {createHash} from "node:crypto";
const project="charly-brown",site="sites/"+project;
const token=execFileSync("gcloud",["auth","print-access-token"],{encoding:"utf8"}).trim();
async function api(path,method="GET",body){
  const response=await fetch("https://firebasehosting.googleapis.com/v1beta1/"+path,{method,
    headers:{Authorization:"Bearer "+token,"x-goog-user-project":project,"Content-Type":"application/json"},
    ...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw Error(JSON.stringify(data));return data;
}
const release=(await api(site+"/releases?pageSize=1")).releases[0];
const previous=await api(release.version.name);
const files={};let pageToken="";
do {
  const page=await api(previous.name+"/files?pageSize=1000"+(pageToken?"&pageToken="+encodeURIComponent(pageToken):""));
  for(const file of page.files||[])files[file.path]=file.hash;
  pageToken=page.nextPageToken;
}while(pageToken);
const changed=["PigPenCreator.html","PigPenCreator.css","js/PigPenCreator.js","js/pigpen-generation-client.mjs","js/api-client.js"];
const uploads=new Map();
// Include missing imports required by PigPen without publishing other editors.
for(let i=0;i<changed.length;i++) {
  const source=await readFile(new URL("../public/"+changed[i],import.meta.url),"utf8");
  for(const match of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) {
    const resolved=new URL(match[1].split("?")[0],new URL("../public/"+changed[i],import.meta.url));
    const relative=resolved.pathname.split("/public/")[1];
    if(relative && !files["/"+relative] && !changed.includes(relative))changed.push(relative);
  }
}
for(const file of changed){
  const bytes=gzipSync(await readFile(new URL("../public/"+file,import.meta.url)),{level:9});
  const hash=createHash("sha256").update(bytes).digest("hex");
  files["/"+file]=hash;uploads.set(hash,bytes);
}
const config=structuredClone(previous.config);
const routes=["/api/pigpen/generation","/api/pigpen/generation/**","/api/pigpen/mcp"];
const sample=(config.rewrites||[]).find(rule=>rule.glob==="/api/pigpen/**");
if(!sample)throw Error("No se encontró la ruta PigPen en Hosting.");
const target=sample.run ? {run:{serviceId:"pigpengenerationapi",region:"us-central1"}} : {function:"pigpenGenerationApi",functionRegion:"us-central1"};
config.rewrites=[...routes.map(glob=>({glob,...target})),...(config.rewrites||[]).filter(rule=>!routes.includes(rule.glob))];
if(!process.argv.includes("--publish")) {
  console.log(JSON.stringify({previous:previous.name,changed,rewrites:config.rewrites.slice(0,3),sourceRoute:sample,totalFiles:Object.keys(files).length},null,2));process.exit(0);
}
// Avoid publishing over another deployment that completed while reading files.
if((await api(site+"/releases?pageSize=1")).releases[0].name!==release.name)throw Error("La versión publicada cambió; vuelve a ejecutar.");
const version=await api(site+"/versions","POST",{config});
const entries=Object.entries(files);
for(let index=0;index<entries.length;index+=1000){
  const result=await api(version.name+":populateFiles","POST",{files:Object.fromEntries(entries.slice(index,index+1000))});
  for(const hash of result.uploadRequiredHashes||[]){
    if(!uploads.has(hash))throw Error("Falta un archivo de la versión anterior: "+hash);
    const uploaded=await fetch(result.uploadUrl+"/"+hash,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/octet-stream"},body:uploads.get(hash)});
    if(!uploaded.ok)throw Error("Falló la carga: "+uploaded.status);
  }
}
await api(version.name+"?updateMask=status","PATCH",{status:"FINALIZED"});
if((await api(site+"/releases?pageSize=1")).releases[0].name!==release.name)throw Error("Otra publicación se adelantó; versión preparada pero no publicada.");
const published=await api(site+"/releases?versionName="+encodeURIComponent(version.name),"POST",{message:"PigPen: agentes paralelos, imágenes y revisión multimodal"});
console.log(JSON.stringify({previous:previous.name,version:version.name,release:published.name,changed,totalFiles:entries.length},null,2));
