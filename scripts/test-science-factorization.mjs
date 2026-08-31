import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyCurriculumProfile, createCurriculumRegistry, resolveCurriculumProfile } from "../public/js/science-curriculum-profiles.mjs";
import { calculateQuadraticFactorization, calculateScienceSimulatorMeasurement } from "../public/js/science-simulator-runtime.mjs";
import { simulatorUsesFullyProgrammaticScene, validateLocalizedSimulatorExportContract } from "../public/js/science-export-contract.mjs";

const CASES = [
  [{ commonFactor: 1, factorP: 1, factorQ: 2, factorR: 1, factorS: 3 }, [1, 5, 6], "(x + 2)(x + 3)"],
  [{ commonFactor: 1, factorP: 2, factorQ: 1, factorR: 1, factorS: 3 }, [2, 7, 3], "(2x + 1)(x + 3)"],
  [{ commonFactor: 1, factorP: 1, factorQ: -3, factorR: 1, factorS: 2 }, [1, -1, -6], "(x − 3)(x + 2)"],
  [{ commonFactor: 1, factorP: 3, factorQ: 2, factorR: 1, factorS: -4 }, [3, -10, -8], "(3x + 2)(x − 4)"],
  [{ commonFactor: 1, factorP: 2, factorQ: -3, factorR: 2, factorS: -3 }, [4, -12, 9], "(2x − 3)(2x − 3)"],
  [{ commonFactor: 2, factorP: 1, factorQ: 2, factorR: 1, factorS: 3 }, [2, 10, 12], "2(x + 2)(x + 3)"],
];

test("el modelo expande y vuelve a factorizar los casos de aceptación", () => {
  for (const [values, coefficients, factoredForm] of CASES) {
    const result = calculateQuadraticFactorization(values);
    assert.deepEqual([result.a, result.b, result.c], coefficients);
    assert.equal(result.factoredForm, factoredForm);
    assert.equal(result.middleOne + result.middleTwo, result.innerB);
    assert.equal(result.innerA * result.innerC, result.middleOne * result.middleTwo);
  }
});

test("el progreso depende de ocho pasos verificables y llega exactamente a 100", () => {
  const values = {
    factorMode: 1, commonFactor: 2, factorP: 1, factorQ: 2, factorR: 1, factorS: 3,
    _factorization: { mcdCorrect: true, middleCorrect: true, placements: { tl: "x2", tr: "middle-one", bl: "middle-two", br: "unit" }, factorACorrect: true, factorBCorrect: true }
  };
  const complete = calculateScienceSimulatorMeasurement("quadratic-factorization-rectangle", values);
  assert.equal(complete.stepsComplete, 8);
  assert.equal(complete.progress, 100);
  assert.equal(complete.reached, true);
  const partial = calculateQuadraticFactorization({ ...values, _factorization: { mcdCorrect: true, placements: { tl: "x2" } } });
  assert.equal(partial.stepsComplete, 2);
  assert.equal(partial.progress, 25);
  assert.equal(partial.reached, false);
});

test("normaliza factores no primitivos y conserva tres términos no nulos", () => {
  const normalized = calculateQuadraticFactorization({ commonFactor: 1, factorP: 2, factorQ: 4, factorR: 1, factorS: 3 });
  assert.deepEqual([normalized.g, normalized.p, normalized.q], [2, 1, 2]);
  assert.deepEqual([normalized.a, normalized.b, normalized.c], [2, 10, 12]);
  assert.notEqual(normalized.b, 0);
  assert.notEqual(normalized.c, 0);
});

test("el ZIP reconoce la caja como escena completamente programática", () => {
  const activity = { gameMode: "simulator", simulator: { modelId: "quadratic-factorization-rectangle" }, visualScene: { background: {}, layers: [] } };
  assert.equal(simulatorUsesFullyProgrammaticScene(activity), true);
  assert.doesNotThrow(() => validateLocalizedSimulatorExportContract(activity, structuredClone(activity)));
});

test("Factorización usa un perfil dedicado y conserva el estado serializable", () => {
  const registry = createCurriculumRegistry({ math: ["Factorización", "Polinomios"] });
  const profile = resolveCurriculumProfile(registry, "math", "Factorización");
  const polynomialProfile = resolveCurriculumProfile(registry, "math", "Polinomios");
  assert.equal(profile.simulatorProfile.modelId, "quadratic-factorization-rectangle");
  assert.equal(profile.simulatorProfile.objective.dynamicTarget, "factorizationProgress");
  assert.deepEqual(profile.simulatorProfile.controls.map(({ id }) => id), ["factorMode", "commonFactor", "factorP", "factorQ", "factorR", "factorS"]);
  assert.equal(polynomialProfile.simulatorProfile.modelId, "math", "Los demás temas algebraicos deben conservar el modelo genérico");
  const activity = applyCurriculumProfile({ simulator: {} }, profile);
  assert.equal(activity.simulator.objectiveEnabled, true);
  assert.equal(activity.simulator.objectiveTargetMetric, "factorizationProgress");
});

test("el preview y el ZIP registran el modelo y los estilos de la caja", async () => {
  const [source, runtime, previewCss, exportCss, bundle] = await Promise.all([
    readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8"),
    readFile(new URL("../public/js/science-simulator-runtime.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/scienceActivities.css", import.meta.url), "utf8"),
    readFile(new URL("../public/science-assessment-export.css", import.meta.url), "utf8"),
    readFile(new URL("../public/js/export-bundles/science-simulator-export.bundle.js", import.meta.url), "utf8")
  ]);
  for (const text of [source, runtime, bundle]) assert.match(text, /quadratic-factorization-rectangle/);
  for (const text of [previewCss, exportCss]) assert.match(text, /science-factor-box/);
  assert.match(source, /factorizaci\[oó\]n\|factorizar/);
});
