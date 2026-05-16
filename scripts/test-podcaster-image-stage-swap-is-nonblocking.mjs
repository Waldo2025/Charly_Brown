import assert from "node:assert/strict";
import fs from "node:fs";

const controllerSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-playback-controller.js",
  "utf8"
);

assert.match(
  controllerSource,
  /requestImageStageSwap\(entry = null\) \{/,
  "El controller debe tener un helper explícito para preparar swaps de imagen fuera del tick crítico."
);

assert.match(
  controllerSource,
  /if \(isImage\) \{\s*this\.requestImageStageSwap\(entry\);\s*return;\s*\}/m,
  "La ruta de imagen no debe bloquear syncStageSwitching con awaits de preload/carga."
);

assert.doesNotMatch(
  controllerSource,
  /if \(isImage\) \{[\s\S]*await this\.preloadImageSrc\(entry\.videoSrc\);[\s\S]*await this\.ensureStageImageReady\(imageEl, entry\.videoSrc\);[\s\S]*return;\s*\}/m,
  "La ruta de imagen no debe esperar preload+ensure dentro del cambio crítico de escena."
);

assert.match(
  controllerSource,
  /isImageStageEntry\(entry = null\) \{/,
  "El controller debe centralizar la detección de escenas de imagen para no depender solo de un flag runtime."
);

assert.match(
  controllerSource,
  /upcoming\.forEach\(e => \{\s*if \(this\.isImageStageEntry\(e\)\) \{\s*this\.preloadImageSrc\(e\.videoSrc\)\.catch\(\(\) => \{ \}\);\s*\} else \{\s*this\.getBlobUrl\(e\.videoSrc\);\s*\}\s*\}\);/m,
  "El controller debe precargar imágenes próximas en background antes de que el playhead llegue a ellas."
);

console.log("Podcaster image stage swap is nonblocking OK.");
