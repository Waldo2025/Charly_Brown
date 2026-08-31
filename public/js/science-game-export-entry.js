import * as Phaser from "../vendor/phaser/phaser.esm.min.js";
import * as Anime from "../vendor/animejs/anime.esm.min.js";
import { createScienceGame, installAccessibleGameState } from "./science-game-runtime.mjs";
import { installScienceActivitiesMotion } from "./science-activities-motion.mjs";
import html2canvas from "html2canvas-pro";

globalThis.__SCIENCE_EXPORT_PHASER__ = Phaser.default || Phaser;
globalThis.__SCIENCE_EXPORT_ANIME__ = Anime.default || Anime;
globalThis.__SCIENCE_HTML2CANVAS__ = html2canvas;

async function startExportedScienceGame() {
  installScienceActivitiesMotion(document.body);
  const mount = document.getElementById("scienceGameMount") || document.getElementById("scienceGame");
  const controls = document.getElementById("scienceGameControls") || document.getElementById("scienceControls");
  const instance = await createScienceGame(mount, controls, globalThis.SCIENCE_ACTIVITY);
  globalThis.scienceGameInstance = instance;
  installAccessibleGameState(instance);
  await import("./science-assessment-export.js");
}

startExportedScienceGame().catch((error) => {
  console.error("[ScienceActivities Export] No se pudo iniciar el videojuego:", error);
  document.body.dataset.exportError = "true";
});
