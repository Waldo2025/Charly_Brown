import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { collectDeterministicObjectiveSourceRepairs } from "../public/js/escape-room-objective-source.mjs";
import { normalizeQuestion, stripPrivateGenerationFields } from "../public/js/escape-room-creator-model.mjs";
import {
  canonicalizeObjectiveNarrativeContinuity,
  inferRequiredObjectiveMechanic,
  materializeObjectiveBlueprintMechanics,
  objectiveAnswerTargetsEquivalent,
  objectiveHintLikelyRevealsBooleanAnswer,
  objectiveHintRevealsPlanAnswer,
  objectivePlanClaimsFragmentDelivery,
  objectivePlanCaseDataIsMaterialized,
  objectivePlanRequestsPrematureUnlock,
  objectiveSynthesisLacksConcreteCase,
  objectiveSynthesisUsesNarrativeStatusAnswer,
  objectivePlanTargetText,
  objectiveTeachingExamplesRevealPlan,
  objectiveTextDisclosesFinalCode,
  objectiveTextDisclosesRoomFragment,
  redactObjectiveFinalCodeDisclosure,
  reconcileObjectiveMechanicContract,
  shiftCipherText,
  validateGeneratedRoomContent
} from "../public/js/escape-room-mechanics.mjs";

const source = await readFile(new URL("../public/js/PigPenCreator.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/PigPenCreator.html", import.meta.url), "utf8");
assert.match(source, /escape-room-mechanics\.mjs\?v=20260909-objective-contract-v26/);

const legacyRecoveryStart = source.indexOf("function isFormattedPigPenObjectivePlan(");
const legacyRecoveryEnd = source.indexOf("\nfunction buildObjectiveSourceContract(", legacyRecoveryStart);
assert.ok(legacyRecoveryStart >= 0 && legacyRecoveryEnd > legacyRecoveryStart, "La migración de planes antiguos debe conservar un objetivo fuente limpio.");
const createLegacyRecoveryHarness = new Function(
  "normalizeString",
  `${source.slice(legacyRecoveryStart, legacyRecoveryEnd)}\nreturn recoverLegacyObjectiveSeed;`
);
const recoverLegacySeed = createLegacyRecoveryHarness((value, fallback = "") => String(value ?? fallback).trim());
const recoveredLegacySeed = recoverLegacySeed(`[PIGPEN_PLAN_V19]
TITLE: The Lost Constellation Console
LEARNING PURPOSE: Interpret astronomical vocabulary.
ROOM 1
TITLE: Orbital Model Control
LEARNING_FOCUS: Compare orbital models.
FIXED_REQUIREMENTS: Preserve the drag and drop activity.
MANDATORY_ANCHORS: GEOCENTRIC | HELIOCENTRISM
SOURCE_REPAIR 1: A generated and obsolete diagnosis.
QUESTION 1
ANSWER_TARGET: Earth
NARRATIVE_EFFECT: Console emits fragment S.
FIXED_CODE_FRAGMENT: S
ROOM_COMPLETION_FEEDBACK: Take S.
FINAL UNLOCK
FINAL_CODE: STAR
FINAL_FEEDBACK: Code accepted.`);
assert.match(recoveredLegacySeed, /TITLE: The Lost Constellation Console/);
assert.match(recoveredLegacySeed, /MANDATORY_ANCHORS: GEOCENTRIC \| HELIOCENTRISM/);
assert.match(recoveredLegacySeed, /FIXED_CODE_FRAGMENT: S/);
assert.match(recoveredLegacySeed, /ROOM_COMPLETION_FEEDBACK: Take S\./);
assert.match(recoveredLegacySeed, /FINAL_CODE: STAR/);
assert.doesNotMatch(recoveredLegacySeed, /SOURCE_REPAIR|QUESTION 1|ANSWER_TARGET|NARRATIVE_EFFECT/);

const recoveredSpanishLegacySeed = recoverLegacySeed(`[PIGPEN_PLAN_V20]
TÍTULO: Consola perdida
PROPÓSITO PEDAGÓGICO: Interpretar vocabulario científico.
META DE LA EXPERIENCIA: Resolver cuatro salas.
SALA 1
TITLE: Control orbital
LEARNING_OBJECTIVE: Clasificar modelos.
PREGUNTA 1
ANSWER_TARGET: Tierra
FIXED_CODE_FRAGMENT: C
ROOM_COMPLETION_FEEDBACK: Toma C.
DESBLOQUEO FINAL
FINAL_CODE: COSMOS
FINAL_FEEDBACK: Acceso concedido.`);
assert.match(recoveredSpanishLegacySeed, /TÍTULO: Consola perdida/);
assert.match(recoveredSpanishLegacySeed, /PROPÓSITO PEDAGÓGICO: Interpretar vocabulario científico/);
assert.match(recoveredSpanishLegacySeed, /SALA 1/);
assert.match(recoveredSpanishLegacySeed, /FIXED_CODE_FRAGMENT: C/);
assert.match(recoveredSpanishLegacySeed, /FINAL_CODE: COSMOS/);
assert.doesNotMatch(recoveredSpanishLegacySeed, /PREGUNTA 1|ANSWER_TARGET/);

const normalizerStart = source.indexOf("function normalizeObjectiveQuestionPlan(");
const normalizerEnd = source.indexOf("\nfunction normalizeObjectiveBrief(", normalizerStart);
const mergeStart = source.indexOf("function mergeFilledQuestionPlanWithTemplate(");
const mergeEnd = source.indexOf("\nfunction buildObjectiveRoomFillResponseSchema(", mergeStart);
assert.ok(normalizerStart >= 0 && normalizerEnd > normalizerStart, "El normalizador de question_plan debe existir en alcance de módulo.");
assert.ok(mergeStart >= 0 && mergeEnd > mergeStart, "La fusión progresiva de la plantilla debe existir.");
assert.doesNotMatch(source, /\bnormalizeQuestionPlan\b/, "Ninguna ruta debe conservar una referencia al antiguo normalizador local.");
const createTemplateMergeHarness = new Function(
  "normalizeString",
  "normalizeTextList",
  "normalizeBaseText",
  `${source.slice(normalizerStart, normalizerEnd)}\n${source.slice(mergeStart, mergeEnd)}\nreturn mergeFilledQuestionPlanWithTemplate;`
);
const mergeTemplatePlan = createTemplateMergeHarness(
  (value, fallback = "") => String(value ?? fallback).trim(),
  (values) => (Array.isArray(values) ? values : []).map((value) => String(value).trim()).filter(Boolean),
  (value) => String(value ?? "").toLocaleLowerCase().replace(/\s+/g, " ").trim()
);
const mergedTemplatePlan = mergeTemplatePlan(
  { plan_id: "gemini-changed-id", knowledge: "Filled knowledge", answer_target: "Filled answer", interaction: "texto" },
  {
    plan_id: "r1_p1",
    knowledge_id: "r1_k1",
    assessment_case_id: "r1_case_1",
    case_source: "new_case_in_prompt",
    pedagogical_role: "transfer",
    difficulty: "guided",
    interaction: "drag_drop",
    integrates_knowledge_ids: ["r1_k1"],
    support_source: "prompt",
    requires_image: false,
    estimated_seconds: 60
  }
);
assert.equal(mergedTemplatePlan.plan_id, "r1_p1", "La ruta real de fusión debe conservar el plan_id de la plantilla.");
assert.equal(mergedTemplatePlan.interaction, "drag_drop", "Gemini no debe reemplazar la interacción fijada por la plantilla.");
assert.equal(mergedTemplatePlan.knowledge, "Filled knowledge", "La fusión debe conservar el contenido editable generado.");

const constellationObjective = `
Título del tema: "The Lost Constellation Console"
Sala 2:
• Student instructions (B1): Unscramble N-O-R-I to name the constellation.
• Respuesta correcta: ORION.
• Fragmento de código: T.
Sala 4:
• Ejemplo: DOU -3 → ABR.
• Respuesta correcta: MILKY WAY.
Salida final: unir los cuatro fragmentos y escribir STAR.
`;

const repairs = collectDeterministicObjectiveSourceRepairs(constellationObjective, 4);
assert.ok(
  repairs.some((repair) => repair.room_index === 1 && repair.code === "anagram_letter_mismatch"),
  "El compilador debe detectar que N-O-R-I no puede producir ORION."
);
assert.ok(
  collectDeterministicObjectiveSourceRepairs("Room 1: Example URAGI → AURIGA.", 1)
    .some((repair) => repair.code === "anagram_example_mismatch"),
  "Los ejemplos editoriales también deben conservar exactamente las letras."
);
assert.deepEqual(
  collectDeterministicObjectiveSourceRepairs("Room 1: Correct answer: GEOCENTRIC → EARTH-CENTERED; HELIOCENTRISM → SUN-CENTERED.", 1),
  [],
  "Una relación de clasificación no debe diagnosticarse como anagrama."
);

assert.deepEqual(
  collectDeterministicObjectiveSourceRepairs("Room 1: Unscramble N-O-I-R-O. Correct answer: ORION.", 1),
  [],
  "Un anagrama que conserva exactamente las letras no debe repararse."
);
assert.deepEqual(
  collectDeterministicObjectiveSourceRepairs("Room 1: Unscramble N-O-O-I-R. Correct answer: ORION.", 1),
  [],
  "NOOIR debe conservarse como un anagrama válido de ORION."
);
assert.equal(shiftCipherText("MILKY WAY", 1), "NJMLZ XBZ", "El cifrado fijo de MILKY WAY debe materializarse exactamente.");

for (const shift of [-25, -7, -1, 1, 4, 19, 25]) {
  const ciphertext = shiftCipherText("MILKY WAY 2040", shift);
  assert.equal(shiftCipherText(ciphertext, -shift), "MILKY WAY 2040", `El cifrado debe ser reversible con shift ${shift}.`);
}

const materialized = materializeObjectiveBlueprintMechanics({
  rooms: [{
    fixed_code_fragment: "X",
    room_completion_feedback: "Take X.",
    narrative_beat: {},
    question_plans: [{ plan_id: "generic-anagram", mechanic_contract: { kind: "anagram", solution: "PLANET" } }],
    reserve_opportunity: { plan_id: "reserve", mechanic_contract: { kind: "none" } }
  }]
});
const anagram = materialized.rooms[0].question_plans[0].mechanic_contract;
assert.notEqual(anagram.scrambled, anagram.solution);
assert.equal([...anagram.scrambled].sort().join(""), [...anagram.solution].sort().join(""));

const continuous = canonicalizeObjectiveNarrativeContinuity({
  rooms: [
    { narrative_beat: { incoming_state: "Inicio", next_state: "The first lock is open." } },
    { narrative_beat: { incoming_state: "The first lock has opened.", next_state: "The map starts glowing." } },
    { narrative_beat: { incoming_state: "A glowing map appears.", next_state: "The exit is visible." } },
    { narrative_beat: { incoming_state: "Students can see the exit.", next_state: "Mission complete." } }
  ]
});
assert.equal(continuous.rooms[1].narrative_beat.incoming_state, "The first lock is open.");
assert.equal(continuous.rooms[2].narrative_beat.incoming_state, "The map starts glowing.");
assert.equal(continuous.rooms[3].narrative_beat.incoming_state, "The exit is visible.");
assert.ok(
  repairs.some((repair) => repair.room_index === 3 && repair.code === "cipher_example_mismatch" && repair.issue.includes("ALR")),
  "El compilador debe calcular DOU -3 como ALR y rechazar ABR."
);

const cipherInterpretationPlan = {
  evidence: "A shift of 1 step forward transforms M to N, I to J, and L to M.",
  cognitive_operation: "Interpretation",
  application: "Analyzing a sample shift transformation.",
  instruction_outline: "Verify how shifting one step back reverses a one-step forward cipher.",
  hint_strategy: "If N moves back one step, it becomes M.",
  mechanic_contract: { kind: "none" }
};
assert.equal(
  inferRequiredObjectiveMechanic(cipherInterpretationPlan),
  "none",
  "Una explicación de la regla de desplazamiento sin producir letras nuevas debe seguir siendo conceptual."
);
const repairedIncompleteCipher = materializeObjectiveBlueprintMechanics({
  rooms: [{
    question_plans: [{
      plan_id: "cipher-with-derived-fields",
      answer_target: "MILKY WAY",
      application: "Move every letter one step back to decode the message.",
      mechanic_contract: { kind: "cipher", solution: "", shift: 0 }
    }]
  }]
}).rooms[0].question_plans[0].mechanic_contract;
assert.equal(repairedIncompleteCipher.solution, "MILKY WAY");
assert.equal(repairedIncompleteCipher.shift, 1);
assert.equal(repairedIncompleteCipher.ciphertext, "NJMLZ XBZ");
const reconciledMismatchedMechanic = materializeObjectiveBlueprintMechanics({
  rooms: [{
    question_plans: [{
      plan_id: "mixed-repair-anagram",
      answer_target: "ORION",
      application: "Unscramble the letters to identify the constellation name.",
      instruction_outline: "Solve the anagram by rearranging the letters.",
      mechanic_contract: { kind: "cipher", solution: "ORION", shift: 0 }
    }]
  }]
}).rooms[0].question_plans[0].mechanic_contract;
assert.equal(reconciledMismatchedMechanic.kind, "anagram");
assert.equal(reconciledMismatchedMechanic.solution, "ORION");
assert.notEqual(reconciledMismatchedMechanic.scrambled, "ORION");
const materializedSequence = materializeObjectiveBlueprintMechanics({
  rooms: [{
    question_plans: [{
      plan_id: "sequence-derived-locally",
      interaction: "ordenar_secuencia",
      answer_target: "Observe → Compare → Conclude",
      instruction_outline: "Order the reasoning steps.",
      reasoning_evidence: "Each step prepares the next one.",
      mechanic_contract: { kind: "none" }
    }]
  }]
}).rooms[0].question_plans[0].mechanic_contract;
assert.equal(materializedSequence.kind, "sequence");
assert.deepEqual(materializedSequence.ordered_items, ["Observe", "Compare", "Conclude"]);
assert.equal(
  inferRequiredObjectiveMechanic({
    interaction: "ordenar_secuencia",
    application: "Rearrange the names into the correct procedural order."
  }),
  "sequence",
  "La interacción de ordenamiento debe prevalecer sobre inferencias léxicas de anagrama."
);
assert.equal(
  inferRequiredObjectiveMechanic({
    knowledge: "Partial cipher diagnosis",
    application: "Checking the first word of the decrypted target message.",
    instruction_outline: "Identify the first word produced when shifting the ciphertext back by one step."
  }),
  "cipher",
  "La pregunta 3 real de la sala 4 debe reconocerse como cálculo parcial de cifrado."
);
assert.equal(
  inferRequiredObjectiveMechanic({
    knowledge: "Caesar cipher vocabulary",
    instruction_outline: "Explain why a cipher uses a consistent rule without transforming any letters."
  }),
  "none",
  "Una explicación conceptual que no opera letras no debe exigir un contrato calculable."
);
assert.equal(
  inferRequiredObjectiveMechanic({
    knowledge: "Caesar cipher terminology",
    application: "Select the first navigation statement that explains the route."
  }),
  "none",
  "El validador no debe combinar palabras de campos distintos para inventar una operación de cifrado."
);
assert.ok(
  objectiveAnswerTargetsEquivalent(
    objectivePlanTargetText({ answer_target: "MILKY WAY" }),
    "MILKY WAY"
  ),
  "El compilador debe detectar que una pregunta previa reutiliza la solución reservada MILKY WAY."
);
assert.ok(
  !objectiveAnswerTargetsEquivalent(
    objectivePlanTargetText({
      answer_target: "O",
      feedback_strategy: "Confirm O is required to complete ORION."
    }),
    "ORION"
  ),
  "Mencionar ORION al explicar una respuesta O no debe confundirse con reutilizar ORION como respuesta."
);
assert.equal(
  objectivePlanRequestsPrematureUnlock({
    instruction_outline: "Assemble the four room security fragments into the complete master override sequence."
  }),
  true,
  "Una pregunta no puede ejecutar el desbloqueo antes de que la última sala entregue su fragmento."
);
assert.equal(objectiveTextDisclosesFinalCode("The master override code is STAR.", "STAR"), true);
assert.equal(objectiveTextDisclosesFinalCode("All fragments S-T-A-R form the final key.", "STAR"), true);
assert.equal(objectiveTextDisclosesFinalCode("A star produces its own light.", "STAR"), false);
assert.equal(
  objectiveTextDisclosesFinalCode("Use STAR observations to recover the final code later.", "STAR"),
  false,
  "Una palabra académica no debe convertirse en revelación sólo por aparecer cerca de la meta narrativa."
);
assert.equal(
  objectiveTextDisclosesFinalCode("Enter STAR to unlock the console.", "STAR"),
  true,
  "Una instrucción inequívoca para introducir el valor sí debe bloquearse."
);
const redactedEscalation = redactObjectiveFinalCodeDisclosure(
  "Each room raises the stakes. All fragments S-T-A-R form the final key.",
  "STAR",
  "the concealed access value"
);
assert.match(redactedEscalation, /Each room raises the stakes\./);
assert.doesNotMatch(redactedEscalation, /S-T-A-R/);
assert.equal(objectiveTextDisclosesFinalCode(redactedEscalation, "STAR"), false);
assert.equal(objectiveTextDisclosesRoomFragment("Correct. Take S.", "S"), true);
assert.equal(objectiveTextDisclosesRoomFragment("A star produces light.", "S"), false);
assert.equal(objectivePlanClaimsFragmentDelivery({ narrative_effect: "Final fragment R unlocked." }), true);
assert.equal(objectivePlanClaimsFragmentDelivery({ narrative_effect: "The telescope rotates toward the nebula." }), false);
assert.equal(objectivePlanClaimsFragmentDelivery({
  narrative_effect: "The console unlocks the next observation deck.",
  feedback_strategy: "Do not display a room fragment inside question feedback."
}), false, "Palabras situadas en campos independientes no deben formar una entrega de fragmento inexistente.");
const reconciledAnagram = reconcileObjectiveMechanicContract({
  answer_target: "ORION",
  application: "Unscramble the letters to identify the constellation name.",
  instruction_outline: "Rearrange the scrambled letters to form the name.",
  mechanic_contract: { kind: "none" }
});
assert.deepEqual(
  reconciledAnagram,
  { kind: "anagram", solution: "ORION" },
  "PigPen debe completar determinísticamente un contrato de anagrama omitido cuando la solución ya es inequívoca."
);
const materializedMissingAnagram = materializeObjectiveBlueprintMechanics({
  rooms: [{
    narrative_beat: {},
    question_plans: [{
      plan_id: "r2_p4",
      answer_target: "ORION",
      application: "Unscramble the letters to identify the constellation name.",
      instruction_outline: "Rearrange the scrambled letters to form the name.",
      mechanic_contract: { kind: "none" }
    }]
  }]
});
assert.equal(materializedMissingAnagram.rooms[0].question_plans[0].mechanic_contract.kind, "anagram");
assert.equal(materializedMissingAnagram.rooms[0].question_plans[0].mechanic_contract.solution, "ORION");
assert.notEqual(materializedMissingAnagram.rooms[0].question_plans[0].mechanic_contract.scrambled, "ORION");
assert.equal(objectiveHintLikelyRevealsBooleanAnswer({
  interaction: "verdadero_falso",
  answer_target: "False",
  hint_strategy: "Gemini represents twins; the ladle belongs to the Big Dipper."
}), true);
assert.equal(objectiveHintLikelyRevealsBooleanAnswer({
  interaction: "verdadero_falso",
  answer_target: "False",
  hint_strategy: "Compare the log with both definitions in the briefing."
}), false);
assert.equal(objectiveHintRevealsPlanAnswer({
  answer_target: "GEOCENTRIC->EARTH;HELIOCENTRIC->SUN",
  hint_strategy: "Match GEOCENTRIC with EARTH and HELIOCENTRIC with SUN."
}), true);
assert.equal(objectiveHintRevealsPlanAnswer({
  answer_target: "GEOCENTRIC->EARTH;HELIOCENTRIC->SUN",
  hint_strategy: "Identify the central body first, then compare the roots."
}), false);
assert.equal(objectiveSynthesisLacksConcreteCase({
  pedagogical_role: "synthesis",
  case_source: "new_case_in_prompt",
  application: "Select the correct master configuration."
}), true);
assert.equal(objectiveSynthesisLacksConcreteCase({
  pedagogical_role: "synthesis",
  case_source: "new_case_in_prompt",
  case_data: ["Object A: orbits Earth", "Object B: orbits the Sun"],
  application: "A new probe log reports Object A: orbits Earth and Object B: orbits the Sun. Classify both readings and select the corrected route."
}), false);
assert.equal(objectivePlanCaseDataIsMaterialized({
  case_data: ["Signal A: stable", "Signal B: drifting"],
  application: "Signal A: stable, while Signal B: drifting. Diagnose the route."
}, 2), true);
assert.equal(objectivePlanCaseDataIsMaterialized({
  case_data: ["Signal A: stable", "Signal B: drifting"],
  application: "Signal A: stable. Diagnose the route."
}, 2), false);
assert.equal(objectivePlanCaseDataIsMaterialized({
  case_data: ["Sensor Grid Alpha", "Sensor Grid Beta"],
  application: "Compare Sensor Grid Alpha and Sensor Grid Beta."
}, 2), false, "Los nombres de fuentes sin observaciones no cuentan como datos concretos.");
assert.equal(objectiveSynthesisUsesNarrativeStatusAnswer({
  pedagogical_role: "synthesis",
  answer_family: "core_authorization",
  answer_target: "Galactic core authorization complete"
}), true);
assert.equal(objectiveSynthesisUsesNarrativeStatusAnswer({
  pedagogical_role: "synthesis",
  answer_family: "galaxy_classification",
  answer_target: "Barred spiral galaxy"
}), false);
assert.equal(
  objectivePlanRequestsPrematureUnlock({
    answer_target: "STAR",
    instruction_outline: "Identify the astronomical object that produces its own light."
  }),
  false,
  "Usar una palabra que coincide con la clave como respuesta académica no debe bloquearse."
);
assert.equal(
  objectiveTeachingExamplesRevealPlan(
    ["POLARIS = North Star", "GEMINI = twins", "BIG DIPPER = large ladle"],
    {
      interaction: "relacion_columnas",
      answer_target: "POLARIS=>North Star|GEMINI=>twins|BIG DIPPER=>large ladle",
      mechanic_contract: { kind: "none" }
    }
  ),
  true,
  "Los ejemplos no deben resolver exactamente el emparejamiento evaluado."
);
assert.equal(
  objectiveTeachingExamplesRevealPlan(
    ["CASSIOPEIA = queen", "SCORPIUS = scorpion"],
    {
      interaction: "relacion_columnas",
      answer_target: "POLARIS=>North Star|GEMINI=>twins|BIG DIPPER=>large ladle",
      mechanic_contract: { kind: "none" }
    }
  ),
  false,
  "Los ejemplos análogos con otros casos deben permitirse."
);
const academicFragmentMention = validateGeneratedRoomContent({
  titulo: "STAR Formation",
  historia: "A star forms inside a cloud of gas.",
  contexto: "A star produces light through nuclear fusion.",
  datos_clave: ["A star is an astronomical object."],
  reto: "The stellar nursery becomes visible.",
  retroalimentacion_correcta: "Take STAR.",
  preguntas: []
}, {
  fixed_code_fragment: "STAR",
  room_completion_feedback: "Take STAR.",
  question_plans: []
}, { roomIndex: 0, finalCode: "STARX" });
assert.ok(
  !academicFragmentMention.issues.some((issue) => issue.code === "room_fragment_leak"),
  "Una palabra académica igual al fragmento no debe tratarse como filtración."
);
const explicitFragmentDisclosure = validateGeneratedRoomContent({
  titulo: "Formation",
  historia: "The code fragment is STAR.",
  contexto: "Fusion powers stars.",
  datos_clave: ["Stars produce light."],
  reto: "The stellar nursery becomes visible.",
  retroalimentacion_correcta: "Take STAR.",
  preguntas: []
}, {
  fixed_code_fragment: "STAR",
  room_completion_feedback: "Take STAR.",
  question_plans: []
}, { roomIndex: 0, finalCode: "STARX" });
assert.ok(
  explicitFragmentDisclosure.issues.some((issue) => issue.code === "room_fragment_leak"),
  "Identificar explícitamente una palabra como fragmento antes del cierre sí debe rechazarse."
);

const tracedQuestion = normalizeQuestion({
  reto: "Apply the rule to a new orbit map.",
  respuesta_correcta: "heliocentric",
  _assessment_case_id: "orbit-map-new-01",
  _case_source: "new_case_in_prompt",
  _case_data: ["probe A circles Earth", "probe B circles the Sun"],
  _transfer_delta: "The positions differ from the taught example.",
  _reasoning_evidence: "Classify the center from the new positions.",
  _integrates_knowledge_ids: ["earth-center", "sun-center"]
}, 0, 0, "en-US");
assert.equal(tracedQuestion._assessment_case_id, "orbit-map-new-01");
assert.deepEqual(tracedQuestion._case_data, ["probe A circles Earth", "probe B circles the Sun"]);
assert.deepEqual(tracedQuestion._integrates_knowledge_ids, ["earth-center", "sun-center"]);
const strippedTrace = stripPrivateGenerationFields({ misiones: [{ preguntas: [tracedQuestion] }] });
assert.equal(Object.hasOwn(strippedTrace.misiones[0].preguntas[0], "_assessment_case_id"), false);
assert.equal(Object.hasOwn(strippedTrace.misiones[0].preguntas[0], "_case_data"), false);
assert.equal(Object.hasOwn(strippedTrace.misiones[0].preguntas[0], "_reasoning_evidence"), false);

assert.match(source, /const CONTENT_GENERATION_CONTRACT_VERSION = 37;/);
assert.match(
  source,
  /else if \(formState\.__objectiveBlueprint\?\.source_contract\?\.original_objective_hash\)[\s\S]*source_contract: structuredClone/,
  "La migración debe conservar el contrato fuente aunque invalide el blueprint antiguo."
);
assert.match(source, /getQuestionDifficulty\(context, questionIndex, questionCount\)\.pedagogical_role/);
for (const field of ["source_contract", "plan_fingerprint", "verified_mechanics", "verified_examples", "quality_report"]) {
  assert.match(source, new RegExp(`${field}:`), `El blueprint debe persistir ${field}.`);
}
assert.match(source, /function formatObjectiveBrief[\s\S]*QUESTION \$\{questionIndex \+ 1\}[\s\S]*ANSWER_SIGNATURE:[\s\S]*VERIFIED_MECHANIC:[\s\S]*FINAL_CODE:/);
assert.match(source, /function buildInteractionPlanFromObjectiveBlueprint[\s\S]*questionPlans\.map[\s\S]*ESCAPE_ROOM_INTERACTION_CATALOG/);
assert.match(
  source,
  /isObjectiveBlueprintCurrent\(formData\)[\s\S]*\? state\.objectiveBlueprint[\s\S]*: await ensureObjectiveBlueprint\(formData\)/,
  "Generar debe usar el plan vigente directamente o sincronizarlo automáticamente sin bloquear el botón."
);
assert.match(source, /constraintText = normalizedEditedPlan \|\| originalObjective/);
assert.doesNotMatch(source, /function buildObjectiveEnrichmentPrompt|function buildObjectiveCompilerContract|function buildObjectiveBriefOutputShape/);
const directObjectiveFlow = source.slice(
  source.indexOf("async function generateEnrichedObjectiveBrief("),
  source.indexOf("function activateObjectiveBrief(")
);
assert.match(directObjectiveFlow, /await compileObjectiveBlueprintFromTemplate/);
assert.doesNotMatch(directObjectiveFlow, /validateObjectiveBrief|auditObjectiveBlueprintForPublication|repairObjective|maximumRepairRounds|for \(let attempt/);
assert.doesNotMatch(source, /function validateObjectiveBrief|function auditObjectiveBlueprintForPublication|function repairObjectiveQuestionPlansSurgically/);
assert.match(
  source,
  /function materializeObjectivePlanCaseEvidence[\s\S]*Case evidence:[\s\S]*mergeFilledQuestionPlanWithTemplate/,
  "PigPen debe materializar localmente los datos del caso en la aplicación antes de validar."
);
assert.match(source, /case_data: \{ type: "array", minItems: 2, maxItems: 4/);
assert.doesNotMatch(
  source.slice(source.indexOf("function buildObjectiveRoomFillPrompt("), source.indexOf("function mergeFilledQuestionPlanWithTemplate(")),
  /<USER_OBJECTIVE>/,
  "El prompt de preguntas no debe recibir el objetivo crudo con fragmentos y claves privadas."
);
assert.match(source, /const roomCurriculum = \{[\s\S]*fixed_requirements: normalizeTextList\(room\.fixed_requirements \|\| \[\]\)/);
assert.doesNotMatch(source, /sanitizeObjectiveRoomCurriculumSecrets|safeRoomCurriculum/);
assert.doesNotMatch(source, /templateRetryInstruction|function applyObjectiveInteractionRequirements/);
assert.match(
  source,
  /function buildDeterministicQuestionPlanTemplate[\s\S]*plan_id: `r\$\{roomIndex \+ 1\}_p\$\{questionIndex \+ 1\}`[\s\S]*function compileObjectiveBlueprintFromTemplate/,
  "PigPen debe construir la plantilla estructural antes de pedir contenido a Gemini."
);
assert.match(
  source,
  /for \(let roomIndex = 0; roomIndex < roomCount; roomIndex \+= 1\)[\s\S]*buildObjectiveRoomFillPrompt[\s\S]*mergeFilledQuestionPlanWithTemplate/,
  "Gemini debe llenar una sala a la vez y PigPen debe restaurar los campos inmutables de la plantilla."
);
assert.doesNotMatch(source, /extractObjectiveLanguageLevel|target_language_level/);
assert.match(source, /B1\/B2 en campos de bloque o trimestre son etiquetas académicas/);
for (const field of ["assessment_case_id", "case_source", "case_data", "transfer_delta", "reasoning_evidence", "integrates_knowledge_ids"]) {
  assert.match(source, new RegExp(`${field}:`), `Cada question_plan debe declarar ${field}.`);
}
assert.doesNotMatch(
  source,
  /repite la mecánica calculable/,
  "Dos mecánicas del mismo tipo no deben rechazarse solo por compartir su categoría."
);
assert.doesNotMatch(
  source,
  /necesita una oportunidad de reserva distinta de sus preguntas activas/,
  "La reserva no debe bloquear la compilación inicial del plan por una regla editorial redundante."
);
assert.match(source, /<SOURCE_CONTRACT>[\s\S]*deterministic_repairs/);
const generationFlow = source.slice(
  source.indexOf("async function generateEscapeRoomFromBrief("),
  source.indexOf('elements.form.addEventListener("submit"')
);
assert.match(
  generationFlow,
  /await ensureObjectiveBlueprint\(formData\)/,
  "Generar debe recuperar automáticamente un plan ausente o realmente desactualizado."
);
assert.doesNotMatch(html, /id="objectivePlanStatus"/);
assert.match(
  source,
  /elements\.btnGenerar\.disabled = state\.isLoading \|\| generationBusy;[\s\S]*btnGenerarBottom\.disabled = state\.isLoading \|\| generationBusy;/,
  "Los botones de generación no deben bloquearse únicamente por el estado de la huella del plan."
);
assert.match(html, /Puedes cerrar para usarlo o modificar los datos sin eliminar encabezados ni etiquetas/);
assert.match(html, /id="objectiveEnrichmentLoader"[\s\S]*pigpen\.png[\s\S]*PigPen está diseñando el plan/);
assert.match(source, /function setObjectiveEnrichmentLoading[\s\S]*aria-busy[\s\S]*setObjectiveEnrichmentLoading\(true\)[\s\S]*setObjectiveEnrichmentLoading\(false\)/);
assert.match(
  source,
  /function activateObjectiveBrief[\s\S]*objectiveInput\.value = finalText[\s\S]*state\.objectiveBlueprintKey = buildObjectiveBlueprintKey[\s\S]*syncActionButtons\(\)/,
  "Un plan aprobado debe activarse, persistirse y habilitar la generación mediante una sola operación."
);
assert.match(
  source,
  /const activeBrief = activateObjectiveBrief\(brief, proposedText\)[\s\S]*modal\.show\(\)/,
  "Recrear y enriquecer debe activar el plan antes de mostrar el modal de revisión."
);
assert.match(html, /El plan creado ya quedó aplicado y la generación está habilitada/);
assert.match(
  source,
  /\["objetivoModeloSelect", "imagenModeloSelect"\]\.includes\(fieldId\)[\s\S]*field\.dataset\.pendingModelValue/,
  "La restauración debe conservar temporalmente los modelos guardados hasta validarlos contra el catálogo remoto."
);
assert.doesNotMatch(html, /id="(?:erDurationHelp|dificultadHelp)"/);
assert.match(
  source,
  /function isObjectiveBlueprintCurrent[\s\S]*objectiveMatches[\s\S]*configurationMatches[\s\S]*state\.objectiveBlueprintKey = currentKey/,
  "Una deriva interna de la clave debe autorrepararse cuando el texto y la configuración compilada siguen idénticos."
);
assert.match(
  source,
  /const activeConfiguration = getObjectiveConfigurationContract\(nextContext\)[\s\S]*source_contract\.configuration = activeConfiguration/,
  "La activación debe guardar exactamente la configuración efectiva usada por la huella."
);

console.log("PigPen objective compiler contract OK.");
