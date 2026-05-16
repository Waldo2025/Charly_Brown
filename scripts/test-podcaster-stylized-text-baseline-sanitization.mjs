import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-media-editor.js",
  "utf8"
);

assert.match(
  source,
  /const VALID_CANVAS_TEXT_BASELINES = new Set\(\[\s*'top',\s*'hanging',\s*'middle',\s*'alphabetic',\s*'ideographic',\s*'bottom'\s*\]\);/m,
  "El editor debe definir la lista oficial de CanvasTextBaseline válidos."
);

assert.match(
  source,
  /if \(baseline === 'alphabetical'\) return 'alphabetic';/,
  "El editor debe corregir explícitamente el valor heredado 'alphabetical'."
);

assert.match(
  source,
  /if \(VALID_CANVAS_TEXT_BASELINES\.has\(baseline\)\) return baseline;\s*return 'alphabetic';/m,
  "El editor debe degradar cualquier baseline inválido a 'alphabetic'."
);

assert.match(
  source,
  /const sanitizedTextData = sanitizeStylizedTextSceneData\(textData\);[\s\S]*staticCanvas\.loadFromJSON\(sanitizedTextData, \(\) => \{/m,
  "La renderización a bitmap debe volver a sanear el payload justo antes de loadFromJSON."
);

console.log("Podcaster stylized text baseline sanitization OK.");
