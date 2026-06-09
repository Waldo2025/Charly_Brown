import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);
const sharedSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-on-screen-text.js",
  "utf8"
);

assert.match(
  source,
  /function shouldRepairLegacyOnScreenTextLayout\(layout = null, settings = null\) \{/,
  "Debe existir un detector explícito para layouts legacy de subtítulos."
);

assert.match(
  sharedSource,
  /const STUDIO_ONSCREEN_TEXT_LEGACY_DEFAULT_X_PCT = 0\.21;[\s\S]*const STUDIO_ONSCREEN_TEXT_LEGACY_DEFAULT_Y_PCT = 0\.7;/m,
  "La reparación debe reconocer la firma vieja izquierda del layout de texto."
);

assert.match(
  source,
  /if \(currentLayout && !shouldRepairLegacyOnScreenTextLayout\(currentLayout, settings\)\) return;[\s\S]*next\[rowId\] = defaultLayout;/m,
  "Los layouts legacy deben regenerarse con el layout centrado por defecto."
);

console.log("Podcaster onscreen legacy layout repair OK.");
