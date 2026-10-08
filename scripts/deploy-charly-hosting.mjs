// Publish only Charly resource editor assets, preserving every other file and the live config.
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
const changed=["charly-brown/user-intent.js","charly-brown/main.js", "charly-brown/chat-controller.js", "charly-brown/resource-review-modal.js", "charly-brown/accepted-panel.js", "charly-brown/charly-brown.css", "charly-brown/state.js", "charly-brown/sessions-store.js", "charly-brown/production-client.js", "charly-brown/video-script-copy.js", "charly-brown/gemini-client.js", "charly-brown/prompts-service.js", "charly-brown/unit-automation.js", "charly-brown/subtopics-settings-modal.js", "charly-brown/unit-contracts.js", "charly-brown/unit-panel.css", "charly-brown/unit-drawer.js"];
const uploads=new Map();
for(const file of changed){
  const bytes=gzipSync(await readFile(new URL("../public/"+file,import.meta.url)),{level:9});
  const hash=createHash("sha256").update(bytes).digest("hex");
  files["/"+file]=hash;uploads.set(hash,bytes);
}
const config=structuredClone(previous.config);
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
const published=await api(site+"/releases?versionName="+encodeURIComponent(version.name),"POST",{message:"Charly: revisión de recursos en modales y especialistas MCP"});
console.log(JSON.stringify({previous:previous.name,version:version.name,release:published.name,changed,totalFiles:entries.length},null,2));
