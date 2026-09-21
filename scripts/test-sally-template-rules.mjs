import assert from "node:assert/strict";
import {initializeApp,deleteApp} from "firebase/app";
import {getFirestore,connectFirestoreEmulator,doc,setDoc,getDoc,getDocs,collection,updateDoc,deleteDoc,serverTimestamp,terminate} from "firebase/firestore";
const projectId="demo-sally-templates",apps=[],databases=[];
function client(uid,claims={role:"teacher",approvalStatus:"approved"}){const app=initializeApp({projectId,apiKey:"fake"},uid||"anonymous");apps.push(app);const db=getFirestore(app);databases.push(db);connectFirestoreEmulator(db,"127.0.0.1",8187,uid?{mockUserToken:{sub:uid,user_id:uid,...claims}}:{});return db;}
async function denied(action){await assert.rejects(action,error=>error.code==="permission-denied");}
const owner=client("alice"),other=client("bob"),anon=client(null),pending=client("pending",{role:"teacher",approvalStatus:"pending"}),noRole=client("no-role",{approvalStatus:"approved"}),rolePending=client("role-pending",{role:"pending",approvalStatus:"approved"}),blocked=client("blocked",{role:"teacher",approvalStatus:"blocked"});
const data=()=>({ownerId:"alice",name:"Nota del maestro",html:'<aside style="color:#123">{{contenido}}</aside>',version:1,archived:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
try{
 await setDoc(doc(owner,"SallyBrownTemplates","note"),data());
 assert.equal((await getDoc(doc(other,"SallyBrownTemplates","note"))).data().name,"Nota del maestro");
 assert.equal((await getDocs(collection(other,"SallyBrownTemplates"))).size,1);
 await denied(()=>setDoc(doc(pending,"SallyBrownTemplates","pending-write"),{...data(),ownerId:"pending"}));
 for(const db of [anon,pending,noRole,rolePending,blocked])await denied(()=>getDoc(doc(db,"SallyBrownTemplates","note")));
 await denied(()=>updateDoc(doc(other,"SallyBrownTemplates","note"),{html:"Otro texto",version:2,updatedAt:serverTimestamp()}));
 await denied(()=>updateDoc(doc(owner,"SallyBrownTemplates","note"),{ownerId:"bob",version:2,updatedAt:serverTimestamp()}));
 await denied(()=>updateDoc(doc(owner,"SallyBrownTemplates","note"),{version:1,updatedAt:serverTimestamp()}));
 await denied(()=>setDoc(doc(other,"SallyBrownTemplates","spoof"),data()));
 await denied(()=>setDoc(doc(owner,"SallyBrownTemplates","oversize"),{...data(),html:"a".repeat(150001)}));
 await updateDoc(doc(owner,"SallyBrownTemplates","note"),{archived:true,version:2,updatedAt:serverTimestamp()});
 await updateDoc(doc(owner,"SallyBrownTemplates","note"),{archived:false,version:3,updatedAt:serverTimestamp()});
 await denied(()=>deleteDoc(doc(owner,"SallyBrownTemplates","note")));
 await setDoc(doc(other,"SallyBrownTemplates","copy"),{...data(),ownerId:"bob"});
 const revoked=await fetch(`http://127.0.0.1:8187/v1/projects/${projectId}/databases/(default)/documents/users/alice`,{method:"PATCH",headers:{Authorization:"Bearer owner","Content-Type":"application/json"},body:JSON.stringify({fields:{role:{stringValue:"teacher"},approvalStatus:{stringValue:"rejected"}}})});assert.equal(revoked.ok,true);
 await denied(()=>updateDoc(doc(owner,"SallyBrownTemplates","note"),{version:4,updatedAt:serverTimestamp()}));
 console.log("PASS: global approved reads, author-only writes, copies, immutable ownership, version checks, limits, archival and revoked approval.");
}finally{await Promise.all(databases.map(terminate));await Promise.all(apps.map(deleteApp));}
