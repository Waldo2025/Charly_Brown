import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/home.js",
  "utf8"
);

assert.match(
  source,
  /const existingOnScreenTextClips = normalizeSharedClipMap\(s\?\.timelineOnScreenTextClipsByRowId/,
  "Home debe revisar clips de texto en pantalla guardados antes de sintetizar el fallback."
);

assert.match(
  source,
  /const savedClip = existingOnScreenTextClips\?\.\[entry\.rowId\]\s*\|\|\s*cfg\.timelineOnScreenTextClipsByRowId\?\.\[entry\.rowId\]\s*\|\|\s*null;/,
  "Home debe resolver el clip guardado por fila al construir el fallback del overlay."
);

assert.match(
  source,
  /hidden: savedClip\?\.hidden === true,/,
  "El fallback de texto en pantalla debe preservar el estado hidden."
);

assert.match(
  source,
  /autoHidden: savedClip\?\.autoHidden === true/,
  "El fallback de texto en pantalla debe preservar autoHidden."
);

console.log("Home onscreen hidden respected OK.");
