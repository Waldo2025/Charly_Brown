import {ref,listAll,uploadBytes} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import {authFetch} from "./api-client.js";
let lastRecordTime=0;
const MAX_PRIVATE_JSON_BYTES=32*1024*1024;
function privateJsonRoute(path){
  const route=`/api/assets/proxy-media?storagePath=${encodeURIComponent(path)}&noRange=1`;
  const host=String(window.location.hostname||"").toLowerCase();
  return host==="127.0.0.1"||host==="localhost"?`http://127.0.0.1:8787${route}`:route;
}

export async function readPrivateJson(storage,path){
  try{
    // Keep private Storage redirects outside the browser: signed Google URLs can
    // require a preflight that is invalid for the GET-only signature.
    const response=await authFetch(privateJsonRoute(path),{headers:{Accept:"application/json"}});
    if(!response.ok)throw Error(`Storage respondió HTTP ${response.status}.`);
    const declaredSize=Number(response.headers.get("content-length"))||0;
    if(declaredSize>MAX_PRIVATE_JSON_BYTES)throw Error("El archivo privado supera el límite permitido.");
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength>MAX_PRIVATE_JSON_BYTES)throw Error("El archivo privado supera el límite permitido.");
    return JSON.parse(new TextDecoder().decode(bytes));
  }catch(error){
    if(error instanceof SyntaxError)throw Error("El archivo del historial no contiene JSON válido.");
    throw Error("No se pudo recuperar el archivo privado del historial.",{cause:error});
  }
}
export async function appendHistory(storage,uid,sessionId,entry){
  lastRecordTime=Math.max(Date.now(),lastRecordTime+1);
  const record={...entry,id:crypto.randomUUID(),authorId:uid,createdAt:new Date(lastRecordTime).toISOString()};
  const path=`sallyBrown/${uid}/${sessionId}/history/${Date.now()}-${record.id}.json`;
  await uploadBytes(ref(storage,path),new Blob([JSON.stringify(record)],{type:"application/json"}));
  return {...record,path};
}
export async function loadHistory(storage,session){
  const authors=[...new Set([session.ownerId,...(session.collaborators||[]),...(session.historyAuthors||[])])];
  const groups=await Promise.all(authors.map(async uid=>{
    const listing=await listAll(ref(storage,`sallyBrown/${uid}/${session.id}/history`));
    return Promise.all(listing.items.map(async item=>({...await readPrivateJson(storage,item.fullPath),path:item.fullPath})));
  }));
  return groups.flat().sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
}
