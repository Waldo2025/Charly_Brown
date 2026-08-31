import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BIOLOGY_ALLOWED_QUESTION_TYPES,
  BIOLOGY_FORBIDDEN_QUESTION_TYPES,
  CURRICULUM_POLICY_VERSION,
  buildCurriculumGenerationContract,
  isAssessmentDifficultyCompatible,
  isCurriculumContentCompatible,
  isQuestionTypeAllowed,
  isSimpleBiologyNumericAssessment,
  questionTypesForActivity
} from "../public/js/science-curriculum-policy.mjs";

const biologyActivity = {
  subject: "biology",
  topic: "Respiración celular",
  grade: "1º secundaria",
  difficulty: "guided",
  expectedLearnings: "Explica cómo la respiración celular transforma nutrientes en energía utilizable.",
  experiencePrompt: "Editar un video de una rutina de skateboarding",
  generation: { curriculumPolicyVersion: CURRICULUM_POLICY_VERSION }
};

test("la política nueva de Biología expone sólo mecánicas compatibles", () => {
  const globalTypes = [...BIOLOGY_ALLOWED_QUESTION_TYPES, ...BIOLOGY_FORBIDDEN_QUESTION_TYPES];
  assert.deepEqual(questionTypesForActivity(biologyActivity, globalTypes), [...BIOLOGY_ALLOWED_QUESTION_TYPES]);
  BIOLOGY_ALLOWED_QUESTION_TYPES.forEach((type) => assert.equal(isQuestionTypeAllowed(biologyActivity, type), true));
  BIOLOGY_FORBIDDEN_QUESTION_TYPES.forEach((type) => assert.equal(isQuestionTypeAllowed(biologyActivity, type), false));
});

test("una actividad guardada sin versión conserva su distribución anterior", () => {
  const legacyTypes = ["multiple", "equation-build", "graph-plot"];
  assert.deepEqual(questionTypesForActivity({ ...biologyActivity, generation: {} }, legacyTypes), legacyTypes);
});

test("Biología acepta conteos directos y rechaza porcentajes, fórmulas y varios pasos", () => {
  assert.equal(isSimpleBiologyNumericAssessment(biologyActivity, {
    type: "numeric-answer",
    context: "En el video de skateboarding se observan muestras de respiración celular.",
    prompt: "Hay 4 muestras y se agregan 3. ¿Cuántas hay?",
    correctValue: 7,
    tolerance: 0
  }), true);
  assert.equal(isSimpleBiologyNumericAssessment(biologyActivity, {
    type: "numeric-answer",
    prompt: "La cantidad aumenta 25%. ¿Cuál es el resultado?",
    correctValue: 25,
    tolerance: 0
  }), false);
  assert.equal(isSimpleBiologyNumericAssessment(biologyActivity, {
    type: "numeric-answer",
    prompt: "Usa la fórmula x = 4 + 3.",
    correctValue: 7,
    tolerance: 0
  }), false);
  assert.equal(isSimpleBiologyNumericAssessment(biologyActivity, {
    type: "numeric-answer",
    prompt: "Se observa una muestra. ¿Cuántas muestras hay?",
    correctValue: -1,
    tolerance: 0
  }), false);
});

test("materia, tema y experiencia deben aparecer sin mezclar contenido", () => {
  assert.equal(isCurriculumContentCompatible(
    biologyActivity,
    "Al editar el video de skateboarding, identifica cómo la respiración celular aporta energía al organismo."
  ), true);
  assert.equal(isCurriculumContentCompatible(
    biologyActivity,
    "Calcula la velocidad y grafica la trayectoria del skateboard."
  ), false);
  assert.equal(isCurriculumContentCompatible(
    biologyActivity,
    "Describe una célula sin relacionarla con la experiencia solicitada."
  ), false);
});

test("la validación reconoce singular y plural del tema Ecosistemas", () => {
  const ecosystemsActivity = {
    ...biologyActivity,
    topic: "Ecosistemas",
    expectedLearnings: "Identifica productores y consumidores dentro de un ecosistema.",
    experiencePrompt: "Observar un desierto"
  };
  assert.equal(isCurriculumContentCompatible(
    ecosystemsActivity,
    "Al observar el desierto, identifica el productor que sostiene este ecosistema árido."
  ), true);
});

test("el contrato Fácil es explícito y mantiene el valor interno guided", () => {
  const contract = buildCurriculumGenerationContract(biologyActivity);
  assert.match(contract, /DIFICULTAD FÁCIL OBLIGATORIA/);
  assert.match(contract, /un solo concepto por pregunta/);
  assert.match(contract, /Respiración celular/);
  assert.match(contract, /transforma nutrientes en energía utilizable/);
  assert.match(contract, /skateboarding/);
  assert.match(contract, /aprendizajes esperados indican los conceptos y procedimientos/);
});

test("Fácil rechaza tareas largas o de varios pasos", () => {
  assert.equal(isAssessmentDifficultyCompatible(biologyActivity, {
    context: "En el video se observa la respiración celular.",
    goal: "Reconoce el proceso.",
    prompt: "¿Qué proceso observas?"
  }), true);
  assert.equal(isAssessmentDifficultyCompatible(biologyActivity, {
    context: "Primero identifica la estructura, después calcula el cambio y luego justifica el resultado.",
    goal: "Resuelve todo el procedimiento.",
    prompt: "Completa el análisis."
  }), false);
});

test("generador, interfaz y títulos usan la política sin reescribir sesiones antiguas", async () => {
  const [source, html, exportSource, hudCss] = await Promise.all([
    readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8"),
    readFile(new URL("../public/scienceActivities.html", import.meta.url), "utf8"),
    readFile(new URL("../public/js/science-assessment-export.js", import.meta.url), "utf8"),
    readFile(new URL("../public/science-hud-themes.css", import.meta.url), "utf8")
  ]);
  assert.match(source, /buildQuestionTypeSchedule\(activity, expectedCount\)/);
  assert.match(source, /generatedActivity\.generation\s*=\s*\{/);
  assert.match(source, /curriculumPolicyVersion:\s*CURRICULUM_POLICY_VERSION/);
  assert.doesNotMatch(source, /"(?:equation-build|exponent-placement|chemical-balance|graph-plot)":\s*biology/);
  assert.match(html, /<option value="guided">Fácil<\/option>/);
  assert.match(source, /completeLearningTitle\(assessment\.prompt\)/);
  assert.match(exportSource, /completeLearningTitle\(question\.prompt\)/);
  assert.match(hudCss, /Los encabezados pedagógicos no se recortan/);
});
