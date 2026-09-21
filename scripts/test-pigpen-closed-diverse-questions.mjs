import assert from "node:assert/strict";
import { closeGeneratedAnswer, findRepeatedQuestionPlans, CLOSED_ANSWER_SUBTYPES } from "../public/js/escape-room-question-policy.mjs";
import { normalizeQuestion, validateQuestionAnswer } from "../public/js/escape-room-creator-model.mjs";

assert.ok(!CLOSED_ANSWER_SUBTYPES.includes("frase_libre"));
const closed = normalizeQuestion(closeGeneratedAnswer({
  tipo_interaccion: "texto", subtipo_respuesta: "frase_libre", respuesta_correcta: "Energy conservation", reto: "Name the law."
}, "texto", true));
assert.notEqual(closed.subtipo_respuesta, "frase_libre");
assert.equal(validateQuestionAnswer(closed, "anything"), false);
assert.equal(validateQuestionAnswer(closed, "Energy conservation"), true);
assert.throws(() => closeGeneratedAnswer({ respuesta_correcta: "" }, "texto", true), /respuesta cerrada/);
assert.doesNotThrow(() => closeGeneratedAnswer({ respuesta_correcta: "" }, "drag_drop", true));

const first = { plan_id: "r1p1", interaction: "texto", knowledge: "constellation identification", application: "Identify the hunter", answer_target: "ORION" };
assert.equal(findRepeatedQuestionPlans([{ ...first, plan_id: "r1p2", interaction: "opcion_multiple", application: "Select the hunter" }], [first]).length, 1);
assert.equal(findRepeatedQuestionPlans([{ plan_id: "p2", application: "Different statement", answer_target: "true" }], [{ plan_id: "p1", application: "First statement", answer_target: "true" }]).length, 0);
assert.equal(findRepeatedQuestionPlans([{ plan_id: "p2", application: "Stars as navigation references", knowledge: "navigation", answer_target: "POLARIS" }], [first]).length, 0);
assert.equal(findRepeatedQuestionPlans([{ plan_id: "p2", answer_target: "B → 2 | A → 1" }], [{ plan_id: "p1", answer_target: "A → 1 | B → 2" }]).length, 1);
console.log("Closed answers and distinct questions OK.");
const detailed = findRepeatedQuestionPlans([
  { plan_id: 'r2_p4', knowledge: 'Model comparison', application: 'New case', answer_target: 'ORION' }
], [
  { plan_id: 'r2_p2', knowledge: 'Model comparison', application: 'Other case', answer_target: 'SUN' },
  { plan_id: 'r2_p3', knowledge: 'Star identification', application: 'Hunter case', answer_target: 'ORION' }
]);
assert.equal(detailed.length, 1);
assert.deepEqual(detailed[0].conflicts.map(c => c.fields), [['knowledge'], ['answer_target']]);
assert.match(detailed[0].message, /solución «ORION» de r2_p3/);
assert.match(detailed[0].message, /concepto evaluado «Model comparison» de r2_p2/);
assert.equal(findRepeatedQuestionPlans([{ knowledge: 'Shared theme', application: 'New case', answer_target: 'X' }], [{ plan_id: 'prior', knowledge: 'Shared theme', application: 'Old case', answer_target: 'Y' }])[0].conflicts[0].fields[0], 'knowledge');
console.log('Specific collision diagnostics OK: all conflicting fields and plans are preserved.');
