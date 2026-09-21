import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../public/js/PigPenCreator.js", import.meta.url), "utf8");

test("el objetivo final materializa y conserva cada sala completa", () => {
  assert.match(source, /const OBJECTIVE_ROOM_GENERATION_CONTRACT_VERSION = 1;/);
  assert.match(source, /const mission = await requestGeneratedRoomBundle\(materializationContext, roomIndex,/);
  assert.match(source, /setObjectiveGeneratedRoom\(foundation, roomIndex, mission, materializationContext, roomInteractionPlan\)/);
  assert.match(source, /generated_room: normalizeObjectiveGeneratedRoom\(room, index\)/);
  assert.match(source, /const contentModel = context\.contentModel \|\| context\.modeloObjetivo \|\| context\.modelo \|\| TEXT_MODEL_DEFAULT;/);
  assert.match(source, /context = \{ \.\.\.context, contentModel, modeloObjetivo: contentModel, modelo: contentModel \}/);
});

test("el borrador se hidrata desde el blueprint antes de calcular salas faltantes", () => {
  assert.match(source, /rooms: Array\.from\(\{ length: missionCount \}, \(_, missionIndex\) => \(\s*getReusableObjectiveGeneratedMission/);
  assert.match(source, /privateDraft = hydratePrivateGenerationDraftFromObjective\(/);
  const hydratePosition = source.indexOf("privateDraft = hydratePrivateGenerationDraftFromObjective(");
  const missingPosition = source.indexOf("const missingMissionIndexes = privateDraft.rooms", hydratePosition);
  assert.ok(hydratePosition >= 0 && missingPosition > hydratePosition);
});

test("el fallback persiste solamente la sala recuperada para reutilizarla", () => {
  const generationStart = source.indexOf("async function generateEscapeRoomFromBrief");
  const generationEnd = source.indexOf("elements.form.addEventListener", generationStart);
  const generationFlow = source.slice(generationStart, generationEnd);
  assert.match(generationFlow, /runWithConcurrency\(missingMissionIndexes, 1,/);
  assert.match(generationFlow, /setObjectiveGeneratedRoom\(objectiveBlueprint, missionIndex, mission, formData, roomInteractionPlan\)/);
  assert.match(generationFlow, /persistObjectiveBlueprint\(state\.objectiveBlueprintKey, state\.objectiveBlueprint\)/);
});

test("la compatibilidad invalida materializaciones con contrato, cantidad o interacciones distintas", () => {
  assert.match(source, /generated\.meta\.contractVersion !== OBJECTIVE_ROOM_GENERATION_CONTRACT_VERSION/);
  assert.match(source, /generated\.meta\.questionCount !== expectedQuestionCount/);
  assert.match(source, /JSON\.stringify\(generated\.meta\.interactions\) !== JSON\.stringify\(expectedInteractions\)/);
  assert.match(source, /actualQuestions\.length !== expectedQuestionCount/);
});
