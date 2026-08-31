import assert from "node:assert/strict";
import test from "node:test";
import { createCurriculumRegistry, resolveCurriculumProfile, applyCurriculumProfile } from "../public/js/science-curriculum-profiles.mjs";
import { advanceScienceLinearMotion, calculateScienceBackgroundMotion, calculateScienceMotionIndicators, calculateScienceSimulatorMeasurement, calculateScienceSimulatorObjectiveProgress, isLinearMotionSimulator } from "../public/js/science-simulator-runtime.mjs";

const topic = "Movimiento rectilíneo uniforme (MRU)";

test("MRU normaliza sesiones antiguas al objetivo de aceleración cero", () => {
  const registry = createCurriculumRegistry({ physics: [topic] });
  const profile = resolveCurriculumProfile(registry, "physics", topic);
  assert.ok(profile);
  const activity = applyCurriculumProfile({ simulator: { objective: "Objetivo genérico", objectiveTargets: [] } }, profile);
  assert.equal(activity.simulator.objectiveMetric, "acceleration");
  assert.match(activity.simulator.objective, /aceleración = 0 m\/s²/i);
  assert.deepEqual(activity.simulator.objectiveTargets, [{ metric: "acceleration", value: 0, tolerance: .01 }]);
});

test("20 m/s, 25 kg y 5 N producen 0.2 m/s² y aproximación parcial", () => {
  const measurement = calculateScienceSimulatorMeasurement("friction", { velocity: 20, mass: 25, force: 5 });
  assert.equal(measurement.acceleration, .2);
  const result = calculateScienceSimulatorObjectiveProgress({
    targets: [{ metric: "acceleration", value: 0, tolerance: .01 }],
    values: { velocity: 20, mass: 25, force: 5 },
    measurement
  });
  assert.ok(result.progress > 0 && result.progress < 100);
  assert.equal(Math.round(result.progress), 80);
  assert.equal(result.reached, false);
});

test("fuerza neta cero alcanza exactamente 100%", () => {
  const measurement = calculateScienceSimulatorMeasurement("friction", { velocity: 20, mass: 25, force: 0 });
  const result = calculateScienceSimulatorObjectiveProgress({
    targets: [{ metric: "acceleration", value: 0, tolerance: .01 }],
    values: { velocity: 20, mass: 25, force: 0 },
    measurement
  });
  assert.equal(measurement.acceleration, 0);
  assert.equal(result.progress, 100);
  assert.equal(result.reached, true);
});

test("la aproximación usa el rango alcanzable y no cae a 0% con 3.33 m/s²", () => {
  const controls = [
    { id: "velocity", min: 0, max: 40, step: 1 },
    { id: "mass", min: 1, max: 25, step: 1 },
    { id: "force", min: -100, max: 100, step: 5 }
  ];
  const values = { velocity: 23, mass: 6, force: 20 };
  const measurement = calculateScienceSimulatorMeasurement("friction", values);
  const result = calculateScienceSimulatorObjectiveProgress({
    targets: [{ metric: "acceleration", value: 0, tolerance: .01 }],
    controls,
    values,
    measurement
  });
  assert.equal(Number(measurement.acceleration.toFixed(2)), 3.33);
  assert.equal(Math.round(result.progress), 80);
  assert.equal(result.reached, false);
});

test("MRUA conserva la velocidad acumulada cuando la posición completa una vuelta", () => {
  assert.equal(isLinearMotionSimulator({ topic: "Movimiento rectilíneo uniformemente acelerado (MRUA)" }), true);
  let motion = { distance: 0, velocity: 10 };
  motion = advanceScienceLinearMotion(motion, { deltaMs: 1000, acceleration: 2, trackLength: 20 });
  assert.equal(motion.velocity, 12);
  assert.equal(motion.distance, 11);
  motion = advanceScienceLinearMotion(motion, { deltaMs: 1000, acceleration: 2, trackLength: 20 });
  assert.equal(motion.velocity, 14);
  assert.equal(motion.distance, 24);
  assert.equal(motion.loops, 1);
  assert.equal(Number(motion.progress.toFixed(2)), .2);
});

test("envolver la posición nunca reinicia la velocidad de MRUA a cero", () => {
  let motion = { distance: 95, velocity: 18 };
  motion = advanceScienceLinearMotion(motion, { deltaMs: 500, acceleration: 4, trackLength: 100 });
  assert.equal(motion.velocity, 20);
  assert.equal(motion.loops, 1);
  assert.ok(motion.progress < .1);
  const resumed = advanceScienceLinearMotion(motion, { deltaMs: 500, acceleration: 0, trackLength: 100 });
  assert.equal(resumed.velocity, 20);
  assert.ok(resumed.distance > motion.distance);
});

test("las flechas de MRU avanzan con el tiempo y responden a la velocidad", () => {
  const base = { running: true, velocity: 12, objectX: 500, objectY: 260, objectWidth: 240, objectHeight: 100, viewportWidth: 960 };
  const first = calculateScienceMotionIndicators({ ...base, time: 0 });
  const later = calculateScienceMotionIndicators({ ...base, time: 500 });
  assert.equal(first.length, 3);
  assert.ok(later[0].x > first[0].x);
  assert.ok(calculateScienceMotionIndicators({ ...base, time: 0, velocity: 36 })[0].speed > first[0].speed);
});

test("las flechas invierten dirección y se inmovilizan al pausar", () => {
  const reverse = calculateScienceMotionIndicators({ running: true, time: 400, velocity: -10, objectX: 500, objectY: 260, objectWidth: 240, objectHeight: 100, viewportWidth: 960 });
  assert.ok(reverse.every((indicator) => indicator.direction === -1));
  const paused = calculateScienceMotionIndicators({ running: false, time: 5000, velocity: 12, objectX: 500, objectY: 260, objectWidth: 240, objectHeight: 100, viewportWidth: 960 });
  const pausedLater = calculateScienceMotionIndicators({ running: false, time: 9000, velocity: 12, objectX: 500, objectY: 260, objectWidth: 240, objectHeight: 100, viewportWidth: 960 });
  assert.deepEqual(paused, pausedLater);
});

test("el fondo de MRU se desplaza de derecha a izquierda en loop", () => {
  const first = calculateScienceBackgroundMotion({ running: true, reduced: false, time: 500, velocity: 12, viewportWidth: 960 });
  const later = calculateScienceBackgroundMotion({ running: true, reduced: false, time: 1500, velocity: 12, viewportWidth: 960 });
  assert.equal(first.directionLabel, "right-to-left");
  assert.ok(later.offset > first.offset);
  assert.ok(calculateScienceBackgroundMotion({ running: true, time: 500, velocity: 40, viewportWidth: 960 }).speed > first.speed);
});

test("el fondo de MRUA usa la distancia integrada y conserva la aceleración entre vueltas", () => {
  const first = calculateScienceBackgroundMotion({ running: true, distance: 11, velocity: 12, trackLength: 20, viewportWidth: 960 });
  const nextLoop = calculateScienceBackgroundMotion({ running: true, distance: 24, velocity: 14, trackLength: 20, viewportWidth: 960 });
  assert.equal(first.source, "integrated-distance");
  assert.equal(first.offset, 528);
  assert.equal(nextLoop.offset, 192);
  assert.ok(nextLoop.speed > first.speed);
});

test("el fondo se pausa, respeta movimiento reducido e invierte con velocidad negativa", () => {
  assert.equal(calculateScienceBackgroundMotion({ running: false, time: 5000, velocity: 20, viewportWidth: 960 }).offset, 0);
  assert.equal(calculateScienceBackgroundMotion({ running: true, reduced: true, time: 5000, velocity: 20, viewportWidth: 960 }).animated, false);
  assert.equal(calculateScienceBackgroundMotion({ running: true, time: 500, velocity: -20, viewportWidth: 960 }).directionLabel, "left-to-right");
});
