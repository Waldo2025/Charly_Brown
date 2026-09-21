const {randomUUID}=require("node:crypto");
function createTaskStore(db,bucket){
  const tasks=db.collection("SallyBrownTasks");
  async function read(id){const meta=await tasks.doc(id).get();if(!meta.exists)return null;const [bytes]=await bucket.file(meta.data().path).download();return {...JSON.parse(bytes),revision:meta.data().revision};}
  async function write(task,creating=false){
    const revision=randomUUID(),path=`sallyBrown/${task.ownerId}/${task.sessionId}/tasks/${task.id}/states/${revision}.json`;
    const data={...task,revision};await bucket.file(path).save(JSON.stringify(data),{resumable:false,contentType:"application/json"});
    await db.runTransaction(async tx=>{const ref=tasks.doc(task.id),old=await tx.get(ref);if(creating?old.exists:!old.exists||old.data().revision!==task.revision)throw Error("La tarea cambió en otro proceso. Vuelve a cargarla.");tx.set(ref,{sessionId:task.sessionId,conversationId:task.conversationId,ownerId:task.ownerId,title:task.title,status:task.status,path,revision,updatedAt:new Date().toISOString()});});task.revision=revision;return task;
  }
  return {get:read,create:t=>write(t,true),save:t=>write(t),async list(sessionId,conversationId){const docs=await tasks.where("sessionId","==",sessionId).get();return docs.docs.map(d=>({id:d.id,...d.data()})).filter(t=>t.conversationId===conversationId);},
    async artifact(task,data){const path=`sallyBrown/${task.ownerId}/${task.sessionId}/tasks/${task.id}/artifacts/${randomUUID()}.json`;await bucket.file(path).save(JSON.stringify(data),{resumable:false,contentType:"application/json"});return path;},
    async readArtifact(path){const [b]=await bucket.file(path).download();return JSON.parse(b);}
  };
}
module.exports={createTaskStore};
