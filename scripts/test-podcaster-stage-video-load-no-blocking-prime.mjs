import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster.js",
  "utf8"
);

assert.doesNotMatch(
  source,
  /await primePodcastStageVideoSource\(cleanSrc\);/,
  "El stage de Studio no debe bloquear el cambio de escena esperando un preloader duplicado."
);

assert.match(
  source,
  /if \(!cachedObjectUrl\) \{\s*primePodcastStageVideoSource\(cleanSrc\)\.catch\(\(\) => \{ \}\);\s*\}/m,
  "El prewarm del video debe quedar en background, no en la ruta crítica del cambio de escena."
);

console.log("Podcaster stage video load no blocking prime OK.");
