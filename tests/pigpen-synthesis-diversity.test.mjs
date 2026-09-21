import test from 'node:test';
import assert from 'node:assert/strict';
import {findRepeatedQuestionPlans} from '../public/js/escape-room-question-policy.mjs';
const knowledge='Sequential compliance requires executing step 1 before step 2 and step 3.';
const first={plan_id:'r3_p1',knowledge,application:'Identify the skipped step in route A.',answer_target:'Document check',case_data:['A keeps distance.','A moves directly to the scanner.'],reasoning_steps:['Compare route A with protocol.','Identify its missing middle action.']};
const transfer={plan_id:'r3_p3',knowledge,pedagogical_role:'transfer',application:'Which route meets the full protocol?',answer_target:'Route C',case_data:['B starts at the scanner.','C follows all three stages.'],reasoning_steps:['Compare each candidate route with all stages.','Choose the route with no omitted or reversed stages.']};
const synthesis={plan_id:'r3_p4',knowledge,pedagogical_role:'synthesis',application:'Combine both logs to find the failed checkpoint.',answer_target:'Gate D',case_data:['Log A records completion of stages one and two.','Log B records refusal at gate D before eye contact.'],reasoning_steps:['Read the completed actions in log A.','Locate the refusal in log B.','Combine logs to identify the unfulfilled stage at gate D.']};
test('Reported r3_p1/r3_p3/r3_p4 shared principle allows distinct assessments in all roles',()=>{
 assert.deepEqual(findRepeatedQuestionPlans([first,transfer,synthesis]),[]);
 for(const pedagogical_role of ['interpretation','diagnosis','transfer','synthesis']){
  assert.deepEqual(findRepeatedQuestionPlans([{...transfer,pedagogical_role}],[first]),[]);
 }
});
test('Same case, reasoning or non-generic answer remains rejected',()=>{
 for(const field of ['application','case_data','reasoning_steps','answer_target']){
  const issues=findRepeatedQuestionPlans([{...transfer,[field]:first[field]}],[first]);
  assert.ok(issues[0].conflicts[0].fields.includes(field));
 }
 assert.ok(findRepeatedQuestionPlans([{...transfer,case_data:[...first.case_data].reverse()}],[first]).length);
});
test('Changing labels, IDs, interaction or role cannot disguise duplication',()=>{
 assert.ok(findRepeatedQuestionPlans([{...first,plan_id:'different',knowledge_id:'new',interaction:'opcion_multiple',pedagogical_role:'synthesis'}],[first]).length);
 for(const missing of ['case_data','reasoning_steps','application','answer_target']){
  const incomplete={...transfer};delete incomplete[missing];
  assert.ok(findRepeatedQuestionPlans([incomplete],[first]).length);
 }
});
test('Boolean reuse is allowed for distinct cases and relationship solutions remain protected',()=>{
 assert.deepEqual(findRepeatedQuestionPlans([{...transfer,answer_target:'true'}],[{...first,answer_target:'true'}]),[]);
 assert.ok(findRepeatedQuestionPlans([{...transfer,answer_target:'B → 2 | A → 1'}],[{...first,answer_target:'A → 1 | B → 2'}]).length);
});
