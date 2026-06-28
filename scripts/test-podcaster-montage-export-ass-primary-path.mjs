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
  "El fallback legacy debe poder quemar karaoke con libass cuando no hay PNGs renderizados."
);

assert.match(
  backendSource,
  /if \(renderedTextOverlayResult\.appliedOverlayCount > 0\)[\s\S]*?else if \(input\.onScreenTextRenderedFrameAttempted !== true\)[\s\S]*?appendMontageSceneOnScreenTextAssFilters/,
  "El backend solo debe usar ASS cuando el frontend no intento generar snapshots PNG."
);

assert.match(
  backendSource,
  /Skipping ASS fallback because frontend attempted rendered PNG frames/,
  "Si el frontend intento snapshots PNG, el backend no debe meter el karaoke amarillo legacy."
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
