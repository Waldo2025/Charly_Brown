import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-media-editor.js",
  "utf8"
);

assert.match(
  source,
  /const preferredSelectors = \[[\s\S]*?#podcastActiveSpeakerVideo[\s\S]*?#podcastActiveSpeakerImage[\s\S]*?#podcastActiveSpeakerVideoAlt[\s\S]*?#podcastActiveSpeakerImageAlt[\s\S]*?#montageExportPreviewVideo[\s\S]*?#montageExportPreviewImage/s,
  "El cálculo del render box debe priorizar el media principal del stage antes que otros img/video decorativos."
);

assert.doesNotMatch(
  source,
  /querySelectorAll\('video, img'\)/,
  "El render box ya no debe depender del primer img/video visible del contenedor porque puede agarrar logo o avatar."
);

console.log("Podcaster stylized text render box stage-media priority OK.");
