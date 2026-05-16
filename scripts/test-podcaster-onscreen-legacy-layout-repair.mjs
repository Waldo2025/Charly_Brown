import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

assert.match(
  source,
  /function shouldRepairLegacyOnScreenTextLayout\(layout = null, settings = null\) \{/,
  "Debe existir un detector explícito para layouts legacy de subtítulos."
);

assert.match(
  source,
  /const legacyDefaultX = 0\.21;[\s\S]*const legacyDefaultY = 0\.7;/m,
  "La reparación debe reconocer la firma vieja izquierda del layout de texto."
);

assert.match(
  source,
  /if \(currentLayout && !shouldRepairLegacyOnScreenTextLayout\(currentLayout, settings\)\) return;[\s\S]*next\[rowId\] = defaultLayout;/m,
  "Los layouts legacy deben regenerarse con el layout centrado por defecto."
);

console.log("Podcaster onscreen legacy layout repair OK.");
