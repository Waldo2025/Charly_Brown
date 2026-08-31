import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGeneratedAssessmentGroundingContext,
  repairGeneratedAssessmentShape
} from "../public/js/science-assessment-generation-repair.mjs";

test("repara aliases frecuentes de respuesta numérica", () => {
  const repaired = repairGeneratedAssessmentShape({ type: "numeric-answer", answer: "12", units: "kg" }, "numeric-answer");
  assert.equal(repaired.correctValue, "12");
  assert.equal(repaired.tolerance, 0);
  assert.equal(repaired.unit, "kg");
});

test("repara una respuesta de completar sin perder el contenido de Gemini", () => {
  const repaired = repairGeneratedAssessmentShape({
    type: "fill-blank",
    sentence: "La potencia de base 2 es ___.",
    correctAnswer: "8"
  }, "fill-blank");
  assert.equal(repaired.expression, "La potencia de base 2 es ___.");
  assert.deepEqual(repaired.accepted, ["8"]);
});

test("convierte reactivos, productos y coeficientes alternativos al contrato químico", () => {
  const repaired = repairGeneratedAssessmentShape({
    type: "chemical-balance",
    reactants: ["H2", "O2"],
    products: ["H2O"],
    coefficients: [2, 1, 2]
  }, "chemical-balance");
  assert.deepEqual(repaired.compounds, [
    { formula: "H2", side: "reactant" },
    { formula: "O2", side: "reactant" },
    { formula: "H2O", side: "product" }
  ]);
  assert.deepEqual(repaired.correctCoefficients, [2, 1, 2]);
});

test("añade anclajes curriculares sin superar el límite de dificultad guiada", () => {
  const context = buildGeneratedAssessmentGroundingContext({
    topic: "Potencias y raíces",
    experiencePrompt: "Analizar una campaña escolar que aumenta su alcance en cada ronda",
    expectedLearnings: "Explica la ley de los exponentes de bases iguales y calcula potencias"
  }, "El grupo compara los datos registrados para decidir el siguiente paso.");
  assert.match(context, /Potencias y raíces/);
  assert.match(context, /campaña escolar/);
  assert.match(context, /ley de los exponentes/);
  assert.ok(context.split(/\s+/).length <= 86);
});
