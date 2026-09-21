import {ref,listAll,uploadBytes,getDownloadURL} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
let lastRecordTime=0;

export async function readPrivateJson(storage,path){
  const response=await fetch(await getDownloadURL(ref(storage,path)));
  if(!response.ok)throw Error("No se pudo recuperar el archivo del historial.");
  return response.json();
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
