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
  /await appendMontageSceneOnScreenTextDrawtextFilters\(\{/,
  "El render de escena debe usar drawtext compartido para el texto en pantalla."
);

assert.match(
  backendSource,
  /if \(shouldUseMontageSceneDrawtextFilters\(input\)\) \{[\s\S]*appendMontageSceneOnScreenTextDrawtextFilters\([\s\S]*\} else \{[\s\S]*appendMontageSceneOnScreenTextOverlays\(/,
  "El export normal debe usar drawtext como ruta principal y dejar raster solo como fallback."
);

assert.doesNotMatch(
  backendSource,
  /raster frames missing, falling back to native drawtext overlay/,
  "La ruta nueva no debe depender de una degradación silenciosa desde rasters."
);

console.log("Podcaster montage final visuals keep normal text out of final drawtext pass OK.");
