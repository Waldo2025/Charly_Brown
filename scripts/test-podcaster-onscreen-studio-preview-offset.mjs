import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-playback-controller.js",
  "utf8"
);

assert.doesNotMatch(
  source,
  /const isDashboardPreview = this\.deps\?\.isDashboard === true;/,
  "El controller no debe bifurcar offsets distintos entre Home y Studio."
);

assert.doesNotMatch(
  source,
  /0\.5 - \(widthPctForPreview \/ 2\)|storedBubbleTopPct \+ 0\.14/,
  "El preview de Studio no debe recentrar ni bajar el texto con offsets hardcodeados."
);

assert.match(
  source,
  /const previewSpec = this\.deps\?\.resolveOnScreenTextPreviewLayoutSpec\?\.\(\{/,
  "La posición final del subtítulo debe salir de la spec compartida."
);

console.log("Podcaster onscreen studio preview offset removed OK.");
