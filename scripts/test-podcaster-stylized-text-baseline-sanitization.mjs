import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-media-editor.js",
  "utf8"
);

const snippetStart = source.indexOf("const VALID_CANVAS_TEXT_BASELINES = new Set([");
const snippetEnd = source.indexOf("function cloneStylizedTextData");

assert.notStrictEqual(snippetStart, -1, "No se encontró la configuración de baselines válidos.");
assert.notStrictEqual(snippetEnd, -1, "No se encontró el cierre del bloque de saneamiento.");

const runtime = {
  STYLIZED_TEXT_ALLOWED_OBJECT_TYPES: new Set(["i-text", "text", "textbox", "group"])
};

vm.createContext(runtime);
vm.runInContext(source.slice(snippetStart, snippetEnd), runtime);

assert.equal(
  runtime.normalizeCanvasTextBaseline("alphabetical"),
  "alphabetic",
  "El valor heredado 'alphabetical' debe corregirse a 'alphabetic'."
);

assert.equal(
  runtime.normalizeCanvasTextBaseline("made-up-baseline"),
  "alphabetic",
  "Cualquier baseline inválido debe degradarse a 'alphabetic'."
);

const sanitizedFromString = runtime.sanitizeStylizedTextSceneData(
  JSON.stringify({
    width: 1280,
    height: 720,
    objects: [
      {
        type: "i-text",
        textBaseline: "alphabetical",
        styles: {
          0: {
            0: { textBaseline: "alphabetical" }
          }
        },
        metadataJson: JSON.stringify({
          textBaseline: "alphabetical"
        })
      }
    ]
  })
);

assert.equal(
  sanitizedFromString.objects[0].textBaseline,
  "alphabetic",
  "El objeto principal debe salir saneado antes de llegar a Fabric."
);

assert.equal(
  sanitizedFromString.objects[0].styles[0][0].textBaseline,
  "alphabetic",
  "Los estilos anidados del IText deben sanearse también."
);

assert.match(
  sanitizedFromString.objects[0].metadataJson,
  /alphabetic/,
  "Las cadenas JSON heredadas también deben corregirse antes de parsearse internamente."
);

assert.doesNotMatch(
  JSON.stringify(sanitizedFromString),
  /alphabetical/,
  "Después del saneamiento no debe quedar ningún baseline heredado en el payload."
);

assert.match(
  source,
  /const sanitizedTextData = sanitizeStylizedTextSceneData\(textData\);[\s\S]*staticCanvas\.loadFromJSON\(sanitizedTextData, \(\) => \{/m,
  "La renderización a bitmap debe seguir saneando el payload justo antes de loadFromJSON."
);

console.log("Podcaster stylized text baseline sanitization OK.");
