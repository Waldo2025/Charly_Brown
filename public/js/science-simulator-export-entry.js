import * as Phaser from "../vendor/phaser/phaser.esm.min.js";
import { createScienceSimulator } from "./science-simulator-runtime.mjs";

globalThis.__SCIENCE_EXPORT_PHASER__ = Phaser.default || Phaser;

async function startExportedScienceSimulator() {
  const activity = globalThis.SCIENCE_ACTIVITY;
  const mount = document.getElementById("scienceGameMount") || document.getElementById("scienceGame");
  await createScienceSimulator(mount, {
    ...activity,
    challenge: activity.challenge,
    simulator: activity.simulator,
    curriculumProfile: activity.curriculumProfile
  });
}

startExportedScienceSimulator().catch((error) => {
  console.error("[ScienceActivities Export] No se pudo iniciar el simulador:", error);
  document.body.dataset.exportError = "true";
});
