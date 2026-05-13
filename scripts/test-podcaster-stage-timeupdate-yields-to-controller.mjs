import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster.js",
  "utf8"
);

assert.match(
  source,
  /const onStageTimeUpdate = \(event\) => \{\s*if \(podcastVideoState\.montageActive === true\) return;/m,
  "El timeupdate nativo del stage debe ignorarse durante montaje activo."
);

assert.match(
  source,
  /function scheduleStudioTimelinePreviewSync\(nextMs = 0, entries = null\) \{\s*if \(podcastVideoState\.montageActive === true\) return;/m,
  "El scheduler de preview diferido no debe correr mientras el controller gobierna el montaje."
);

assert.match(
  source,
  /if \(podcastVideoState\.montageActive === true\) return;\s*syncStudioTimelinePreview\(session, \{ currentMs: payload\.nextMs, autoplay: false \}\);/m,
  "El flush del preview diferido debe abortar si el montaje se activó antes del frame."
);

console.log("Podcaster stage timeupdate yields to controller OK.");
