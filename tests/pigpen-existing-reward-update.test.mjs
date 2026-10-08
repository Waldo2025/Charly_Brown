import test from 'node:test';
import assert from 'node:assert/strict';
import {experience as E} from '../public/js/escape-room-experience.mjs';
import {createRewardEngine} from '../public/js/escape-room-rewards.mjs';
import {isRewardOnlyConfigurationChange, updateExistingProjectReward} from '../public/js/pigpen-existing-reward-update.mjs';
import {projectFor} from './fixtures/pigpen-experience.mjs';

const rewards=createRewardEngine(E);
const configContract=(primary='letras',extras=['pista'])=>({
  tema:'Funciones',salas:1,preguntas_por_sala:1,
  experience_config:{version:1,question_types:['respuesta_coordenadas'],primary_reward:primary,extras,bonus_rule:'perfect_room',reward_image_signature:null}
});

test('recognizes a reward-only change and rejects unrelated experience changes',()=>{
  const before=configContract();
  const after=configContract('imagen');
  assert.equal(isRewardOnlyConfigurationChange(before,after),true);
  const changedTypes=structuredClone(after);changedTypes.experience_config.question_types=['opcion_multiple'];
  assert.equal(isRewardOnlyConfigurationChange(before,changedTypes),false);
  const changedExtras=structuredClone(after);changedExtras.experience_config.extras=['pista','descarte'];
  assert.equal(isRewardOnlyConfigurationChange(before,changedExtras),false);
  assert.equal(isRewardOnlyConfigurationChange(before,structuredClone(before)),false);
});

test('updates every new primary reward without replacing authored rooms or fragment assignments',()=>{
  const source=projectFor(['respuesta_coordenadas'],'letras',['pista']);
  source.clave_final='PARABOLA';
  source.misiones.push({...structuredClone(source.misiones[0]),id:'m2',titulo:'Sala 2'});
  source.reward_plan=rewards.buildPlan(source.experience_config,source.clave_final,[{id:'m1',titulo:'Sala 1',fragment:'PA'},{id:'m2',titulo:'Sala 2',fragment:'RABOLA'}]);
  const questions=structuredClone(source.misiones[0].preguntas);
  for(const type of ['imagen','simbolos','coordenadas','posiciones','patron']){
    const config=E.config({...source.experience_config,primary_reward:type,...(type==='imagen'?{reward_image:'https://example.com/reward.webp'}:{})});
    const updated=updateExistingProjectReward(source,config,rewards);
    assert.equal(updated.experience_config.primary_reward,type);
    assert.equal(updated.reward_plan.type,type);
    assert.deepEqual(updated.reward_plan.rooms.map(room=>room.fragment),source.reward_plan.rooms.map(room=>room.fragment));
    assert.deepEqual(updated.misiones[0].preguntas,questions);
    assert.deepEqual(rewards.issues(updated.reward_plan),[]);
  }
  assert.equal(source.experience_config.primary_reward,'letras');
  assert.equal(source.reward_plan.type,'letras');
  assert.deepEqual(source.misiones[0].preguntas,questions);
});
