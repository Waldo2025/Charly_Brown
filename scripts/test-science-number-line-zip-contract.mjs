import test from "node:test";
import assert from "node:assert/strict";
import { simulatorUsesProgrammaticPrimary, validateLocalizedSimulatorExportContract } from "../public/js/science-export-contract.mjs";

const embeddedBackground = "data:image/png;base64,AA==";

test("la recta numérica exporta sin una imagen de objeto principal", () => {
  const manifest = {
    gameMode: "simulator",
    simulationType: "number-line",
    simulator: { modelId: "number-line" },
    visualScene: { background: { imageSrc: "assets/simulator/background.png" }, layers: [] }
  };
  const runtime = {
    ...structuredClone(manifest),
    visualScene: { background: { dataUrl: embeddedBackground }, layers: [] }
  };
  assert.equal(simulatorUsesProgrammaticPrimary(manifest), true);
  assert.doesNotThrow(() => validateLocalizedSimulatorExportContract(manifest, runtime, { simulatorVisualBytes: 2 }));
});

test("los demás simuladores siguen exigiendo su objeto principal", () => {
  const manifest = {
    gameMode: "simulator",
    simulator: { modelId: "friction" },
    visualScene: { background: { imageSrc: "assets/simulator/background.png" }, layers: [] }
  };
  const runtime = {
    ...structuredClone(manifest),
    visualScene: { background: { dataUrl: embeddedBackground }, layers: [] }
  };
  assert.throws(
    () => validateLocalizedSimulatorExportContract(manifest, runtime),
    /objeto principal/
  );
});

test("la recta numérica sigue exigiendo un fondo localizado e incrustado", () => {
  const manifest = { gameMode: "simulator", simulator: { modelId: "number-line" }, visualScene: { background: {}, layers: [] } };
  const runtime = structuredClone(manifest);
  assert.throws(() => validateLocalizedSimulatorExportContract(manifest, runtime), /fondo visual/);
});
