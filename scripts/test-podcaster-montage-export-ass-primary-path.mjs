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
  /let shouldBurnSceneOnScreenText = shouldUseMontageSceneAssSubtitles\(input\)(?:\s*&&\s*![^;]+)?;/,
  "El export normal debe decidir el texto en pantalla antes del render por escena."
);

assert.match(
  backendSource,
  /const hasFinalVisualPass = Boolean\([\s\S]*?\);[\s\S]*?const finalShouldAttemptBrowserRenderer = false;[\s\S]*?const hasBrowserVisualPass = false;/,
  "La entrega final debe mantener desactivado el browser visual pass cuando el texto normal se quema por escena."
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
  /if \(renderedTextOverlayResult\.appliedOverlayCount > 0\)[\s\S]*?text_overlay_fallback[\s\S]*?appendMontageSceneOnScreenTextAssFilters/,
  "El backend debe usar ASS como fallback visible cuando los snapshots PNG no se apliquen."
);

assert.match(
  backendSource,
  /reason: "rendered_png_empty_or_failed"[\s\S]*fallback: "ass"/,
  "Si el frontend intento snapshots PNG y fallan, el backend debe quemar texto con ASS."
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
