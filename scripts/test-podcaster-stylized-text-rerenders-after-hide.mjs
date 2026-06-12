import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-playback-controller.js",
  "utf8"
);

assert.match(
  source,
  /if \(!rowId \|\| !session\?\.stylizedTextMap\?\.\[rowId\]\) \{[\s\S]*container\.innerHTML = '';[\s\S]*delete container\.dataset\.activeRowId;[\s\S]*delete container\.dataset\.activeText;[\s\S]*container\.hidden = true;[\s\S]*return;/,
  "Al ocultar texto estilizado se debe limpiar el cache de row/text para permitir re-render en la siguiente aparición."
);

console.log("Podcaster stylized text rerenders after hide OK.");
