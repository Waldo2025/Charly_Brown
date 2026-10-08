import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {experience} from '../public/js/escape-room-experience.mjs';
import {readQuestionPreferences,saveQuestionPreferences,questionPreferencesKey,QUESTION_PREFERENCES_KEY} from '../public/js/pigpen-question-preferences.mjs';
const store=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
test('confirmed question types persist without copying rewards or images',()=>{
 const storage=store();assert.equal(readQuestionPreferences({},storage,'teacher').question_types.length,8);
 assert.equal(saveQuestionPreferences({question_types:['matriz_deduccion','opcion_multiple'],primary_reward:'imagen',reward_image:'data:image/png;base64,YQ=='},storage,'teacher'),true);
 assert.deepEqual(JSON.parse(storage.getItem(questionPreferencesKey('teacher'))),{version:1,question_types:['matriz_deduccion','opcion_multiple']});
 assert.deepEqual(readQuestionPreferences({},storage,'teacher').question_types,['matriz_deduccion','opcion_multiple']);assert.equal(readQuestionPreferences({},storage,'teacher').primary_reward,'letras');
 assert.equal(readQuestionPreferences({primary_reward:'simbolos'},storage,'teacher').primary_reward,'simbolos');
});
test('corrupt, empty, unknown and inaccessible storage fall back safely',()=>{
 const storage=store();for(const raw of ['{bad','null','{}',JSON.stringify({version:1,question_types:[]}),JSON.stringify({version:1,question_types:['unknown']})]){storage.setItem(questionPreferencesKey('teacher'),raw);assert.equal(readQuestionPreferences({},storage,'teacher').question_types.length,8);}
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('full');}};assert.equal(readQuestionPreferences({},blocked).question_types.length,8);assert.equal(saveQuestionPreferences({},blocked),false);
});
test('new session and topic use preference; opening a saved topic does not write preferences',()=>{
 const source=readFileSync(new URL('../public/js/PigPenCreator.js',import.meta.url),'utf8');
 function extract(name){const start=source.indexOf('function '+name+'(');return source.slice(start,source.indexOf('\nfunction ',start+1));}
 const storage=store();saveQuestionPreferences({question_types:['marcar_evidencia']},storage,'teacher');
 const original={__experienceConfig:experience.config({question_types:['texto'],primary_reward:'simbolos'})};
 const ctx=vm.createContext({serializeFormState:()=>structuredClone(original),readQuestionPreferences:base=>readQuestionPreferences(base,storage,'teacher'),window:{}});
 vm.runInContext(extract('buildInheritedTopicFormState')+'\n'+extract('buildInheritedSessionFormState'),ctx);
 assert.deepEqual(ctx.buildInheritedTopicFormState(2).__experienceConfig.question_types,['marcar_evidencia']);assert.equal(ctx.buildInheritedTopicFormState(2).__experienceConfig.primary_reward,'simbolos');
 assert.deepEqual(ctx.buildInheritedSessionFormState().__experienceConfig.question_types,['marcar_evidencia']);assert.equal(ctx.buildInheritedSessionFormState().__experienceConfig.primary_reward,'letras');
 assert.doesNotMatch(extract('applyFormState'),/saveQuestionPreferences|readQuestionPreferences/);assert.deepEqual(original.__experienceConfig.question_types,['texto']);
});

test("preferences never cross accounts or import the legacy key",()=>{const storage=store();storage.setItem(QUESTION_PREFERENCES_KEY,JSON.stringify({version:1,question_types:["texto"]}));assert.equal(readQuestionPreferences({},storage,"a").question_types.length,8);saveQuestionPreferences({question_types:["texto"]},storage,"a");assert.deepEqual(readQuestionPreferences({},storage,"a").question_types,["texto"]);assert.equal(readQuestionPreferences({},storage,"b").question_types.length,8);assert.equal(saveQuestionPreferences({},storage),false);});
