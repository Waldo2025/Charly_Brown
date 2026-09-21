const test=require('node:test');
const assert=require('node:assert/strict');
const {inspectQuiz,createDescription}=require('../quiz-adapter.js');
const {validatePlan}=require('../agent.js');
const courseUrl='https://aprende.asc.education/course/view.php?id=496';
const url='https://aprende.asc.education/mod/quiz/view.php?id=39890';
function lockedPage(){return {
  goto:async()=>{},title:async()=>'T1.E1. Actividad 1',
  locator(selector){
    if(selector==='#region-main')return {innerText:async()=> 'No puede agregar o quitar preguntas porque este cuestionario ya ha sido respondido. (Intentos: 246)'};
    if(selector.startsWith('a['))return {evaluateAll:async()=>[courseUrl]};
    if(selector.startsWith('.slot'))return {evaluateAll:async()=>[{slot:'1',title:'Pregunta existente',type:'ddwtos'}]};
    throw Error('Unexpected interaction: '+selector);
  }
};}
test('Existing attempts are reported and stop writes before any edit control',async()=>{
  const page=lockedPage();
  const inv=await inspectQuiz(page,{url,courseUrl});
  assert.equal(inv.structureLocked,true);assert.equal(inv.questions.length,1);
  await assert.rejects(createDescription(page,{id:'test',payload:{quizId:'39890'}},{courseUrl,authorize:async()=>assert.fail('write authorization must not be reached'),fillHtml:async()=>assert.fail('editor must not be reached')}),/ya tiene intentos/);
});
test('Planning refuses locked quizzes and never uses model quiz evidence for destination writes',()=>{
  const task={thread:'target',targetUrl:courseUrl,context:{text:''}};
  const op={type:'create_quiz_description',payload:{quizId:'39890',beforeSlot:'1',html:'<p>Información</p>'}};
  const read={tool:'read_course',view:'target',data:{sections:[{modules:[{url}]}],coverage:{complete:true}}};
  const quiz={tool:'inspect_quiz',view:'target',data:{quizId:'39890',questions:[{slot:'1',title:'Pregunta'}],structureLocked:true}};
  assert.throws(()=>validatePlan([op],task,[read,quiz]),/intentos/);
  assert.throws(()=>validatePlan([op],task,[read,{...quiz,view:'model'}]),/posición/);
});
