import {collection,doc,onSnapshot,runTransaction,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
export function createTemplateStore(db,uid){
  const collectionRef=collection(db,"SallyBrownTemplates");
  return {
    watch(next,error){return onSnapshot(collectionRef,snap=>next(snap.docs.map(d=>({id:d.id,...d.data()}))),error);},
    async save({id,name,html,version,archived=false}){
      if(!name?.trim()||name.length>120||!html?.trim()||html.length>150000)throw Error("Indica un nombre y HTML válido (máximo 150 000 caracteres).");
      const target=id?doc(collectionRef,id):doc(collectionRef);
      await runTransaction(db,async transaction=>{
        const old=await transaction.get(target);
        if(id&&(!old.exists()||old.data().ownerId!==uid))throw Error("Solo el autor puede modificar esta plantilla. Guarda una copia.");
        if(id&&old.data().version!==version)throw Error("La plantilla cambió en otra ventana. Vuelve a seleccionarla antes de guardar.");
        const data={name:name.trim(),html,ownerId:uid,archived,version:old.exists()?old.data().version+1:1,createdAt:old.exists()?old.data().createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
        transaction.set(target,data);
      });return target.id;
    }
  };
}
