import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

assert.match(
  backendSource,
  /const reviewOnScreenTextEnabled = input\.exportMode === "review" && Boolean\(input\.onScreenTextSettings && input\.onScreenTextSegments\.length\);/,
  "El pass final debe aplicar texto en pantalla solo en export review."
);

assert.match(
  backendSource,
  /const shouldBurnSceneOnScreenText = input\.exportMode !== "review" && Boolean\(input\.onScreenTextSettings && input\.onScreenTextSegments\.length\);/,
  "El export normal debe decidir el texto en pantalla antes del render por escena."
);

assert.match(
  backendSource,
  /await appendMontageSceneOnScreenTextOverlays\(\{/,
  "El render de escena debe inyectar capas rasterizadas del texto en pantalla."
);

assert.doesNotMatch(
  backendSource,
  /const hasEffectiveRasterizedText = input\.exportMode !== "review"[\s\S]*?&& false;/,
  "El pass final no debe conservar la ruta desactivada basada en movie=filename."
);

assert.doesNotMatch(
  backendSource,
  /raster frames missing, falling back to native drawtext overlay/,
  "El export normal no debe degradar silenciosamente a drawtext."
);

console.log("Podcaster montage final visuals keep normal text out of final drawtext pass OK.");
