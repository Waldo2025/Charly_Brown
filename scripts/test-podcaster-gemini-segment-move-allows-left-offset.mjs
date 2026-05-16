import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

assert.doesNotMatch(
  source,
  /minStartMs:\s*sceneStartMs,/,
  "El drag Gemini no debe bloquear el segmento al inicio de la escena."
);

assert.match(
  source,
  /minStartMs:\s*0,/,
  "El drag Gemini debe permitir mover el segmento a la izquierda hasta 0 ms del timeline."
);

console.log("Podcaster Gemini segment move allows left offset OK.");
