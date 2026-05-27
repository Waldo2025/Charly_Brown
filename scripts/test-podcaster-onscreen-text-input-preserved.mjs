import assert from "node:assert/strict";
import fs from "node:fs";

const scriptEditorSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-script-editor.js",
  "utf8"
);
const timelineUiSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-timeline-ui.js",
  "utf8"
);

assert.match(
  scriptEditorSource,
  /field === "onScreenText"\s*\?\s*\{\s*onScreenTextNoSummarize: true\s*\}\s*:\s*\{\}/,
  "La edición manual de onScreenText debe marcar el row para preservar el texto exacto y evitar re-sumarización."
);

assert.match(
  timelineUiSource,
  /const nextText = String\(row\?\.onScreenText \|\| ""\)\.trim\(\) \|\| "Sin texto";[\s\S]*contentEl\.textContent = nextText;/,
  "El render ligero del timeline debe refrescar el contenido visual del chip de texto en pantalla con el onScreenText actualizado."
);

console.log("Podcaster onscreen text input preserved OK.");
