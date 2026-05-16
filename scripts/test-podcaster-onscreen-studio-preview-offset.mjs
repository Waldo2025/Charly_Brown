import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-playback-controller.js",
  "utf8"
);

assert.match(
  source,
  /const isDashboardPreview = this\.deps\?\.isDashboard === true;/,
  "El controlador debe distinguir Home del preview de Studio."
);

assert.match(
  source,
  /const bubbleLeftPct = isDashboardPreview[\s\S]*0\.5 - \(widthPctForPreview \/ 2\)/m,
  "En podcaster.html el preview debe recentrar horizontalmente el texto en pantalla."
);

assert.match(
  source,
  /const bubbleTopPct = isDashboardPreview[\s\S]*storedBubbleTopPct \+ 0\.14/m,
  "En podcaster.html el preview debe bajar el texto respecto al layout persistido."
);

console.log("Podcaster onscreen studio preview offset OK.");
