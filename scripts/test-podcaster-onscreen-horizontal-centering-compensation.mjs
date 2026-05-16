import assert from "node:assert/strict";
import fs from "node:fs";

const shared = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-on-screen-text.js",
  "utf8"
);
const controller = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-playback-controller.js",
  "utf8"
);

assert.match(
  shared,
  /function buildCanonicalOnScreenTextLayoutBounds\(widthPct = STUDIO_ONSCREEN_TEXT_DEFAULT_WIDTH_PCT, heightPct = STUDIO_ONSCREEN_TEXT_DEFAULT_HEIGHT_PCT, settings = null\)/,
  "La geometría canónica debe vivir en el módulo compartido."
);

assert.match(
  shared,
  /xPct: Math\.max\(0, Math\.min\(1 - safeWidthPct, centerXPct - \(safeWidthPct \/ 2\)\)\)/,
  "El layout por defecto debe centrarse horizontalmente desde la fuente compartida de verdad."
);

assert.doesNotMatch(
  controller,
  /storedBubbleCenterXPct|actualBubbleWidthPct|bubbleLeftPct = Math\.max\(0, Math\.min\(1 - actualBubbleWidthPct,/,
  "El controller ya no debe compensar el centrado horizontal por su cuenta."
);

assert.match(
  controller,
  /const bubbleLeftPct = this\.clamp01\(Number\(previewSpec\?\.xPct \?\? rowLayout\?\.xPct \?\? 0\)\);/,
  "El controller debe aplicar directamente la coordenada horizontal resuelta por la spec compartida."
);

console.log("Podcaster onscreen horizontal centering compensation removed OK.");
