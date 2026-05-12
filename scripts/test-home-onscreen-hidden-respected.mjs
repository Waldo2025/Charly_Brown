import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/home.js",
  "utf8"
);

assert.match(
  source,
  /const existingOnScreenTextClips = s\?\.timelineOnScreenTextClipsByRowId[\s\S]*?\|\| \{\};/,
  "Home debe revisar clips de texto en pantalla guardados antes de sintetizar el fallback."
);

assert.match(
  source,
  /const savedClip = existingOnScreenTextClips\?\.\[entry\.rowId\] \|\| null;/,
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
