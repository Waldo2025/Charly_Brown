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

const textPrototype = { textBaseline: "alphabetical" };
const iTextPrototype = { textBaseline: "alphabetical" };
const textDefaults = { textBaseline: "alphabetical" };
runtime.fabric = {
  Text: { prototype: textPrototype, ownDefaults: textDefaults },
  IText: { prototype: iTextPrototype },
  Textbox: { prototype: { textBaseline: "made-up-baseline" } }
};
runtime.patchFabricTextBaselineDefaults();

assert.equal(
  textPrototype.textBaseline,
  "alphabetic",
  "El default de fabric.Text debe sanearse antes de crear canvases."
);
assert.equal(
  iTextPrototype.textBaseline,
  "alphabetic",
  "El default de fabric.IText debe sanearse antes de crear canvases."
);
assert.equal(
  textDefaults.textBaseline,
  "alphabetic",
  "Los ownDefaults de Fabric también deben sanearse."
);

const liveObject = {
  type: "i-text",
  textBaseline: "alphabetical",
  styles: {
    0: {
      0: { textBaseline: "alphabetical" }
    }
  },
  get(key) {
    return this[key];
  },
  set(key, value) {
    this[key] = value;
  }
};
runtime.sanitizeFabricTextObjectInstance(liveObject);

assert.equal(
  liveObject.textBaseline,
  "alphabetic",
  "Los objetos Fabric ya instanciados deben corregir textBaseline antes de renderizar."
);
assert.equal(
  liveObject.styles[0][0].textBaseline,
  "alphabetic",
  "Los estilos anidados de objetos Fabric vivos también deben corregirse."
);

assert.match(
  source,
  /const sanitizedTextData = sanitizeStylizedTextSceneData\(textData\);[\s\S]*staticCanvas\.loadFromJSON\(sanitizedTextData, \(\) => \{/m,
  "La renderización a bitmap debe seguir saneando el payload justo antes de loadFromJSON."
);

assert.match(
  source,
  /patchFabricTextBaselineDefaults\(\);[\s\S]*new fabric\.StaticCanvas/m,
  "La renderización a bitmap debe sanear defaults de Fabric antes de crear StaticCanvas."
);

assert.match(
  source,
  /staticCanvas\.loadFromJSON\(sanitizedTextData, \(\) => \{[\s\S]*sanitizeFabricCanvasTextBaselines\(staticCanvas\);/m,
  "La renderización a bitmap debe sanear objetos Fabric después de loadFromJSON."
);

console.log("Podcaster stylized text baseline sanitization OK.");
