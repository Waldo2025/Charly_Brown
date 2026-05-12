import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster.js",
  "utf8"
);

assert.match(
  source,
  /field === "onScreenText"\s*\?\s*\{\s*onScreenTextNoSummarize: true\s*\}\s*:\s*\{\}/,
  "La edición manual de onScreenText debe marcar el row para preservar el texto exacto y evitar re-sumarización."
);

assert.match(
  source,
  /const nextText = String\(row\?\.onScreenText \|\| ""\)\.trim\(\) \|\| "Sin texto";[\s\S]*contentEl\.textContent = nextText;/,
  "El render ligero del timeline debe refrescar el contenido visual del chip de texto en pantalla con el onScreenText actualizado."
);

console.log("Podcaster onscreen text input preserved OK.");
