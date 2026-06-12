import assert from "node:assert/strict";
import fs from "node:fs";

const controllerSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-playback-controller.js",
  "utf8"
);

assert.match(
  controllerSource,
  /syncStylizedText\(currentMs,\s*options = \{\}\) \{/,
  "El preview del texto estilizado debe aceptar opciones para respetar la fila preferida del editor."
);

assert.match(
  controllerSource,
  /const preferredRowId = String\(options\?\.rowId \|\| options\?\.preferredRowId \|\| this\.state\.activeRowId \|\| ""\)\.trim\(\);/,
  "El texto estilizado debe resolver la fila preferida igual que el overlay del editor."
);

assert.match(
  controllerSource,
  /const shouldShowPreferredRow = forceRow \|\| \(editorPreviewMode && Boolean\(preferredRowId\)\);/,
  "El preview del editor debe poder mostrar el texto estilizado de la fila activa aunque el cursor no haya llegado a esa escena."
);

assert.match(
  controllerSource,
  /const rowId = preferredRowId && shouldShowPreferredRow && session\?\.stylizedTextMap\?\.\[preferredRowId\][\s\S]*?\?[\s\S]*?preferredRowId[\s\S]*?:[\s\S]*?activeEntryRowId;/,
  "El controller debe priorizar el texto estilizado de la fila preferida antes de caer al clip activo en tiempo."
);

console.log("Podcaster stylized text editor preferred-row preview OK.");
