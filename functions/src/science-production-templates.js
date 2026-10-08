const {fail}=require('./science-production-policy.js');
let modules;
async function catalog(){
  modules||=Promise.all([import('./science-curriculum-profiles.mjs'),import('./science-curriculum-policy.mjs')]).then(([profiles,policy])=>({...profiles,...policy,registry:profiles.createCurriculumRegistry(profiles.SCIENCE_TOPIC_CATALOG)}));
  return modules;
}
async function listScienceTopics(subject){
  const c=await catalog();
  if(subject&&!Object.hasOwn(c.SCIENCE_TOPIC_CATALOG,subject))throw fail('Materia inválida.');
  return [...c.registry.values()].filter(p=>!subject||p.subject===subject).map(p=>({subject:p.subject,topic:p.topic,profileId:p.id,modelId:p.simulatorProfile.modelId,formula:p.simulatorProfile.formula,focus:p.simulatorProfile.focus,questionTypes:p.gameProfile.questionTypes||p.questionTypes||[]}));
}
async function getActivityTemplate(subject,topic,{allowCustom=false}={}){
  const c=await catalog();
  if(!Object.hasOwn(c.SCIENCE_TOPIC_CATALOG,subject))throw fail('Materia inválida.');
  const aliases={MRUA:'Movimiento rectilíneo uniformemente acelerado (MRUA)',MRU:'Movimiento rectilíneo uniforme (MRU)'};
  const name=aliases[String(topic).toUpperCase()]||String(topic||'');
  const profile=c.resolveCurriculumProfile(c.registry,subject,name);
  if(!profile&&!allowCustom)throw fail('Tema sin modelo curado. Consulta list_science_topics o solicita simulatorMode new.',422);
  const base={schemaVersion:2,subject,topic:profile?.topic||name,title:`${profile?.topic||name}: actividad científica`,subtitle:'Explora y comprueba',grade:subject==='biology'?'1º secundaria':subject==='physics'?'2º secundaria':'3º secundaria',trimester:'Trimestre 1',gameMode:'game',difficulty:'balanced',visualStyle:'rive-kawaii-signal',levelCount:3,questionsPerLevel:3,experiencePrompt:'',expectedLearnings:'',mission:profile?.simulatorProfile.focus||`Investiga ${name}`,scientificPrinciple:profile?.simulatorProfile.formula||'Modelo pendiente de validación científica',actionLabel:'Experimentar',successMessage:'Compara tus resultados con la explicación.',coachTips:['Cambia una variable cada vez.','Predice y comprueba.','Registra las unidades.'],assessments:[],controls:[],simulator:{modelId:'pending'},generation:{complete:false,curriculumPolicyVersion:c.CURRICULUM_POLICY_VERSION},scenario:{id:'science-context',label:name,topic:name,biome:'laboratory',sky:'#d8e7f4',ground:'#617c9b',accent:'#ff8068',motif:'science'},visual:{primary:'#617c9b',accent:'#ff8068'}};
  if(profile)c.applyCurriculumProfile(base,profile);
  base.allowedQuestionTypes=c.questionTypesForActivity(base,profile?.gameProfile.questionTypes||['multiple']);
  base.curriculumGenerationContract=c.buildCurriculumGenerationContract(base);
  return base;
}
async function prepareActivityTemplate(config={},supplied){
  const subject=config.subject||supplied?.subject,topic=config.topic||supplied?.topic;
  const isGame=(config.gameMode||supplied?.gameMode||'game')!=='simulator';
  const trusted=await getActivityTemplate(subject,topic,{allowCustom:isGame||['new','approved'].includes(config.simulatorMode)});
  if(isGame&&trusted.simulator.modelId==='pending'){
    const c=await catalog(),profiles=[...c.registry.values()].filter(p=>p.subject===subject);
    const requested=supplied?.simulator?.modelId;
    const fallback=profiles.find(p=>p.simulatorProfile.modelId===requested)||profiles.find(p=>p.simulatorProfile.modelId===({physics:'friction',chemistry:'atomic',biology:'cell-structure',math:'math-integer-addition'}[subject]))||profiles[0];
    c.applyCurriculumProfile(trusted,fallback);
    // Reuse a known game engine without claiming the free topic has a curated simulator.
    trusted.runtimeTemplateTopic=fallback.topic;trusted.customTopic=true;
    trusted.curriculumProfile={...trusted.curriculumProfile,topic:String(topic)};
    trusted.gameProfile={...trusted.gameProfile,learningObjective:`Explorar ${topic}.`};
    trusted.allowedQuestionTypes=c.questionTypesForActivity(trusted,fallback.gameProfile.questionTypes);
    trusted.curriculumGenerationContract=c.buildCurriculumGenerationContract(trusted);
  }
  if(!supplied){if(!isGame)trusted.artDirection=await require('./science-production-art.js').deriveProductionArtDirection({...trusted,gameMode:'simulator'},config.simulatorMode);return trusted;}
  const merged={...structuredClone(supplied),subject,topic:trusted.topic};
  // Browser/editor data may specify values and content, never replace curated engines or ranges.
  const requested=new Map((Array.isArray(supplied.controls)?supplied.controls:[]).map(c=>[c.id,c.value]));
  for(const key of ['profileId','profileVersion','curriculumProfile','simulationType','variant','gameProfile','challenge','allowedQuestionTypes','customTopic','runtimeTemplateTopic'])if(trusted[key]!=null)merged[key]=trusted[key];
  merged.controls=trusted.controls.map(control=>({...control,...(Number.isFinite(requested.get(control.id))?{value:Math.max(control.min,Math.min(control.max,requested.get(control.id)))}:{})}));
  merged.simulator={...trusted.simulator,values:Object.fromEntries(merged.controls.map(c=>[c.id,c.value]))};
  merged.generation={...supplied.generation,complete:false,curriculumPolicyVersion:trusted.generation.curriculumPolicyVersion};
  merged.curriculumGenerationContract=(await catalog()).buildCurriculumGenerationContract({...merged,...config});
  if(!isGame)merged.artDirection=await require('./science-production-art.js').deriveProductionArtDirection({...merged,gameMode:'simulator'},config.simulatorMode);
  else delete merged.artDirection;
  return merged;
}
module.exports={listScienceTopics,getActivityTemplate,prepareActivityTemplate};
