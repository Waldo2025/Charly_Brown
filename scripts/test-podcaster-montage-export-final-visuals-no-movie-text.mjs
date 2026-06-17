import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

assert.match(
  backendSource,
  /const hasEffectiveRasterizedText = input\.exportMode !== "review"[\s\S]*?&& false;/,
  "El pass final debe mantener desactivada la ruta rasterizada basada en movie=filename."
);

assert.match(
  backendSource,
  /const segmentDrawFilters = renderOnScreenTextDrawFilters\(/,
  "El pass final debe conservar la ruta compartida drawtext para texto/karaoke."
);

console.log("Podcaster montage final visuals avoid movie-based text overlays OK.");
