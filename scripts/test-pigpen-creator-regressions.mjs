import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/PigPenCreator.js",
  "utf8"
);

assert.match(
  source,
  /const elements\s*=\s*\{[\s\S]*?\bbtnPublicar:\s*document\.getElementById\("btnPublicar"\)/,
  "El editor debe registrar el botón Publicar en el mapa de elementos."
);

const loadSessionMatch = source.match(/async function loadSessionIntoEditor\(session\) \{([\s\S]*?)\n\}/);
assert.ok(loadSessionMatch, "Debe existir la función loadSessionIntoEditor.");
const loadSessionBody = loadSessionMatch[1];
assert.ok(
  loadSessionBody.indexOf('resetEditorState({ preserveForm: false });') >= 0,
  "Cargar una sesión debe reiniciar el formulario antes de hidratarlo."
);
assert.ok(
  loadSessionBody.indexOf('resetEditorState({ preserveForm: false });') < loadSessionBody.indexOf("applyFormState(session.formState || {});"),
  "La limpieza base del formulario debe ocurrir antes de aplicar el estado remoto."
);

assert.match(
  source,
  /elements\.btnExportar\.disabled\s*=\s*state\.isLoading\s*\|\|\s*!hasData\s*\|\|\s*state\.isGenerating;/,
  "Exportar debe quedar deshabilitado mientras el creador sigue generando recursos."
);

assert.match(
  source,
  /elements\.btnPublicar\.disabled\s*=\s*state\.isLoading\s*\|\|\s*!canPublish;/,
  "Publicar debe depender del estado actual del editor y no quedar muerto permanentemente."
);

assert.match(
  source,
  /elements\.btnPublicar\??\.addEventListener\("click",\s*publishActiveSession\);/,
  "El botón Publicar debe ejecutar una acción real."
);

console.log("PigPenCreator regressions OK.");
