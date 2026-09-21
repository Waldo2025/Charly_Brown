import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {experience} from '../public/js/escape-room-experience.mjs';
import {prepareEscapeRoomCloudPayload} from '../public/js/escape-room-cloud-payload.mjs';

function noUndefined(value){assert.notEqual(value,undefined);if(value&&typeof value==='object')for(const child of Object.values(value))noUndefined(child);}
test('objective configuration omits reward_image instead of assigning undefined',()=>{
 const source=readFileSync(new URL('../public/js/PigPenCreator.js',import.meta.url),'utf8');const start=source.indexOf('function getObjectiveConfigurationContract(');const end=source.indexOf('\nfunction ',start+1);
 const context=vm.createContext({experience,CONTENT_GENERATION_CONTRACT_VERSION:1,TEXT_MODEL_DEFAULT:'test',normalizeString:(s,f)=>String(s||f),normalizePresentationMode:()=> 'salas'});
 vm.runInContext(source.slice(start,end),context);
 for(const reward_image of [undefined,'data:image/png;base64,YQ==']){
  const data={experience_config:{primary_reward:'imagen',reward_image}};
  const result=context.getObjectiveConfigurationContract(data);assert.equal(Object.hasOwn(result.experience_config,'reward_image'),false);noUndefined(result);
  assert.equal(data.experience_config.reward_image,reward_image);
  assert.equal(result.experience_config.reward_image_signature===null,reward_image===undefined);
 }
});
test('previously created nested blueprint is safe to save without changing editor state or Firebase values',async()=>{
 class Timestamp {constructor(){this.seconds=123;}}
 const timestamp=new Timestamp();const input={formState:{__objectiveBlueprint:{source_contract:{configuration:{experience_config:{primary_reward:'letras',reward_image:undefined,reward_image_signature:null}}}}},project:{titulo:'Conservar',values:[0,false,'',null,undefined]},updatedAt:timestamp};
 const result=await prepareEscapeRoomCloudPayload(input,()=>{throw Error('No assets to upload');});
 noUndefined(result);assert.equal(result.updatedAt,timestamp);assert.equal(Object.hasOwn(input.formState.__objectiveBlueprint.source_contract.configuration.experience_config,'reward_image'),true);
 assert.deepEqual(result.formState.__objectiveBlueprint.source_contract.configuration.experience_config,{primary_reward:'letras',reward_image_signature:null});assert.deepEqual(result.project.values,[0,false,'',null,null]);assert.equal(result.project.titulo,'Conservar');
});
