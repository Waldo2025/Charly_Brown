// Large generation drafts must not compete with small form preferences in localStorage.
export function createObjectiveCheckpointStore({ indexedDB, localStorage } = {}) {
  let database;
  const open = () => database ||= new Promise((resolve,reject) => {
    const req=indexedDB.open('pigpen-generation-cache',1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('checkpoints'))req.result.createObjectStore('checkpoints');};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  }).catch(error=>{database=null;throw error;});
  async function run(mode,key,value,remove=false){
    const db=await open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('checkpoints',mode),store=tx.objectStore('checkpoints');
      const req=mode==='readonly'?store.get(key):remove?store.delete(key):store.put(value,key);
      let result;req.onsuccess=()=>{result=req.result;};
      tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error || Error('Checkpoint transaction aborted'));tx.onerror=()=>reject(tx.error);
    });
  }
  return {
    async load(key){
      if(indexedDB){const saved=await run('readonly',key);if(saved)return saved;}
      try{return JSON.parse(localStorage?.getItem(key)||'null');}catch{return null;}
    },
    async save(key,value){
      if(indexedDB){await run('readwrite',key,value);try{localStorage?.removeItem(key);}catch{};return;}
      if(!localStorage)throw Error('No se puede guardar el avance en este navegador.');
      localStorage.setItem(key,JSON.stringify(value));
    },
    async remove(key){if(indexedDB)await run('readwrite',key,null,true);try{localStorage?.removeItem(key);}catch{}}
  };
}
export const objectiveCheckpointStore = createObjectiveCheckpointStore({indexedDB:globalThis.indexedDB,localStorage:globalThis.localStorage});
