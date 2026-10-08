import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,collection,getDocsFromServer,runTransaction,serverTimestamp,getDoc,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
import {createFirestorePresetAdapter} from '../public/js/pigpen-experience-presets-firestore.mjs';
import {DEFAULT_PRESETS,normalizePreset} from '../public/js/pigpen-experience-presets.mjs';
const [host,port]=String(process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8080').split(':');
const env=await initializeTestEnvironment({projectId:'demo-pigpen-presets',firestore:{host,port:Number(port),rules:fs.readFileSync(process.env.PIGPEN_PRESET_RULES_FILE||'firestore.rules','utf8')}});
const sdk={doc,collection,getDocsFromServer,runTransaction,serverTimestamp};
try{
 const db=env.authenticatedContext('owner').firestore(),other=env.authenticatedContext('other').firestore(),anonymous=env.unauthenticatedContext().firestore();
 const adapter=createFirestorePresetAdapter(db,sdk);
 const defaults=DEFAULT_PRESETS.map(p=>normalizePreset(p));
 await adapter.initialize('owner',defaults);assert.equal((await adapter.load('owner')).length,4);
 await adapter.remove('owner','preset_classic',1);await adapter.initialize('owner',defaults);assert.equal((await adapter.load('owner')).length,3);
 const value=normalizePreset({id:'preset_custom',name:'Ciencias',config:{question_types:['texto','marcar_evidencia'],primary_reward:'imagen',extras:['pista'],reward_image:'data:image/png;base64,YQ==',reward_image_alt:'Imagen',reward_image_aspect:1.2},structure:{rooms:8,questionsPerRoom:9}});
 const saved=await adapter.save('owner',value,0);assert.equal(saved.revision,1);
 const otherDevice=createFirestorePresetAdapter(env.authenticatedContext('owner').firestore(),sdk);assert.deepEqual((await otherDevice.load('owner')).find(p=>p.id===saved.id).config,saved.config);
 await adapter.save('owner',{...value,structure:{rooms:2,questionsPerRoom:3}},1);
 await assert.rejects(otherDevice.save('owner',value,1),{code:'preset-conflict'});await assert.rejects(otherDevice.remove('owner',value.id,1),{code:'preset-conflict'});
 const target=doc(db,'users','owner','pigpenExperiencePresets',value.id),data=(await getDoc(target)).data();
 for(const context of [other,anonymous]){
  await assertFails(getDoc(doc(context,'users','owner','pigpenExperiencePresets',value.id)));
  await assertFails(getDocsFromServer(collection(context,'users','owner','pigpenExperiencePresets')));
  await assertFails(setDoc(doc(context,'users','owner','pigpenExperiencePresets','stolen'),{...data,id:'stolen'}));
  await assertFails(deleteDoc(doc(context,'users','owner','pigpenExperiencePresets',value.id)));
  await assertFails(getDoc(doc(context,'users','owner','pigpenExperienceState','library')));
 }
 const marker=doc(db,'users','owner','pigpenExperienceState','library');await assertFails(deleteDoc(marker));await assertFails(updateDoc(marker,{initialized:false}));
 for(const patch of [{name:'x'.repeat(29)},{config:{...data.config,question_types:[]}},{config:{...data.config,question_types:['invalid']}},{config:{...data.config,reward_image:'data:image/png;base64,'+'A'.repeat(350000)}},{config:{...data.config,extras:['invented']}},{structure:{rooms:9,questionsPerRoom:2}},{structure:{rooms:2,questionsPerRoom:0}},{unexpected:'field'},{revision:2}]){
  await assertFails(setDoc(target,{...data,...patch,revision:patch.revision??3,updatedAt:serverTimestamp()}));
 }
 await assertSucceeds(setDoc(target,{...data,revision:3,updatedAt:serverTimestamp()}));
 await adapter.remove('owner',value.id,3);assert.equal((await adapter.load('owner')).length,3);
 console.log('PigPen presets: Firestore transactions, hydration, deletion, image and private rules OK.');
}finally{await env.cleanup();}
