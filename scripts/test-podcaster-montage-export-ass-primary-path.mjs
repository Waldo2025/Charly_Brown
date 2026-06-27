import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

assert.match(
  backendSource,
  /const reviewOnScreenTextEnabled = input\.exportMode === "review" && isTextTrackVisible && Boolean\(input\.onScreenTextSettings && input\.onScreenTextSegments\.length\);/,
  "El pass final debe aplicar texto en pantalla solo en export review."
);

assert.match(
  backendSource,
  /let shouldBurnSceneOnScreenText = shouldUseMontageSceneAssSubtitles\(input\);/,
  "El export normal debe decidir el texto en pantalla antes del render por escena."
);

assert.match(
  backendSource,
  /\["text", "pill", "rect", "underline"\]\.includes\(stylizedKaraokeStyle\)/,
  "Los estilos karaoke no ASS deben forzar la pasada visual de navegador."
);

assert.match(
  backendSource,
  /normalOnScreenTextEnabled = input\.exportMode === "normal" && isTextTrackVisible && Boolean\(input\.onScreenTextSettings && input\.onScreenTextSegments\.length\);/,
  "Al forzar browser para karaoke/texto estilizado, el pass final debe reactivar el texto en pantalla."
);

assert.match(
  backendSource,
  /const hasBrowserVisualPass = finalShouldAttemptBrowserRenderer && hasFinalVisualPass;/,
  "La entrega final debe determinar el browser visual pass dinámicamente."
);

assert.match(
  backendSource,
  /async function appendMontageSceneOnScreenTextAssFilters\(\{/,
  "El render de escena debe construir un archivo ASS temporal por escena."
);

assert.match(
  backendSource,
  /renderMode: "browser"/,
  "La pasada visual de navegador debe configurar el renderMode a browser."
);

assert.match(
  backendSource,
  /const assContent = buildMontageOnScreenTextAss\(\{/,
  "La ruta de export principal debe reutilizar el builder compartido de ASS."
);

assert.match(
  backendSource,
  /ass=filename='/,
  "El render por escena debe quemar el karaoke con libass."
);

assert.doesNotMatch(
  backendSource,
  /appendMontageSceneOnScreenTextDrawtextFilters\(/,
  "El export normal ya no debe conservar la ruta drawtext por escena."
);

assert.doesNotMatch(
  backendSource,
  /appendMontageSceneOnScreenTextOverlays\(/,
  "El export normal ya no debe conservar la ruta rasterizada por escena."
);

console.log("Podcaster montage export ASS primary path contract OK.");
