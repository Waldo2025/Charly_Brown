import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-playback-controller.js",
  "utf8"
);

assert.match(
  source,
  /resolveLiveOnScreenTextLayout\(selectedRowId, baseLayout, overlay, previewEl\)/,
  "El controller debe tener un override vivo del layout mientras se arrastra o redimensiona."
);

assert.match(
  source,
  /const activeInteraction = \[dragState, resizeState\]\.find\(\(item\) => String\(item\?\.rowId \|\| ""\)\.trim\(\) === rowId\) \|\| null;/,
  "El override debe activarse para drag y resize del mismo row."
);

assert.match(
  source,
  /xPct: this\.parseOverlayCssPercent\(bubble\.style\.getPropertyValue\("--pod-onscreen-text-x"\), Number\(baseLayout\?\.xPct \|\| 0\)\)/,
  "Durante el drag se debe usar la X viva del bubble en vez del layout persistido anterior."
);

assert.match(
  source,
  /const liveLayout = this\.resolveLiveOnScreenTextLayout\(selected\.rowId, persistedLayout, overlay, previewEl\);/,
  "syncOverlay debe renderizar contra el layout vivo cuando exista interacción."
);

console.log("Podcaster onscreen live layout drag override OK.");
