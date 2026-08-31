import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCurriculumRegistry, resolveCurriculumProfile, buildCuratedProfileAssessment } from "../public/js/science-curriculum-profiles.mjs";
import { calculateScienceSimulatorMeasurement } from "../public/js/science-simulator-runtime.mjs";

test("Adición y sustracción tiene perfil y selector semántico propios", () => {
  const registry = createCurriculumRegistry({ math: ["Adición y sustracción"] });
  const profile = resolveCurriculumProfile(registry, "math", "Adición y sustracción");
  assert.equal(profile.id, "math:adicion-y-sustraccion");
  assert.equal(profile.simulatorProfile.modelId, "addition-subtraction");
  assert.deepEqual(profile.simulatorProfile.controls.map(({ id }) => id), ["operandA", "operator", "operandB"]);
  assert.equal(profile.simulatorProfile.controls[1].controlType, "segmented");
  assert.deepEqual(profile.simulatorProfile.controls[1].options, [{ value: 1, label: "+" }, { value: -1, label: "−" }]);
});

test("el modelo resuelve las cuatro combinaciones de signo y respeta los límites", () => {
  const cases = [
    [{ operandA: 5, operator: 1, operandB: 3 }, 8, 3],
    [{ operandA: 5, operator: -1, operandB: 3 }, 2, -3],
    [{ operandA: 5, operator: 1, operandB: -3 }, 2, -3],
    [{ operandA: 5, operator: -1, operandB: -3 }, 8, 3],
    [{ operandA: 20, operator: 1, operandB: 20 }, 40, 20],
    [{ operandA: -20, operator: -1, operandB: 20 }, -40, -20]
  ];
  for (const [values, result, signedDelta] of cases) {
    const measurement = calculateScienceSimulatorMeasurement("addition-subtraction", values);
    assert.equal(measurement.result, result);
    assert.equal(measurement.signedDelta, signedDelta);
  }
  assert.equal(calculateScienceSimulatorMeasurement("addition-subtraction", { operandA: 5, operator: -1, operandB: -3 }).formula, "5 − (−3) = 8");
});

test("las preguntas curriculares cubren cálculo, ecuación, procedimiento y signos", () => {
  const profile = resolveCurriculumProfile(createCurriculumRegistry({ math: ["Adición y sustracción"] }), "math", "Adición y sustracción");
  assert.deepEqual([0, 1, 2, 3].map((index) => buildCuratedProfileAssessment(profile, index).type), ["numeric-answer", "equation-build", "sequence-order", "multiple"]);
  assert.match(buildCuratedProfileAssessment(profile, 3).feedback, /Restar −3 equivale a sumar 3/);
});

test("Science Activities usa tablero vectorial y evita Gemini para este modelo", async () => {
  const [source, runtime, html] = await Promise.all([
    readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8"),
    readFile(new URL("../public/js/science-simulator-runtime.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/scienceActivities.html", import.meta.url), "utf8")
  ]);
  assert.match(source, /visualSelection\.modelKey === "addition-subtraction"/);
  assert.match(source, /Tablero matemático exacto/);
  assert.match(runtime, /science-sim-segmented/);
  assert.match(runtime, /positiveChips/);
  const bundleVersions = [...html.matchAll(/scienceActivities\.bundle\.js\?v=([^"']+)/g)].map((match) => match[1]);
  assert.equal(bundleVersions.length, 2);
  assert.equal(bundleVersions[0], bundleVersions[1]);
});
