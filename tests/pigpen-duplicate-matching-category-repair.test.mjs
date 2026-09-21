import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/js/PigPenCreator.js", import.meta.url), "utf8");

function duplicateDragDropIssues(plan = {}, slot = {}) {
  const items = (Array.isArray(plan.solution_pairs) ? plan.solution_pairs : [])
    .filter(pair => String(pair?.izquierda || "").trim() && String(pair?.derecha || "").trim());
  const left = items.map(pair => String(pair.izquierda).toLocaleLowerCase().trim());
  const right = items.map(pair => String(pair.derecha).toLocaleLowerCase().trim());
  const findDuplicates = (values = []) => {
    const seen = new Set();
    const dupes = new Set();
    values.forEach((value) => {
      if (!value) return;
      if (seen.has(value)) dupes.add(value);
      seen.add(value);
    });
    return [...dupes];
  };
  const leftDuplicates = findDuplicates(left);
  const rightDuplicates = findDuplicates(right);
  if (items.length !== 6 || leftDuplicates.length || rightDuplicates.length) {
    return [`${slot.plan_id}: cada destino y cada ficha deben ser completos y distintos. Destinos repetidos: ${JSON.stringify(leftDuplicates)}; respuestas repetidas: ${JSON.stringify(rightDuplicates)}. Conserva las relaciones válidas y sustituye las repetidas por relaciones curriculares específicas, no por copias numeradas.`];
  }
  return [];
}

function loadEnvironment() {
  const start = source.indexOf("async function requestFixedObjectiveRoomFill(");
  const end = source.indexOf("\nasync function ", start + 1);
  const repairContextStart = source.indexOf("function buildDragDropPairRepairContext(");
  const repairContextEnd = source.indexOf("\nfunction formatQuestionPlanSolutionPairs(", repairContextStart + 1);

  const factory = () => {
    const ctx = {
      buildObjectiveRoomFillResponseSchema: (tpl) => {
        const id = tpl.question_plans[0].plan_id;
        return { properties: { [id]: {} }, required: [id] };
      },
      validateFixedObjectiveFill: () => [],
      normalizeQuestionPlanSolutionPairs: () => [],
      normalizePairList: value => Array.isArray(value) ? value : [],
      normalizeString: (v, fb) => (typeof v === "string" ? v : fb || ""),
      normalizeSolutionPairToken: v => String(v || "").trim().toLowerCase(),
      answerDisclosureIssues: () => [],
      matchingPromptIssues: () => [],
      repairAnswerEntryInstruction: value => value,
      objectivePlanContractIssues: duplicateDragDropIssues,
      experience: { get: () => null },
      normalizeObjectiveQuestionPlan: value => value,
      formatQuestionPlanSolutionPairs: pairs => pairs.map(p => `${p.izquierda} → ${p.derecha}`).join(" | "),
      buildFixedObjectiveFillShape: () => ({}),
      setStatus: () => {}
    };
    const vmContext = vm.createContext(ctx);
    vm.runInContext(source.slice(repairContextStart, repairContextEnd), vmContext);
    vm.runInContext(source.slice(start, end), vmContext);
    return ctx;
  };
  return { factory };
}

test("repara categorias repetidas en solution_pairs y actualiza answer_target", async () => {
  const { factory } = loadEnvironment();
  const ctx = factory();
  let repairPromptReceived = "";

  const initialWithDuplicateCategories = {
    r3_p1: {
      knowledge: "Poderes y roles en Roma antigua",
      case_data: ["El pontífice vela por el culto.", "El cónsul lidera las asambleas civiles."],
      application: "Relaciona cada función con su autoridad.",
      instruction_outline: "Ubica la ficha con su destino.",
      hint_strategy: "Observa la naturaleza de cada potestad.",
      answer_target: "religious power → Pontifex Maximus | religious power → Vestal Virgin | civic power → Consul | civic power → Tribune | family status → Paterfamilias | family status → Matrona",
      reasoning_steps: ["Identifica la esfera de poder", "Determina el cargo"],
      evidence: "Historia romana",
      reasoning_evidence: "Datos del caso permiten asociar",
      cognitive_operation: "clasificación",
      transfer_delta: "Estructuras de poder en la república",
      feedback_strategy: "Diferencia las potestades",
      distractor_errors: [],
      mechanic_contract: { kind: "none", solution: "", ciphertext: "", computed_value: "", claimed_value: "", expected_boolean: false, scrambled: "", shift: 0, alphabet: "", ordering_rule: "", items: [] },
      solution_pairs: [
        { izquierda: "religious power", derecha: "Pontifex Maximus" },
        { izquierda: "religious power", derecha: "Vestal Virgin" },
        { izquierda: "civic power", derecha: "Consul" },
        { izquierda: "civic power", derecha: "Tribune" },
        { izquierda: "family status", derecha: "Paterfamilias" },
        { izquierda: "family status", derecha: "Matrona" }
      ]
    }
  };

  ctx.requestQualityJson = async (prompt, _context, _temperature, options) => {
    if (options?.responseJsonSchema?.properties?.r3_p1?.properties?.solution_pairs) {
      repairPromptReceived = prompt;
      return {
        r3_p1: {
          solution_pairs: [
            { izquierda: "Supreme priestly power", derecha: "Pontifex Maximus" },
            { izquierda: "Sacred flame guardianship", derecha: "Vestal Virgin" },
            { izquierda: "Supreme magistrate authority", derecha: "Consul" },
            { izquierda: "Plebeian defense power", derecha: "Tribune" },
            { izquierda: "Paternal head status", derecha: "Paterfamilias" },
            { izquierda: "Maternal domestic status", derecha: "Matrona" }
          ]
        }
      };
    }
    return initialWithDuplicateCategories;
  };

  const result = await ctx.requestFixedObjectiveRoomFill(
    "Base prompt",
    {},
    { question_plans: [{ plan_id: "r3_p1", interaction: "drag_drop", difficulty_policy_version: 1 }] },
    initialWithDuplicateCategories
  );

  assert.ok(repairPromptReceived.includes("Conflicto de categorías repetidas"));
  assert.ok(repairPromptReceived.includes("religious power"));
  assert.equal(result.r3_p1.solution_pairs.length, 6);
  assert.equal(result.r3_p1.answer_target, "Supreme priestly power → Pontifex Maximus | Sacred flame guardianship → Vestal Virgin | Supreme magistrate authority → Consul | Plebeian defense power → Tribune | Paternal head status → Paterfamilias | Maternal domestic status → Matrona");
});

test("si suppliedResponse falla y reparacion no converge en intento 0, pasa a recuperacion parcial en intento 1 sin abortar de inmediato", async () => {
  const { factory } = loadEnvironment();
  const ctx = factory();
  let calls = 0;
  let partialRecoveryCalled = false;

  const failingPlan = {
    r3_p1: {
      knowledge: "Prueba",
      case_data: ["Dato"],
      application: "App",
      instruction_outline: "Outline",
      hint_strategy: "Hint",
      answer_target: "bad target",
      reasoning_steps: ["Paso 1"],
      evidence: "Ev",
      reasoning_evidence: "RE",
      cognitive_operation: "Op",
      transfer_delta: "Delta",
      feedback_strategy: "FB",
      distractor_errors: [],
      mechanic_contract: { kind: "none", solution: "", ciphertext: "", computed_value: "", claimed_value: "", expected_boolean: false, scrambled: "", shift: 0, alphabet: "", ordering_rule: "", items: [] },
      solution_pairs: [
        { izquierda: "a", derecha: "1" },
        { izquierda: "a", derecha: "2" }
      ]
    }
  };

  ctx.requestQualityJson = async (prompt, _context, _temperature, options) => {
    calls += 1;
    if (options?.responseJsonSchema?.properties?.r3_p1?.properties?.solution_pairs) {
      return { r3_p1: { solution_pairs: [{ izquierda: "a", derecha: "1" }] } };
    }
    if (prompt.includes("RECUPERACIÓN PARCIAL")) {
      partialRecoveryCalled = true;
      return {
        r3_p1: {
          ...failingPlan.r3_p1,
          solution_pairs: [
            { izquierda: "d1", derecha: "f1" },
            { izquierda: "d2", derecha: "f2" },
            { izquierda: "d3", derecha: "f3" },
            { izquierda: "d4", derecha: "f4" },
            { izquierda: "d5", derecha: "f5" },
            { izquierda: "d6", derecha: "f6" }
          ]
        }
      };
    }
    return failingPlan;
  };

  const result = await ctx.requestFixedObjectiveRoomFill(
    "Base prompt",
    {},
    { question_plans: [{ plan_id: "r3_p1", interaction: "drag_drop", difficulty_policy_version: 1 }] },
    failingPlan
  );

  assert.ok(partialRecoveryCalled, "Debe llamar a recuperación parcial en vez de abortar con throw en intento 0");
  assert.equal(result.r3_p1.solution_pairs.length, 6);
});
