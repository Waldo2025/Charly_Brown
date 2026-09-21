import assert from "node:assert/strict";
import fs from "node:fs";

import {
  applyMechanicContractToQuestion,
  shiftCipherText,
  validateGeneratedRoomContent
} from "../public/js/escape-room-mechanics.mjs";

const cipherTemplateQuestion = applyMechanicContractToQuestion({
  respuesta_correcta: "WRONG",
  respuestas_aceptadas: ["WRONG"],
  opciones: ["WRONG", "ANDROMEDA"]
}, {
  kind: "cipher",
  solution: "MILKY WAY"
});
assert.equal(cipherTemplateQuestion.respuesta_correcta, "MILKY WAY");
assert.deepEqual(cipherTemplateQuestion.respuestas_aceptadas, ["MILKY WAY"]);
assert.equal(cipherTemplateQuestion.opciones[0], "MILKY WAY");

const creatorSource = fs.readFileSync(
  new URL("../public/js/PigPenCreator.js", import.meta.url),
  "utf8"
);
const creatorHtml = fs.readFileSync(
  new URL("../public/PigPenCreator.html", import.meta.url),
  "utf8"
);
const creatorCss = fs.readFileSync(
  new URL("../public/PigPenCreator.css", import.meta.url),
  "utf8"
);

const roomContract = {
  fixed_code_fragment: "K",
  question_plans: [{
    plan_id: "water-state-1",
    knowledge: "water evaporation",
    evidence: "water evaporation",
    application: "water evaporation",
    narrative_effect: "archive seal opens",
    mechanic_contract: { kind: "none" }
  }]
};
assert.equal(
  shiftCipherText("GALAXY", 2),
  "ICNCZA",
  "PigPen debe calcular el cifrado César de forma determinista, no delegarlo al modelo."
);
const rejectedMission = {
  titulo: "The water archive",
  historia: "The archive records changes in the state of water.",
  contexto: "Evaporation changes liquid water into vapour when heat supplies energy.",
  datos_clave: ["Evaporation changes liquid water into vapour."],
  reto: "Recover code K to continue through the archive.",
  imagen_prompt: "An old water archive without text or symbols.",
  imagen_alt: "An old water archive.",
  retroalimentacion_correcta: "The room is complete; obtain code K.",
  preguntas: [{
    _plan_id: "water-state-1",
    titulo: "Identify the process",
    reto: "Which process changes liquid water into vapour when heat is added?",
    tipo_interaccion: "texto",
    subtipo_respuesta: "palabra",
    respuesta_correcta: "evaporation",
    respuestas_aceptadas: ["evaporation"],
    pista: "Review the change caused by heat.",
    retroalimentacion_correcta: "The archive seal opens after identifying the process.",
    retroalimentacion_incorrecta: "Evaporation is not the response you entered.",
    imagen_prompt: "",
    imagen_alt: ""
  }]
};

const rejectedIssues = validateGeneratedRoomContent(rejectedMission, roomContract, { roomIndex: 0 }).issues;
assert.ok(
  rejectedIssues.some((issue) => issue.code === "answer_leak" && issue.field === "retroalimentacion_incorrecta"),
  "La reproducción debe detectar la respuesta revelada por el feedback incorrecto."
);
assert.ok(
  rejectedIssues.some((issue) => issue.code === "room_fragment_leak" && issue.field === "reto"),
  "La reproducción debe detectar el fragmento privado anticipado por el Challenge."
);

const correctedMission = structuredClone(rejectedMission);
correctedMission.reto = "The archive mechanism waits for the investigation to restore its flow.";
correctedMission.preguntas[0].retroalimentacion_incorrecta = "Review how heat changes liquid water, then try again.";
const correctedIssues = validateGeneratedRoomContent(correctedMission, roomContract, { roomIndex: 0 }).issues;
assert.ok(
  !correctedIssues.some((issue) => ["answer_leak", "room_fragment_leak"].includes(issue.code)),
  "Una sala corregida debe superar las dos condiciones exactas reportadas."
);

const caseDataContract = structuredClone(roomContract);
caseDataContract.fixed_code_fragment = "";
caseDataContract.question_plans[0].case_data = ["temperature is 28°C", "humidity is 80%"];
const caseDataMission = structuredClone(correctedMission);
caseDataMission.preguntas[0]._case_data = ["temperature is 28°C", "humidity is 80%"];
caseDataMission.preguntas[0].reto = "The new log says temperature is 28°C and humidity is 80%. Use both readings to diagnose the water cycle stage.";
const materializedCaseIssues = validateGeneratedRoomContent(caseDataMission, caseDataContract, { roomIndex: 0 }).issues;
assert.ok(
  !materializedCaseIssues.some((issue) => ["case_data_binding_mismatch", "case_data_not_materialized"].includes(issue.code)),
  "Los datos concretos vinculados al plan deben aparecer literalmente en el enunciado generado."
);
caseDataMission.preguntas[0].reto = "Use the new weather readings to diagnose the water cycle stage.";
const missingCaseDataIssues = validateGeneratedRoomContent(caseDataMission, caseDataContract, { roomIndex: 0 }).issues;
assert.ok(
  missingCaseDataIssues.some((issue) => issue.code === "case_data_not_materialized"),
  "PigPen debe rechazar una pregunta que omita los datos concretos aprobados en su plan."
);

const takeFragmentContract = structuredClone(roomContract);
takeFragmentContract.fixed_code_fragment = "T";
takeFragmentContract.room_completion_feedback = "The route is restored. Take T.";
const takeFragmentMission = structuredClone(correctedMission);
takeFragmentMission.retroalimentacion_correcta = "The route is restored. Take T.";
const takeFragmentIssues = validateGeneratedRoomContent(takeFragmentMission, takeFragmentContract, { roomIndex: 1 }).issues;
assert.ok(
  !takeFragmentIssues.some((issue) => issue.code === "missing_room_fragment"),
  "El feedback privado 'Take T.' debe reconocer el fragmento de una letra que PigPen insertó por contrato."
);

const coincidentalLetterContract = structuredClone(roomContract);
coincidentalLetterContract.fixed_code_fragment = "A";
coincidentalLetterContract.room_completion_feedback = "You obtained fragment A.";
const coincidentalLetterMission = structuredClone(correctedMission);
coincidentalLetterMission.retroalimentacion_correcta = "You obtained fragment A.";
coincidentalLetterMission.preguntas[0].reto = "Identify the letter A in the displayed water-state label.";
const coincidentalLetterIssues = validateGeneratedRoomContent(
  coincidentalLetterMission,
  coincidentalLetterContract,
  { roomIndex: 0 }
).issues;
assert.ok(
  !coincidentalLetterIssues.some((issue) => issue.code === "fragment_leak" && issue.field === "reto"),
  "Una letra académica coincidente no debe confundirse con la entrega del fragmento secreto."
);

const booleanContract = structuredClone(roomContract);
booleanContract.fixed_code_fragment = "";
booleanContract.question_plans.push({
  ...booleanContract.question_plans[0],
  plan_id: "water-state-2",
  application: "water vapour"
});
const booleanMission = structuredClone(correctedMission);
booleanMission.preguntas = [
  {
    ...structuredClone(correctedMission.preguntas[0]),
    tipo_interaccion: "verdadero_falso",
    respuesta_correcta: true,
    respuestas_aceptadas: [],
    _plan_id: "water-state-1"
  },
  {
    ...structuredClone(correctedMission.preguntas[0]),
    tipo_interaccion: "verdadero_falso",
    respuesta_correcta: true,
    respuestas_aceptadas: [],
    _plan_id: "water-state-2",
    titulo: "Check the result",
    reto: "Water vapour is the gaseous state produced by evaporation.",
    retroalimentacion_correcta: "The archive seal opens and the vapour record becomes stable."
  }
];
const booleanIssues = validateGeneratedRoomContent(booleanMission, booleanContract, { roomIndex: 0 }).issues;
assert.ok(
  !booleanIssues.some((issue) => ["duplicate_answer_signature", "synthesis_reuses_answer"].includes(issue.code)),
  "Los booleanos repetidos no representan por sí solos actividades duplicadas."
);

const finalKeyLeakIssues = validateGeneratedRoomContent(correctedMission, roomContract, {
  roomIndex: 0,
  finalCode: "EVAPORATION"
}).issues;
assert.ok(
  !finalKeyLeakIssues.some((issue) => ["final_code_answer_leak", "final_code_leak"].includes(issue.code)),
  "Una respuesta académica puede coincidir con la clave final si el texto no la identifica como clave."
);
const finalKeyOptionMission = structuredClone(correctedMission);
finalKeyOptionMission.preguntas[0].tipo_interaccion = "opcion_multiple";
finalKeyOptionMission.preguntas[0].opciones = ["evaporation", "STAR", "condensation"];
const finalKeyOptionIssues = validateGeneratedRoomContent(finalKeyOptionMission, roomContract, {
  roomIndex: 0,
  finalCode: "STAR"
}).issues;
assert.ok(
  !finalKeyOptionIssues.some((issue) => issue.code === "final_code_leak" && issue.field === "opciones"),
  "Una palabra curricular como STAR no debe confundirse por sí sola con la divulgación de la clave."
);

const astronomyMission = structuredClone(correctedMission);
astronomyMission.historia = "Starlight returns while students inspect a star map and compare nearby stars.";
astronomyMission.contexto = "A star is a luminous object; stars can form recognizable patterns in the night sky.";
astronomyMission.imagen_prompt = "A star map with several stars and no written codes.";
astronomyMission.imagen_alt = "Students studying stars on a star map.";
const astronomyIssues = validateGeneratedRoomContent(astronomyMission, roomContract, {
  roomIndex: 0,
  finalCode: "STAR"
}).issues;
assert.ok(
  !astronomyIssues.some((issue) => issue.code === "final_code_leak"),
  "STAR, stars y Starlight deben seguir disponibles como vocabulario académico normal."
);

const explicitFinalKeyMission = structuredClone(astronomyMission);
explicitFinalKeyMission.contexto = "The final code is STAR. Enter it after the rooms.";
const explicitFinalKeyIssues = validateGeneratedRoomContent(explicitFinalKeyMission, roomContract, {
  roomIndex: 0,
  finalCode: "STAR"
}).issues;
assert.ok(
  explicitFinalKeyIssues.some((issue) => issue.code === "final_code_leak" && issue.field === "contexto"),
  "Una divulgación explícita de la clave STAR sí debe bloquear la publicación."
);

const opaqueCodeMission = structuredClone(correctedMission);
opaqueCodeMission.contexto = "The archive record A1B classifies the sample used in this lesson.";
const opaqueCodeIssues = validateGeneratedRoomContent(opaqueCodeMission, roomContract, {
  roomIndex: 0,
  finalCode: "A1B"
}).issues;
assert.ok(
  !opaqueCodeIssues.some((issue) => issue.code === "final_code_leak"),
  "Un valor alfanumérico coincidente tampoco es secreto si no se presenta como código final."
);
opaqueCodeMission.contexto = "Use A1B as the final code after completing every room.";
const explicitOpaqueCodeIssues = validateGeneratedRoomContent(opaqueCodeMission, roomContract, {
  roomIndex: 0,
  finalCode: "A1B"
}).issues;
assert.ok(
  explicitOpaqueCodeIssues.some((issue) => issue.code === "final_code_leak"),
  "Un valor alfanumérico sí debe bloquearse cuando se declara explícitamente como código final."
);

const pluralAnswerMission = structuredClone(correctedMission);
pluralAnswerMission.preguntas[0].respuesta_correcta = "star";
pluralAnswerMission.preguntas[0].respuestas_aceptadas = ["star"];
pluralAnswerMission.preguntas[0].pista = "Compare the stars by their visible starlight.";
const pluralAnswerIssues = validateGeneratedRoomContent(pluralAnswerMission, roomContract, { roomIndex: 0 }).issues;
assert.ok(
  !pluralAnswerIssues.some((issue) => issue.code === "answer_leak" && issue.field === "pista"),
  "Una respuesta singular no debe detectarse dentro de plurales o palabras compuestas."
);

const uncontractedCipherMission = structuredClone(correctedMission);
uncontractedCipherMission.preguntas[0].reto = "For the water archive, shift GALAXY +2 and decide whether the displayed result is correct.";
uncontractedCipherMission.preguntas[0].tipo_interaccion = "verdadero_falso";
uncontractedCipherMission.preguntas[0].respuesta_correcta = true;
uncontractedCipherMission.preguntas[0].respuestas_aceptadas = [];
const uncontractedCipherIssues = validateGeneratedRoomContent(
  uncontractedCipherMission,
  roomContract,
  { roomIndex: 0 }
).issues;
assert.ok(
  uncontractedCipherIssues.some((issue) => issue.code === "uncontracted_calculation"),
  "Todo cifrado calculable debe provenir de un contrato materializado por PigPen."
);
const conceptualAnagramMission = structuredClone(correctedMission);
conceptualAnagramMission.preguntas[0].reto = "Explain what makes two words an anagram in the water archive lesson.";
const conceptualAnagramIssues = validateGeneratedRoomContent(
  conceptualAnagramMission,
  roomContract,
  { roomIndex: 0 }
).issues;
assert.ok(
  !conceptualAnagramIssues.some((issue) => issue.code === "uncontracted_calculation"),
  "Una pregunta conceptual sobre anagramas no debe confundirse con una operación de letras pendiente."
);

const directRoomFlow = creatorSource.slice(
  creatorSource.indexOf("async function requestGeneratedRoomBundle("),
  creatorSource.indexOf("async function runWithConcurrency(")
);
assert.match(directRoomFlow, /responseJsonSchema: buildRoomBundleResponseSchema/);
assert.match(directRoomFlow, /normalizeGeneratedRoomBundle/);
assert.doesNotMatch(directRoomFlow, /maximumAttempts|buildRoomBundleRetryInstruction|validateGeneratedRoomContent|validateGeneratedRoomBundle/);
assert.match(creatorSource, /function materializeGeneratedQuestionTemplate[\s\S]*generatedQuestionPlanIssues\(source, questionPlan, interaction\)[\s\S]*if \(planIssues.length\)/);
assert.match(
  creatorSource,
  /materializeGeneratedQuestionTemplate\(question, questionPlan, interaction, \{\s*roomIndex: missionIndex,\s*questionIndex,/,
  "La plantilla de sala debe convertir missionIndex al nombre roomIndex esperado por la plantilla de pregunta."
);
const submitFlow = creatorSource.slice(
  creatorSource.indexOf('elements.form.addEventListener("submit"'),
  creatorSource.indexOf("elements.btnAddMission.addEventListener")
);
assert.match(submitFlow, /const generationDraft = assemblePrivateGenerationDraft/);
assert.doesNotMatch(submitFlow, /maximumPublicationRepairRounds|auditGeneratedDraftForPublication|repairPrivateDraftFromPublicationIssues/);
const singleQuestionFlow = creatorSource.slice(
  creatorSource.indexOf("async function regenerateQuestionContent("),
  creatorSource.indexOf("function createQuestionDraft(")
);
assert.match(singleQuestionFlow, /responseJsonSchema: buildQuestionsResponseSchema\(1, 1, \{ singleQuestion: true \}\)/);
assert.match(singleQuestionFlow, /materializeGeneratedQuestionTemplate/);
assert.match(singleQuestionFlow, /applyMechanicContractToQuestion/);
assert.match(singleQuestionFlow, /_plan_id: normalizeString\(questionPlan\?\.plan_id,/);
assert.doesNotMatch(
  singleQuestionFlow,
  /validateGeneratedRoomContent/,
  "Regenerar una pregunta no debe volver a auditar las demás preguntas públicas de la sala."
);
assert.match(
  creatorSource,
  /async function generateValidatedImage\(prompt, imageOptions\) \{\s*const image = await generateGeminiImage\(prompt, imageOptions\);\s*return optimizeGeneratedImageForProject\(image\);\s*\}/,
  "La primera imagen válida del proveedor debe conservarse aunque contenga palabras."
);
assert.doesNotMatch(creatorSource, /auditGeneratedImage|prepareImageForVisualAudit|Imagen descartada por contener una respuesta escrita/);
const missionImageFlow = creatorSource.slice(
  creatorSource.indexOf("async function generateMissionImages("),
  creatorSource.indexOf("function getQuestionComparisonText(")
);
assert.doesNotMatch(
  missionImageFlow,
  /catch \(error\) \{[\s\S]{0,240}(?:mission|question)\.imagen = ""/,
  "Un fallo al generar o guardar una imagen no debe borrar la imagen anterior."
);
assert.match(creatorSource, /function removeQuestionImage[\s\S]*question\.imagen = "";[\s\S]*question\.media = \{ \.\.\.question\.media, url: "" \}/);
assert.match(creatorSource, /data-question-action="delete-question-image"[\s\S]*Eliminar imagen/);
assert.match(creatorSource, /questionAction === "delete-question-image"[\s\S]*removeQuestionImage\(missionIndex, questionIndex\)/);
assert.match(creatorCss, /\.er-question-image-actions \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(
  creatorSource,
  /function mergeGeneratedQuestionPairs[\s\S]*buildQuestionPlanFallbackPairs[\s\S]*slice\(0, 6\)/,
  "La plantilla debe completar parejas verificables cuando el modelo entregue menos de las necesarias."
);
assert.match(
  creatorSource,
  /if \(\["relacion_columnas", "drag_drop"\]\.includes\(interaction\)\) \{\s*result\.parejas = mergeGeneratedQuestionPairs/,
  "Las interacciones de correspondencia deben materializar sus parejas antes de entrar al proyecto."
);
const packageExportFlow = creatorSource.slice(
  creatorSource.indexOf("async function buildAndDownloadExportPackage("),
  creatorSource.indexOf("async function exportPackage(")
);
assert.match(packageExportFlow, /Exportando borrador con advertencias/);
assert.match(packageExportFlow, /ZIP de borrador generado/);
assert.doesNotMatch(packageExportFlow, /No se puede exportar:[\s\S]*return;/);
assert.match(
  creatorHtml,
  /PigPenCreator\.js\?v=20260907-editorial-export-v208/,
  "El HTML debe invalidar la caché del módulo que contiene el fix."
);

console.log("PigPen room generation retry OK.");
