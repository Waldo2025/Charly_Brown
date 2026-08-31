import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import {
  applyCurriculumProfile,
  createCurriculumRegistry,
  resolveCurriculumProfile
} from "../public/js/science-curriculum-profiles.mjs";
import {
  calculateScienceNumberLineApproximation,
  calculateScienceNumberLineLayout,
  calculateScienceNumberLineMotion,
  calculateScienceSimulatorMeasurement,
  SCIENCE_NUMBER_LINE_MOTION_DURATION_MS
} from "../public/js/science-simulator-runtime.mjs";

test("la aproximación usa el punto de comparación aunque una sesión antigua no tenga targetValue", () => {
  const integerProgress = calculateScienceNumberLineApproximation({ finalPosition: 4, comparison: 8 });
  assert.equal(integerProgress.progress, 50);
  assert.equal(integerProgress.reached, false);

  const fractionProgress = calculateScienceNumberLineApproximation({ finalPosition: 2, comparison: 4 });
  assert.equal(fractionProgress.progress, 50);
  assert.equal(fractionProgress.reached, false);

  const reached = calculateScienceNumberLineApproximation({ finalPosition: 4, comparison: 4 });
  assert.equal(reached.progress, 100);
  assert.equal(reached.reached, true);
});

test("La recta numérica tiene perfil, controles y mecánica propios", () => {
  const registry = createCurriculumRegistry({ math: ["La recta numérica"] });
  const profile = resolveCurriculumProfile(registry, "math", "La recta numérica");
  assert.equal(profile.simulatorProfile.modelId, "number-line");
  assert.equal(profile.simulatorProfile.objective.dynamicTarget, "comparison");
  assert.equal(profile.gameProfile.mechanic, "number-line-placement");
  assert.deepEqual(profile.simulatorProfile.controls.map(({ id }) => id), [
    "startNumerator",
    "movementNumerator",
    "comparisonNumerator",
    "denominator"
  ]);
  assert.equal(profile.simulatorProfile.controls.at(-1).max, 10);
  const activity = applyCurriculumProfile({ simulator: {}, challenge: { targetLabel: "Reto heredado", targetValue: 1 } }, profile);
  assert.equal(activity.simulator.objectiveEnabled, true);
  assert.equal(activity.simulator.objectiveTargetMetric, "comparison");
  assert.equal(activity.challenge, null);
});

test("el modelo conserva los valores y usa el denominador sólo como subdivisión", () => {
  const result = calculateScienceSimulatorMeasurement("number-line", {
    startNumerator: -6,
    movementNumerator: 10,
    comparisonNumerator: 8,
    denominator: 2
  });
  assert.equal(result.start, -6);
  assert.equal(result.movement, 10);
  assert.equal(result.finalPosition, 4);
  assert.equal(result.comparison, 8);
  assert.equal(result.relation, "<");
  assert.equal(result.distanceToZero, 4);
});

test("el modo fracciones interpreta numeradores, conserva el denominador y simplifica la lectura", () => {
  const result = calculateScienceSimulatorMeasurement("number-line", {
    numberMode: 1,
    startNumerator: -1,
    movementNumerator: 4,
    comparisonNumerator: 8,
    denominator: 2
  });
  assert.equal(result.start, -.5);
  assert.equal(result.movement, 2);
  assert.equal(result.finalPosition, 1.5);
  assert.equal(result.comparison, 4);
  assert.equal(result.displayValue, "3/2");
  assert.equal(result.formula, "-1/2 + 4/2 = 3/2");
  assert.equal(result.jumpSize, .5);
  const motion = calculateScienceNumberLineMotion(result, SCIENCE_NUMBER_LINE_MOTION_DURATION_MS);
  assert.equal(motion.totalJumps, 4);
  assert.equal(motion.completedJumps, 4);
  assert.equal(motion.currentPosition, 1.5);
});

test("el marcador avanza una vez y se detiene exactamente en el resultado", () => {
  const measurement = { start: 0, finalPosition: 4, startNumerator: 0, finalNumerator: 4, denominator: 2 };
  const start = calculateScienceNumberLineMotion(measurement, 0);
  const middle = calculateScienceNumberLineMotion(measurement, SCIENCE_NUMBER_LINE_MOTION_DURATION_MS / 2);
  const end = calculateScienceNumberLineMotion(measurement, SCIENCE_NUMBER_LINE_MOTION_DURATION_MS * 4);
  assert.equal(start.currentPosition, 0);
  assert.equal(start.complete, false);
  assert.equal(start.totalJumps, 4);
  assert.equal(middle.completedJumps, 2);
  assert.equal(middle.currentPosition, 2);
  assert.equal(end.currentPosition, 4);
  assert.equal(end.progress, 1);
  assert.equal(end.complete, true);
});

test("la escala alinea valores enteros y conserva las subdivisiones", () => {
  const layout = calculateScienceNumberLineLayout({ start: -1, finalPosition: 4, comparison: 8, denominator: 2 }, 960);
  const halfStep = layout.pxTick(1) - layout.pxTick(0);
  assert.ok(halfStep > 20, `Cada medio debe ser visible; separación obtenida: ${halfStep}px`);
  assert.ok(Math.abs(layout.pxValue(-1) + halfStep * 10 - layout.pxValue(4)) < 1e-9);
  assert.ok(Math.abs(layout.pxValue(8)-layout.pxTick(16)) < 1e-9);
});

test("los desplazamientos negativos saltan a la izquierda y respetan el denominador", () => {
  const motion = calculateScienceNumberLineMotion({ startNumerator: 5, finalNumerator: 2, denominator: 4 }, SCIENCE_NUMBER_LINE_MOTION_DURATION_MS);
  assert.equal(motion.direction, -1);
  assert.equal(motion.totalJumps, 3);
  assert.equal(motion.start, 5);
  assert.equal(motion.currentPosition, 2);
  assert.equal(motion.complete, true);
});

test("los dos exports usan portada y difieren el runtime hasta el gesto", async () => {
  const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
  assert.match(source, /buttonLabel:\s*meaningfulActivityText\(custom\.buttonLabel\) \|\| "Comenzar"/);
  assert.match(source, /requestFullscreen\|\|e\.webkitRequestFullscreen/);
  assert.match(source, /buildExportBootScript/);
  assert.match(source, /script\.src=\"js\/\$\{bundle\}\"/);
  assert.match(source, /await import\(\"\.\/script\.js\"\)/);
  assert.doesNotMatch(source, /<script src="js\/\$\{bundle\}"><\/script>/);
});

test("los bundles offline contienen el modelo, el vector programático y el reto", async () => {
  const [simulatorBundle, gameBundle, simulatorRuntime] = await Promise.all([
    readFile(new URL("../public/js/export-bundles/science-simulator-export.bundle.js", import.meta.url), "utf8"),
    readFile(new URL("../public/js/export-bundles/science-game-export.bundle.js", import.meta.url), "utf8"),
    readFile(new URL("../public/js/science-simulator-runtime.mjs", import.meta.url), "utf8")
  ]);
  assert.match(simulatorBundle, /number-line/);
  assert.match(simulatorRuntime, /for\(let jump=0;jump<motion\.completedJumps;jump\+\+\)/);
  assert.match(gameBundle, /number-line-placement/);
});

test("el ZIP solicita versiones nuevas del bundle y CSS del simulador", async () => {
  const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
  assert.match(source, /export-bundles\/\$\{exportBundle\}\?v=\$\{isSimulator \? SIMULATOR_EXPORT_BUNDLE_VERSION/);
  assert.match(source, /science-assessment-export\.css\?v=20260815-segmented-switch-v34/);
});

test("el fondo predeterminado de la recta existe y es apto para exportación offline", async () => {
  const backgroundUrl = new URL("../public/assets/simulator-fallbacks/number-line-observatory-v1.webp", import.meta.url);
  const metadata = await stat(backgroundUrl);
  assert.ok(metadata.size > 10_000, `El fondo parece vacío: ${metadata.size} bytes`);
  const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
  assert.match(source, /numberLine:\s*\{[\s\S]*?number-line-observatory-v1\.webp/);
});

test("el bundle offline de simulador conserva el movimiento de fondo de MRU y MRUA", async () => {
  const simulatorBundle = await readFile(new URL("../public/js/export-bundles/science-simulator-export.bundle.js", import.meta.url), "utf8");
  assert.match(simulatorBundle, /integrated-distance/);
  assert.match(simulatorBundle, /tilePositionX/);
  assert.match(simulatorBundle, /right-to-left/);
});
