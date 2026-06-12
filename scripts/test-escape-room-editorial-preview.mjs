import assert from "node:assert/strict";
import fs from "node:fs";

const builder = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/escape-room-package-builder.mjs",
  "utf8"
);
const home = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/home.js",
  "utf8"
);
const creatorHtml = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/PigPenCreator.html",
  "utf8"
);
const creatorJs = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/PigPenCreator.js",
  "utf8"
);

assert.match(
  builder,
  /export function buildPreviewDocument\(project,\s*options = \{\}\)/,
  "El builder debe aceptar opciones para el preview editorial."
);

assert.match(
  builder,
  /window\.__ESCAPE_ROOM_EDITORIAL_REVIEW__ = true;/,
  "El preview editorial debe marcar el runtime en modo revisión."
);

assert.match(
  builder,
  /data-editorial-autofill/,
  "El runtime del preview debe renderizar un control para autocompletar la pantalla actual."
);

assert.match(
  builder,
  /function autocompleteCurrentScreen\(/,
  "El runtime debe exponer la función de autocompletar pantalla."
);

assert.match(
  builder,
  /addEventListener\("click", autocompleteCurrentScreen\)/,
  "El botón editorial debe disparar el autocompletado."
);

assert.match(
  home,
  /buildPreviewDocument\(project,\s*\{\s*editorialReview:\s*true\s*\}\)/,
  "Home debe abrir el preview del escape room en modo editorial."
);

assert.match(
  creatorHtml,
  /id="btnPreviewAutofill"/,
  "PigPenCreator debe incluir un botón para resolver en automático el preview."
);

assert.match(
  creatorJs,
  /buildPreviewDocument\(project,\s*\{\s*editorialReview:\s*true\s*\}\)/,
  "PigPenCreator debe abrir su iframe de preview en modo editorial."
);

assert.match(
  creatorJs,
  /function triggerPreviewEditorialAutofill\(/,
  "PigPenCreator debe exponer un helper para disparar el autocompletado del preview."
);

assert.match(
  creatorJs,
  /elements\.btnPreviewAutofill\?\.addEventListener\("click",\s*triggerPreviewEditorialAutofill\)/,
  "El botón del creador debe activar la resolución automática del preview."
);

console.log("Escape room editorial preview OK.");
