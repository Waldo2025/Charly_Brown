import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const creatorPath = new URL("../public/js/PigPenCreator.js", import.meta.url);
const creatorSource = await readFile(creatorPath, "utf8");
const creatorModelSource = await readFile(new URL("../public/js/escape-room-creator-model.mjs", import.meta.url), "utf8");

function functionSource(name, nextName) {
  const start = creatorSource.indexOf(`function ${name}`);
  const end = creatorSource.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must exist after ${name}`);
  return creatorSource.slice(start, end);
}

test("single-question regeneration scopes the quality gate to the selected question", () => {
  const source = functionSource("regenerateQuestionContent", "createQuestionDraft");
  assert.match(source, /scope = \{ missionIndex: roomIndex, questionIndex: qIndex \}/);
  assert.match(source, /runContentQualityGate\([\s\S]*?scope,[\s\S]*?additionalAudit:/);
  assert.match(source, /forbiddenQuestions = \[question, \.\.\.excludedQuestions\]/);
  assert.match(source, /questionsAreTooSimilar\(candidate, existing\)/);
  assert.match(source, /questionsReusePrimaryAnswer\(candidate, existing\)/);
});

test("single-question regeneration avoids unnecessary images and stores required images before rendering", () => {
  const source = functionSource("regenerateQuestionContent", "createQuestionDraft");
  assert.match(source, /shouldGenerateQuestionImage = approvedQuestion\?\.requiere_imagen === true/);
  assert.match(source, /shouldGenerateQuestionImage\s+\? await generateMissionImages/);
  assert.match(source, /await uploadProjectImagesToFirebaseStorage\(state\.activeSessionId, state\.activeTopicId\)/);
  assert.ok(
    source.indexOf("await uploadProjectImagesToFirebaseStorage") < source.indexOf("renderOutputsNow()"),
    "the generated image must leave the in-memory data URL before rebuilding the preview"
  );
});

test("answer comparison imports and executes its normalization helper", async () => {
  assert.match(creatorSource, /normalizeAcceptedAnswers,\s+normalizeBaseText,\s+normalizeTextList/);
  assert.match(creatorModelSource, /export function normalizeBaseText\(/);
  const source = functionSource("questionsReusePrimaryAnswer", "assertQuestionVariety");
  assert.match(source, /normalizeBaseText\(String\(firstQuestion\.respuesta_correcta/);
  const { normalizeBaseText } = await import("../public/js/escape-room-creator-model.mjs");
  const compareAnswers = Function("normalizeBaseText", `return (${source.trim()});`)(normalizeBaseText);
  assert.equal(compareAnswers({ respuesta_correcta: "Éarth" }, { respuesta_correcta: "earth" }), true);
  assert.equal(compareAnswers({ respuesta_correcta: "Earth" }, { respuesta_correcta: "planet" }), false);
});

test("question regeneration prompt requires a genuinely different question", () => {
  const source = functionSource("buildQuestionRegenerationPrompt", "pickMissionFromGeminiPayload");
  assert.match(source, /PREGUNTA ACTUAL QUE DEBES REEMPLAZAR/);
  assert.match(source, /otra evidencia o enfoque, otra redacción y una respuesta diferente/);
  assert.doesNotMatch(source, /Si puedes, conserva la intención/);
});

test("scoped audits ignore issues outside the selected question", () => {
  const source = functionSource("contentAuditIssueMatchesScope", "runAiContentAudit");
  assert.match(source, /issue\.roomIndex === null/);
  assert.match(source, /issue\.questionIndex === null/);
  assert.match(creatorSource, /Es válido que respuesta_correcta aparezca una sola vez también en respuestas_aceptadas/);
});
