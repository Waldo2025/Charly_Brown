import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { buildDifficultyInstruction, getDifficultyPolicy, getQuestionDifficulty } from "../public/js/escape-room-difficulty-policy.mjs";
import { materializeObjectiveBlueprintMechanics } from "../public/js/escape-room-mechanics.mjs";

const source = fs.readFileSync(new URL("../public/js/PigPenCreator.js", import.meta.url), "utf8");
const extract = (name, next) => source.slice(source.indexOf(`function ${name}(`), source.indexOf(`function ${next}(`));
const context = vm.createContext({
  structuredClone, normalizeString: (v, fallback = "") => String(v ?? fallback).trim(),
  normalizeTextList: (v) => Array.isArray(v) ? v.map(String) : [],
  materializeObjectivePlanCaseEvidence: (v) => v
});
vm.runInContext(extract("normalizeObjectiveQuestionPlan", "materializeObjectivePlanCaseEvidence"), context);
vm.runInContext(extract("mergeFilledQuestionPlanWithTemplate", "buildObjectiveRoomFillResponseSchema"), context);
vm.runInContext(extract("buildObjectiveRoomFillResponseSchema", "buildDeterministicRoomCompletionFeedback"), context);
const base = { nivel: "Secundaria", grado: "Segundo", materia: "Inglés", objetivo: "Interpret acronyms", trimestre: "B1" };
assert.equal(getDifficultyPolicy(base).level, "equilibrada");
for (const dificultad of ["guiada", "equilibrada", "desafiante"]) {
  const policy = getDifficultyPolicy({ ...base, dificultad });
  assert.equal(policy.level, dificultad);
  assert.equal(getQuestionDifficulty({ ...base, dificultad }, 3, 4).difficulty, dificultad);
  assert.ok(buildDifficultyInstruction({ ...base, dificultad }).includes(policy.demand));
}
assert.equal(getQuestionDifficulty({ dificultad: "guiada" }, 3, 4).pedagogical_role, "transfer");
assert.equal(getQuestionDifficulty(base, 3, 4).pedagogical_role, "synthesis");
assert.notEqual(getDifficultyPolicy({ ...base, nivel: "Primaria" }).gradeCalibration, getDifficultyPolicy(base).gradeCalibration);
assert.ok(buildDifficultyInstruction({ ...base, materia: "Matemáticas", grado: "Tercero" }).includes('"grado":"Tercero"'));
assert.match(buildDifficultyInstruction(base), /no CEFR/);
assert.match(buildDifficultyInstruction(base), /P visible/);
assert.match(buildDifficultyInstruction(base), /Save Our Seas/);

const filled = {
  reasoning_steps: ["Compare both sensor observations", "Apply the rule to eliminate the conflicting route"],
  distractor_errors: ["Choosing the route from only the first sensor ignores the second constraint"],
  mechanic_contract: { kind: "none" },
  difficulty_policy_version: 1
};
const template = { plan_id: "r1_p1", ...getQuestionDifficulty(base), integrates_knowledge_ids: ["k1", "k2"] };
const merged = context.mergeFilledQuestionPlanWithTemplate(filled, template);
const stored = JSON.parse(JSON.stringify({ rooms: [{ question_plans: [merged] }] }));
const restored = materializeObjectiveBlueprintMechanics(stored).rooms[0].question_plans[0];
assert.deepEqual(Array.from(context.normalizeObjectiveQuestionPlan(restored).reasoning_steps), filled.reasoning_steps);
assert.deepEqual(Array.from(context.normalizeObjectiveQuestionPlan(restored).distractor_errors), filled.distractor_errors);
assert.equal(context.normalizeObjectiveQuestionPlan(restored).difficulty_policy_version, 3);
assert.equal(context.normalizeObjectiveQuestionPlan({ plan_id: "old" }).difficulty_policy_version, 0);
const edited = { ...restored, reasoning_steps: ["Use the revised observation", "Apply both constraints"] };
assert.deepEqual(Array.from(context.normalizeObjectiveQuestionPlan(JSON.parse(JSON.stringify(edited))).reasoning_steps), edited.reasoning_steps);
const schema = context.buildObjectiveRoomFillResponseSchema({question_plans:[template]}).properties.r1_p1;
assert.ok(schema.required.includes("reasoning_steps"));
assert.ok(schema.required.includes("distractor_errors"));
const demanding = context.buildObjectiveRoomFillResponseSchema({question_plans:[
  {...template,plan_id:'regular',difficulty:'desafiante'},
  {...template,plan_id:'closing',difficulty:'desafiante',pedagogical_role:'synthesis'}
]}).properties;
assert.equal(demanding.regular.properties.reasoning_steps.minItems,2);
assert.equal(demanding.closing.properties.reasoning_steps.minItems,3);
assert.equal(demanding.closing.properties.reasoning_steps.items.minLength,1);
for (const [start, end] of [["buildObjectiveFoundationPrompt", "buildObjectiveFoundationResponseSchema"], ["buildObjectiveRoomFillPrompt", "mergeFilledQuestionPlanWithTemplate"]]) {
  assert.match(extract(start, end), /buildDifficultyInstruction\(context\)/);
}
assert.match(extract("buildUnifiedContentGenerationContract", "isGeminiUpstreamTimeout"), /buildDifficultyInstruction\(data\)/);
assert.match(extract("buildQuestionRegenerationPrompt", "pickMissionFromGeminiPayload"), /buildUnifiedContentGenerationContract/);
assert.match(source, /REASONING_STEPS: \$\{JSON.stringify/);
assert.match(source, /DISTRACTOR_ERRORS: \$\{JSON.stringify/);
console.log("Difficulty policy OK: three levels, academic context, prompt routes, schema, saved/edited plan and legacy compatibility.");
